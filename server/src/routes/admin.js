import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, badRequest, HttpError } from "../middleware/errors.js";
import { signedUrl, signedCampusUrl } from "../services/storage.js";
import { notify } from "../services/notifications.js";

const router = Router();
router.use(requireAuth, requireMinRole("super_admin"));

/**
 * Review scope, matching staff_can_review_challenge() from migration 0042:
 * a global admin sees every proposal, a super admin sees their own
 * department's. A super admin with no officers row has no department, and
 * `null` here meant the `$1 is null` branch fired and they silently saw every
 * institution's proposals in the city — the opposite of what RLS grants the
 * same account. -1 matches no department, so they see nothing until they are
 * given one.
 */
const proposalScope = (user) => (user.role === "global_admin" ? null : user.departmentId ?? -1);
const proposalVisible = `(p.status in ('submitted','under_review','revision_requested','resubmitted','approved','rejected') and ($1::int is null or ch.department_id=$1))`;

/* GET /api/admin/overview — everything the command centre first paints. */
/* Campus proposals are reviewed in this existing staff/admin route. */
router.get("/proposals", wrap(async (req, res) => {
  const status = String(req.query.status || "all");
  const allowed = ["all", "submitted", "under_review", "revision_requested", "resubmitted", "approved", "rejected"];
  if (!allowed.includes(status)) throw badRequest("Unknown proposal status.");
  const scope = proposalScope(req.user);
  const { rows } = await query(`select p.ref,p.title,p.status,p.current_version,p.duration_weeks,p.created_at,p.updated_at,p.reviewed_at,p.review_comment,
      i.name institution,ch.ref challenge_ref,ch.title challenge,d.name department,mentor.full_name faculty_mentor,
      (select coalesce(sum(q.total_cost),0) from quotations q where q.challenge_id=p.challenge_id and q.institution_id=p.institution_id) budget
    from campus_proposals p join institutions i on i.id=p.institution_id join challenges ch on ch.id=p.challenge_id
    left join departments d on d.id=ch.department_id left join profiles mentor on mentor.id=p.faculty_mentor_id
    where ${proposalVisible} and ($2='all' or p.status=$2) order by p.updated_at desc`, [scope, status]);
  const { rows: counts } = await query(`select p.status,count(*)::int count from campus_proposals p join challenges ch on ch.id=p.challenge_id where ${proposalVisible} group by p.status`, [scope]);
  res.json({ proposals: rows, counts: Object.fromEntries(counts.map((x) => [x.status, x.count])) });
}));

router.get("/proposals/:ref", wrap(async (req, res) => {
  const scope = proposalScope(req.user);
  const { rows } = await query(`select p.*,i.name institution,ch.ref challenge_ref,ch.title challenge,ch.summary challenge_summary,d.name department,mentor.full_name faculty_mentor
    from campus_proposals p join institutions i on i.id=p.institution_id join challenges ch on ch.id=p.challenge_id left join departments d on d.id=ch.department_id left join profiles mentor on mentor.id=p.faculty_mentor_id
    where p.ref=$2 and ${proposalVisible}`, [scope, req.params.ref]);
  if (!rows[0]) throw badRequest("Proposal is not in your review scope.");
  const proposal = rows[0];
  const [documents, versions, reviews, quotation, team] = await Promise.all([
    query("select cd.id,cd.filename,cd.document_type,cd.mime_type,cd.size_bytes,cd.version,cd.uploaded_at,u.full_name uploaded_by from campus_documents cd left join profiles u on u.id=cd.uploaded_by where cd.proposal_id=$1 and cd.status='uploaded' order by cd.document_type,cd.version desc", [proposal.id]),
    query("select version,submitted_at,change_note,submitted_by from campus_proposal_versions where proposal_id=$1 order by version desc", [proposal.id]),
    query("select r.*,p.full_name reviewer from campus_proposal_reviews r join profiles p on p.id=r.reviewer_id where r.proposal_id=$1 order by r.created_at desc", [proposal.id]),
    query("select q.id,q.ref,q.total_cost,q.currency,q.duration_weeks,q.deliverables,q.status,q.tax_rate,q.updated_at from quotations q where q.proposal_id=$1", [proposal.id]),
    query("select pm.role,pm.discipline,p.full_name from project_members pm join profiles p on p.id=pm.profile_id join projects project on project.id=pm.project_id where project.challenge_id=$1 and project.institution_id=$2", [proposal.challenge_id, proposal.institution_id]),
  ]);
  const quote = quotation.rows[0] || null;
  const items = quote ? (await query("select description,quantity,unit,unit_cost,tax_rate,line_total,position from quotation_items where quotation_id=$1 order by position", [quote.id])).rows : [];
  const subtotal=items.reduce((total,item)=>total+Number(item.line_total),0); const tax=items.reduce((total,item)=>total+Number(item.line_total)*Number(item.tax_rate||0)/100,0);
  res.json({ proposal, documents: documents.rows, versions: versions.rows, reviews: reviews.rows, quotation: quote ? { ...quote, items, subtotal, tax, grand_total:subtotal+tax } : null, team: team.rows });
}));

