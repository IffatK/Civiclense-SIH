import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { query, transaction } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";
import { signedCampusUrl, signedUrl } from "../services/storage.js";
import { createClient } from "@supabase/supabase-js";
import { groqComplete } from "../services/ai/groq.js";
import { notify } from "../services/notifications.js";

const router = Router();
const permittedDocumentTypes = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const permittedDocumentExtensions = new Set([".pdf", ".doc", ".docx"]);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (_r, f, cb) => {
  const extension = f.originalname.slice(f.originalname.lastIndexOf(".")).toLowerCase();
  // Chrome and mobile file pickers sometimes provide application/octet-stream
  // for a perfectly ordinary PDF. Require the recognised extension in that
  // case; do not accept arbitrary binary files.
  cb(null, permittedDocumentTypes.has(f.mimetype) || (f.mimetype === "application/octet-stream" && permittedDocumentExtensions.has(extension)));
} });
const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const bucket = process.env.CAMPUS_STORAGE_BUCKET || "campus-private";

async function uploadCampusDocument(path, file) {
  const options = { contentType: file.mimetype === "application/octet-stream" ? "application/pdf" : file.mimetype, upsert: false };
  let result = await storage.storage.from(bucket).upload(path, file.buffer, options);
  if (result.error && /bucket.*(not found|does not exist)|not found.*bucket/i.test(result.error.message)) {
    const created = await storage.storage.createBucket(bucket, { public: false, fileSizeLimit: "15728640" });
    if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
      throw badRequest(`Private document storage is unavailable: ${created.error.message}`);
    }
    result = await storage.storage.from(bucket).upload(path, file.buffer, options);
  }
  if (result.error) throw badRequest(`Document could not be stored: ${result.error.message}`);
}

function quotationPdf({proposal, institution, quotation, items, subtotal, tax, total}) {
  const esc=(value)=>String(value??"").replace(/[\\()]/g,"\\$&");
  const lines=["CIVICPULSE", "QUOTATION", `Proposal: ${proposal.title}`, `Proposal ID: ${proposal.ref}`, `University: ${institution}`, `Quotation: ${quotation.ref} — ${quotation.title}`, `Duration: ${quotation.duration_weeks} weeks`, "", "Description | Qty | Unit | Unit cost | Tax | Total", ...items.map((item)=>`${item.description} | ${item.quantity} | ${item.unit||""} | INR ${item.unit_cost} | ${item.tax_rate||0}% | INR ${(Number(item.line_total)*(1+Number(item.tax_rate||0)/100)).toFixed(2)}`), "", `Subtotal: INR ${subtotal.toFixed(2)}`, `Tax: INR ${tax.toFixed(2)}`, `Grand total: INR ${total.toFixed(2)}`];
  const stream=`BT /F1 10 Tf 50 790 Td ${lines.map((line,index)=>`${index?"0 -16 Td ":""}(${esc(line)}) Tj`).join(" ")} ET`;
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>","<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let body="%PDF-1.4\n", offsets=[0]; objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(body));body+=`${index+1} 0 obj\n${object}\nendobj\n`;}); const xref=Buffer.byteLength(body); body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

async function campusUser(userId) {
  const { rows } = await query(`select p.institution_id, p.institution_role, p.role, i.name from profiles p join institutions i on i.id=p.institution_id where p.id=$1`, [userId]);
  if (!rows[0]?.institution_id) throw badRequest("You must belong to an approved institution to use the Campus Portal.");
  return rows[0];
}
const canManage = (m) => ["university_admin", "faculty"].includes(m.role) || ["faculty", "partner_lead"].includes(m.institution_role);
async function audit(m, actor, action, entity, id, before, after) { await query(`insert into campus_audit_logs(institution_id,actor,action,entity,entity_id,before,after) values($1,$2,$3,$4,$5,$6,$7)`, [m.institution_id, actor, action, entity, String(id), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]); }

