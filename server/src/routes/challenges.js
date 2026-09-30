import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound, badRequest, HttpError } from "../middleware/errors.js";

const router = Router();

/**
 * Challenges — recurring problems that need solving rather than fixing.
 *
 * The complaint workflow ends when an officer patches something. That is right
 * for a pothole and wrong for the fourth pothole on the same stretch this year:
 * patching it again is maintenance, and the recurrence is the actual problem.
 *
 * A challenge is raised *from* complaints that already exist, so it carries
 * real evidence — how many residents reported it, over how long. A challenge
 * nobody reported is a research topic, not a civic one, and this deliberately
 * cannot express that.
 */

const NEEDS = [
  "civil", "water", "drainage", "roads", "waste", "public_health",
  "ai", "iot", "gis", "data", "hardware", "mobile",
];

/* ── Public: what is open, and what came of it ─────────────────────────── */
router.get(
  "/",
  wrap(async (req, res) => {
    const { status } = req.query;

    const { rows } = await query(
      `select ch.ref, ch.title, ch.summary, ch.status, ch.needs,
              ch.reports_at_raise, ch.residents_affected, ch.raised_at,
              cat.name as category, w.name as ward, d.name as department,
              (select count(*)::int from challenge_interest i
                where i.challenge_id = ch.id and i.decision is null) as interested,
              (select p.ref from projects p where p.challenge_id = ch.id limit 1) as project_ref
       from challenges ch
       left join categories cat on cat.id = ch.category_id
       left join wards w on w.id = ch.ward_id
       left join departments d on d.id = ch.department_id
       where ($1::text is null or $1 = '' or ch.status = $1)
       order by ch.residents_affected desc, ch.raised_at desc
       limit 50`,
      [status || null]
    );

    res.json({ challenges: rows, needs: NEEDS });
  })
);

router.get(
  "/:ref",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select ch.*, cat.name as category, w.name as ward, d.name as department
       from challenges ch
       left join categories cat on cat.id = ch.category_id
       left join wards w on w.id = ch.ward_id
       left join departments d on d.id = ch.department_id
       where ch.ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Challenge");

    const [matches, interest, project] = await Promise.all([
      query(
        `select institution, kind, matched, required, matched_on
         from challenge_matches where challenge_id = $1
         order by matched desc limit 6`,
        [rows[0].id]
      ),
      query(
        `select i.pitch, i.submitted_at, i.decision, inst.name as institution, inst.kind
         from challenge_interest i
         join institutions inst on inst.id = i.institution_id
         where i.challenge_id = $1
         order by i.submitted_at`,
        [rows[0].id]
      ),
      query(
        `select p.ref, p.title, p.stage, p.approach, p.impact_note,
                p.complaints_closed, inst.name as institution, partner.name as partner,
                (select json_agg(json_build_object(
                   'title', m.title, 'due_on', m.due_on, 'done_at', m.done_at
                 ) order by m.position)
                 from project_milestones m where m.project_id = p.id) as milestones
         from projects p
         join institutions inst on inst.id = p.institution_id
         left join institutions partner on partner.id = p.partner_id
         where p.challenge_id = $1`,
        [rows[0].id]
      ),
    ]);

    res.json({
      challenge: rows[0],
      // Overlap counts rather than percentages. "Civil Engineering — 91%" is a
      // number with no derivation; "2 of 3 needs" can be checked at a glance.
      matches: matches.rows,
      interest: interest.rows,
      project: project.rows[0] || null,
    });
  })
);

/* ── Raising one from what residents already reported ──────────────────── */
router.post(
  "/from-group/:clusterRef",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { title, summary, needs } = z
      .object({
        title: z.string().trim().min(8).max(160),
        summary: z.string().trim().min(30).max(2000),
        needs: z.array(z.enum(NEEDS)).min(1).max(6),
      })
      .parse(req.body);

    const { rows: cluster } = await query(
      `select id, report_count from clusters where ref = $1`,
      [req.params.clusterRef]
    );
    if (!cluster[0]) throw notFound("Group");

    const { rows: existingChallenge } = await query(
      "select ref from challenges where cluster_id=$1 limit 1",
      [cluster[0].id]
    );
    if (existingChallenge[0]) {
      throw new HttpError(
        409,
        `This group is already linked to challenge ${existingChallenge[0].ref}.`,
        { challengeRef: existingChallenge[0].ref }
      );
    }

    // A group of two is a coincidence. Raising a challenge is a claim that a
    // pattern exists, and three separate reports is the least that supports it.
    if (cluster[0].report_count < 3) {
      throw badRequest(
        "This group has too few reports to call a pattern. A challenge should come from " +
          "something residents have reported repeatedly."
      );
    }

    const { rows } = await query(
      `select raise_challenge_from_cluster($1,$2,$3,$4,$5) as id`,
      [cluster[0].id, title, summary, needs, req.user.id]
    );

    const { rows: created } = await query(`select ref from challenges where id = $1`, [rows[0].id]);

    await query(
      `insert into audit_logs (actor, action, entity, entity_id, after)
       values ($1, 'challenge.raised', 'challenges', $2, $3)`,
      [req.user.id, created[0].ref, JSON.stringify({ from: req.params.clusterRef, needs })]
    );

    res.status(201).json({ ref: created[0].ref });
  })
);

