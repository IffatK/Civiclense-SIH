
import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { wrap, notFound } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/followups?category=&lang=
 *
 * Returns the universal question and the questions associated
 * with the requested category.
 */
router.get(
  "/",
  wrap(async (req, res) => {
    const { category, lang } = z
      .object({
        category: z.coerce.number().int().nullable().optional(),
        lang: z.enum(["en", "hi", "mr"]).default("en"),
      })
      .parse(req.query);

    const { rows } = await query(
      `SELECT id, position, prompt, options
       FROM questions_for_category($1)`,
      [category ?? null]
    );

    res.json({
      questions: rows.map((q) => ({
        id: q.id,
        prompt: q.prompt[lang] || q.prompt.en,
        options: q.options.map((o) => ({
          value: o.value,
          label: o.label[lang] || o.label.en,
        })),
      })),
    });
  })
);

/**
 * POST /api/followups/:ref
 *
 * Saves the resident's answers and adjusts the complaint severity
 * score and severity classification.
 */
router.post(
  "/:ref",
  wrap(async (req, res) => {
    const { answers } = z
      .object({
        answers: z
          .array(
            z.object({
              question_id: z.number().int(),
              value: z.string(),
              language: z.enum(["en", "hi", "mr"]).optional(),
            })
          )
          .max(10),
      })
      .parse(req.body);

    const { rows } = await query(
      `SELECT id, severity_score
       FROM complaints
       WHERE ref = $1 AND citizen_id = $2`,
      [req.params.ref, req.user.id]
    );

    if (!rows[0]) {
      throw notFound("Complaint");
    }

    let delta = 0;

    for (const answer of answers) {
      const { rows: q } = await query(
        `SELECT options
         FROM followup_questions
         WHERE id = $1`,
        [answer.question_id]
      );

      const option = q[0]?.options?.find(
        (o) => o.value === answer.value
      );

      if (!option) continue;

      const severityDelta = option.severity_delta || 0;
      delta += severityDelta;

      await query(
        `INSERT INTO complaint_followups
          (complaint_id, question_id, answer_value, severity_delta, language)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          rows[0].id,
          answer.question_id,
          answer.value,
          severityDelta,
          answer.language || "en",
        ]
      );
    }

    if (delta !== 0) {
      const { rows: updated } = await query(
        `UPDATE complaints
         SET severity_score = LEAST(
               100,
               GREATEST(0, severity_score + $2)
             ),
             severity = (
               CASE
                 WHEN LEAST(100, severity_score + $2) >= 80
                   THEN 'critical'
                 WHEN LEAST(100, severity_score + $2) >= 60
                   THEN 'high'
                 WHEN LEAST(100, severity_score + $2) >= 35
                   THEN 'medium'
                 ELSE 'low'
               END
             )::severity
         WHERE id = $1
         RETURNING severity, severity_score`,
        [rows[0].id, delta]
      );

      return res.json({
        ok: true,
        adjusted_by: delta,
        ...updated[0],
      });
    }

    return res.json({
      ok: true,
      adjusted_by: 0,
    });
  })
);

export default router;