router.get("/dashboard", requireAuth, wrap(async (req,res) => { const m=await campusUser(req.user.id); const {rows}=await query(`select (select count(*)::int from challenge_matches_detailed cm where cm.institution_id=$1) recommendations, (select count(*)::int from university_challenge_reviews where institution_id=$1 and status='pending') awaiting_review, (select count(*)::int from university_challenge_reviews where institution_id=$1 and status='accepted') accepted_challenges, (select count(*)::int from university_challenge_reviews where institution_id=$1 and status='declined') declined_challenges, (select count(*)::int from campus_proposals where institution_id=$1 and status='draft') drafts, (select count(*)::int from campus_proposals where institution_id=$1 and status in ('submitted','under_review','resubmitted')) submitted_proposals, (select count(*)::int from campus_proposals where institution_id=$1 and status='revision_requested') revisions, (select count(*)::int from campus_proposals where institution_id=$1 and status='approved') approved_proposals, (select count(*)::int from projects where institution_id=$1 and stage in ('approved','building','pilot')) active_projects, (select count(*)::int from projects where institution_id=$1 and stage='deployed') completed_projects, (select count(*)::int from project_milestones ms join projects p on p.id=ms.project_id where p.institution_id=$1 and ms.due_on between current_date and current_date+interval '14 days' and ms.status <> 'completed') upcoming_milestones, (select count(*)::int from project_milestones ms join projects p on p.id=ms.project_id where p.institution_id=$1 and ms.due_on<current_date and ms.status <> 'completed') overdue_milestones, (select count(distinct pm.profile_id)::int from project_members pm join projects p on p.id=pm.project_id join profiles pp on pp.id=pm.profile_id where p.institution_id=$1 and pp.institution_role='student') students, (select count(distinct pm.profile_id)::int from project_members pm join projects p on p.id=pm.project_id join profiles pp on pp.id=pm.profile_id where p.institution_id=$1 and pp.institution_role='faculty') faculty_mentors`,[m.institution_id]); res.json({institution:m.name,stats:rows[0]}); }));

router.get("/profile", requireAuth, wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query("select id,name,kind,city,website,description,disciplines,research_areas,laboratories,capabilities,expertise from institutions where id=$1",[m.institution_id]);res.json({profile:rows[0]});}));
router.patch("/profile", requireAuth, wrap(async(req,res)=>{const m=await campusUser(req.user.id);if(!canManage(m))throw badRequest("Only a campus administrator or faculty lead can edit the university profile.");const x=z.object({name:z.string().trim().min(3).max(160),city:z.string().max(100).optional().nullable(),website:z.string().max(240).optional().nullable(),description:z.string().max(5000).optional().nullable(),disciplines:z.array(z.string().max(80)).max(60).default([]),researchAreas:z.array(z.string().max(100)).max(60).default([]),laboratories:z.array(z.string().max(100)).max(60).default([]),capabilities:z.array(z.string().max(100)).max(60).default([]),expertise:z.array(z.string().max(60)).max(30).default([])}).parse(req.body);await query("update institutions set name=$2,city=$3,website=$4,description=$5,disciplines=$6,research_areas=$7,laboratories=$8,capabilities=$9,expertise=$10 where id=$1",[m.institution_id,x.name,x.city||null,x.website||null,x.description||null,x.disciplines,x.researchAreas,x.laboratories,x.capabilities,x.expertise]);await audit(m,req.user.id,"institution.profile_updated","institution",m.institution_id,null,x);res.json({ok:true});}));

router.get("/departments",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query(`select d.*,p.full_name head_name,(select count(*)::int from campus_member_details md join profiles pp on pp.id=md.profile_id where md.department_id=d.id) members from university_departments d left join profiles p on p.id=d.head_id where d.institution_id=$1 order by d.name`,[m.institution_id]);res.json({departments:rows});}));
router.post("/departments",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);if(!canManage(m))throw badRequest("Only a coordinator or faculty lead can manage departments.");const x=z.object({name:z.string().trim().min(2).max(120),disciplines:z.array(z.string().max(80)).default([]),expertise:z.array(z.string().max(80)).default([]),researchAreas:z.array(z.string().max(100)).default([]),labs:z.array(z.string().max(100)).default([])}).parse(req.body);const {rows}=await query("insert into university_departments(institution_id,name,disciplines,expertise,research_areas,labs) values($1,$2,$3,$4,$5,$6) returning id",[m.institution_id,x.name,x.disciplines,x.expertise,x.researchAreas,x.labs]);await audit(m,req.user.id,"department.created","department",rows[0].id,null,x);res.status(201).json({id:rows[0].id});}));

router.get("/people",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const role=req.query.role;const {rows}=await query(`select p.id,p.full_name,p.email,p.role,p.institution_role,md.designation,md.study_year,md.specialization,md.skills,md.interests,md.research_areas,md.availability,d.name department from profiles p left join campus_member_details md on md.profile_id=p.id left join university_departments d on d.id=md.department_id where p.institution_id=$1 and ($2::text is null or p.institution_role=$2) order by p.full_name`,[m.institution_id,role||null]);res.json({people:rows});}));
router.patch("/people/:id",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);if(!canManage(m))throw badRequest("Only a coordinator or faculty lead can update people records.");const x=z.object({departmentId:z.coerce.number().nullable().optional(),designation:z.string().max(120).optional(),studyYear:z.coerce.number().int().min(1).max(8).nullable().optional(),specialization:z.string().max(300).optional(),skills:z.array(z.string().max(80)).default([]),interests:z.array(z.string().max(80)).default([]),researchAreas:z.array(z.string().max(100)).default([]),availability:z.string().max(200).optional()}).parse(req.body);const owned=(await query("select id from profiles where id=$1 and institution_id=$2",[req.params.id,m.institution_id])).rows[0];if(!owned)throw notFound("Institution member");await query(`insert into campus_member_details(profile_id,department_id,designation,study_year,specialization,skills,interests,research_areas,availability) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(profile_id) do update set department_id=excluded.department_id,designation=excluded.designation,study_year=excluded.study_year,specialization=excluded.specialization,skills=excluded.skills,interests=excluded.interests,research_areas=excluded.research_areas,availability=excluded.availability,updated_at=now()`,[req.params.id,x.departmentId||null,x.designation||null,x.studyYear||null,x.specialization||null,x.skills,x.interests,x.researchAreas,x.availability||null]);await audit(m,req.user.id,"member.updated","profile",req.params.id,null,x);res.json({ok:true});}));

