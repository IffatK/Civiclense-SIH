import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole, requireRole } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";
import { notify } from "../services/notifications.js";
import { createClient } from "@supabase/supabase-js";

// Same client staff.js builds. Creating the account server-side means no
// verification email for what is, in effect, an internal application — the
// approval step is the verification.
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});


const router = Router();

/**
 * Institutions applying to work on challenges, and the people inside them.
 *
 * The innovation ecosystem existed in the schema and nobody outside the
 * municipality could reach it. Every challenge was matched, accepted and run by
 * an administrator acting on a university's behalf, which is not an ecosystem —
 * it is an administrator doing more paperwork.
 *
 * Two ways in, deliberately different. An institution applies to the city and
 * waits for approval, because an open directory of a city's unsolved problems
 * is a directory of where that city is weak. Students and further faculty are
 * invited by their own institution, because a university knows who its students
 * are and a municipal administrator does not.
 */

/**
 * Free email providers. An institution registers with an institutional address.
 *
 * Not a security control — anyone can buy a domain — but it is the difference
 * between "somebody from this university" and "somebody who typed this
 * university's name". A registrar cannot verify a gmail address against an
 * institution at all; they can at least look at kjsce.somaiya.edu and see
 * whether it belongs to the college named on the form.
 *
 * A blocklist rather than an allowlist, because the set of legitimate academic
 * domains worldwide is not enumerable and rejecting a real college over a
 * missing entry is the worse failure.
 */
const FREE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "rediffmail.com", "rediff.com", "icloud.com", "me.com", "aol.com",
  "protonmail.com", "proton.me", "zoho.com", "mail.com", "gmx.com",
  "yandex.com", "tutanota.com", "example.com", "test.com",
]);

/** Domains that say "institution" without further checking. */
const ACADEMIC = /\.(edu|ac)\.[a-z]{2,}$|\.edu$|\.ac$|\.res\.in$|\.gov\.in$/i;

function checkWorkEmail(email, kind) {
  const domain = String(email).split("@")[1]?.toLowerCase() || "";

  if (FREE_EMAIL.has(domain)) {
    return {
      ok: false,
      reason:
        `${domain} is a personal email provider. Register with your institutional address — ` +
        `an approver cannot check a personal account against the institution you are naming.`,
    };
  }

  if (domain.split(".").length < 2) {
    return { ok: false, reason: "That does not look like a valid email domain." };
  }

  // Academic domains pass without comment. A company domain is fine too, but
  // it is worth telling the approver it was not academic rather than treating
  // the two as identical.
  return { ok: true, academic: ACADEMIC.test(domain), domain };
}

const EXPERTISE = [
  "civil", "water", "drainage", "roads", "waste", "public_health",
  "ai", "iot", "gis", "data", "hardware", "mobile",
];

/* ── Registering ───────────────────────────────────────────────────────── */
/**
 * POST /api/institutions/register
 *
 * Account and application in one step.
 *
 * The two-step version — sign up as a resident, then find the apply page —
 * asked a university to pretend to be a citizen first. It also meant the entry
 * point was buried inside the resident app, which is exactly where somebody
 * from a university would never look.
 *
 * Mirrors staff registration deliberately: same shape, same approval queue,
 * same "you will be notified either way".
 */