router.get("/proposals/:ref/documents/:id/url", wrap(async (req, res) => {
  const scope = proposalScope(req.user);
  const { rows } = await query(`select cd.storage_path,cd.filename from campus_documents cd join campus_proposals p on p.id=cd.proposal_id join challenges ch on ch.id=p.challenge_id where cd.id=$2 and p.ref=$3 and ${proposalVisible}`, [scope, req.params.id, req.params.ref]);
  if (!rows[0]) throw badRequest("Document is not in your review scope.");
  const url = await signedCampusUrl(rows[0].storage_path);
  if (!url) throw badRequest("A secure document link could not be created.");
  res.json({ url, filename: rows[0].filename });
}));

router.post("/proposals/:ref/review", wrap(async (req, res) => {
  const input = z.object({ decision: z.enum(["under_review", "revision_requested", "approved", "rejected"]), comment: z.string().trim().max(4000).optional() }).parse(req.body);
  if (["revision_requested", "rejected"].includes(input.decision) && !input.comment) throw badRequest("A reason is required for this decision.");
  const scope = proposalScope(req.user);
  const { rows } = await query(`select p.*,i.name institution from campus_proposals p join institutions i on i.id=p.institution_id join challenges ch on ch.id=p.challenge_id where p.ref=$2 and ${proposalVisible}`, [scope, req.params.ref]);
  const proposal = rows[0]; if (!proposal) throw badRequest("Proposal is not in your review scope.");
  const transitions = {
    submitted: ["under_review"],
    resubmitted: ["under_review"],
    under_review: ["revision_requested", "approved", "rejected"],
  };
  if (!transitions[proposal.status]?.includes(input.decision)) {
    throw new HttpError(409, `Cannot ${input.decision.replace(/_/g," ")} while this proposal is ${proposal.status.replace(/_/g," ")}.`);
  }
  let project = null;
  await query("update campus_proposals set status=$2,review_comment=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() where id=$1", [proposal.id, input.decision, input.comment || null, req.user.id]);
  await query("insert into campus_proposal_reviews(proposal_id,reviewer_id,decision,comment) values($1,$2,$3,$4)", [proposal.id, req.user.id, input.decision, input.comment || null]);
  if (input.decision === "approved") { const existing = (await query("select ref from projects where challenge_id=$1 and institution_id=$2", [proposal.challenge_id, proposal.institution_id])).rows[0]; if (existing) project=existing.ref; else { const created=(await query("insert into projects(challenge_id,institution_id,title,approach,stage,faculty_lead) values($1,$2,$3,$4,'approved',$5) returning id,ref", [proposal.challenge_id,proposal.institution_id,proposal.title,proposal.sections?.solution||proposal.sections?.problem||null,proposal.faculty_mentor_id||null])).rows[0]; project=created.ref; await query("insert into project_milestones(project_id,title,position) select $1,title,pos from (values('Problem research',1),('Requirements',2),('Prototype',3),('Testing',4),('Pilot',5),('Deployment',6),('Impact evaluation',7)) x(title,pos)", [created.id]); await query("update challenges set status='in_progress' where id=$1", [proposal.challenge_id]); } }
  const kind = { under_review:"proposal_under_review", revision_requested:"proposal_revision_requested", approved:"proposal_approved", rejected:"proposal_rejected" }[input.decision];
  if (kind) await notify({ userId: proposal.created_by, kind, context: { proposal: proposal.title, reason: input.comment || "" } });
  await query("insert into campus_audit_logs(institution_id,actor,action,entity,entity_id,after) values($1,$2,$3,'proposal',$4,$5)", [proposal.institution_id,req.user.id,`proposal.${input.decision}`,proposal.ref,JSON.stringify({comment:input.comment||null,project})]);
  res.json({ ok:true, project });
}));