router.get("/my-challenges",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query(`select ch.ref,ch.title,ch.status,r.status review_status,p.ref project_ref,cp.ref proposal_ref,cp.status proposal_status from university_challenge_reviews r join challenges ch on ch.id=r.challenge_id left join campus_proposals cp on cp.challenge_id=ch.id and cp.institution_id=r.institution_id left join projects p on p.challenge_id=ch.id and p.institution_id=r.institution_id where r.institution_id=$1 order by r.updated_at desc`,[m.institution_id]);res.json({challenges:rows});}));
router.get("/projects",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query(`select p.ref,p.title,p.stage,p.started_at,ch.ref challenge_ref,ch.title challenge,(select count(*)::int from project_milestones ms where ms.project_id=p.id and ms.status <> 'completed') open_milestones from projects p join challenges ch on ch.id=p.challenge_id where p.institution_id=$1 order by p.started_at desc`,[m.institution_id]);res.json({projects:rows});}));
router.get("/analytics",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query(`select (select count(*)::int from university_challenge_reviews where institution_id=$1) challenges_received,(select count(*)::int from university_challenge_reviews where institution_id=$1 and status='accepted') challenges_accepted,(select count(*)::int from campus_proposals where institution_id=$1 and status in ('submitted','resubmitted','approved')) proposals_submitted,(select count(*)::int from campus_proposals where institution_id=$1 and status='approved') proposals_approved,(select count(*)::int from projects where institution_id=$1 and stage in ('approved','building','pilot')) active_projects,(select count(*)::int from projects where institution_id=$1 and stage='deployed') completed_projects`,[m.institution_id]);res.json({metrics:rows[0]});}));
router.get("/search",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const q=`%${String(req.query.q||"").trim()}%`;if(q==="%%")return res.json({results:[]});const {rows}=await query(`select 'proposal' type,ref,title from campus_proposals where institution_id=$1 and (title ilike $2 or ref ilike $2) union all select 'project',ref,title from projects where institution_id=$1 and (title ilike $2 or ref ilike $2) union all select 'challenge',ch.ref,ch.title from university_challenge_reviews r join challenges ch on ch.id=r.challenge_id where r.institution_id=$1 and (ch.title ilike $2 or ch.ref ilike $2) limit 30`,[m.institution_id,q]);res.json({results:rows});}));

