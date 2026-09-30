/**
 * The CivicLense demo dataset.
 *
 *   npm run db:seed         build it
 *   npm run db:reset-demo   remove it, and nothing else
 *
 * What this is trying to be: a platform that has been running for about seven
 * months in a city, with the residue that leaves behind. Reports that were
 * closed properly and reports that were closed badly and came back. Officers
 * who hit their deadlines and officers who do not. Challenges nobody has
 * picked up. A proposal that was rejected for a reason somebody wrote down.
 * An empty dashboard and a dashboard full of identical rows are both obviously
 * fake; the difference between them is where the work is.
 *
 * Everything is deterministic. The same seed run twice produces the same
 * dataset, so a screenshot taken today still matches the data tomorrow.
 *
 * Two rules the reset depends on:
 *   · every row this script creates is reachable from is_demo on complaints,
 *     clusters, challenges, institutions or profiles;
 *   · nothing without that flag is ever modified or deleted.
 * Reference data — wards, categories, departments, contracts, establishments —
 * is read and never written.
 */
import "dotenv/config";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CITIZENS, OFFICERS, STAFF, UNIVERSITIES, PARTNERS, FACULTY, STUDENTS, SKILLS_BY_TAG } from "./demo/people.js";
import { WARDS, DESCRIPTIONS, OFFICER_NOTES, COMMENTS, MODERATION, CONFUSABLE, CHALLENGE_THREADS } from "./demo/reports.js";
import { CHALLENGES } from "./demo/storylines.js";
import { makePdf } from "./demo/pdf.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DATASET_ROOT = resolve(SCRIPT_DIR, "../../model/static/dataset");
const EVIDENCE_BUCKET = process.env.STORAGE_BUCKET || "complaint-media";
const DOCUMENT_BUCKET = process.env.CAMPUS_STORAGE_BUCKET || "campus-private";
const DEMO_DOMAIN = "demo.civiclense.in";
const DEMO_PASSWORD = "CivicLense@Demo2026";
/** Everything this script writes to storage lives under here and nowhere else. */
const STORAGE_PREFIX = "demo-seed";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const q = (text, values) => db.query(text, values);

// ============================================================
// Deterministic helpers
// ============================================================

/**
 * A rerun has to produce the same dataset. Math.random() would mean the
 * leaderboard reshuffles every time somebody reseeds before a demo, and a
 * screenshot taken yesterday would no longer match what is on screen.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260911);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (p) => rand() < p;
const round2 = (n) => Math.round(n * 100) / 100;

const NOW = Date.now();
const DAY = 86400000;
const daysAgo = (d) => new Date(NOW - d * DAY);
const hoursAfter = (date, h) => new Date(date.getTime() + h * 3600000);

/** A stable pseudo-random offset in degrees, so a landmark always lands in the same spot. */
function placeOffset(key) {
  const h = createHash("sha1").update(key).digest();
  return [((h[0] - 128) / 128) * 0.006, ((h[1] - 128) / 128) * 0.007];
}

/**
 * A 64-bit hash standing in for the perceptual hash the classifier produces.
 *
 * This is a fixture, not a perceptual hash: it is derived from the file's
 * bytes, so identical files hash identically and different files land far
 * apart. That is enough for the duplicate machinery, which compares Hamming
 * distance — and where the demo needs a near-duplicate (the same problem
 * photographed twice by two residents) a few bits are flipped deliberately,
 * which is what a second photograph of the same scene actually produces.
 * Computing a real perceptual hash here would mean decoding JPEG in Node,
 * which means a dependency the server does not otherwise need.
 */
function fixtureHash(buffer, flipBits = 0) {
  const digest = createHash("sha256").update(buffer).digest();
  let value = digest.readBigUInt64BE(0);
  for (let i = 0; i < flipBits; i++) value ^= 1n << BigInt((i * 11 + 3) % 64);
  return value.toString(16).padStart(16, "0");
}
const hammingHex = (a, b) => {
  let bits = 0;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  while (x) { bits += Number(x & 1n); x >>= 1n; }
  return bits;
};

const SEVERITY = (score) => (score >= 80 ? "critical" : score >= 60 ? "high" : score >= 35 ? "medium" : "low");

// ============================================================
// Evidence: real photographs, filed by what they show
// ============================================================

/**
 * Category to the classifier dataset folder whose photographs genuinely show
 * that problem.
 *
 * Categories absent from this map get no photograph. A report of "no water
 * supply" has nothing to photograph, and attaching a picture of a leaking pipe
 * to it would be inventing evidence — which is worse than a report with no
 * image, because somebody downstream would believe it.
 */
const EVIDENCE_FOLDER = {
  POTHOLE: "pothole", ROADCRACK: "road_crack", MANHOLE: "open_manhole",
  FOOTPATH: "broken_footpath", GARBAGE: "garbage_overflow", DUMPING: "illegal_dumping",
  DEADANIMAL: "dead_animal", DEBRIS: "construction_debris", LEAK: "water_leakage",
  FLOOD: "flooding", CONTAMINATED: "contaminated_water", STREETLIGHT: "broken_streetlight",
  EXPOSEDWIRE: "exposed_wire", SIGNAL: "damaged_traffic_signal", PARKING: "illegal_parking",
  TOILET: "public_toilet_unusable", FOODSTALL: "unhygienic_food_stall", TREEFALL: "fallen_tree",
  DEAD_TREE: "fallen_tree", PARKDAMAGE: "damaged_park_equipment",
  ENCROACHMENT: "footpath_encroachment", HAWKER: "footpath_encroachment",
  STRAY: "stray_animal_concern", DAMP: "damp_or_seepage",
  STAGNANT: "flooding", DRAINBLOCK: "flooding", PIPELINE: "water_leakage",
  SEWAGE: "water_leakage", DAMAGEDPOLE: "broken_streetlight", ROADOBST: "construction_debris",
};

/**
 * Storage calls, retried.
 *
 * This run uploads several hundred objects over about forty minutes, and a
 * single "fetch failed" from a momentary network blip used to abort the whole
 * thing partway through — leaving a half-built dataset and costing the entire
 * run. Transient failures are the normal case at this volume, not an
 * exceptional one.
 *
 * Only the transport is retried. An error the service actually returned — a
 * bad bucket, a rejected file — is reported on the first attempt, because
 * retrying it four times just delays the same message.
 */
async function withRetry(what, fn, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await fn();
      if (result?.error && attempt < attempts && /fetch failed|network|timeout|ECONN|socket/i.test(result.error.message || "")) {
        throw new Error(result.error.message);
      }
      return result;
    } catch (e) {
      if (attempt >= attempts) throw new Error(`${what} failed after ${attempts} attempts: ${e.message}`);
      await new Promise((r) => setTimeout(r, 400 * 2 ** (attempt - 1)));
    }
  }
}

const evidenceFiles = new Map();   // folder -> filenames
const uploadedPaths = new Map();   // local file -> storage path
const fileHashes = new Map();      // local file -> fixture hash

async function evidenceFor(categoryCode, n) {
  const folder = EVIDENCE_FOLDER[categoryCode];
  if (!folder) return null;
  if (!evidenceFiles.has(folder)) {
    const names = (await readdir(join(DATASET_ROOT, folder)))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort();
    evidenceFiles.set(folder, names);
  }
  const names = evidenceFiles.get(folder);
  if (!names.length) return null;
  return { folder, file: names[n % names.length] };
}

/** Uploads once per distinct photograph, however many reports reference it. */
async function uploadEvidence(choice) {
  const local = join(DATASET_ROOT, choice.folder, choice.file);
  if (uploadedPaths.has(local)) return { path: uploadedPaths.get(local), hash: fileHashes.get(local) };

  const body = await readFile(local);
  const ext = choice.file.split(".").pop().toLowerCase();
  const path = `${STORAGE_PREFIX}/evidence/${choice.folder}/${choice.file}`;
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const { error } = await withRetry(`upload ${path}`, () =>
    supa.storage.from(EVIDENCE_BUCKET).upload(path, body, { contentType, upsert: true }));
  if (error) throw new Error(`Could not upload evidence ${path}: ${error.message}`);

  const hash = fixtureHash(body);
  uploadedPaths.set(local, path);
  fileHashes.set(local, hash);
  return { path, hash };
}

/**
 * Every object under a prefix, as a set of full paths.
 *
 * Storage listing is per-folder and does not recurse, so this walks the tree.
 * An entry with no id is a folder rather than a file — that is the only signal
 * the API gives, and treating folders as files would make the validation pass
 * on a prefix that contains nothing.
 */
async function listAll(bucket, prefix) {
  const found = new Set();
  const queue = [prefix];
  while (queue.length) {
    const dir = queue.pop();
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await withRetry(`list ${bucket}/${dir}`, () =>
        supa.storage.from(bucket).list(dir, { limit: 100, offset }));
      if (error) throw new Error(`Could not list ${bucket}/${dir}: ${error.message}`);
      for (const entry of data) {
        const full = `${dir}/${entry.name}`;
        if (entry.id) found.add(full);
        else queue.push(full);
      }
      if (data.length < 100) break;
    }
  }
  return found;
}

async function uploadDocument(path, buffer) {
  const { error } = await withRetry(`upload ${path}`, () =>
    supa.storage.from(DOCUMENT_BUCKET).upload(path, buffer, { contentType: "application/pdf", upsert: true }));
  if (error) throw new Error(`Could not upload document ${path}: ${error.message}`);
}

// ============================================================
// Accounts
// ============================================================

let authIndex = null;

async function loadAuthIndex() {
  authIndex = new Map();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) authIndex.set(u.email?.toLowerCase(), u);
    if (data.users.length < 1000) break;
  }
}

const emailFor = (name, suffix = "") =>
  `${name.toLowerCase().replace(/^(dr|prof|ar)\.\s*/, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}${suffix}@${DEMO_DOMAIN}`;

/**
 * Auth owns the UUID, so the email is the stable identity across reruns. A
 * rerun finds the existing account rather than creating a second one, which is
 * what lets the documented demo credentials keep working.
 */
async function ensureUser(name, email, fields = {}) {
  if (!authIndex) await loadAuthIndex();
  let user = authIndex.get(email);
  if (!user) {
    const { data, error } = await withRetry(`create ${email}`, () =>
      supa.auth.admin.createUser({
        email, password: DEMO_PASSWORD, email_confirm: true,
        user_metadata: { full_name: name, demo: true },
      }));
    if (error) throw new Error(`Could not create ${email}: ${error.message}`);
    user = data.user;
    authIndex.set(email, user);
  }
  await q(
    `insert into profiles (id, email, full_name, role, language, is_demo, phone, city, state, area,
                           institution_id, institution_role, department_id)
     values ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12)
     on conflict (id) do update set
       email=excluded.email, full_name=excluded.full_name, role=excluded.role,
       language=excluded.language, is_demo=true, phone=excluded.phone, city=excluded.city,
       state=excluded.state, area=excluded.area, institution_id=excluded.institution_id,
       institution_role=excluded.institution_role, department_id=excluded.department_id`,
    [user.id, email, name, fields.role || "citizen", fields.language || "en",
     fields.phone || null, fields.city || "Mumbai", "Maharashtra", fields.area || null,
     fields.institutionId || null, fields.institutionRole || null, fields.departmentId || null]
  );
  return user.id;
}