router.get(
  "/overview",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;

    const [stats, complaints, clusters, wards, departments, escalations] = await Promise.all([
      query(
        `select
           count(*)                                                              as total,
           count(*) filter (where created_at::date = current_date)               as today,
           count(*) filter (where severity = 'critical'
                              and status not in ('resolved','rejected'))         as critical,
           count(*) filter (where sla_deadline < now() and resolved_at is null)  as sla_breached,
           count(*) filter (where authenticity <> 'likely_genuine')              as flagged_images,
           round(100.0 * count(*) filter (where status = 'resolved')
                 / nullif(count(*),0), 1)                                        as resolution_rate
          ,(select count(*)::int from campus_proposals proposal join challenges proposal_challenge on proposal_challenge.id=proposal.challenge_id where proposal.status in ('submitted','resubmitted') and ($1::int is null or proposal_challenge.department_id=$1)) as submitted_proposals
          ,(select count(*)::int from campus_proposals proposal join challenges proposal_challenge on proposal_challenge.id=proposal.challenge_id where proposal.status='under_review' and ($1::int is null or proposal_challenge.department_id=$1)) as under_review_proposals
         from complaints
         where ($1::int is null or department_id = $1)`,
        [scope]
      ),
      query(
        `select c.ref, cat.name as category, c.severity,
                st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng
              , (select storage_path from complaint_images i
                 where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path
         from complaints c
         left join categories cat on cat.id = c.category_id
         where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn'
           and c.location is not null
         order by c.created_at desc limit 300`,
        [scope]
      ),
      query(
        `select c.ref, cat.name as category, c.report_count,
                st_y(c.centroid::geometry) as lat, st_x(c.centroid::geometry) as lng,
                case when c.trend_pct > 50 then 'critical' else 'high' end as severity,
                count(*) filter (where c.is_hotspot) over () as hotspots,
                count(*) filter (where c.is_emerging) over () as emerging
         from clusters c
         left join categories cat on cat.id = c.category_id
         where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn'
           and c.status <> 'resolved'
           -- A cluster whose centroid never got computed cannot be plotted, and
           -- Leaflet throws rather than skipping it.
           and c.centroid is not null`,
        [scope]
      ),
      query(`select code, st_asgeojson(geom)::json as geojson from wards where geom is not null`),
      query(
        `select d.name,
                count(*) filter (where c.status not in ('resolved','rejected')) as open,
                least(100, round(100.0 * count(*) filter (where c.status not in ('resolved','rejected'))
                      / greatest(count(*),1))) as load
         from departments d left join complaints c on c.department_id = d.id
         where ($1::int is null or d.id = $1)
         group by d.name order by open desc`,
        [scope]
      ),
      query(
        `select c.ref, cat.name as category, w.code as ward, c.report_count
         from clusters c
         left join categories cat on cat.id = c.category_id
         left join lateral (
         select w.code from wards w
         where st_intersects(w.geom, c.centroid)
         order by st_area(w.geom::geometry) asc
         limit 1
       ) w on true
         where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn' and c.status <> 'resolved'
         order by c.report_count desc limit 5`,
        [scope]
      ),
    ]);

    res.json({
      stats: {
        ...stats.rows[0],
        hotspots: clusters.rows[0]?.hotspots ?? 0,
        emerging: clusters.rows[0]?.emerging ?? 0,
      },
      map: {
        // Signed per pin. A thumbnail in the popup is the difference between
        // "a dot on Kurla" and knowing at a glance whether it is worth sending
        // someone — the photograph is the whole basis of the report.
        complaints: await Promise.all(
          complaints.rows.map(async (r) => ({
            ...r,
            image_url: r.image_path ? await signedUrl(r.image_path, 3600) : null,
            image_path: undefined,
          }))
        ),
        clusters: clusters.rows,
        // Malformed geometry should cost one ward outline, not the whole map.
        wards: wards.rows
          .map((w) => {
            const ring = w.geojson?.coordinates?.[0]?.[0];
            if (!Array.isArray(ring) || ring.length < 3) return null;
            return { code: w.code, polygon: ring.map(([lng, lat]) => [lat, lng]) };
          })
          .filter(Boolean),
      },
      departments: departments.rows,
      escalations: escalations.rows.map((e) => ({ ...e, location: `Ward ${e.ward}` })),
    });
  })
);