router.get("/challenges", requireAuth, wrap(async(req,res)=>{const m=await campusUser(req.user.id); const {rows}=await query(`select cm.*, r.status as review_status from challenge_matches_detailed cm left join university_challenge_reviews r on r.challenge_id=cm.challenge_id and r.institution_id=$1 where cm.institution_id=$1 order by cm.matched desc, cm.reports_at_raise desc`,[m.institution_id]);res.json({challenges:rows});}));
router.get("/challenges/:ref", requireAuth, wrap(async (req, res) => {
  const m = await campusUser(req.user.id);
  const { rows } = await query(`select ch.*,cat.name category,w.name ward,d.name department, cm.matched,cm.required,cm.matched_on,cm.gaps,r.status review_status,r.initial_idea,r.note from challenges ch left join categories cat on cat.id=ch.category_id left join wards w on w.id=ch.ward_id left join departments d on d.id=ch.department_id left join challenge_matches_detailed cm on cm.challenge_id=ch.id and cm.institution_id=$1 left join university_challenge_reviews r on r.challenge_id=ch.id and r.institution_id=$1 where ch.ref=$2`, [m.institution_id, req.params.ref]);
  if (!rows[0]) throw notFound("Challenge");
  const evidence = await query(`select c.ref,regexp_replace(c.description_original,'^\\[DEMO-SEED\\]\\s*','') description_original,c.anonymous,c.created_at,regexp_replace(coalesce(a.summary,''),'^Seeded analysis for ','Analysis for ') ai_summary,json_agg(i.storage_path order by i.id) filter(where i.id is not null) images from complaints c left join complaint_images i on i.complaint_id=c.id and i.role='report' left join complaint_ai_analysis a on a.complaint_id=c.id where c.cluster_id=$1 group by c.id,a.summary order by c.created_at desc`, [rows[0].cluster_id]);
  const signedEvidence = await Promise.all(evidence.rows.map(async (item) => ({
    ...item,
    images: await Promise.all((item.images || []).map(async (storage_path) => ({ storage_path, url: await signedUrl(storage_path, 3600) }))),
  })));
  res.json({ challenge: rows[0], evidence: signedEvidence });
}));
router.post("/challenges/:ref/review",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);if(!canManage(m))throw badRequest("Only a coordinator or faculty member can review a challenge.");const x=z.object({status:z.enum(["saved","accepted","declined","information_requested"]),departmentIds:z.array(z.coerce.number()).default([]),facultyMentorId:z.string().uuid().nullable().optional(),projectType:z.string().max(100).optional(),disciplines:z.array(z.string().max(80)).default([]),initialIdea:z.string().max(4000).optional(),estimatedWeeks:z.coerce.number().int().min(1).max(260).optional(),note:z.string().max(2000).optional()}).parse(req.body);const {rows:ch}=await query("select id from challenges where ref=$1",[req.params.ref]);if(!ch[0])throw notFound("Challenge");await query(`insert into university_challenge_reviews(challenge_id,institution_id,status,department_ids,faculty_mentor_id,project_type,disciplines,initial_idea,estimated_weeks,note,reviewed_by,reviewed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) on conflict(challenge_id,institution_id) do update set status=excluded.status,department_ids=excluded.department_ids,faculty_mentor_id=excluded.faculty_mentor_id,project_type=excluded.project_type,disciplines=excluded.disciplines,initial_idea=excluded.initial_idea,estimated_weeks=excluded.estimated_weeks,note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=now(),updated_at=now()`,[ch[0].id,m.institution_id,x.status,x.departmentIds,x.facultyMentorId||null,x.projectType||null,x.disciplines,x.initialIdea||null,x.estimatedWeeks||null,x.note||null,req.user.id]);await audit(m,req.user.id,`challenge.${x.status}`,"challenge",req.params.ref,null,x);res.json({ok:true});}));