router.post(
  "/register",
  wrap(async (req, res) => {
    const input = z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(72),
        fullName: z.string().trim().min(2).max(120),

        institutionName: z.string().trim().min(4).max(160),
        kind: z.enum(["university", "industry", "ngo", "research"]).default("university"),
        city: z.string().trim().max(80).optional(),
        website: z.string().trim().max(200).optional(),
        expertise: z.array(z.enum(EXPERTISE)).min(1).max(8),
        departments: z.array(z.string().trim().max(80)).max(12).default([]),
        statement: z.string().trim().min(40).max(2000),
      })
      .parse(req.body);

    const emailCheck = checkWorkEmail(input.email, input.kind);
    if (!emailCheck.ok) throw badRequest(emailCheck.reason);

    // An institution already on file and approved means somebody from there has
    // been through this. Better to say so than to create a second record that
    // splits their projects across both.
    const { rows: known } = await query(
      `select id, approved from institutions where lower(name) = lower($1)`,
      [input.institutionName]
    );
    if (known[0]?.approved) {
      throw badRequest(
        `${input.institutionName} is already registered. Ask a colleague there to invite you, ` +
          `or sign in if you already have an account.`
      );
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });

    if (error) {
      throw badRequest(
        /already/i.test(error.message)
          ? "An account with that email already exists. Sign in and apply from there."
          : error.message
      );
    }

    const userId = data.user.id;

    await query(
      `insert into profiles (id, email, full_name, role, language)
       values ($1,$2,$3,'citizen','en')
       on conflict (id) do nothing`,
      [userId, input.email, input.fullName]
    );

    await query(
      `insert into institution_applications
         (institution_name, kind, city, website, expertise, departments,
          applicant_id, applicant_role, statement)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.institutionName, input.kind, input.city || null, input.website || null,
        input.expertise, input.departments, userId,
        input.kind === "industry" ? "industry_partner" : "university_admin",
        input.statement,
      ]
    );

    res.status(201).json({
      ok: true,
      note: "Your application is with a city administrator. Sign in to check its status.",
    });
  })
);

/* ── Applying ──────────────────────────────────────────────────────────── */
router.post(
  "/apply",
  requireAuth,
  wrap(async (req, res) => {
    const input = z
      .object({
        institutionName: z.string().trim().min(4).max(160),
        kind: z.enum(["university", "industry", "ngo", "research"]).default("university"),
        city: z.string().trim().max(80).optional(),
        website: z.string().trim().max(200).optional(),
        expertise: z.array(z.enum(EXPERTISE)).min(1).max(8),
        departments: z.array(z.string().trim().max(80)).max(12).default([]),
        role: z.enum(["university_admin", "faculty", "industry_partner"]).default("university_admin"),
        statement: z.string().trim().min(40).max(2000),
      })
      .parse(req.body);

    // Somebody who signed up as a resident on a personal address and is now
    // applying as a university would otherwise slip past the registration check.
    const emailCheck = checkWorkEmail(req.user.email, input.kind);
    if (!emailCheck.ok) throw badRequest(emailCheck.reason);

    const { rows: existing } = await query(
      `select id, status from institution_applications
       where applicant_id = $1 and status = 'pending'`,
      [req.user.id]
    );
    if (existing[0]) {
      throw badRequest("You already have an application waiting for a decision.");
    }

    const { rows } = await query(
      `insert into institution_applications
         (institution_name, kind, city, website, expertise, departments,
          applicant_id, applicant_role, statement)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id`,
      [
        input.institutionName, input.kind, input.city || null, input.website || null,
        input.expertise, input.departments, req.user.id, input.role, input.statement,
      ]
    );

    res.status(201).json({
      id: rows[0].id,
      // Said plainly, because an applicant who does not know how long to wait
      // assumes they have been ignored.
      note: "A city administrator reviews applications. You will be notified either way.",
    });
  })
);

router.get(
  "/my-application",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(
      `select a.*, p.full_name as decided_by_name
       from institution_applications a
       left join profiles p on p.id = a.decided_by
       where a.applicant_id = $1
       order by a.created_at desc limit 1`,
      [req.user.id]
    );

    res.json({ application: rows[0] || null });
  })
);

/* ── The queue, and deciding ───────────────────────────────────────────── */
router.get(
  "/applications",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { status } = req.query;

    const { rows } = await query(
      `select a.*, p.full_name as applicant_name, p.email as applicant_email,
              (select count(*)::int from institutions i
                where lower(i.name) = lower(a.institution_name)) as already_known
       from institution_applications a
       join profiles p on p.id = a.applicant_id
       where ($1::text is null or $1 = '' or a.status = $1)
       order by a.status = 'pending' desc, a.created_at desc
       limit 60`,
      [status || "pending"]
    );

    res.json({ applications: rows, expertise: EXPERTISE });
  })
);

/* City-wide institute record. Unlike the application queue, this contains
   approved institutions and their current operational footprint. */
router.get(
  "/directory",
  requireAuth,
  requireRole("global_admin"),
  wrap(async (_req, res) => {
    const { rows } = await query(`select i.id,i.name,i.kind,i.city,i.website,i.description,i.approved,i.approved_at,
      i.expertise,i.disciplines,i.research_areas,i.laboratories,i.capabilities,
      (select count(*)::int from profiles p where p.institution_id=i.id) member_count,
      (select count(*)::int from university_departments d where d.institution_id=i.id) department_count,
      (select count(*)::int from projects p where p.institution_id=i.id) project_count,
      (select count(*)::int from projects p where p.institution_id=i.id and p.stage in ('approved','building','pilot')) active_project_count
      from institutions i order by i.approved desc, i.name`);
    res.json({ institutions: rows });
  })
);

router.post(
  "/applications/:id/decide",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { decision, note } = z
      .object({
        decision: z.enum(["approved", "rejected"]),
        // Required on a rejection. Somebody turned down without a reason has
        // nothing to correct and no way to try again sensibly.
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    if (decision === "rejected" && !note) {
      throw badRequest("A rejection needs a reason — the applicant is told what it says.");
    }

    const { rows: app } = await query(
      `select id, applicant_id, institution_name, status from institution_applications where id = $1`,
      [req.params.id]
    );
    if (!app[0]) throw notFound("Application");
    if (app[0].status !== "pending") throw badRequest("That has already been decided.");

    if (decision === "approved") {
      await query(`select approve_institution($1, $2, $3)`, [
        req.params.id, req.user.id, note || null,
      ]);
    } else {
      await query(
        `update institution_applications
         set status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3
         where id = $1`,
        [req.params.id, req.user.id, note]
      );
    }

    await notify({
      userId: app[0].applicant_id,
      kind: decision === "approved" ? "institution_approved" : "institution_rejected",
      context: { institution: app[0].institution_name, reason: note || "" },
    });

    res.json({ ok: true });
  })
);

/* ── Inviting people into an institution ───────────────────────────────── */
router.post(
  "/invite",
  requireAuth,
  wrap(async (req, res) => {
    const { email, role, discipline } = z
      .object({
        email: z.string().email(),
        invitedRole: z.enum(["faculty", "student", "partner_member"]).optional(),
        role: z.enum(["faculty", "student", "partner_member"]).default("student"),
        discipline: z.string().trim().max(60).optional(),
      })
      .parse(req.body);

    const { rows: me } = await query(
      `select institution_id, role from profiles where id = $1`,
      [req.user.id]
    );

    // Only somebody who leads an institution invites into it. A student
    // inviting further students would let one account quietly become a whole
    // fictional department.
    if (!me[0]?.institution_id || !["university_admin", "faculty", "industry_partner"].includes(me[0].role)) {
      throw badRequest("Only an institution lead or faculty member can invite people.");
    }

    await query(
      `insert into institution_invites (institution_id, email, invited_role, discipline, invited_by)
       values ($1,$2,$3,$4,$5)
       on conflict (institution_id, email)
       do update set invited_role = excluded.invited_role,
                     discipline = excluded.discipline,
                     invited_at = now(),
                     expires_at = now() + interval '14 days',
                     accepted_at = null`,
      [me[0].institution_id, email.toLowerCase(), role, discipline || null, req.user.id]
    );

    res.status(201).json({
      ok: true,
      note: "They join the institution when they sign up with that address. The invitation lapses after 14 days.",
    });
  })
);

/** Called after sign-up, so an invited student lands inside their institution. */
router.post(
  "/claim-invite",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`select accept_institution_invite($1, $2) as institution_id`, [
      req.user.email,
      req.user.id,
    ]);

    if (!rows[0]?.institution_id) {
      return res.json({ joined: false });
    }

    const { rows: inst } = await query(`select name, kind from institutions where id = $1`, [
      rows[0].institution_id,
    ]);

    res.json({ joined: true, institution: inst[0] });
  })
);

/* ── What we should be working on ──────────────────────────────────────── */
router.get(
  "/my/challenges",
  requireAuth,
  wrap(async (req, res) => {
    const { rows: me } = await query(
      `select institution_id, institution_role from profiles where id = $1`,
      [req.user.id]
    );
    if (!me[0]?.institution_id) throw badRequest("You are not attached to an institution.");

    /**
     * Matched challenges, best fit first — with the reasoning attached.
     *
     * Deliberately not a percentage. "Civil Engineering — 91%" is a number with
     * no derivation that invites the question "91% of what", and nobody can
     * check it. Three of four needs, named, is something a faculty member can
     * argue with.
     *
     * Gaps are shown rather than hidden. A university missing one need is
     * exactly the case where an industry partner is worth bringing in, and
     * concealing the gap conceals the reason to.
     */
    const { rows } = await query(
      `select m.*,
              (select count(*)::int from challenge_interest i
                where i.challenge_id = m.challenge_id and i.institution_id = $1) as we_applied,
              (select count(*)::int from challenge_interest i
                where i.challenge_id = m.challenge_id) as total_interest
       from challenge_matches_detailed m
       where m.institution_id = $1
       order by m.matched desc, m.residents_affected desc
       limit 30`,
      [me[0].institution_id]
    );

    // What we have already taken on, so the workspace is not only a shopping list.
    const { rows: ours } = await query(
      `select p.ref, p.title, p.stage, p.started_at,
              ch.ref as challenge_ref, ch.title as challenge,
              (select count(*)::int from project_members pm where pm.project_id = p.id) as team_size,
              (select count(*)::int from project_milestones ms
                where ms.project_id = p.id and ms.done_at is not null) as done,
              (select count(*)::int from project_milestones ms where ms.project_id = p.id) as total
       from projects p
       join challenges ch on ch.id = p.challenge_id
       where p.institution_id = $1
       order by p.started_at desc`,
      [me[0].institution_id]
    );

    const { rows: inst } = await query(
      `select name, kind, expertise from institutions where id = $1`,
      [me[0].institution_id]
    );

    res.json({
      institution: inst[0],
      matched: rows,
      projects: ours,
      role: me[0].institution_role,
    });
  })
);

/* ── Who is in my institution ──────────────────────────────────────────── */
router.get(
  "/members",
  requireAuth,
  wrap(async (req, res) => {
    const { rows: me } = await query(`select institution_id from profiles where id = $1`, [
      req.user.id,
    ]);
    if (!me[0]?.institution_id) throw badRequest("You are not attached to an institution.");

    const [members, invites] = await Promise.all([
      query(
        `select p.id, p.full_name, p.email, p.role, p.institution_role
         from profiles p
         where p.institution_id = $1
         order by case p.institution_role
                    when 'faculty' then 0 when 'partner_lead' then 1 else 2 end,
                  p.full_name`,
        [me[0].institution_id]
      ),
      query(
        `select email, invited_role, discipline, invited_at, expires_at
         from institution_invites
         where institution_id = $1 and accepted_at is null and expires_at > now()
         order by invited_at desc`,
        [me[0].institution_id]
      ),
    ]);

    res.json({ members: members.rows, pending: invites.rows });
  })
);

export default router;