/* GET /api/admin/complaints — the working list, with filters and assignment state. */
router.get(
  "/complaints",
  wrap(async (req, res) => {
    const scope = req.user.role === "global_admin" ? null : req.user.departmentId;
    const { status, severity, ward, unassigned, overdue, q } = req.query;

    const { rows } = await query(
      `select c.ref, cat.name as category, c.severity, c.status, c.created_at,
              c.sla_deadline, c.address, w.code as ward_code, d.name as department,
              st_y(c.location::geometry) as lat, st_x(c.location::geometry) as lng,
              p.full_name as officer, c.assigned_officer,
              cl.ref as cluster_ref, cl.report_count as cluster_size,
              (c.sla_deadline < now() and c.resolved_at is null) as overdue,
              c.rework_count,
              exists (select 1 from resolution_proofs rp where rp.complaint_id = c.id) as has_proof,
              (select storage_path from complaint_images i
               where i.complaint_id = c.id and i.role = 'report' limit 1) as image_path
       from complaints c
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join departments d on d.id = c.department_id
       left join profiles p on p.id = c.assigned_officer
       left join clusters cl on cl.id = c.cluster_id
       where ($1::int is null or c.department_id = $1)
           and c.status <> 'withdrawn'
         -- "open" is not a status but the question people actually ask: what is
         -- still outstanding. Expanding it here means the meaning lives in one
         -- place rather than in every caller.
         and ($2::text is null or $2 = ''
              or ($2 = 'open' and c.status not in ('resolved','rejected'))
              or c.status::text = $2)
         and ($3::text is null or c.severity::text = $3)
         and ($4::text is null or w.code = $4)
         and ($5::bool is not true or c.assigned_officer is null)
         and ($6::bool is not true or (c.sla_deadline < now() and c.resolved_at is null))
         and ($7::text is null or c.ref ilike '%' || $7 || '%' or c.address ilike '%' || $7 || '%')
       order by
         case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
         c.sla_deadline asc nulls last
       limit 200`,
      [scope, status || null, severity || null, ward || null,
       unassigned === "true", overdue === "true", q || null]
    );

    const { rows: wards } = await query(`select distinct code from wards order by code`);

    const complaints = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        image_url: r.image_path ? await signedUrl(r.image_path) : null,
      }))
    );

    res.json({ complaints, wards: wards.map((w) => w.code) });
  })
);

/* GET /api/admin/assignable?department= — approved, active officers only. */
router.get(
  "/assignable",
  wrap(async (req, res) => {
    /**
     * Officers who could take this specific complaint.
     *
     * Two things were wrong. It scoped to the *administrator's* department
     * rather than the *complaint's*, so a global admin — who has no department —
     * saw every officer in the city, and a water leak could be assigned to a
     * roads officer. What matters is which department owns the work, not who is
     * doing the assigning.
     *
     * And department heads appeared in the list. A head assigns work; they do
     * not carry it. Putting them among the officers invites exactly what
     * happened — a head assigned to their own complaints.
     */
    const { complaint } = req.query;

    let departmentId = req.user.role === "global_admin" ? null : req.user.departmentId;

    if (complaint) {
      const { rows: c } = await query(
        `select department_id from complaints where ref = $1`,
        [complaint]
      );
      if (c[0]?.department_id) departmentId = c[0].department_id;
    }

    const { rows } = await query(
      `select o.id, p.full_name as name, p.email, d.name as department, o.designation,
              count(c.id) filter (where c.status not in ('resolved','rejected'))::int as open_cases,
              round(100.0 * count(c.id) filter (where c.resolved_at <= c.sla_deadline)
                    / nullif(count(c.id) filter (where c.resolved_at is not null),0)) as sla
       from officers o
       join profiles p on p.id = o.id
       join departments d on d.id = o.department_id
       left join complaints c on c.assigned_officer = o.id
       where o.active and o.approved_at is not null
         and ($1::int is null or o.department_id = $1)
         -- Officers only. A head assigns work rather than carrying it.
         and p.role = 'officer' 
       group by o.id, p.full_name, p.email, d.name, o.designation
       order by open_cases asc`,
      [departmentId]
    );

    res.json({
      officers: rows,
      // Named so the picker can say whose officers these are rather than
      // presenting an unexplained subset.
      department: rows[0]?.department ?? null,
      scoped: Boolean(departmentId),
    });
  })
);