router.get("/proposals",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query(`select p.ref,p.title,p.status,p.current_version,p.updated_at,ch.ref challenge_ref,ch.title challenge from campus_proposals p join challenges ch on ch.id=p.challenge_id where p.institution_id=$1 order by p.updated_at desc`,[m.institution_id]);res.json({proposals:rows});}));
router.get("/proposals/:ref",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query(`select p.*,ch.ref challenge_ref,ch.title challenge from campus_proposals p join challenges ch on ch.id=p.challenge_id where p.ref=$1 and p.institution_id=$2`,[req.params.ref,m.institution_id]);if(!rows[0])throw notFound("Proposal");const [versions,docs]=await Promise.all([query("select version,submitted_at,change_note from campus_proposal_versions where proposal_id=$1 order by version desc",[rows[0].id]),query("select id,filename,document_type,mime_type,size_bytes,version,uploaded_at from campus_documents where proposal_id=$1 and status='uploaded' order by document_type,version desc",[rows[0].id])]);res.json({proposal:rows[0],versions:versions.rows,documents:docs.rows});}));
router.post("/writing-assistant",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const x=z.object({text:z.string().trim().min(3).max(6000),action:z.enum(["improve","rephrase","professional","concise","expand","summarize","grammar","translate"]).default("improve")}).parse(req.body);const suggestion=await groqComplete({apiKey:process.env.CAMPUS_GROQ_API_KEY,model:process.env.CAMPUS_GROQ_MODEL||"llama-3.3-70b-versatile",system:"You are a careful CivicLense proposal writing assistant. Improve only wording. Never invent costs, partnerships, approvals, results, research findings, dates, names, or deployment claims. Return only the revised text.",messages:[{role:"user",content:`Action: ${x.action}\nText:\n${x.text}`}],maxTokens:1400,temperature:0.2});await audit(m,req.user.id,"proposal.writing_suggestion","proposal","draft",null,{action:x.action});res.json({suggestion});}));
router.post("/proposals",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const x=z.object({challengeRef:z.string(),title:z.string().trim().min(8).max(180),projectType:z.string().max(100).optional(),durationWeeks:z.coerce.number().int().min(1).max(260).optional(),sections:z.record(z.any()).default({})}).parse(req.body);const {rows:ch}=await query("select id from challenges where ref=$1",[x.challengeRef]);if(!ch[0])throw notFound("Challenge");const {rows}=await query(`insert into campus_proposals(institution_id,challenge_id,title,project_type,duration_weeks,sections,created_by) values($1,$2,$3,$4,$5,$6,$7) returning ref`,[m.institution_id,ch[0].id,x.title,x.projectType||null,x.durationWeeks||null,JSON.stringify(x.sections),req.user.id]);await audit(m,req.user.id,"proposal.created","proposal",rows[0].ref,null,x);res.status(201).json({ref:rows[0].ref});}));
router.patch("/proposals/:ref",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const x=z.object({title:z.string().trim().min(8).max(180),projectType:z.string().max(100).optional(),durationWeeks:z.coerce.number().int().min(1).max(260).optional(),sections:z.record(z.any()).default({})}).parse(req.body);const {rows}=await query(`update campus_proposals set title=$3,project_type=$4,duration_weeks=$5,sections=$6,updated_at=now() where ref=$1 and institution_id=$2 and status in ('draft','revision_requested') returning id`,[req.params.ref,m.institution_id,x.title,x.projectType||null,x.durationWeeks||null,JSON.stringify(x.sections)]);if(!rows[0])throw badRequest("Only a draft or revision-requested proposal can be edited.");await audit(m,req.user.id,"proposal.edited","proposal",req.params.ref,null,x);res.json({ok:true});}));
router.post("/proposals/:ref/submit",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);if(!canManage(m))throw badRequest("Only faculty or a coordinator can submit a proposal.");const {rows}=await query(`select p.id,p.title,p.challenge_id,p.sections,p.current_version,p.status,ch.department_id from campus_proposals p join challenges ch on ch.id=p.challenge_id where p.ref=$1 and p.institution_id=$2`,[req.params.ref,m.institution_id]);if(!rows[0])throw notFound("Proposal");if(!["draft","revision_requested"].includes(rows[0].status))throw badRequest("This proposal is not ready for submission.");const proposal=rows[0],version=proposal.current_version+1,status=version===1?"submitted":"resubmitted";await transaction(async c=>{await c.query("insert into campus_proposal_versions(proposal_id,version,sections,submitted_by) values($1,$2,$3,$4)",[proposal.id,version,JSON.stringify(proposal.sections),req.user.id]);
  // Carry the mentor named on the challenge review onto the proposal. Staff
  // review shows it, and approval copies it to projects.faculty_lead — which
  // was always null because nothing ever populated this column.
  await c.query("update campus_proposals set faculty_mentor_id=coalesce(faculty_mentor_id,(select faculty_mentor_id from university_challenge_reviews where challenge_id=$2 and institution_id=$3)) where id=$1",[proposal.id,proposal.challenge_id,m.institution_id]);
  await c.query("update campus_proposals set current_version=$2,status=$3,updated_at=now() where id=$1",[proposal.id,version,status])});const reviewers=(await query("select p.id from profiles p left join officers o on o.id=p.id where p.role='global_admin' or (p.role='super_admin' and o.department_id=$1)",[proposal.department_id])).rows;await Promise.all(reviewers.map(r=>notify({userId:r.id,kind:"proposal_submitted",context:{proposal:proposal.title,institution:m.name}})));await audit(m,req.user.id,`proposal.${status}`,"proposal",req.params.ref,null,{version});res.json({ok:true,version,status});}));
// Compatibility endpoint for older clients. Keep it subject to the same role,
// draft/revision, document type, storage, and audit rules as /attachments.
router.post("/proposals/:ref/documents",requireAuth,upload.single("file"),wrap(async(req,res)=>{
  const m=await campusUser(req.user.id);
  if(!canManage(m))throw badRequest("Only faculty or a coordinator can upload proposal documents.");
  if(!req.file)throw badRequest("Upload a PDF, DOC, or DOCX file no larger than 15 MB.");
  const proposal=await ownedProposal(req.params.ref,m.institution_id);
  if(!["draft","revision_requested"].includes(proposal.status))throw badRequest("Upload a new document after a revision is requested; submitted versions are preserved.");
  const version=(await query("select coalesce(max(version),0)+1 as v from campus_documents where proposal_id=$1 and document_type='proposal'",[proposal.id])).rows[0].v;
  const mimeType=req.file.mimetype === "application/octet-stream" ? "application/pdf" : req.file.mimetype;
  const created=(await query("insert into campus_documents(institution_id,proposal_id,kind,document_type,filename,mime_type,size_bytes,storage_path,version,uploaded_by) values($1,$2,'proposal','proposal',$3,$4,$5,'pending',$6,$7) returning id,filename,document_type,status,version,uploaded_at",[m.institution_id,proposal.id,req.file.originalname,mimeType,req.file.size,version,req.user.id])).rows[0];
  const safeName=req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"); const path=`proposals/${proposal.id}/documents/${created.id}/v${version}-${safeName}`;
  try { await uploadCampusDocument(path,req.file); await query("update campus_documents set storage_path=$2 where id=$1",[created.id,path]); }
  catch(error) { await query("delete from campus_documents where id=$1",[created.id]); console.error("[Proposal Documents]",{proposalId:req.params.ref,userId:req.user.id,institutionId:m.institution_id,filename:req.file.originalname,storageUpload:"failed"}); throw error; }
  await audit(m,req.user.id,"proposal.document_uploaded","proposal",proposal.ref,null,{filename:created.filename,version,documentType:"proposal"});
  res.status(201).json({document:{...created,document_type:"proposal",status:"uploaded"}});
}));
router.get("/documents/:id/url",requireAuth,wrap(async(req,res)=>{const m=await campusUser(req.user.id);const {rows}=await query("select storage_path,filename from campus_documents where id=$1 and institution_id=$2",[req.params.id,m.institution_id]);if(!rows[0])throw notFound("Document");const url=await signedCampusUrl(rows[0].storage_path);if(!url)throw badRequest("A secure preview link could not be created.");res.json({url,filename:rows[0].filename});}));