/* ── Help writing the proposal ─────────────────────────────────────────── */
router.get(
  "/:ref/proposal-guide",
  requireAuth,
  wrap(async (req, res) => {
    const { rows: ch } = await query(
      `select ch.id, ch.title, ch.summary, ch.needs, ch.reports_at_raise,
              ch.residents_affected, cat.name as category, w.name as ward
       from challenges ch
       left join categories cat on cat.id = ch.category_id
       left join wards w on w.id = ch.ward_id
       where ch.ref = $1`,
      [req.params.ref]
    );
    if (!ch[0]) throw notFound("Challenge");

    const { rows: me } = await query(
      `select i.name, i.expertise, i.city
       from profiles p join institutions i on i.id = p.institution_id
       where p.id = $1`,
      [req.user.id]
    );

    const c = ch[0];
    const mine = me[0];
    const gaps = mine
      ? c.needs.filter((n) => !mine.expertise.includes(n))
      : c.needs;
    const covered = mine
      ? c.needs.filter((n) => mine.expertise.includes(n))
      : [];

    /**
     * Prompts drawn from the challenge, not generated prose.
     *
     * A model writing the proposal would produce something the institution did
     * not mean and cannot defend in a meeting — and the city would then be
     * choosing between four essays written by the same model. What actually
     * helps is knowing which questions the administrator will ask, which is
     * knowable from the challenge itself.
     */
    res.json({
      challenge: c,
      sections: [
        {
          heading: "What you think is actually wrong",
          prompt:
            `${c.reports_at_raise} residents reported this before it was raised. Patching it ` +
            `has not held. Say what you believe the underlying cause is — that judgement is ` +
            `what distinguishes a proposal from a quotation.`,
          required: true,
        },
        {
          heading: "How you would find out",
          prompt:
            "What you would measure or survey first, and roughly how long that takes. An " +
            "administrator is choosing between institutions partly on who has a method.",
          required: true,
        },
        {
          heading: "Who would do it",
          prompt: mine
            ? `Which of your departments, and how many students. You have recorded ` +
              `${(mine.expertise || []).join(", ")}.`
            : "Which departments and how many students.",
          required: true,
        },
        {
          heading: covered.length
            ? `What you already cover — ${covered.join(", ")}`
            : "What you already cover",
          prompt: "Prior work of your own that is relevant. Be specific rather than broad.",
          required: false,
        },
        gaps.length
          ? {
              heading: `The gap — ${gaps.join(", ")}`,
              prompt:
                `This challenge asks for ${gaps.join(" and ")}, which your recorded expertise ` +
                `does not cover. Say how you would handle that: a partner, a hire, or a ` +
                `narrower scope. Saying nothing about it is the weakest option.`,
              required: true,
            }
          : null,
        {
          heading: "What would count as done",
          prompt:
            "The city measures a project by whether the reports stopped. Say what you would " +
            "expect to change and how anyone would know.",
          required: true,
        },
      ].filter(Boolean),

      // Stated plainly. An institution should not be guessing what the
      // assessment weighs while writing the thing being assessed.
      assessed_on: [
        "How much of the challenge your expertise covers",
        "What you have finished before, and what you abandoned",
        "How many people and disciplines you have registered",
        "How close you are to the site",
      ],
    });
  })
);