/** A plausible Indian mobile number that cannot be a real one. */
const phoneFor = (i) => `9${String(80000000 + i * 1373).padStart(9, "0")}`.slice(0, 10);

// ============================================================
// Reset
// ============================================================

/**
 * Removes the demo dataset and nothing else.
 *
 * Storage objects go before the rows that point at them. A bucket left full of
 * stale fixtures makes the next run look healthy while serving evidence that
 * belongs to reports that no longer exist, so a failure to remove an object is
 * fatal rather than a warning.
 */
async function reset() {
  const { rows: media } = await q(
    `select distinct i.storage_path from complaint_images i
     join complaints c on c.id = i.complaint_id where c.is_demo`
  );
  const { rows: docs } = await q(
    `select distinct storage_path from campus_documents
     where storage_path like '${STORAGE_PREFIX}/%'`
  );
  await removeObjects(EVIDENCE_BUCKET, media.map((r) => r.storage_path));
  await removeObjects(DOCUMENT_BUCKET, docs.map((r) => r.storage_path));

  const client = await db.connect();
  try {
    await client.query("begin");
    const CH = "(select id from challenges where is_demo)";
    const INST = "(select id from institutions where is_demo)";
    const CP = "(select id from complaints where is_demo)";

    // Order matters more than it looks. quotations.proposal_id cascades from
    // campus_proposals, so deleting proposals first silently takes the
    // quotations with them — and that fails, because projects still point at
    // those quotations. Projects go first, then quotations, then the proposals
    // they came from. The awarded quotation is also unlinked from any project
    // that survives, so a cascade can never strand a live project.
    await client.query(`delete from campus_documents where proposal_id in (select id from campus_proposals where challenge_id in ${CH}) or institution_id in ${INST} or storage_path like '${STORAGE_PREFIX}/%'`);
    await client.query(`delete from project_tasks where project_id in (select id from projects where challenge_id in ${CH})`);
    await client.query(`delete from project_messages where project_id in (select id from projects where challenge_id in ${CH}) or challenge_id in ${CH}`);
    await client.query(`delete from project_outcomes where project_id in (select id from projects where challenge_id in ${CH})`);
    await client.query(`delete from project_milestones where project_id in (select id from projects where challenge_id in ${CH})`);
    await client.query(`delete from project_members where project_id in (select id from projects where challenge_id in ${CH})`);
    await client.query(`delete from project_institutions where project_id in (select id from projects where challenge_id in ${CH}) or institution_id in ${INST}`);
    await client.query(`delete from projects where challenge_id in ${CH} or institution_id in ${INST}`);
    await client.query(`update projects set quotation_id = null where quotation_id in (select id from quotations where challenge_id in ${CH} or institution_id in ${INST})`);
    await client.query(`delete from quotation_items where quotation_id in (select id from quotations where challenge_id in ${CH} or institution_id in ${INST})`);
    await client.query(`delete from quotations where challenge_id in ${CH} or institution_id in ${INST}`);
    await client.query(`delete from campus_proposal_reviews where proposal_id in (select id from campus_proposals where challenge_id in ${CH})`);
    await client.query(`delete from campus_proposal_versions where proposal_id in (select id from campus_proposals where challenge_id in ${CH})`);
    await client.query(`delete from campus_proposals where challenge_id in ${CH} or institution_id in ${INST}`);
    await client.query(`delete from challenge_interest where challenge_id in ${CH} or institution_id in ${INST}`);
    await client.query(`delete from university_challenge_reviews where challenge_id in ${CH} or institution_id in ${INST}`);
    await client.query(`delete from campus_audit_logs where institution_id in ${INST}`);
    await client.query(`delete from challenges where is_demo`);

    await client.query(`delete from duplicate_scores where complaint_id in ${CP} or compared_to in ${CP}`);
    await client.query(`delete from ai_corrections where complaint_id in ${CP}`);
    await client.query(`delete from resolution_proofs where complaint_id in ${CP}`);
    await client.query(`delete from complaint_reviews where complaint_id in ${CP}`);
    await client.query(`delete from complaint_feedback where complaint_id in ${CP}`);
    await client.query(`delete from complaint_followups where complaint_id in ${CP}`);
    await client.query(`delete from complaint_comments where complaint_id in ${CP}`);
    await client.query(`delete from complaint_status_history where complaint_id in ${CP}`);
    await client.query(`delete from complaint_ai_analysis where complaint_id in ${CP}`);
    await client.query(`delete from complaint_images where complaint_id in ${CP}`);
    await client.query(`delete from notifications where complaint_id in ${CP} or user_id in (select id from profiles where is_demo)`);
    await client.query(`delete from reward_events where complaint_id in ${CP} or citizen_id in (select id from profiles where is_demo)`);
    await client.query(`delete from citizen_badges where citizen_id in (select id from profiles where is_demo)`);
    await client.query(`delete from complaints where is_demo`);
    await client.query(`delete from clusters where is_demo`);
    await client.query(`delete from audit_logs where actor in (select id from profiles where is_demo)`);

    await client.query(`update profiles set institution_id = null, institution_role = null where is_demo`);
    await client.query(`delete from campus_member_details where profile_id in (select id from profiles where is_demo)`);
    await client.query(`delete from university_departments where institution_id in ${INST}`);
    // Officers, one at a time. A demo officer who was assigned a real complaint
    // is still referenced by it, and breaking that complaint's assignment to
    // tidy up demo data is exactly the damage reset exists to avoid. Rather
    // than enumerating every foreign key that might point here — there are
    // several and the list grows — each delete is attempted inside a savepoint
    // and the ones that are still referenced are simply left alone. The seed
    // re-upserts them, so a kept row costs nothing.
    const { rows: officerRows } = await client.query(
      "select id from officers where id in (select id from profiles where is_demo)"
    );
    for (const { id } of officerRows) {
      await client.query("savepoint drop_officer");
      try {
        await client.query("delete from officers where id = $1", [id]);
        await client.query("release savepoint drop_officer");
      } catch {
        await client.query("rollback to savepoint drop_officer");
      }
    }
    await client.query(`delete from institutions where is_demo`);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }

  await dropStaleAccounts();
  // Derived from open complaints, so it has to be rebuilt once theirs are gone.
  await q("select rebuild_work_zones(250)");
  console.log("Removed the demo dataset. Nothing outside it was touched.");
}

async function removeObjects(bucket, paths) {
  const own = [...new Set(paths)].filter((p) => p && p.startsWith(`${STORAGE_PREFIX}/`));
  for (let i = 0; i < own.length; i += 100) {
    const batch = own.slice(i, i + 100);
    const { error } = await withRetry(`remove from ${bucket}`, () => supa.storage.from(bucket).remove(batch));
    if (error) throw new Error(`Could not remove demo objects from ${bucket}: ${error.message}`);
  }
}

/**
 * Retires demo accounts from earlier versions of this seed.
 *
 * The previous seed created accounts called "Demo Citizen 01" on a different
 * domain. Left in place they sit in the resident list and the leaderboard with
 * no activity, which is exactly the generated-looking filler this dataset
 * exists to replace. Only accounts flagged is_demo on a demo domain are
 * touched, and any that some other record still points at are left alone
 * rather than forced — an orphaned foreign key would be a worse outcome than
 * a stale name.
 */
async function dropStaleAccounts() {
  const { rows } = await q(
    `select id, email from profiles
     where is_demo and (email like '%@demo.civicpulse.local' or email like '%@${DEMO_DOMAIN}')`
  );
  let removed = 0;
  let kept = 0;
  for (const { id, email } of rows) {
    try {
      await q("delete from profiles where id = $1", [id]);
      await supa.auth.admin.deleteUser(id);
      removed++;
    } catch {
      kept++;
    }
  }
  authIndex = null;
  if (removed || kept) {
    console.log(`Demo accounts: ${removed} retired${kept ? `, ${kept} kept because other records still reference them` : ""}.`);
  }
}

// ============================================================
// Seed
// ============================================================

async function seed() {
  await reset();

  const ref = {
    categories: new Map((await q("select id, code, name, base_severity, default_department_id from categories")).rows.map((r) => [r.code, r])),
    departments: new Map((await q("select id, code, name from departments")).rows.map((r) => [r.code, r])),
    wards: new Map((await q("select id, code, name from wards")).rows.map((r) => [r.code, r])),
    contracts: (await q("select id, department_id from contracts")).rows,
    establishments: (await q("select id, kind::text, ward_id from establishments")).rows,
    questions: (await q("select id, category_id, prompt, options, universal from followup_questions where active")).rows,
    slaHours: new Map((await q("select category_id, severity::text, hours from sla_rules")).rows.map((r) => [`${r.category_id}:${r.severity}`, r.hours])),
  };

  const people = await seedPeople(ref);
  const campus = await seedCampus(people);
  const civic = await seedCivic(ref, people);
  await seedChallenges(ref, people, campus, civic);
  await seedEngagement(ref, people, civic);
  await recomputeStanding();

  // Work zones are derived from wherever open complaints actually cluster, so
  // they are rebuilt rather than seeded. Leaving the old ones in place would
  // give the zone screen groups built around reports that no longer exist.
  const { rows: zones } = await q("select rebuild_work_zones(250) as built");
  console.log(`Work zones: ${zones[0].built} rebuilt from open reports.`);

  await validate();
}

// ── Accounts ────────────────────────────────────────────────

async function seedPeople(ref) {
  const citizens = [];
  for (const [i, [name, ward, tier, lang]] of CITIZENS.entries()) {
    const id = await ensureUser(name, emailFor(name), {
      role: "citizen", language: lang, phone: phoneFor(i),
      area: ref.wards.get(ward)?.name || ward,
    });
    citizens.push({ id, name, ward, tier });
  }

  const officers = [];
  for (const [i, [name, designation, deptCode, ward, performance]] of OFFICERS.entries()) {
    const department = ref.departments.get(deptCode);
    const id = await ensureUser(name, emailFor(name, ".officer"), {
      role: "officer", phone: phoneFor(200 + i), area: ref.wards.get(ward)?.name || ward,
      departmentId: department.id,
    });
    const centre = WARDS[ward]?.centre || [19.076, 72.877];
    await q(
      `insert into officers (id, department_id, base_location, specializations, active, designation, employee_id, work_phone, approved_at)
       values ($1,$2,st_setsrid(st_makepoint($3,$4),4326)::geography,$5,true,$6,$7,$8,now())
       on conflict (id) do update set department_id=excluded.department_id, active=true,
         designation=excluded.designation, base_location=excluded.base_location`,
      [id, department.id, centre[1], centre[0], [department.name], designation,
       `MCGM/${deptCode}/${String(1200 + i * 7)}`, phoneFor(200 + i)]
    );
    officers.push({ id, name, designation, deptCode, departmentId: department.id, ward, performance });
  }

  const staff = [];
  for (const [i, [name, deptCode]] of STAFF.entries()) {
    const department = ref.departments.get(deptCode);
    const id = await ensureUser(name, emailFor(name, ".staff"), {
      role: "super_admin", phone: phoneFor(400 + i), departmentId: department.id,
    });
    // approve_staff_application() writes an officers row for everyone it
    // approves, super admins included — that is where a staff member's
    // department is read from. Seeding the profile alone produced accounts the
    // application itself could not have created, and their proposal approvals
    // screen came up empty because the scope resolved to no department.
    //
    // active is false: they are not field staff and must not appear in the
    // officer lists or on the leaderboard, which both filter on it.
    await q(
      `insert into officers (id, department_id, active, designation, employee_id, work_phone, approved_at)
       values ($1,$2,false,$3,$4,$5,now())
       on conflict (id) do update set department_id = excluded.department_id,
         designation = excluded.designation, active = false`,
      [id, department.id, "Assistant Municipal Commissioner (Ward Office)",
       `MCGM/ADMIN/${String(300 + i * 3)}`, phoneFor(400 + i)]
    );
    staff.push({ id, name, deptCode, departmentId: department.id });
  }

  const commissioner = await ensureUser("Aparna Ravikumar", `commissioner@${DEMO_DOMAIN}`, {
    role: "global_admin", phone: phoneFor(500),
  });

  console.log(`Accounts: ${citizens.length} residents, ${officers.length} officers, ${staff.length} ward administrators, 1 city administrator.`);
  return { citizens, officers, staff, commissioner };
}