const quotationItemSchema = z.object({ description:z.string().trim().min(2).max(200), category:z.enum(["people","equipment","materials","travel","software","other"]).default("other"), quantity:z.coerce.number().positive().max(100000), unit:z.string().trim().max(40).optional(), unitCost:z.coerce.number().min(0).max(10000000), taxRate:z.coerce.number().min(0).max(100).default(0) });

async function ownedProposal(ref, institutionId) {
  const { rows } = await query("select p.*,ch.ref challenge_ref,ch.title challenge from campus_proposals p join challenges ch on ch.id=p.challenge_id where p.ref=$1 and p.institution_id=$2", [ref, institutionId]);
  if (!rows[0]) throw notFound("Proposal");
  return rows[0];
}

/**
 * The mentor lives on the challenge review, which is where the Campus portal
 * actually captures it. campus_proposals.faculty_mentor_id was only ever read,
 * never written, so a proposal could not name a mentor at all.
 */
const mentorForProposal = (proposal, institutionId) =>
  query("select faculty_mentor_id from university_challenge_reviews where challenge_id=$1 and institution_id=$2",
    [proposal.challenge_id, institutionId]);

/**
 * What the checklist means.
 *
 * `ready` mirrors the database guard in 0044 exactly — the four sections, a
 * quotation, and an uploaded document of type 'proposal'. It previously also
 * required a faculty mentor and a student team, and neither could ever be
 * satisfied: nothing wrote campus_proposals.faculty_mentor_id, and the team is
 * read from a project that is only created once the proposal is approved. So
 * `ready` was false forever and the Submit button it gates was permanently
 * disabled. Those two stay on the list as advisory rows, because they are
 * genuinely worth completing — they just are not submission blockers, and the
 * database does not treat them as any.
 */
router.get("/proposals/:ref/checklist", requireAuth, wrap(async (req,res) => {
  const m=await campusUser(req.user.id); const proposal=await ownedProposal(req.params.ref,m.institution_id);
  const [documents, quotation, team, mentor] = await Promise.all([
    // Matches the submission guard: any other document type is supporting
    // material, not the proposal itself.
    query("select count(*)::int count from campus_documents where proposal_id=$1 and document_type='proposal' and status='uploaded'",[proposal.id]),
    query("select id from quotations where proposal_id=$1",[proposal.id]),
    query("select count(*)::int count from project_members pm join projects p on p.id=pm.project_id where p.challenge_id=$1 and p.institution_id=$2",[proposal.challenge_id,m.institution_id]),
    mentorForProposal(proposal,m.institution_id),
  ]);
  const sections=proposal.sections||{};
  const required=[
    ["Problem statement",Boolean(sections.problem?.trim())], ["Proposed solution",Boolean(sections.solution?.trim())],
    ["Implementation timeline",Boolean(sections.implementation?.trim())], ["Expected impact",Boolean(sections.impact?.trim())],
    ["Quotation",Boolean(quotation.rows[0])], ["Proposal document",documents.rows[0].count>0],
  ].map(([label,ready])=>({label,ready,required:true}));
  const advisory=[
    ["Faculty mentor",Boolean(proposal.faculty_mentor_id||mentor.rows[0]?.faculty_mentor_id)],
    ["Student team",team.rows[0].count>0],
  ].map(([label,ready])=>({label,ready,required:false}));
  res.json({checklist:[...required,...advisory],ready:required.every(x=>x.ready)});
}));

router.get("/proposals/:ref/quotation", requireAuth, wrap(async(req,res)=>{
  const m=await campusUser(req.user.id); const proposal=await ownedProposal(req.params.ref,m.institution_id);
  const {rows}=await query("select * from quotations where proposal_id=$1",[proposal.id]); const quotation=rows[0]||null;
  const items=quotation ? (await query("select id,description,category,quantity,unit,unit_cost,tax_rate,position from quotation_items where quotation_id=$1 order by position",[quotation.id])).rows : [];
  const subtotal=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_cost),0); const tax=items.reduce((sum,item)=>sum+Number(item.quantity)*Number(item.unit_cost)*Number(item.tax_rate||0)/100,0);
  res.json({quotation:quotation&&{...quotation,items,subtotal,tax,total:subtotal+tax}});
}));

