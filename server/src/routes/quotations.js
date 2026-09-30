import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../db/pool.js";
import { requireAuth, requireMinRole } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";
import { notify } from "../services/notifications.js";

const router = Router();

/**
 * Quotations — what an institution proposes, what it costs, and what the city
 * gets at the end.
 *
 * Before this, an institution wrote a paragraph and the city awarded work on
 * it. Public money does not move on a paragraph. A quotation names a figure, a
 * duration, and a list of deliverables, and it itemises — a total on its own
 * cannot be interrogated, and one that can be is the one worth having.
 *
 * Several institutions can bid together. A university with the modelling and no
 * hardware, and a company with the sensors and nobody who understands municipal
 * drainage, is the normal case rather than the exception.
 */

const itemSchema = z.object({
  description: z.string().trim().min(3).max(200),
  category: z.enum(["people", "equipment", "materials", "travel", "software", "other"]),
  quantity: z.coerce.number().min(0.01).max(10000),
  unit_cost: z.coerce.number().min(0).max(10000000),
});

/* ── Submitting one ────────────────────────────────────────────────────── */
router.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const input = z
      .object({
        challengeRef: z.string(),
        title: z.string().trim().min(8).max(160),
        approach: z.string().trim().min(100).max(5000),
        durationWeeks: z.coerce.number().int().min(1).max(104),
        startAvailable: z.string().optional(),
        deliverables: z.array(z.string().trim().min(3).max(200)).min(1).max(12),
        assumptions: z.string().max(2000).optional(),
        exclusions: z.string().max(2000).optional(),
        partnerIds: z.array(z.coerce.number()).max(4).default([]),
        items: z.array(itemSchema).min(1).max(40),
      })
      .parse(req.body);

    const { rows: me } = await query(
      `select institution_id, institution_role from profiles where id = $1`,
      [req.user.id]
    );
    if (!me[0]?.institution_id) {
      throw badRequest("Only somebody attached to an approved institution can submit a quotation.");
    }

    // A student cannot commit their institution to a figure. Faculty and leads
    // can; that is the difference between the roles.
    if (!["faculty", "partner_lead"].includes(me[0].institution_role)) {
      throw badRequest(
        "Only faculty or an institution lead can submit a quotation — it commits your " +
          "institution to a cost and a date."
      );
    }

    const { rows: ch } = await query(`select id, title, status from challenges where ref = $1`, [
      input.challengeRef,
    ]);
    if (!ch[0]) throw notFound("Challenge");
    if (!["open", "matched"].includes(ch[0].status)) {
      throw badRequest("This challenge is no longer taking quotations.");
    }

    // The total comes from the items rather than being submitted alongside
    // them. A figure that disagrees with its own breakdown is the first thing
    // an assessor would query, and there is no reason to allow it.
    const total = input.items.reduce((n, i) => n + i.quantity * i.unit_cost, 0);

    const ref = await transaction(async (client) => {
      let created;
      try {
        ({ rows: created } = await client.query(
          `insert into quotations
             (challenge_id, institution_id, partner_ids, title, approach,
              total_cost, duration_weeks, start_available, deliverables,
              assumptions, exclusions, submitted_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           returning id, ref`,
          [
            ch[0].id, me[0].institution_id, input.partnerIds, input.title, input.approach,
            total, input.durationWeeks, input.startAvailable || null, input.deliverables,
            input.assumptions || null, input.exclusions || null, req.user.id,
          ]
        ));
      } catch (err) {
        if (err.code === "23505") {
          throw badRequest("Your institution has already quoted for this challenge.");
        }
        throw err;
      }

      for (const [i, item] of input.items.entries()) {
        await client.query(
          `insert into quotation_items (quotation_id, description, category, quantity, unit_cost, position)
           values ($1,$2,$3,$4,$5,$6)`,
          [created[0].id, item.description, item.category, item.quantity, item.unit_cost, i]
        );
      }

      await client.query(`update challenges set status = 'matched' where id = $1 and status = 'open'`, [
        ch[0].id,
      ]);

      return created[0].ref;
    });

    res.status(201).json({ ref, total });
  })
);