// ── Institutions, faculty, students, partners ───────────────

async function seedCampus(people) {
  const institutions = [];
  for (const uni of UNIVERSITIES) {
    const { rows } = await q(
      `insert into institutions (name, kind, city, expertise, contact_name, contact_email, approved, approved_at,
                                 website, description, disciplines, research_areas, laboratories, capabilities, is_demo, created_at)
       values ($1,'university',$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12,true,$6) returning id`,
      [uni.name, uni.city, uni.expertise, `Office of the Dean, ${uni.short}`,
       `campus@${uni.short.toLowerCase().replace(/[^a-z0-9]+/g, "")}.${DEMO_DOMAIN}`,
       daysAgo(between(200, 260)),
       `https://${uni.short.toLowerCase().replace(/[^a-z0-9]+/g, "")}.${DEMO_DOMAIN}`,
       `${uni.short} works with the corporation on evidence-led civic projects through its ${uni.labs[0]}. This is a demonstration record; the institution is fictional.`,
       uni.departments.map((d) => d[0]), uni.research, uni.labs,
       ["Field survey", "Prototype development", "Pilot deployment", "Student project teams"]]
    );
    const inst = { id: rows[0].id, ...uni, departments: [] };

    for (const [name, disciplines, research, labs] of uni.departments) {
      const dept = await q(
        `insert into university_departments (institution_id, name, disciplines, expertise, research_areas, labs)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [inst.id, name, disciplines, disciplines, research, labs]
      );
      inst.departments.push({ id: dept.rows[0].id, name, disciplines, labs });
    }
    institutions.push(inst);
  }

  const partners = [];
  for (const [name, kind, city, sector, expertise, support] of PARTNERS) {
    const { rows } = await q(
      `insert into institutions (name, kind, city, expertise, contact_name, contact_email, approved, approved_at,
                                 description, capabilities, is_demo, created_at)
       values ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,true,$7) returning id`,
      [name, kind, city, expertise, "Partnerships lead",
       `partnerships@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.${DEMO_DOMAIN}`,
       daysAgo(between(120, 240)),
       `${sector}. Demonstration record for a fictional organisation — no real partnership is represented.`,
       support]
    );
    partners.push({ id: rows[0].id, name, kind, support });
  }

  // One coordinator per institution: the Campus login journey needs an account
  // that can actually submit, and a faculty account cannot stand in for it.
  const coordinators = [];
  for (const inst of institutions) {
    const short = inst.short.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const id = await ensureUser(`Coordinator, ${inst.short}`, `coordinator.${short}@${DEMO_DOMAIN}`, {
      role: "university_admin", institutionId: inst.id, institutionRole: "faculty", city: inst.city,
    });
    coordinators.push({ id, institutionId: inst.id });
  }

  const faculty = [];
  for (const [i, [name, designation, instIdx, deptIdx, specialization, years]] of FACULTY.entries()) {
    const inst = institutions[instIdx];
    const dept = inst.departments[deptIdx] || inst.departments[0];
    const id = await ensureUser(name, emailFor(name, `.f${i + 1}`), {
      role: "faculty", institutionId: inst.id, institutionRole: "faculty", city: inst.city,
      phone: phoneFor(600 + i),
    });
    await q(
      `insert into campus_member_details (profile_id, department_id, designation, specialization, skills, research_areas, availability, previous_projects)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (profile_id) do update set department_id=excluded.department_id, designation=excluded.designation,
         specialization=excluded.specialization, skills=excluded.skills, research_areas=excluded.research_areas,
         availability=excluded.availability, previous_projects=excluded.previous_projects, updated_at=now()`,
      [id, dept.id, designation, specialization,
       dept.disciplines.flatMap((t) => SKILLS_BY_TAG[t] || []).slice(0, 4),
       [specialization.split(",")[0].trim()],
       years > 15 ? "Mentoring one project at a time" : "Available to mentor",
       `${years} years in ${dept.name}.`]
    );
    faculty.push({ id, name, instIdx, deptIdx, institutionId: inst.id, departmentId: dept.id, specialization });
  }

  const students = [];
  for (const [i, [name, instIdx, deptIdx, year]] of STUDENTS.entries()) {
    const inst = institutions[instIdx];
    const dept = inst.departments[deptIdx] || inst.departments[0];
    const skills = dept.disciplines.flatMap((t) => SKILLS_BY_TAG[t] || []);
    const id = await ensureUser(name, emailFor(name, `.s${i + 1}`), {
      role: "student", institutionId: inst.id, institutionRole: "student", city: inst.city,
    });
    await q(
      `insert into campus_member_details (profile_id, department_id, study_year, skills, interests, availability)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (profile_id) do update set department_id=excluded.department_id, study_year=excluded.study_year,
         skills=excluded.skills, interests=excluded.interests, availability=excluded.availability, updated_at=now()`,
      [id, dept.id, year,
       // Not every student has every skill. A list where everybody knows
       // everything is useless to filter and obviously generated.
       skills.filter(() => chance(0.55)).slice(0, 4).concat(skills[i % skills.length]).slice(0, 4),
       [pick(["Field work", "Prototyping", "Data analysis", "Community engagement", "Research writing"])],
       year >= 4 ? "Final year — available for one project" : "Available"]
    );
    students.push({ id, name, instIdx, deptIdx, institutionId: inst.id, departmentId: dept.id, year });
  }

  // Department heads come from the faculty who actually sit in them.
  for (const inst of institutions) {
    for (const dept of inst.departments) {
      const head = faculty.find((f) => f.departmentId === dept.id && /Professor$/.test(FACULTY[faculty.indexOf(f)]?.[1] || ""));
      if (head) await q("update university_departments set head_id = $2 where id = $1", [dept.id, head.id]);
    }
  }

  console.log(`Campus: ${institutions.length} universities, ${institutions.reduce((n, i) => n + i.departments.length, 0)} departments, ${faculty.length} faculty, ${students.length} students, ${partners.length} partner organisations.`);
  return { institutions, partners, faculty, students, coordinators };
}

// ── Reports ─────────────────────────────────────────────────

/**
 * How old a report is.
 *
 * Not uniform across the seven months. A platform in use has more open recent
 * work than old, because the old work has mostly been closed — drawing ages
 * evenly produced a feed that was 53% resolved with two reports still waiting
 * to be looked at, which reads as an archive rather than as a service
 * somebody is running today.
 */
function reportAge() {
  const r = rand();
  if (r < 0.32) return between(1, 14);
  if (r < 0.57) return between(15, 45);
  if (r < 0.80) return between(46, 120);
  return between(121, 212);
}

/**
 * How a report's life went, chosen from its age.
 *
 * A seven-month-old report that is still "submitted" would mean nobody ever
 * looked at it; a report filed this morning that is already resolved would
 * mean nobody had to travel. Age decides the plausible range, and the officer
 * handling it decides whether it closed on time.
 */
function lifecycleFor(ageDays) {
  if (ageDays > 120) return pick(["resolved", "resolved", "resolved", "resolved", "resolved", "resolved", "rejected", "reopened", "resolved", "verification"]);
  if (ageDays > 60) return pick(["resolved", "resolved", "resolved", "resolved", "work_completed", "verification", "assigned", "reopened", "rejected", "resolved"]);
  if (ageDays > 21) return pick(["resolved", "resolved", "work_started", "work_completed", "assigned", "assigned", "verification", "under_review", "accepted", "resolved"]);
  if (ageDays > 7) return pick(["assigned", "assigned", "work_started", "under_review", "accepted", "submitted", "ai_analysis", "resolved", "work_started", "under_review"]);
  return pick(["submitted", "submitted", "ai_analysis", "under_review", "accepted", "assigned", "submitted", "under_review"]);
}

const PROGRESSION = ["submitted", "ai_analysis", "under_review", "accepted", "assigned", "work_started", "work_completed", "verification", "resolved"];

async function seedCivic(ref, people) {
  const byWard = new Map();
  for (const c of people.citizens) {
    if (!byWard.has(c.ward)) byWard.set(c.ward, []);
    byWard.get(c.ward).push(c);
  }
  const active = people.citizens.filter((c) => c.tier !== "silent");
  const reporters = active.flatMap((c) =>
    Array(c.tier === "champion" ? 11 : c.tier === "regular" ? 4 : 1).fill(c)
  );

  const complaints = [];
  let reporterCursor = 0;
  const nextReporter = (ward) => {
    // Somebody in the ward files it where possible — a resident of Mulund
    // reporting a pothole in Colaba is not impossible but should be rare.
    const local = byWard.get(ward)?.filter((c) => c.tier !== "silent") || [];
    if (local.length && chance(0.78)) return pick(local);
    return reporters[reporterCursor++ % reporters.length];
  };

  /** One report, with everything that happened to it afterwards. */
  async function fileReport({ wardCode, categoryCode, ageDays, placeIndex, nearTo, evidenceIndex, forcedStatus }) {
    const ward = ref.wards.get(wardCode);
    const category = ref.categories.get(categoryCode);
    const wardInfo = WARDS[wardCode];
    const place = wardInfo.places[placeIndex % wardInfo.places.length];
    const citizen = nextReporter(wardCode);

    const [dLat, dLng] = placeOffset(`${wardCode}:${place}`);
    const lat = nearTo ? nearTo.lat + (rand() - 0.5) * 0.0009 : wardInfo.centre[0] + dLat;
    const lng = nearTo ? nearTo.lng + (rand() - 0.5) * 0.0009 : wardInfo.centre[1] + dLng;

    const frames = DESCRIPTIONS[categoryCode] || DESCRIPTIONS.OTHER;
    const description = frames[(placeIndex + evidenceIndex) % frames.length](place);

    const createdAt = daysAgo(ageDays);
    const status = forcedStatus || lifecycleFor(ageDays);
    const severityScore = Math.max(8, Math.min(98, category.base_severity + between(-12, 18)));
    const severity = SEVERITY(severityScore);
    const slaHours = ref.slaHours.get(`${category.id}:${severity}`) || 72;
    const slaDeadline = hoursAfter(createdAt, slaHours);

    const officer = pickOfficer(people.officers, category.default_department_id, wardCode);
    const assigned = PROGRESSION.indexOf(status) >= PROGRESSION.indexOf("assigned") || status === "reopened";
    const contract = ref.contracts.filter((c) => c.department_id === category.default_department_id);
    const establishment = category.code === "FOODSTALL" || category.code === "FOODSTORAGE" || category.code === "HAWKER"
      ? ref.establishments.find((e) => e.ward_id === ward.id) || null : null;

    // Whether the work landed on time is a property of the officer, not a
    // number written into the leaderboard. "strong" almost always beats the
    // deadline; "struggling" genuinely does not.
    const onTime = !officer ? true
      : officer.performance === "strong" ? chance(0.93)
      : officer.performance === "steady" ? chance(0.74) : chance(0.41);
    const resolvedAt = status === "resolved"
      ? new Date(Math.min(NOW - DAY, onTime
          ? createdAt.getTime() + slaHours * 3600000 * (0.35 + rand() * 0.6)
          : slaDeadline.getTime() + (0.4 + rand() * 4) * DAY))
      : null;

    const anonymous = chance(0.24);
    const confidence = round2(52 + rand() * 46);

    const { rows } = await q(
      `insert into complaints
         (citizen_id, description_original, description_canonical, description_lang, location, address,
          ward_id, category_id, department_id, contract_id, establishment_id, ai_confidence,
          severity, severity_score, authenticity, authenticity_confidence, status, anonymous,
          assigned_officer, created_at, updated_at, resolved_at, is_demo)
       values ($1,$2,$2,$3,st_setsrid(st_makepoint($4,$5),4326)::geography,$6,$7,$8,$9,$10,$11,$12,
               $13,$14,$15,$16,$17,$18,$19,$20,$20,$21,true)
       returning id, ref`,
      [citizen.id, description, "en", lng, lat, `Near ${place}, ${ward.name}`,
       ward.id, category.id, category.default_department_id,
       contract.length ? pick(contract).id : null, establishment?.id || null, confidence,
       severity, severityScore, chance(0.88) ? "likely_genuine" : "undetermined",
       round2(60 + rand() * 38), status, anonymous, assigned && officer ? officer.id : null,
       createdAt, resolvedAt]
    );

    const complaint = {
      id: rows[0].id, ref: rows[0].ref, citizen, ward: wardCode, wardId: ward.id,
      category, lat, lng, createdAt, status, severity, severityScore, officer,
      resolvedAt, slaDeadline, anonymous, place, confidence,
      // Carried so the analysis can name a neighbouring category the
      // classifier could plausibly have guessed instead.
      categoriesByCode: ref.categories,
    };

    // The trigger sets sla_deadline from now(); this report was filed months
    // ago, so the deadline has to be moved back to where it actually fell.
    await q("update complaints set sla_deadline = $2 where id = $1", [complaint.id, slaDeadline]);

    await attachEvidence(complaint, categoryCode, evidenceIndex, nearTo);
    await attachAnalysis(complaint);
    await writeHistory(complaint, people);
    complaints.push(complaint);
    return complaint;
  }

  // Each challenge's source reports come first: same place, same category,
  // different residents, spread over weeks. These are what the challenge was
  // raised from, so they have to exist before it.
  const byChallenge = new Map();
  for (const [ci, challenge] of CHALLENGES.entries()) {
    const group = [];
    let anchor = null;
    // Reports accumulate towards the present rather than landing in one week
    // months ago. A recurring problem is still being reported, and a challenge
    // whose newest evidence is six months old would look abandoned.
    const oldest = between(95, 205);
    const newest = between(4, 40);
    for (let i = 0; i < challenge.reports; i++) {
      const report = await fileReport({
        wardCode: challenge.ward, categoryCode: challenge.category,
        ageDays: Math.round(oldest - ((oldest - newest) * i) / Math.max(1, challenge.reports - 1)),
        placeIndex: ci + i, evidenceIndex: ci * 3 + i,
        // The first two reports in a group are the same problem seen twice;
        // the rest are the same problem in the same street, further apart.
        nearTo: i === 1 ? anchor : i > 1 && chance(0.4) ? anchor : null,
      });
      if (i === 0) anchor = report;
      group.push(report);
    }
    byChallenge.set(challenge.key, group);
  }

  // Then the rest of the city, so the map and the filters are not made only of
  // the thirty places somebody wrote a challenge about.
  const wardCodes = Object.keys(WARDS);
  const categoryCodes = [...ref.categories.keys()].filter((c) => c !== "OTHER");
  const weighted = categoryCodes.flatMap((code) => {
    const common = ["POTHOLE", "GARBAGE", "STREETLIGHT", "LEAK", "FOOTPATH", "PARKING", "DUMPING", "STAGNANT"];
    return Array(common.includes(code) ? 4 : 2).fill(code);
  });
  for (let i = 0; i < 96; i++) {
    await fileReport({
      wardCode: wardCodes[i % wardCodes.length],
      categoryCode: weighted[(i * 7) % weighted.length],
      ageDays: reportAge(), placeIndex: i, evidenceIndex: i * 2 + 5,
    });
  }

  console.log(`Reports: ${complaints.length} filed across ${wardCodes.length} wards.`);
  return { complaints, byChallenge };
}

function pickOfficer(officers, departmentId, wardCode) {
  const inDept = officers.filter((o) => o.departmentId === departmentId);
  if (!inDept.length) return null;
  return inDept.find((o) => o.ward === wardCode) || inDept[Math.floor(rand() * inDept.length)];
}

async function attachEvidence(complaint, categoryCode, index, nearTo) {
  const choice = await evidenceFor(categoryCode, index);
  if (!choice) return;
  const { path, hash } = await uploadEvidence(choice);

  // A second resident photographing the same problem produces a hash a few
  // bits away, which is what the duplicate scoring is built to notice.
  const phash = nearTo ? fixtureHash(Buffer.from(path), 0) : hash;
  const stored = nearTo ? fixtureHash(Buffer.from(hash, "hex"), between(3, 7)) : hash;

  await q(
    `insert into complaint_images (complaint_id, storage_path, role, uploaded_by, phash, exif, created_at)
     values ($1,$2,'report',$3,$4,$5,$6)`,
    [complaint.id, path, complaint.citizen.id, nearTo ? stored : phash,
     JSON.stringify({ demo_fixture: true, source: "Classifier training set photograph", subject: choice.folder }),
     complaint.createdAt]
  );
  complaint.phash = nearTo ? stored : phash;

  // A quarter of reports carry a second angle, which is what residents
  // actually do when the first photo does not show the extent.
  if (chance(0.25)) {
    const second = await evidenceFor(categoryCode, index + 17);
    if (second && second.file !== choice.file) {
      const extra = await uploadEvidence(second);
      await q(
        `insert into complaint_images (complaint_id, storage_path, role, uploaded_by, phash, exif, created_at)
         values ($1,$2,'report',$3,$4,$5,$6)`,
        [complaint.id, extra.path, complaint.citizen.id, extra.hash,
         JSON.stringify({ demo_fixture: true, subject: second.folder, note: "Second angle" }),
         hoursAfter(complaint.createdAt, 0.05)]
      );
    }
  }
}

/**
 * The classifier's answer, as it would have been recorded at the time.
 *
 * Confidence varies per report and the category is occasionally wrong, because
 * a demo where the model is right every time at 95% misrepresents what it
 * does — and the resident correction trail, which the AI performance screen is
 * built on, only exists because it is sometimes wrong.
 */
async function attachAnalysis(complaint) {
  const confident = complaint.confidence >= 70;
  await q(
    `insert into complaint_ai_analysis (complaint_id, model, raw_response, severity_factors, summary, analysed_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [complaint.id, "public-complaint-23 (local)",
     JSON.stringify({
       category: complaint.category.name,
       category_confidence: round2(complaint.confidence / 100),
       civic_probability: round2(0.72 + rand() * 0.27),
       severity_band: complaint.severity,
       duplicate_risk: round2(rand() * 0.4),
       authenticity_score: round2(0.78 + rand() * 0.21),
       needs_human_review: !confident,
       model_version: "public-complaint-23",
       processing_ms: between(120, 380),
       classified_at: complaint.createdAt.toISOString(),
       note: "Demonstration dataset. Recorded as the classifier would have returned it at the time of filing.",
     }),
     JSON.stringify([
       { factor: "Category base severity", points: complaint.category.base_severity },
       { factor: "Reported location context", points: between(2, 14) },
     ]),
     confident
       ? `${complaint.category.name} identified with ${Math.round(complaint.confidence)}% confidence.`
       : `${complaint.category.name} suggested at ${Math.round(complaint.confidence)}% — below the threshold, so this was sent for confirmation.`,
     hoursAfter(complaint.createdAt, 0.02)]
  );

  // A resident correcting the classifier is the most valuable record the
  // platform produces, and the AI performance screen is built entirely on it.
  //
  // The direction matters. The complaint's category is what it ended up filed
  // as — the answer the resident gave — so the correction records the
  // classifier having guessed a neighbouring category and being overruled.
  // Recording both sides as the same category would put "Pothole was mistaken
  // for Pothole" on the performance screen.
  if (!confident && chance(0.45)) {
    const neighbours = (CONFUSABLE[complaint.category.code] || [])
      .map((code) => complaint.categoriesByCode.get(code))
      .filter(Boolean);
    if (neighbours.length) {
      const guessed = pick(neighbours);
      await q(
        `insert into ai_corrections (complaint_id, predicted_category_id, predicted_confidence, model_version_id,
                                     corrected_category_id, corrected_by, corrector_role, kind, note, phash, created_at)
         values ($1,$2,$3,(select id from model_versions where kind='category' and active),$4,$5,'resident','category',$6,$7,$8)`,
        [complaint.id, guessed.id, complaint.confidence, complaint.category.id,
         complaint.citizen.id,
         `Resident chose ${complaint.category.name} over the suggested ${guessed.name}.`,
         complaint.phash || null, hoursAfter(complaint.createdAt, 0.4)]
      );
      // The complaint carries the same fact: what the model said, and that a
      // person changed it. The detail screen reads these two columns.
      await q(
        "update complaints set ai_category_id = $2, category_corrected = true, corrected_at = $3 where id = $1",
        [complaint.id, guessed.id, hoursAfter(complaint.createdAt, 0.4)]
      );
      return;
    }
  }
  await q("update complaints set ai_category_id = $2 where id = $1", [complaint.id, complaint.category.id]);
}

/** The status trail, with each step at a time it could plausibly have happened. */
async function writeHistory(complaint, people) {
  const target = complaint.status;
  const end = complaint.resolvedAt || new Date(Math.min(NOW, complaint.createdAt.getTime() + 20 * DAY));
  const path = target === "rejected" ? ["submitted", "ai_analysis", "under_review", "rejected"]
    : target === "reopened" ? [...PROGRESSION, "reopened"]
    : PROGRESSION.slice(0, PROGRESSION.indexOf(target) + 1);
  if (path.length < 2) return;

  const span = Math.max(2 * 3600000, end.getTime() - complaint.createdAt.getTime());
  for (let i = 1; i < path.length; i++) {
    const at = new Date(complaint.createdAt.getTime() + (span * i) / (path.length - 1));
    const actor = ["assigned", "work_started", "work_completed"].includes(path[i]) ? complaint.officer?.id
      : path[i] === "rejected" ? pick(people.staff).id
      : path[i] === "reopened" ? complaint.citizen.id : null;
    const note = OFFICER_NOTES[path[i]] ? pick(OFFICER_NOTES[path[i]]) : null;
    await q(
      `insert into complaint_status_history (complaint_id, from_status, to_status, actor, note, at)
       values ($1,$2,$3,$4,$5,$6)`,
      [complaint.id, path[i - 1], path[i], actor, note, at]
    );
  }

  if (target === "reopened") {
    await q(
      `update complaints set rework_count = 1, last_rejection_reason = $2, last_rejected_at = $3,
              escalation_level = 1 where id = $1`,
      [complaint.id, "The resident reports the problem returned within days of the repair.", end]
    );
  }
  if (target === "rejected") {
    await q("update complaints set review_decision = 'rejected', triage_note = $2, reviewed_at = $3 where id = $1",
      [complaint.id, pick(OFFICER_NOTES.rejected), end]);
  }
}

// ── Clusters, challenges and everything downstream ──────────

async function seedChallenges(ref, people, campus, civic) {
  const counts = { challenges: 0, matches: 0, proposals: 0, quotations: 0, projects: 0, milestones: 0, documents: 0, interest: 0, messages: 0 };

  for (const challenge of CHALLENGES) {
    const group = civic.byChallenge.get(challenge.key);
    const category = ref.categories.get(challenge.category);
    const ward = ref.wards.get(challenge.ward);
    const first = group[0];

    // The cluster is a real aggregation of those reports, not a decoration:
    // its centroid, counts and dates are computed from the rows themselves.
    const ids = group.map((r) => r.id);
    const { rows: clusterRows } = await q(
      `insert into clusters (category_id, department_id, centroid, radius_m, report_count, citizen_count,
                             first_reported, last_reported, is_hotspot, summary, recommended_action, status, is_demo)
       select $1, $2, st_centroid(st_collect(location::geometry))::geography, 180,
              count(*), count(distinct citizen_id), min(created_at), max(created_at), $3, $4, $5, 'under_review', true
       from complaints where id = any($6) returning id`,
      [category.id, category.default_department_id, group.length >= 6, challenge.summary,
       challenge.outcome_sought || null, ids]
    );
    const clusterId = clusterRows[0].id;
    await q("update complaints set cluster_id = $1 where id = any($2)", [clusterId, ids]);

    // Reports two and onward in a group are duplicates of the first in the
    // sense the platform means: the same problem, reported again.
    for (const report of group.slice(1)) {
      const metres = Math.round(haversine(first, report));
      const hours = Math.abs(Math.round((report.createdAt - first.createdAt) / 3600000));
      const bits = first.phash && report.phash ? hammingHex(first.phash, report.phash) : 64;
      const location = metres < 60 ? 1 : metres < 200 ? 0.7 : metres < 500 ? 0.35 : 0.1;
      const image = bits <= 8 ? 0.9 : bits <= 16 ? 0.55 : 0.05;
      const time = hours < 72 ? 0.9 : hours < 336 ? 0.5 : 0.2;
      const composite = round2(location * 0.4 + 1 * 0.25 + image * 0.2 + time * 0.15);
      const band = composite >= 0.8 ? "near_certain" : composite >= 0.6 ? "probable" : composite >= 0.4 ? "possible" : "unrelated";
      await q(
        `insert into duplicate_scores (complaint_id, cluster_id, compared_to, location_score, category_score,
                                       image_score, text_score, time_score, composite_score, band, outcome,
                                       metres_apart, phash_bits_apart, hours_apart, scored_at)
         values ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [report.id, clusterId, first.id, location, image, round2(0.4 + rand() * 0.4), time, composite, band,
         band === "near_certain" ? "grouped" : band === "probable" ? "shown_to_resident" : "ignored",
         metres, bits, hours, hoursAfter(report.createdAt, 0.1)]
      );
      if (band === "near_certain") await q("update complaints set is_duplicate = true where id = $1", [report.id]);
    }

    const raisedAt = new Date(Math.max(...group.map((r) => r.createdAt.getTime())) + 3 * DAY);
    const { rows: chRows } = await q(
      `insert into challenges (title, summary, cluster_id, complaint_id, category_id, ward_id, department_id,
                               needs, reports_at_raise, residents_affected, status, raised_by, raised_at, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) returning id, ref`,
      [challenge.title, challenge.summary, clusterId, first.id, category.id, ward.id,
       category.default_department_id, challenge.needs, group.length, challenge.residents,
       challenge.status, pick(people.staff).id, raisedAt]
    );
    const ch = { id: chRows[0].id, ref: chRows[0].ref, raisedAt, ...challenge };
    counts.challenges++;

    for (const [instIdx, pitch] of challenge.interest || []) {
      const inst = campus.institutions[instIdx];
      const lead = campus.coordinators.find((c) => c.institutionId === inst.id);
      await q(
        `insert into challenge_interest (challenge_id, institution_id, pitch, submitted_by, submitted_at, decision, decided_by, decided_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [ch.id, inst.id, pitch, lead.id, hoursAfter(raisedAt, between(24, 200)),
         challenge.proposal && challenge.proposal.inst === instIdx ? "accepted" : null,
         challenge.proposal && challenge.proposal.inst === instIdx ? pick(people.staff).id : null,
         challenge.proposal && challenge.proposal.inst === instIdx ? hoursAfter(raisedAt, 260) : null]
      );
      counts.interest++;
    }

    for (const [instIdx, status] of challenge.reviews || []) {
      const inst = campus.institutions[instIdx];
      const mentor = campus.faculty.find((f) => f.instIdx === instIdx);
      const dept = inst.departments[0];
      await q(
        `insert into university_challenge_reviews (challenge_id, institution_id, status, department_ids, faculty_mentor_id,
                                                   project_type, disciplines, initial_idea, estimated_weeks, note,
                                                   reviewed_by, reviewed_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [ch.id, inst.id, status, [dept.id], status === "pending" ? null : mentor.id,
         status === "pending" ? null : "Research and prototype",
         inst.expertise.filter((t) => challenge.needs.includes(t)),
         status === "pending" ? null
           : `Reviewed against the ${dept.name} department's capacity. Overlapping expertise: ${inst.expertise.filter((t) => challenge.needs.includes(t)).join(", ") || "none recorded"}.`,
         status === "pending" ? null : between(10, 26),
         status === "declined" ? "No faculty capacity for a project of this duration this semester."
           : status === "information_requested" ? "Interested, subject to understanding what access the ward office can provide."
           : null,
         status === "pending" ? null : mentor.id,
         status === "pending" ? null : hoursAfter(raisedAt, between(48, 400)),
         hoursAfter(raisedAt, 12)]
      );
      counts.matches++;
    }

    if (challenge.proposal) {
      const built = await seedProposal(ch, challenge, campus, people, counts);
      if (challenge.quotation) await seedQuotation(ch, challenge, campus, people, built, counts);
      if (challenge.project) await seedProject(ch, challenge, campus, people, built, counts);

      // The ward office and the institution talking on the challenge itself,
      // which is where that conversation happens before a project exists.
      // project_messages carries a challenge_id for exactly this.
      const thread = CHALLENGE_THREADS[counts.challenges % CHALLENGE_THREADS.length];
      const wardStaff = people.staff.find((s) => s.departmentId === category.default_department_id) || pick(people.staff);
      for (const [i, [who, body]] of thread.entries()) {
        await q(
          `insert into project_messages (project_id, challenge_id, body, author_id, created_at)
           values (null,$1,$2,$3,$4)`,
          [ch.id, body, who === "staff" ? wardStaff.id : built.coordinator.id,
           hoursAfter(built.createdAt, 60 + i * 26)]
        );
        counts.messages++;
      }
    }
  }

  console.log(`Challenges: ${counts.challenges} raised, ${counts.matches} institution reviews, ${counts.interest} expressions of interest, ${counts.proposals} proposals, ${counts.quotations} quotations, ${counts.projects} projects, ${counts.milestones} milestones, ${counts.documents} documents, ${counts.messages} ward-office messages.`);
}

function haversine(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

async function seedProposal(ch, challenge, campus, people, counts) {
  const spec = challenge.proposal;
  const inst = campus.institutions[spec.inst];
  const dept = inst.departments[spec.dept] || inst.departments[0];
  const mentor = campus.faculty.find((f) => f.instIdx === spec.inst && f.deptIdx === spec.dept)
    || campus.faculty.find((f) => f.instIdx === spec.inst);
  const coordinator = campus.coordinators.find((c) => c.institutionId === inst.id);
  const latest = spec.versions.at(-1);
  const createdAt = hoursAfter(ch.raisedAt, between(120, 400));

  const { rows } = await q(
    `insert into campus_proposals (institution_id, challenge_id, department_id, faculty_mentor_id, title, project_type,
                                   duration_weeks, sections, status, current_version, review_comment, reviewed_by,
                                   reviewed_at, created_by, created_at, updated_at, submitted_at, submitted_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17) returning id, ref`,
    [inst.id, ch.id, dept.id, mentor.id, spec.title, spec.type, spec.weeks,
     JSON.stringify(latest ? latest.sections : {}), spec.status, spec.versions.length,
     spec.reviews?.at(-1)?.[1] || null,
     spec.reviews?.length ? pick(people.staff).id : null,
     spec.reviews?.length ? hoursAfter(createdAt, spec.reviews.length * 120) : null,
     mentor.id, createdAt,
     spec.status === "draft" ? null : hoursAfter(createdAt, 24),
     spec.status === "draft" ? null : mentor.id]
  );
  const proposal = { id: rows[0].id, ref: rows[0].ref, inst, dept, mentor, coordinator, createdAt };
  counts.proposals++;

  for (const [i, version] of spec.versions.entries()) {
    await q(
      `insert into campus_proposal_versions (proposal_id, version, sections, submitted_by, submitted_at, change_note)
       values ($1,$2,$3,$4,$5,$6)`,
      [proposal.id, i + 1, JSON.stringify(version.sections), mentor.id,
       hoursAfter(createdAt, 24 + i * 240), version.note]
    );
  }
  for (const [i, [decision, comment]] of (spec.reviews || []).entries()) {
    await q(
      `insert into campus_proposal_reviews (proposal_id, reviewer_id, decision, comment, created_at)
       values ($1,$2,$3,$4,$5)`,
      [proposal.id, pick(people.staff).id, decision, comment, hoursAfter(createdAt, 120 + i * 240)]
    );
  }

  // The proposal document itself, plus whatever the project produced later.
  if (spec.versions.length) {
    await addDocument(proposal, {
      title: spec.title, kind: "proposal",
      body: Object.entries(latest.sections).map(([k, v]) => `${k.toUpperCase()}\n\n${v}`).join("\n\n"),
      at: hoursAfter(createdAt, 24), counts,
    });
  }

  await q(
    `insert into campus_audit_logs (institution_id, actor, action, entity, entity_id, after, created_at)
     values ($1,$2,'proposal.created','proposal',$3,$4,$5)`,
    [inst.id, mentor.id, proposal.ref, JSON.stringify({ challenge: ch.ref, title: spec.title }), createdAt]
  );
  for (const [i, [decision]] of (spec.reviews || []).entries()) {
    await q(
      `insert into campus_audit_logs (institution_id, actor, action, entity, entity_id, after, created_at)
       values ($1,$2,$3,'proposal',$4,$5,$6)`,
      [inst.id, mentor.id, `proposal.${decision}`, proposal.ref,
       JSON.stringify({ decision }), hoursAfter(createdAt, 126 + i * 240)]
    );
  }

  return proposal;
}

async function addDocument(proposal, { title, kind, body, at, counts, projectId = null }) {
  const filename = `${title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.pdf`;
  const pdf = makePdf({
    title,
    subtitle: `CivicLense demonstration document · ${proposal.inst.short} · ${proposal.ref}`,
    body,
  });
  const path = `${STORAGE_PREFIX}/documents/${proposal.ref}/${filename}`;
  await uploadDocument(path, pdf);
  await q(
    `insert into campus_documents (institution_id, proposal_id, project_id, kind, filename, mime_type, size_bytes,
                                   storage_path, version, uploaded_by, uploaded_at, document_type, status)
     values ($1,$2,$3,$4,$5,'application/pdf',$6,$7,1,$8,$9,$10,'uploaded')
     on conflict (proposal_id, filename, version) do nothing`,
    [proposal.inst.id, proposal.id, projectId, kind, filename, pdf.length, path, proposal.mentor.id, at, kind]
  );
  counts.documents++;
}

async function seedQuotation(ch, challenge, campus, people, proposal, counts) {
  const spec = challenge.quotation;
  const taxRate = 18;
  const subtotal = spec.items.reduce((sum, [, , qty, cost]) => sum + qty * cost, 0);
  const total = Math.round(subtotal * (1 + taxRate / 100));
  const submittedAt = hoursAfter(proposal.createdAt, 260);

  const { rows } = await q(
    `insert into quotations (challenge_id, institution_id, partner_ids, title, approach, total_cost, duration_weeks,
                             start_available, deliverables, assumptions, exclusions, status, submitted_by, submitted_at,
                             decided_by, decided_at, decision_note, proposal_id, tax_rate)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id, ref`,
    [ch.id, proposal.inst.id, [], `Costed plan — ${ch.title}`, spec.approach, total, spec.weeks,
     new Date(submittedAt.getTime() + 21 * DAY).toISOString().slice(0, 10),
     spec.deliverables,
     "Ward office provides site access and accompanies field work where municipal property is involved. Figures hold for 90 days.",
     "Civil works, permanent installation beyond the trial scope, and any statutory approval fees.",
     spec.status, proposal.mentor.id, submittedAt,
     spec.status === "accepted" ? pick(people.staff).id : null,
     spec.status === "accepted" ? hoursAfter(submittedAt, 200) : null,
     spec.status === "accepted" ? "Accepted. The itemised breakdown is what made this reviewable." : null,
     proposal.id, taxRate]
  );
  const quotation = { id: rows[0].id, ref: rows[0].ref, total };
  counts.quotations++;

  for (const [i, [description, category, qty, cost, unit]] of spec.items.entries()) {
    await q(
      `insert into quotation_items (quotation_id, description, category, quantity, unit_cost, position, tax_rate, unit)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [quotation.id, description, category, qty, cost, i + 1, taxRate, unit]
    );
  }

  await addDocument(proposal, {
    title: `Costed plan ${quotation.ref}`, kind: "quotation",
    body: `${spec.approach}\n\nLINE ITEMS\n\n${spec.items.map(([d, c, qn, u, unit]) => `${d} — ${qn} ${unit} at Rs. ${u.toLocaleString("en-IN")} (${c}) = Rs. ${(qn * u).toLocaleString("en-IN")}`).join("\n")}\n\nSubtotal Rs. ${subtotal.toLocaleString("en-IN")}\nTax at ${taxRate}% Rs. ${(total - subtotal).toLocaleString("en-IN")}\nTotal Rs. ${total.toLocaleString("en-IN")}`,
    at: submittedAt, counts,
  });

  return quotation;
}

async function seedProject(ch, challenge, campus, people, proposal, counts) {
  const spec = challenge.project;
  const startedAt = hoursAfter(proposal.createdAt, 500);
  const partnerRows = campus.partners.filter((p) => spec.partners.includes(p.name));

  const { rows: quoteRow } = await q("select id, total_cost from quotations where challenge_id = $1 limit 1", [ch.id]);

  const { rows } = await q(
    `insert into projects (challenge_id, institution_id, partner_id, title, approach, stage, faculty_lead, started_at,
                           deployed_at, impact_note, complaints_closed, partner_support, people_affected,
                           institutions_benefited, pilot_locations, community_feedback, quotation_id, awarded_cost)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id, ref`,
    [ch.id, proposal.inst.id, partnerRows[0]?.id || null, spec.title, spec.approach, spec.stage, proposal.mentor.id,
     startedAt, spec.stage === "deployed" ? hoursAfter(startedAt, 3600) : null,
     spec.outcome?.impact || null, spec.closed || 0, spec.support, spec.people, 1, spec.locations,
     spec.stage === "deployed"
       ? "Residents' association asked for the monthly checks to continue through the dry season."
       : null,
     quoteRow[0]?.id || null, quoteRow[0]?.total_cost || null]
  );
  const project = { id: rows[0].id, ref: rows[0].ref };
  counts.projects++;

  await q(
    `insert into project_institutions (project_id, institution_id, role, contribution, joined_at)
     values ($1,$2,'lead',$3,$4)`,
    [project.id, proposal.inst.id, "Lead institution: research design, field work and delivery.", startedAt]
  );
  for (const partner of partnerRows) {
    await q(
      `insert into project_institutions (project_id, institution_id, role, contribution, joined_at)
       values ($1,$2,'partner',$3,$4)`,
      [project.id, partner.id, `Support: ${partner.support.join(", ").replace(/_/g, " ")}.`, hoursAfter(startedAt, 200)]
    );
  }

  const team = campus.students.filter((s) => s.instIdx === challenge.proposal.inst).slice(0, between(3, 5));
  await q("insert into project_members (project_id, profile_id, discipline, role, added_at) values ($1,$2,$3,'mentor',$4)",
    [project.id, proposal.mentor.id, proposal.dept.name, startedAt]);
  for (const [i, student] of team.entries()) {
    await q(
      `insert into project_members (project_id, profile_id, discipline, role, added_at) values ($1,$2,$3,$4,$5)`,
      [project.id, student.id, proposal.inst.departments[student.deptIdx]?.name || proposal.dept.name,
       i === 0 ? "lead" : "member", hoursAfter(startedAt, 24 + i * 12)]
    );
  }

  for (const [i, [title, status, dueOffset]] of spec.milestones.entries()) {
    await q(
      `insert into project_milestones (project_id, title, description, due_on, start_on, status, position, done_at, assigned_member_ids)
       values ($1,$2,$3,current_date + $4::int, current_date + $5::int, $6,$7,$8,$9)`,
      [project.id, title, null, dueOffset, dueOffset - between(10, 21), status, i + 1,
       status === "completed" ? daysAgo(Math.max(1, -dueOffset - between(0, 5))) : null,
       team.slice(0, 2).map((s) => s.id)]
    );
    counts.milestones++;
  }

  if (spec.outcome) {
    await q(
      `insert into project_outcomes (project_id, prototype_status, testing_summary, pilot_summary, deployment_summary,
                                     impact_summary, measurable_outcomes, updated_by, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (project_id) do update set impact_summary = excluded.impact_summary`,
      [project.id, spec.outcome.prototype, spec.outcome.testing, spec.outcome.pilot,
       spec.stage === "deployed" ? "Handed over to the ward office with the register and the method documented." : null,
       spec.outcome.impact, JSON.stringify(spec.outcome.measurable), proposal.mentor.id, daysAgo(between(10, 40))]
    );
  }

  for (const [title, kind] of spec.documents || []) {
    await addDocument(proposal, {
      title, kind,
      body: `${title}\n\nProject ${project.ref} — ${spec.title}\nChallenge ${ch.ref} — ${ch.title}\nInstitution: ${proposal.inst.name}\n\n${spec.approach}\n\n${spec.outcome?.testing || "Work in progress; this document records the method and the data collected so far."}\n\nThis is a demonstration document produced for the CivicLense demo dataset. The figures it describes are from this project's own instrumentation and are not municipal statistics.`,
      at: hoursAfter(startedAt, between(200, 2000)), counts, projectId: project.id,
    });
  }

  const speakers = { mentor: proposal.mentor.id, student: team[0]?.id || proposal.mentor.id, partner: null };
  for (const [i, [who, body]] of (spec.messages || []).entries()) {
    const author = who === "partner"
      ? campus.coordinators.find((c) => c.institutionId === proposal.inst.id).id
      : speakers[who];
    await q(
      `insert into project_messages (project_id, challenge_id, body, author_id, created_at) values ($1,$2,$3,$4,$5)`,
      [project.id, ch.id, body, author, hoursAfter(startedAt, 400 + i * 70)]
    );
  }

  // A couple of open tasks, so the workspace has work in it rather than only
  // milestones that have already been decided.
  for (const [i, title] of ["Draft the findings section", "Chase the ward office for the outfall drawing", "Re-seal sensor 3 and refit"].slice(0, between(2, 3)).entries()) {
    await q(
      `insert into project_tasks (project_id, title, description, assignee_id, status, due_on, created_by, created_at)
       values ($1,$2,$3,$4,$5,current_date + $6::int,$7,$8)`,
      [project.id, title, null, team[i % Math.max(1, team.length)]?.id || proposal.mentor.id,
       pick(["not_started", "in_progress", "under_review"]), between(3, 30), proposal.mentor.id, daysAgo(between(2, 20))]
    );
  }

  return project;
}

// ── Comments, follow-ups, proofs, notifications, audit ──────

async function seedEngagement(ref, people, civic) {
  const counts = { comments: 0, hidden: 0, followups: 0, proofs: 0, feedback: 0, reviews: 0, notifications: 0, rewards: 0, audit: 0 };
  const universal = ref.questions.filter((q_) => q_.universal);

  for (const complaint of civic.complaints) {
    const others = people.citizens.filter((c) => c.id !== complaint.citizen.id && c.tier !== "silent");

    // Discussion, on about half of everything and more of the older reports.
    if (chance(complaint.severityScore > 60 ? 0.6 : 0.38)) {
      // "Me too" is counted, so the schema allows each person exactly one
      // corroboration per report — otherwise one enthusiastic resident could
      // drive the corroboration count on their own. Anything else they may say
      // more than once.
      const corroborated = new Set();
      for (let i = 0; i < between(1, 4); i++) {
        const kind = pick(["corroborate", "corroborate", "detail", "detail", "dispute", "resolved_already"]);
        if (kind === "resolved_already" && complaint.status !== "resolved") continue;
        const author = pick(others);
        if (kind === "corroborate") {
          if (corroborated.has(author.id)) continue;
          corroborated.add(author.id);
        }
        await q(
          `insert into complaint_comments (complaint_id, author_id, kind, body, is_official, created_at)
           values ($1,$2,$3,$4,false,$5)`,
          [complaint.id, author.id, kind, pick(COMMENTS[kind]),
           hoursAfter(complaint.createdAt, between(4, 400))]
        );
        counts.comments++;
      }
      if (complaint.officer && chance(0.3)) {
        await q(
          `insert into complaint_comments (complaint_id, author_id, kind, body, is_official, created_at)
           values ($1,$2,'detail',$3,true,$4)`,
          [complaint.id, complaint.officer.id, pick(COMMENTS.official), hoursAfter(complaint.createdAt, between(20, 300))]
        );
        counts.comments++;
      }
      // Moderated, not deleted. The record of who hid what and why is the
      // point of having moderation at all.
      if (chance(0.05)) {
        await q(
          `insert into complaint_comments (complaint_id, author_id, kind, body, is_official, hidden, hidden_by, hidden_reason, created_at)
           values ($1,$2,'detail',$3,false,true,$4,$5,$6)`,
          [complaint.id, pick(others).id, "This comment was removed by a moderator.",
           pick(people.staff).id, pick(MODERATION), hoursAfter(complaint.createdAt, between(10, 200))]
        );
        counts.hidden++;
      }
    }
    await q(
      `update complaints set comment_count = (select count(*) from complaint_comments where complaint_id = $1 and not hidden),
              corroboration_count = (select count(*) from complaint_comments where complaint_id = $1 and kind = 'corroborate' and not hidden),
              dispute_count = (select count(*) from complaint_comments where complaint_id = $1 and kind = 'dispute' and not hidden)
       where id = $1`, [complaint.id]
    );

    // Follow-up answers, which is where severity actually comes from.
    const scoped = ref.questions.filter((x) => x.category_id === complaint.category.id);
    for (const question of [...universal, ...scoped].slice(0, 2)) {
      const option = pick(question.options);
      await q(
        `insert into complaint_followups (complaint_id, question_id, answer_value, severity_delta, at, language)
         values ($1,$2,$3,$4,$5,'en')`,
        [complaint.id, question.id, option.value, option.severity_delta || 0, hoursAfter(complaint.createdAt, 0.2)]
      );
      counts.followups++;
    }

    // Proof of work, the resident's verdict on it, and the review.
    if (["work_completed", "verification", "resolved", "reopened"].includes(complaint.status)) {
      const { rows: images } = await q("select id from complaint_images where complaint_id = $1 order by id limit 1", [complaint.id]);
      const after = await evidenceFor(complaint.category.code, complaint.id % 23);
      let afterId = null;
      if (after) {
        const uploaded = await uploadEvidence(after);
        const { rows } = await q(
          `insert into complaint_images (complaint_id, storage_path, role, uploaded_by, phash, created_at)
           values ($1,$2,'after',$3,$4,$5) returning id`,
          [complaint.id, uploaded.path, complaint.officer?.id || null, uploaded.hash,
           complaint.resolvedAt || hoursAfter(complaint.createdAt, 72)]
        );
        afterId = rows[0].id;
      }
      const rejected = complaint.status === "reopened";
      await q(
        `insert into resolution_proofs (complaint_id, before_image_id, after_image_id, officer_id, notes,
                                        ai_scene_match, ai_change_detected, ai_verdict, ai_verdict_summary,
                                        attempt, rejected, rejected_at, rejection_reason, created_at)
         values ($1,$2,$3,$4,$5,null,null,'not_checked',$6,1,$7,$8,$9,$10)`,
        [complaint.id, images[0]?.id || null, afterId, complaint.officer?.id || null,
         pick(OFFICER_NOTES.work_completed),
         "No automatic comparison was run — the local classifier reads one photograph at a time. The resident compares the two and decides.",
         rejected, rejected ? complaint.createdAt : null,
         rejected ? "The resident says the problem is still there." : null,
         complaint.resolvedAt || hoursAfter(complaint.createdAt, 70)]
      );
      counts.proofs++;
    }

    if (complaint.status === "resolved" && complaint.resolvedAt) {
      await q(
        `insert into complaint_feedback (complaint_id, citizen_id, resolved, rating, comment, at)
         values ($1,$2,true,$3,$4,$5) on conflict (complaint_id) do nothing`,
        [complaint.id, complaint.citizen.id, between(3, 5),
         pick(["Cleared properly, thank you.", "Done, though it took a while.", "Fixed. The lane is usable again.", null]),
         hoursAfter(complaint.resolvedAt, between(6, 72))]
      );
      counts.feedback++;
      if (chance(0.55)) {
        const onTime = complaint.resolvedAt <= complaint.slaDeadline;
        await q(
          `insert into complaint_reviews (complaint_id, citizen_id, rating, speed_rating, quality_rating, comment, would_report_again, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (complaint_id) do nothing`,
          [complaint.id, complaint.citizen.id, onTime ? between(4, 5) : between(2, 4),
           onTime ? between(4, 5) : between(1, 3), between(3, 5),
           onTime ? pick(["Quick response once it was assigned.", "Attended within a few days.", null])
                  : pick(["Took far longer than it should have.", "Eventually done, after several follow-ups.", null]),
           onTime || chance(0.6), hoursAfter(complaint.resolvedAt, between(12, 96))]
        );
        counts.reviews++;
      }
    }

    // Points, as events. The leaderboard reads the total; the total is the sum
    // of these, so nothing is being asserted that the history does not support.
    const events = [["valid_report", 10, complaint.createdAt]];
    if (complaint.severity === "critical") events.push(["critical_report", 15, complaint.createdAt]);
    if (complaint.status === "resolved") events.push(["confirmed_resolution", 20, complaint.resolvedAt]);
    for (const [reason, points, at] of events) {
      if (complaint.status === "rejected") continue;
      await q(`insert into reward_events (citizen_id, reason, points, complaint_id, at) values ($1,$2,$3,$4,$5)`,
        [complaint.citizen.id, reason, points, complaint.id, at]);
      counts.rewards++;
    }

    // What the resident was told, as it happened.
    const notices = [];
    if (complaint.officer) notices.push(["routed", "Your report has been assigned", `${complaint.ref} is with the ${complaint.category.name.toLowerCase()} team at ${complaint.officer.designation.replace(/\(.*\)/, "").trim()}.`, hoursAfter(complaint.createdAt, between(6, 40))]);
    if (["work_started", "work_completed", "verification", "resolved"].includes(complaint.status))
      notices.push(["work_started", "Work has started", `An officer has begun work on ${complaint.ref}.`, hoursAfter(complaint.createdAt, between(48, 200))]);
    if (complaint.status === "verification") notices.push(["verify", "Please confirm this is fixed", `${complaint.ref} has been marked complete. Tell us whether the problem is actually gone.`, hoursAfter(complaint.createdAt, between(70, 240))]);
    if (complaint.status === "rejected") notices.push(["rejected", "Your report was not taken forward", `${complaint.ref} was closed without action. The reason is on the report.`, hoursAfter(complaint.createdAt, between(40, 120))]);
    if (complaint.resolvedAt) notices.push(["resolved", "Your report is resolved", `${complaint.ref} has been closed. You can review the work.`, complaint.resolvedAt]);
    for (const [kind, title, body, at] of notices) {
      await q(
        `insert into notifications (user_id, kind, title, body, complaint_id, read_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [complaint.citizen.id, kind, title, body, complaint.id,
         chance(0.62) ? hoursAfter(at, between(1, 60)) : null, at]
      );
      counts.notifications++;
    }

    await q(
      `insert into audit_logs (actor, action, entity, entity_id, after, at)
       values ($1,'complaint.created','complaints',$2,$3,$4)`,
      [complaint.citizen.id, complaint.ref,
       JSON.stringify({ category: complaint.category.name, ward: complaint.ward, severity: complaint.severity }),
       complaint.createdAt]
    );
    counts.audit++;
    if (complaint.officer) {
      await q(
        `insert into audit_logs (actor, action, entity, entity_id, after, at)
         values ($1,'officer.assign','complaints',$2,$3,$4)`,
        [pick(people.staff).id, complaint.ref, JSON.stringify({ officer_id: complaint.officer.id }),
         hoursAfter(complaint.createdAt, between(5, 40))]
      );
      counts.audit++;
    }
  }

  // Campus-side notifications, which is what the coordinator sees on sign-in.
  const { rows: proposals } = await q(
    `select p.ref, p.status, p.institution_id, p.faculty_mentor_id, c.ref as challenge_ref, c.title, p.created_at
     from campus_proposals p join challenges c on c.id = p.challenge_id where c.is_demo`
  );
  const { rows: coordinators } = await q(
    `select id, institution_id from profiles where is_demo and role = 'university_admin'`
  );
  for (const p of proposals) {
    const audience = [p.faculty_mentor_id, coordinators.find((c) => c.institution_id === p.institution_id)?.id].filter(Boolean);
    const message = {
      approved: ["proposal_approved", "Proposal approved", `${p.ref} has been approved. A project record has been created.`],
      rejected: ["proposal_rejected", "Proposal not approved", `${p.ref} was not approved. The reviewer's reason is on the proposal.`],
      revision_requested: ["proposal_revision_requested", "Revision requested", `${p.ref} needs changes before it can be approved.`],
      resubmitted: ["proposal_submitted", "Proposal resubmitted", `${p.ref} has been resubmitted for review.`],
      under_review: ["proposal_under_review", "Proposal under review", `${p.ref} has been taken up for review.`],
      submitted: ["proposal_submitted", "Proposal submitted", `${p.ref} has been submitted for review.`],
    }[p.status];
    if (!message) continue;
    for (const user of audience) {
      await q(
        `insert into notifications (user_id, kind, title, body, read_at, created_at) values ($1,$2,$3,$4,$5,$6)`,
        [user, message[0], message[1], message[2], chance(0.5) ? daysAgo(between(1, 20)) : null,
         new Date(new Date(p.created_at).getTime() + 12 * DAY)]
      );
      counts.notifications++;
    }
  }

  // And what the ward office saw, which is the other half of the same events.
  const { rows: challenges } = await q("select id, ref, title, raised_at, department_id from challenges where is_demo");
  for (const ch of challenges) {
    const staff = people.staff.filter((s) => s.departmentId === ch.department_id);
    for (const member of staff.slice(0, 2)) {
      await q(
        `insert into notifications (user_id, kind, title, body, read_at, created_at) values ($1,$2,$3,$4,$5,$6)`,
        [member.id, "routed", "A challenge was raised in your department",
         `${ch.ref} — ${ch.title}`, chance(0.55) ? daysAgo(between(1, 30)) : null, ch.raised_at]
      );
      counts.notifications++;
    }
    await q(
      `insert into audit_logs (actor, action, entity, entity_id, after, at)
       values ($1,'challenge.raised','challenges',$2,$3,$4)`,
      [pick(people.staff).id, ch.ref, JSON.stringify({ title: ch.title }), ch.raised_at]
    );
    counts.audit++;
  }

  console.log(`Engagement: ${counts.comments} comments (${counts.hidden} moderated), ${counts.followups} follow-up answers, ${counts.proofs} resolution proofs, ${counts.feedback} confirmations, ${counts.reviews} reviews, ${counts.rewards} reward events, ${counts.notifications} notifications, ${counts.audit} audit entries.`);
}

/**
 * Points and badges, derived rather than asserted.
 *
 * profiles.points becomes the sum of the resident's reward events, and each
 * badge is awarded by evaluating its own criteria against the complaints that
 * exist. Writing a number into the leaderboard directly would make it a
 * picture of a leaderboard, and the first person to add up the history would
 * find it did not agree.
 */
async function recomputeStanding() {
  await q(
    `update profiles p set points = coalesce((select sum(points) from reward_events r where r.citizen_id = p.id), 0)
     where p.is_demo and p.role = 'citizen'`
  );
  await q(
    `insert into citizen_badges (citizen_id, badge_id, earned_at)
     select s.citizen_id, b.id, s.latest
     from (
       select c.citizen_id,
              count(*) filter (where c.status <> 'rejected')                     as valid_reports,
              count(*) filter (where c.status = 'resolved')                      as resolved,
              count(distinct c.cluster_id) filter (where not c.is_duplicate)      as clusters_started,
              max(c.created_at)                                                   as latest
       from complaints c join profiles p on p.id = c.citizen_id
       where p.is_demo and c.is_demo group by c.citizen_id
     ) s
     join badges b on
       (b.criteria ? 'valid_reports'   and s.valid_reports   >= (b.criteria->>'valid_reports')::int) or
       (b.criteria ? 'resolved'        and s.resolved        >= (b.criteria->>'resolved')::int) or
       (b.criteria ? 'clusters_started' and s.clusters_started >= (b.criteria->>'clusters_started')::int)
     on conflict do nothing`
  );
}

// ============================================================
// Validation
// ============================================================

/**
 * A seed that inserts rows and reports success is worth very little: the
 * failures that matter are a complaint with no photograph, a proposal whose
 * institution was deleted, a storage path pointing at nothing. Every check
 * here is one that has something visibly broken behind it, and a failure
 * throws rather than warns.
 */
async function validate() {
  const one = async (sql, params) => (await q(sql, params)).rows[0].n;
  const problems = [];
  const check = (label, value, ok) => { if (!ok) problems.push(`${label}: ${value}`); return value; };

  const counts = {
    residents: await one("select count(*)::int n from profiles where is_demo and role='citizen'"),
    officers: await one("select count(*)::int n from officers o join profiles p on p.id=o.id where p.is_demo"),
    reports: await one("select count(*)::int n from complaints where is_demo"),
    evidence: await one("select count(*)::int n from complaint_images i join complaints c on c.id=i.complaint_id where c.is_demo"),
    clusters: await one("select count(*)::int n from clusters where is_demo"),
    institutions: await one("select count(*)::int n from institutions where is_demo and kind='university'"),
    partners: await one("select count(*)::int n from institutions where is_demo and kind<>'university'"),
    departments: await one("select count(*)::int n from university_departments d join institutions i on i.id=d.institution_id where i.is_demo"),
    faculty: await one("select count(*)::int n from profiles where is_demo and role='faculty'"),
    students: await one("select count(*)::int n from profiles where is_demo and role='student'"),
    challenges: await one("select count(*)::int n from challenges where is_demo"),
    matches: await one("select count(*)::int n from challenge_matches_detailed m join challenges c on c.id=m.challenge_id where c.is_demo"),
    reviews: await one("select count(*)::int n from university_challenge_reviews r join challenges c on c.id=r.challenge_id where c.is_demo"),
    proposals: await one("select count(*)::int n from campus_proposals p join challenges c on c.id=p.challenge_id where c.is_demo"),
    quotations: await one("select count(*)::int n from quotations q join challenges c on c.id=q.challenge_id where c.is_demo"),
    projects: await one("select count(*)::int n from projects p join challenges c on c.id=p.challenge_id where c.is_demo"),
    milestones: await one("select count(*)::int n from project_milestones m join projects p on p.id=m.project_id join challenges c on c.id=p.challenge_id where c.is_demo"),
    documents: await one("select count(*)::int n from campus_documents d join institutions i on i.id=d.institution_id where i.is_demo"),
    notifications: await one("select count(*)::int n from notifications n join profiles p on p.id=n.user_id where p.is_demo"),
    messages: await one("select count(*)::int n from project_messages m join challenges c on c.id=m.challenge_id where c.is_demo"),
    comments: await one("select count(*)::int n from complaint_comments cm join complaints c on c.id=cm.complaint_id where c.is_demo"),
    audit: await one("select count(*)::int n from audit_logs a join profiles p on p.id=a.actor where p.is_demo"),
  };

  // Volume, because an empty section is the failure this dataset exists to fix.
  check("residents", counts.residents, counts.residents >= 50);
  check("reports", counts.reports, counts.reports >= 150);
  check("challenges", counts.challenges, counts.challenges >= 25);
  check("institutions", counts.institutions, counts.institutions >= 8);
  check("university departments", counts.departments, counts.departments >= 40);
  check("faculty", counts.faculty, counts.faculty >= 50);
  check("students", counts.students, counts.students >= 100);
  check("proposals", counts.proposals, counts.proposals >= 15);
  check("projects", counts.projects, counts.projects >= 8);
  check("milestones", counts.milestones, counts.milestones >= 60);
  check("documents", counts.documents, counts.documents >= 40);
  check("notifications", counts.notifications, counts.notifications >= 100);
  check("audit entries", counts.audit, counts.audit >= 100);
  check("challenge-institution matches", counts.matches, counts.matches >= 60);
  check("messages", counts.messages, counts.messages >= 50);

  // Integrity: every one of these has a visibly broken screen behind it.
  const orphans = {
    "reports with no category": await one("select count(*)::int n from complaints where is_demo and category_id is null"),
    "reports with no ward": await one("select count(*)::int n from complaints where is_demo and ward_id is null"),
    "reports with no location": await one("select count(*)::int n from complaints where is_demo and location is null"),
    "reports filed by a non-resident account": await one("select count(*)::int n from complaints c join profiles p on p.id=c.citizen_id where c.is_demo and p.role<>'citizen'"),
    "resolved reports with no resolution time": await one("select count(*)::int n from complaints where is_demo and status='resolved' and resolved_at is null"),
    "reports resolved before they were filed": await one("select count(*)::int n from complaints where is_demo and resolved_at < created_at"),
    "reports with no SLA deadline": await one("select count(*)::int n from complaints where is_demo and sla_deadline is null"),
    "reports with no classifier record": await one("select count(*)::int n from complaints c where c.is_demo and not exists (select 1 from complaint_ai_analysis a where a.complaint_id=c.id)"),
    "challenges with no source cluster": await one("select count(*)::int n from challenges where is_demo and cluster_id is null"),
    "challenges whose cluster holds no reports": await one("select count(*)::int n from challenges ch join clusters cl on cl.id=ch.cluster_id where ch.is_demo and cl.report_count = 0"),
    "proposals with no faculty mentor": await one("select count(*)::int n from campus_proposals p join challenges c on c.id=p.challenge_id where c.is_demo and p.faculty_mentor_id is null"),
    "proposals with no department": await one("select count(*)::int n from campus_proposals p join challenges c on c.id=p.challenge_id where c.is_demo and p.department_id is null"),
    "submitted proposals with no version history": await one("select count(*)::int n from campus_proposals p join challenges c on c.id=p.challenge_id where c.is_demo and p.status<>'draft' and not exists (select 1 from campus_proposal_versions v where v.proposal_id=p.id)"),
    "projects with no team": await one("select count(*)::int n from projects p join challenges c on c.id=p.challenge_id where c.is_demo and not exists (select 1 from project_members m where m.project_id=p.id)"),
    "projects with no milestones": await one("select count(*)::int n from projects p join challenges c on c.id=p.challenge_id where c.is_demo and not exists (select 1 from project_milestones m where m.project_id=p.id)"),
    "quotations with no line items": await one("select count(*)::int n from quotations q join challenges c on c.id=q.challenge_id where c.is_demo and not exists (select 1 from quotation_items i where i.quotation_id=q.id)"),
    "quotations whose total disagrees with their line items": await one(
      `select count(*)::int n from quotations q join challenges c on c.id=q.challenge_id where c.is_demo
       and abs(q.total_cost - round((select sum(i.quantity*i.unit_cost) from quotation_items i where i.quotation_id=q.id) * (1 + q.tax_rate/100))) > 1`),
    "documents with no file path": await one("select count(*)::int n from campus_documents d join institutions i on i.id=d.institution_id where i.is_demo and coalesce(d.storage_path,'')=''"),
    "milestones marked complete with no completion date": await one("select count(*)::int n from project_milestones m join projects p on p.id=m.project_id join challenges c on c.id=p.challenge_id where c.is_demo and m.status='completed' and m.done_at is null"),
    "notifications addressed to nobody": await one("select count(*)::int n from notifications where user_id is null and complaint_id in (select id from complaints where is_demo)"),
    "residents whose points disagree with their reward history": await one(
      `select count(*)::int n from profiles p where p.is_demo and p.role='citizen'
       and p.points <> coalesce((select sum(points) from reward_events r where r.citizen_id=p.id),0)`),
  };
  for (const [label, n] of Object.entries(orphans)) check(label, n, n === 0);

  // The dashboards that were empty. Each of these drives a screen.
  const surfaces = {
    "public feed": await one("select count(*)::int n from public_reports"),
    "overdue on the public feed": await one("select count(*)::int n from public_reports where overdue"),
    "resident leaderboard": await one("select count(*)::int n from resident_leaderboard"),
    "officer leaderboard": await one("select count(*)::int n from officer_leaderboard"),
  };
  check("public feed", surfaces["public feed"], surfaces["public feed"] >= 150);
  check("overdue on the public feed", surfaces["overdue on the public feed"], surfaces["overdue on the public feed"] >= 5);
  check("resident leaderboard", surfaces["resident leaderboard"], surfaces["resident leaderboard"] >= 25);
  check("officer leaderboard", surfaces["officer leaderboard"], surfaces["officer leaderboard"] >= 8);

  // Every stored path has to have a file behind it, or Preview is a broken
  // link and a report shows an empty frame. Checked by listing the bucket
  // rather than downloading each object: a few dozen listings answer the same
  // question as several hundred downloads.
  const { rows: paths } = await q(
    `select storage_path, 'evidence' as kind from complaint_images i join complaints c on c.id=i.complaint_id where c.is_demo
     union select storage_path, 'document' from campus_documents d join institutions i on i.id=d.institution_id where i.is_demo`
  );
  const buckets = { evidence: EVIDENCE_BUCKET, document: DOCUMENT_BUCKET };
  const present = { evidence: await listAll(EVIDENCE_BUCKET, STORAGE_PREFIX), document: await listAll(DOCUMENT_BUCKET, STORAGE_PREFIX) };
  const sample = [...new Map(paths.map((p) => [p.storage_path, p])).values()];
  let missing = 0;
  for (const p of sample) {
    if (!present[p.kind].has(p.storage_path)) {
      missing++;
      if (missing < 4) problems.push(`missing stored file: ${buckets[p.kind]}/${p.storage_path}`);
    }
  }
  check("stored files missing from the bucket", missing, missing === 0);

  console.log("\n  " + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("\n  "));
  console.log(`  distinct stored files: ${sample.length}`);
  console.log(`  ${Object.entries(surfaces).map(([k, v]) => `${k}: ${v}`).join("\n  ")}`);

  if (problems.length) {
    throw new Error(`Seed validation failed:\n  - ${problems.join("\n  - ")}`);
  }
  console.log("\nEvery check passed.");
}

// ============================================================

const command = process.argv[2];
try {
  if (command === "--reset") await reset();
  else await seed();
} finally {
  await db.end();
}