router.put("/proposals/:ref/quotation", requireAuth, wrap(async(req,res)=>{
  const m=await campusUser(req.user.id); if(!canManage(m))throw badRequest("Only faculty or a coordinator can update a quotation.");
  const input=z.object({title:z.string().trim().min(3).max(160),durationWeeks:z.coerce.number().int().min(1).max(104),items:z.array(quotationItemSchema).min(1).max(40)}).parse(req.body);
  const proposal=await ownedProposal(req.params.ref,m.institution_id); if(!["draft","revision_requested"].includes(proposal.status))throw badRequest("The quotation can only be edited while the proposal is a draft or needs revision.");
  const subtotal=input.items.reduce((sum,item)=>sum+item.quantity*item.unitCost,0); const tax=input.items.reduce((sum,item)=>sum+item.quantity*item.unitCost*item.taxRate/100,0); const total=subtotal+tax;
  const quotation=await transaction(async c=>{
    let found=(await c.query("select id,ref from quotations where proposal_id=$1 for update",[proposal.id])).rows[0];
    if(!found) { const existing=(await c.query("select id,ref from quotations where challenge_id=$1 and institution_id=$2 and proposal_id is null for update",[proposal.challenge_id,m.institution_id])).rows[0]; if(existing){found=existing;await c.query("update quotations set proposal_id=$2 where id=$1",[found.id,proposal.id]);} else { found=(await c.query("insert into quotations(challenge_id,institution_id,proposal_id,title,approach,total_cost,duration_weeks,status,submitted_by,tax_rate) values($1,$2,$3,$4,$5,$6,$7,'draft',$8,0) returning id,ref",[proposal.challenge_id,m.institution_id,proposal.id,input.title,(proposal.sections?.solution||proposal.sections?.problem||"Campus proposal quotation").padEnd(100,"."),total,input.durationWeeks,req.user.id])).rows[0]; } }
    await c.query("update quotations set title=$2,approach=$3,total_cost=$4,duration_weeks=$5,updated_at=now() where id=$1",[found.id,input.title,(proposal.sections?.solution||proposal.sections?.problem||"Campus proposal quotation").padEnd(100,"."),total,input.durationWeeks]);
    await c.query("delete from quotation_items where quotation_id=$1",[found.id]);
    for(const [position,item] of input.items.entries()) await c.query("insert into quotation_items(quotation_id,description,category,quantity,unit,unit_cost,tax_rate,position) values($1,$2,$3,$4,$5,$6,$7,$8)",[found.id,item.description,item.category,item.quantity,item.unit||"",item.unitCost,item.taxRate,position]);
    await c.query("update quotations set total_cost=$2,updated_at=now() where id=$1",[found.id,total]); return found;
  });
  await audit(m,req.user.id,"proposal.quotation_updated","proposal",proposal.ref,null,{quotation:quotation.ref,total}); res.json({quotation:{ref:quotation.ref,subtotal,tax,total}});
}));

router.post("/proposals/:ref/quotation/pdf", requireAuth, wrap(async(req,res)=>{
  const m=await campusUser(req.user.id); if(!canManage(m))throw badRequest("Only faculty or a coordinator can generate a quotation PDF."); const proposal=await ownedProposal(req.params.ref,m.institution_id);
  const quote=(await query("select * from quotations where proposal_id=$1",[proposal.id])).rows[0]; if(!quote)throw badRequest("Create a structured quotation before generating its PDF.");
  const items=(await query("select description,quantity,unit,unit_cost,tax_rate,line_total from quotation_items where quotation_id=$1 order by position",[quote.id])).rows; if(!items.length)throw badRequest("Add at least one quotation item before generating its PDF.");
  const subtotal=items.reduce((sum,item)=>sum+Number(item.line_total),0),tax=items.reduce((sum,item)=>sum+Number(item.line_total)*Number(item.tax_rate||0)/100,0),total=subtotal+tax;
  const existing=await query("select coalesce(max(version),0)+1 v from campus_documents where proposal_id=$1 and document_type='quotation'",[proposal.id]); const version=existing.rows[0].v; const filename=`Quotation-${proposal.ref}-v${version}.pdf`;
  const created=(await query("insert into campus_documents(institution_id,proposal_id,kind,document_type,filename,mime_type,size_bytes,storage_path,version,uploaded_by) values($1,$2,'quotation','quotation',$3,'application/pdf',$4,'pending',$5,$6) returning id,uploaded_at",[m.institution_id,proposal.id,filename,0,version,req.user.id])).rows[0];
  const file={buffer:quotationPdf({proposal,institution:m.name,quotation:quote,items,subtotal,tax,total}),mimetype:"application/pdf"}; const path=`proposals/${proposal.id}/documents/${created.id}/v${version}-${filename}`; file.size=file.buffer.length;
  try{await uploadCampusDocument(path,file);await query("update campus_documents set storage_path=$2,size_bytes=$3 where id=$1",[created.id,path,file.size]);}catch(error){await query("delete from campus_documents where id=$1",[created.id]);throw error;}
  await audit(m,req.user.id,"proposal.quotation_pdf_generated","proposal",proposal.ref,null,{filename,version});res.status(201).json({document:{...created,filename,version,size_bytes:file.size,document_type:"quotation"}});
}));