/**
 * POST /api/admin/demo/reset
 *
 * Development only. Clears demo reports and accounts and reseeds.
 *
 * Guarded three ways, because a button that wipes the database is one somebody
 * eventually presses by accident: global admin only, refused when NODE_ENV is
 * production, and the exact confirmation phrase must be typed.
 */
router.post(
  "/demo/reset",
  requireMinRole("global_admin"),
  wrap(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      throw badRequest("The demo reset is disabled in production.");
    }

    const { confirm } = z.object({ confirm: z.string() }).parse(req.body);

    // The phrase is checked again inside the function. Two checks rather than
    // one, since this is the only irreversible operation in the product.
    const { rows } = await query(`select * from reset_demo_data($1)`, [confirm]);

    res.json({
      cleared: rows,
      note: "Schema, reference data and non-demo accounts were not touched.",
    });
  })
);

/** What the demo data should look like, and whether it does. */
router.get(
  "/demo/verify",
  requireMinRole("super_admin"),
  wrap(async (_req, res) => {
    const { rows } = await query(`select * from verify_demo_data()`);
    res.json({
      checks: rows,
      passed: rows.every((r) => r.passed),
    });
  })
);

/**
 * GET /api/admin/ai/performance
 *
 * What the classifier gets wrong, and what to photograph about it.
 *
 * Not an accuracy percentage. "69% accurate" is a number nobody can act on;
 * "blocked drain is called flooding three times in five, and there are eleven
 * training images of it" names a task.
 */
router.get(
  "/ai/performance",
  requireMinRole("super_admin"),
  wrap(async (_req, res) => {
    const [models, confusions, reliability, priorities] = await Promise.all([
      query(`select * from model_versions order by kind, created_at desc`),
      query(`select * from model_accuracy limit 20`),
      query(`select * from category_reliability where predicted_times > 0 limit 30`),
      query(`select * from training_priorities limit 15`),
    ]);

    res.json({
      models: models.rows,
      confusions: confusions.rows,
      reliability: reliability.rows,
      priorities: priorities.rows,
      note:
        "Corrections come from residents and officers who were in front of the thing. " +
        "Nothing retrains automatically — that is a deliberate act with somebody watching.",
    });
  })
);

/**
 * GET /api/admin/duplicates/compare?a=CP-1&b=CP-2
 *
 * Two reports side by side with every factor scored separately.
 *
 * The composite is what the system acts on; the breakdown is what makes the
 * decision arguable. "0.71" invites nobody to ask what it is 0.71 of — "40
 * metres apart, same category, 3 of 64 image bits different" can be checked
 * against the photographs.
 */
router.get(
  "/duplicates/compare",
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { a, b } = z.object({ a: z.string(), b: z.string() }).parse(req.query);

    const { rows } = await query(`select * from compare_reports($1, $2)`, [a, b]);
    const total = rows.find((r) => r.factor === "TOTAL");

    res.json({
      factors: rows.filter((r) => r.factor !== "TOTAL"),
      total: total?.score ?? 0,
      band:
        total?.score >= 85 ? "near_certain"
        : total?.score >= 70 ? "probable"
        : total?.score >= 40 ? "possible" : "unrelated",
      bands: [
        { id: "near_certain", from: 85, label: "Near certain", action: "grouped automatically" },
        { id: "probable", from: 70, label: "Probable", action: "grouped, with the reason recorded" },
        { id: "possible", from: 40, label: "Possible", action: "shown to the resident before filing" },
        { id: "unrelated", from: 0, label: "Unrelated", action: "ignored" },
      ],
    });
  })
);

/** Recent scores, so the bands can be checked against real decisions. */
router.get(
  "/duplicates/recent",
  requireMinRole("super_admin"),
  wrap(async (_req, res) => {
    const { rows } = await query(
      `select d.*, c.ref, cat.name as category
       from duplicate_scores d
       join complaints c on c.id = d.complaint_id
       left join categories cat on cat.id = c.category_id
       order by d.scored_at desc limit 40`
    );
    res.json({ scores: rows });
  })
);

export default router;
