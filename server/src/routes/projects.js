import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";

const router = Router();

/**
 * Projects — what an institution is actually doing about a challenge.
 *
 * The lifecycle is five stages and no further. Longer ones look thorough on a
 * slide and produce projects that sit in "testing" for a year because nobody
 * ever agreed what leaving it required.
 *
 * The last stage is not "deployed" but "deployed and measured", and the measure
 * is how many complaints stopped arriving. A pilot that ran beautifully and
 * closed nothing has not solved a civic problem — it has demonstrated one.
 */

const STAGES = ["proposal", "approved", "building", "pilot", "deployed", "abandoned"];

/* ── Public: solutions, which is the argument the whole thing rests on ─── */
router.get(
  "/",
  wrap(async (_req, res) => {
    const { rows } = await query(
      `select * from public_solutions order by
         case stage when 'deployed' then 0 when 'pilot' then 1 else 2 end,
         deployed_at desc nulls last
       limit 40`
    );

    res.json({
      solutions: rows,
      // Said plainly, because "12 locations monitored" without a denominator is
      // the kind of impact number that means nothing.
      basis: "Complaints closed is measured against the reports the challenge was raised from.",
    });
  })
);

router.get(
  "/:ref",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select p.*, ch.ref as challenge_ref, ch.title as challenge,
              ch.summary as challenge_summary, ch.reports_at_raise,
              inst.name as institution, inst.kind as institution_kind,
              partner.name as partner,
              lead.full_name as faculty_lead
       from projects p
       join challenges ch on ch.id = p.challenge_id
       join institutions inst on inst.id = p.institution_id
       left join institutions partner on partner.id = p.partner_id
       left join profiles lead on lead.id = p.faculty_lead
       where p.ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Project");

    const [milestones, team] = await Promise.all([
      query(
        `select id, title, due_on, done_at, note, position
         from project_milestones where project_id = $1 order by position`,
        [rows[0].id]
      ),
      query(
        `select p.full_name, m.discipline, m.role
         from project_members m
         join profiles p on p.id = m.profile_id
         where m.project_id = $1
         order by case m.role when 'lead' then 0 when 'mentor' then 1 else 2 end`,
        [rows[0].id]
      ),
    ]);

    res.json({ project: rows[0], milestones: milestones.rows, team: team.rows });
  })
);

/* ── Moving it along ───────────────────────────────────────────────────── */
router.post(
  "/:ref/stage",
  requireAuth,
  wrap(async (req, res) => {
    const { stage, note } = z
      .object({ stage: z.enum(STAGES), note: z.string().max(500).optional() })
      .parse(req.body);

    const { rows } = await query(
      `select p.id, p.stage, p.institution_id, p.challenge_id
       from projects p where p.ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Project");

    // The institution runs its own project; an administrator can intervene.
    // Anyone else with a login should not be able to declare something deployed.
    const { rows: me } = await query(
      `select institution_id, role from profiles where id = $1`,
      [req.user.id]
    );
    const isStaff = ["super_admin", "global_admin"].includes(me[0]?.role);
    if (!isStaff && me[0]?.institution_id !== rows[0].institution_id) {
      throw badRequest("Only this project's institution or a city administrator can move it.");
    }

    // Deployment is a claim about the city, not about the project, so only the
    // city can make it. An institution marking its own work deployed is the
    // same failure as an officer closing their own complaint.
    if (stage === "deployed" && !isStaff) {
      throw badRequest(
        "Only a city administrator can mark a project deployed — it is a statement about the " +
          "city rather than about the work."
      );
    }

    await query(
      `update projects
       set stage = $2, deployed_at = case when $2 = 'deployed' then now() else deployed_at end
       where id = $1`,
      [rows[0].id, stage]
    );

    if (stage === "deployed") {
      await query(`update challenges set status = 'delivered' where id = $1`, [rows[0].challenge_id]);
    }

    await query(
      `insert into audit_logs (actor, action, entity, entity_id, before, after)
       values ($1, 'project.stage', 'projects', $2, $3, $4)`,
      [req.user.id, req.params.ref,
       JSON.stringify({ stage: rows[0].stage }),
       JSON.stringify({ stage, note: note || null })]
    );

    res.json({ ok: true, stage });
  })
);

router.post(
  "/:ref/milestones/:id/done",
  requireAuth,
  wrap(async (req, res) => {
    const { note } = z.object({ note: z.string().max(500).optional() }).parse(req.body);

    const { rows } = await query(
      `update project_milestones m
       set done_at = now(), note = coalesce($3, m.note)
       from projects p
       where m.id = $2 and m.project_id = p.id and p.ref = $1
       returning m.title`,
      [req.params.ref, req.params.id, note || null]
    );
    if (!rows[0]) throw notFound("Milestone");

    res.json({ ok: true, title: rows[0].title });
  })
);

/* ── Who is on it ──────────────────────────────────────────────────────── */
router.post(
  "/:ref/team",
  requireAuth,
  wrap(async (req, res) => {
    const { profileId, discipline, role } = z
      .object({
        profileId: z.string().uuid(),
        // Recorded rather than inferred from a name. Multidisciplinary teams
        // are the point, and "Computer Science" beside "Civil Engineering" is
        // the evidence of it.
        discipline: z.string().min(2).max(60),
        role: z.enum(["lead", "member", "mentor"]).default("member"),
      })
      .parse(req.body);

    const { rows } = await query(`select id from projects where ref = $1`, [req.params.ref]);
    if (!rows[0]) throw notFound("Project");

    await query(
      `insert into project_members (project_id, profile_id, discipline, role)
       values ($1,$2,$3,$4)
       on conflict (project_id, profile_id)
       do update set discipline = excluded.discipline, role = excluded.role`,
      [rows[0].id, profileId, discipline, role]
    );

    res.status(201).json({ ok: true });
  })
);

/* ── What it changed ───────────────────────────────────────────────────── */
router.post(
  "/:ref/impact",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { note, complaintsClosed } = z
      .object({
        note: z.string().trim().min(10).max(1000),
        complaintsClosed: z.coerce.number().min(0).max(100000),
      })
      .parse(req.body);

    // Recorded by the city rather than the institution, for the same reason a
    // resident confirms a fix rather than the officer who did it.
    const { rows } = await query(
      `update projects set impact_note = $2, complaints_closed = $3
       where ref = $1 returning ref`,
      [req.params.ref, note, complaintsClosed]
    );
    if (!rows[0]) throw notFound("Project");

    res.json({ ok: true });
  })
);

export default router;