/* ── An institution putting itself forward ─────────────────────────────── */
router.post(
  "/:ref/interest",
  requireAuth,
  wrap(async (req, res) => {
    const { pitch } = z.object({ pitch: z.string().trim().min(20).max(2000) }).parse(req.body);

    const { rows: me } = await query(
      `select institution_id from profiles where id = $1`,
      [req.user.id]
    );
    if (!me[0]?.institution_id) {
      throw badRequest("Only somebody attached to an approved institution can express interest.");
    }

    const { rows: ch } = await query(`select id, status from challenges where ref = $1`, [
      req.params.ref,
    ]);
    if (!ch[0]) throw notFound("Challenge");
    if (!["open", "matched"].includes(ch[0].status)) {
      throw badRequest("This challenge is no longer taking proposals.");
    }

    try {
      await query(
        `insert into challenge_interest (challenge_id, institution_id, pitch, submitted_by)
         values ($1,$2,$3,$4)`,
        [ch[0].id, me[0].institution_id, pitch, req.user.id]
      );
    } catch (err) {
      if (err.code === "23505") {
        throw badRequest("Your institution has already put itself forward for this one.");
      }
      throw err;
    }

    await query(`update challenges set status = 'matched' where id = $1 and status = 'open'`, [
      ch[0].id,
    ]);

    res.status(201).json({ ok: true });
  })
);

/* ── Comparing the institutions that applied ───────────────────────────── */
router.get(
  "/:ref/assess",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { rows: ch } = await query(`select id, title, needs from challenges where ref = $1`, [
      req.params.ref,
    ]);
    if (!ch[0]) throw notFound("Challenge");

    const { rows: applicants } = await query(
      `select i.institution_id, i.pitch, i.submitted_at,
              inst.name, inst.kind, inst.city, inst.expertise
       from challenge_interest i
       join institutions inst on inst.id = i.institution_id
       where i.challenge_id = $1 and i.decision is null
       order by i.submitted_at`,
      [ch[0].id]
    );

    /**
     * Each applicant scored on things that can be checked.
     *
     * Deliberately not a model. A black box telling a municipality which
     * university to award public work to is exactly the kind of automated
     * decision that should not exist, and one nobody could defend if asked.
     * Every point traces to a fact, and the breakdown travels with the total.
     *
     * It ranks. The administrator decides.
     */
    const assessed = await Promise.all(
      applicants.map(async (a) => {
        const { rows: factors } = await query(`select * from assess_institution($1, $2)`, [
          a.institution_id, ch[0].id,
        ]);

        return {
          ...a,
          factors,
          total: factors.reduce((n, f) => n + f.points, 0),
          out_of: factors.reduce((n, f) => n + f.out_of, 0),
        };
      })
    );

    assessed.sort((x, y) => y.total - x.total);

    res.json({
      challenge: ch[0],
      applicants: assessed,
      caveat:
        "Scores rank applicants on checkable facts — expertise overlap, what they have " +
        "finished before, how many people they have, and how close they are. They do not " +
        "read the pitch, and they do not decide.",
    });
  })
);

/* ── The city choosing ─────────────────────────────────────────────────── */
router.post(
  "/:ref/accept",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { institutionId, title, partnerId, note } = z
      .object({
        institutionId: z.coerce.number(),
        title: z.string().trim().min(8).max(160),
        partnerId: z.coerce.number().nullable().optional(),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);

    const { rows: ch } = await query(`select id from challenges where ref = $1`, [req.params.ref]);
    if (!ch[0]) throw notFound("Challenge");

    const { rows: project } = await query(
      `insert into projects (challenge_id, institution_id, partner_id, title)
       values ($1,$2,$3,$4) returning ref`,
      [ch[0].id, institutionId, partnerId || null, title]
    );

    await query(
      `update challenge_interest
       set decision = case when institution_id = $2 then 'accepted' else 'declined' end,
           decided_by = $3, decided_at = now(), decision_note = $4
       where challenge_id = $1 and decision is null`,
      [ch[0].id, institutionId, req.user.id, note || null]
    );

    await query(`update challenges set status = 'in_progress' where id = $1`, [ch[0].id]);

    // The stages every project moves through, created up front. A milestone
    // list somebody has to invent is a milestone list nobody fills in.
    await query(
      `insert into project_milestones (project_id, title, position)
       select p.id, m.title, m.pos
       from projects p,
            (values ('Proposal accepted', 1), ('Approach agreed', 2),
                    ('Prototype built', 3), ('Pilot running', 4),
                    ('Deployed and measured', 5)) as m(title, pos)
       where p.ref = $1`,
      [project[0].ref]
    );

    res.status(201).json({ ref: project[0].ref });
  })
);

export default router;