router.delete("/proposals/:ref/documents/:id", requireAuth, wrap(async(req,res)=>{
  const m=await campusUser(req.user.id); const proposal=await ownedProposal(req.params.ref,m.institution_id); if(!["draft","revision_requested"].includes(proposal.status))throw badRequest("Documents cannot be removed after submission.");
  const {rows}=await query("select id,storage_path,filename from campus_documents where id=$1 and proposal_id=$2 and institution_id=$3",[req.params.id,proposal.id,m.institution_id]); if(!rows[0])throw notFound("Document");
  const removed=await storage.storage.from(bucket).remove([rows[0].storage_path]); if(removed.error)throw badRequest("The private document could not be removed."); await query("delete from campus_documents where id=$1",[rows[0].id]); await audit(m,req.user.id,"proposal.document_deleted","proposal",proposal.ref,null,{filename:rows[0].filename}); res.json({ok:true});
}));

router.post("/proposals/:ref/attachments", requireAuth, upload.single("file"), wrap(async(req,res)=>{
  const m=await campusUser(req.user.id); if(!req.file)throw badRequest("Choose a PDF, DOC, or DOCX file no larger than 15 MB.");
  const proposal=await ownedProposal(req.params.ref,m.institution_id); if(!["draft","revision_requested"].includes(proposal.status))throw badRequest("Upload a new document after a revision is requested; submitted versions are preserved.");
  const documentType=z.enum(["proposal","technical","research","architecture","implementation","testing","quotation","approval","other"]).catch("other").parse(req.body.documentType);
  const version=(await query("select coalesce(max(version),0)+1 v from campus_documents where proposal_id=$1 and document_type=$2",[proposal.id,documentType])).rows[0].v;
  const mimeType=req.file.mimetype === "application/octet-stream" ? "application/pdf" : req.file.mimetype;
  const created=(await query("insert into campus_documents(institution_id,proposal_id,kind,document_type,filename,mime_type,size_bytes,storage_path,version,uploaded_by) values($1,$2,$3,$3,$4,$5,$6,'pending',$7,$8) returning id,filename,version,uploaded_at",[m.institution_id,proposal.id,documentType,req.file.originalname,mimeType,req.file.size,version,req.user.id])).rows[0];
  const safeName=req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"); const path=`proposals/${proposal.id}/documents/${created.id}/v${version}-${safeName}`;
  try { await uploadCampusDocument(path,req.file); await query("update campus_documents set storage_path=$2 where id=$1",[created.id,path]); }
  catch(error) { await query("delete from campus_documents where id=$1",[created.id]); console.error("[Proposal Documents]",{proposalId:req.params.ref,userId:req.user.id,institutionId:m.institution_id,filename:req.file.originalname,storageUpload:"failed"}); throw error; }
  // An externally prepared quotation PDF is a valid financial submission. It
  // gets a zero-value header in the existing quotations table so the proposal
  // has one canonical quotation relationship without forcing duplicate manual
  // line items. Staff can inspect the protected source PDF.
  if(documentType === "quotation") await query(`insert into quotations(challenge_id,institution_id,proposal_id,title,approach,total_cost,duration_weeks,status,submitted_by)
    select $1,$2,$3,$4,$5,0,$6,'draft',$7 where not exists(select 1 from quotations where proposal_id=$3)`,[proposal.challenge_id,m.institution_id,proposal.id,req.file.originalname,"External quotation PDF attached to the Campus proposal.".padEnd(100,"."),proposal.duration_weeks||1,req.user.id]);
  console.info("[Proposal Documents]",{proposalId:req.params.ref,userId:req.user.id,institutionId:m.institution_id,filename:req.file.originalname,storageUpload:"ok"});
  await audit(m,req.user.id,"proposal.document_uploaded","proposal",proposal.ref,null,{filename:created.filename,version,documentType}); res.status(201).json({document:{...created,document_type:documentType,status:"uploaded"}});
}));
export default router;