/* ── What we have quoted for ───────────────────────────────────────────── */
router.get(
  "/mine",
  requireAuth,
  wrap(async (req, res) => {
    const { rows: me } = await query(`select institution_id from profiles where id = $1`, [
      req.user.id,
    ]);
    if (!me[0]?.institution_id) throw badRequest("You are not attached to an institution.");

    const { rows } = await query(
      `select q.ref, q.title, q.status, q.total_cost, q.currency, q.duration_weeks,
              q.submitted_at, q.decision_note,
              ch.ref as challenge_ref, ch.title as challenge,
              (select count(*)::int from quotations o
                where o.challenge_id = q.challenge_id and o.status <> 'withdrawn') as competing
       from quotations q
       join challenges ch on ch.id = q.challenge_id
       where q.institution_id = $1
       order by q.submitted_at desc`,
      [me[0].institution_id]
    );

    res.json({ quotations: rows });
  })
);

/* ── Comparing them ────────────────────────────────────────────────────── */
router.get(
  "/for/:challengeRef",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { rows: ch } = await query(`select id, title, needs from challenges where ref = $1`, [
      req.params.challengeRef,
    ]);
    if (!ch[0]) throw notFound("Challenge");

    const { rows } = await query(
      `select * from quotation_comparison where challenge_id = $1 order by total_cost`,
      [ch[0].id]
    );

    const withDetail = await Promise.all(
      rows.map(async (q) => {
        const [items, full, partners] = await Promise.all([
          query(
            `select description, category, quantity, unit_cost, line_total
             from quotation_items it
             join quotations qq on qq.id = it.quotation_id
             where qq.ref = $1 order by it.position`,
            [q.ref]
          ),
          query(
            `select approach, deliverables, assumptions, exclusions, partner_ids
             from quotations where ref = $1`,
            [q.ref]
          ),
          query(
            `select i.name from institutions i
             where i.id = any((select partner_ids from quotations where ref = $1))`,
            [q.ref]
          ),
        ]);

        return {
          ...q,
          ...full.rows[0],
          items: items.rows,
          partners: partners.rows.map((p) => p.name),
        };
      })
    );

    res.json({
      challenge: ch[0],
      quotations: withDetail,
      // Stated, because the cheapest total is not the cheapest quotation and
      // somebody scanning a column of numbers will assume it is.
      note:
        "Sorted by total. Compare cost per week and per deliverable too — the cheapest " +
        "quotation over twice the duration is not the cheapest.",
    });
  })
);

/* ── Awarding ──────────────────────────────────────────────────────────── */
router.post(
  "/:ref/award",
  requireAuth,
  requireMinRole("super_admin"),
  wrap(async (req, res) => {
    const { note } = z.object({ note: z.string().max(1000).optional() }).parse(req.body);

    const { rows: q } = await query(
      `select id, institution_id, challenge_id, partner_ids from quotations where ref = $1`,
      [req.params.ref]
    );
    if (!q[0]) throw notFound("Quotation");

    const { rows } = await query(`select award_quotation($1, $2, $3) as project_ref`, [
      q[0].id, req.user.id, note || null,
    ]);

    // Everybody who bid is told, winners and losers. An institution that hears
    // nothing assumes it was never read.
    const { rows: bidders } = await query(
      `select q.institution_id, q.status, q.submitted_by, i.name
       from quotations q join institutions i on i.id = q.institution_id
       where q.challenge_id = $1`,
      [q[0].challenge_id]
    );

    for (const b of bidders) {
      if (!b.submitted_by) continue;
      await notify({
        userId: b.submitted_by,
        kind: b.status === "accepted" ? "quotation_accepted" : "quotation_declined",
        context: { institution: b.name, reason: note || "" },
      });
    }

    res.json({ project: rows[0].project_ref });
  })
);

export default router;
