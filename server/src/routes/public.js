import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { wrap, notFound, badRequest } from "../middleware/errors.js";
import { signedUrl } from "../services/storage.js";

const router = Router();

/**
 * Signing is a local operation, so one URL per image costs nothing over the
 * wire — but doing it row by row inside a map is still N awaits in series.
 * Batched here once, because every endpoint below needs the same thing.
 */
const signAll = (paths, seconds = 3600) =>
  Promise.all(paths.map((p) => (p ? signedUrl(p, seconds) : null)));

/**
 * The public record.
 *
 * The product's argument is that responsibility is visible. Until now it was
 * visible only to the people doing the work, which is a strange position for a
 * transparency tool — a resident could see their own report and nothing else,
 * and had to take on trust that anything happens to anybody else's.
 *
 * No session required. The reporter is never named, coordinates are rounded to
 * roughly a street, and withdrawn or rejected reports do not appear.
 */

/* ── The feed ───────────────────────────────────────────────────────────── */
/**
 * One page of the city.
 *
 * Paged rather than a flat limit of sixty. The feed is now the front page of
 * the product and every card carries a photograph; loading the whole city at
 * once was affordable when a row was four words and a badge, and is not when a
 * row is a 16:10 image.
 *
 * Offset paging, not a keyset cursor. The sort orders are over mutable counters
 * — corroborations and comments change while somebody is scrolling — so a
 * keyset over them would skip rows as they move, and the correctness a cursor
 * buys only exists for a stable ordering. At these page sizes the offset scan
 * is not what costs anything.
 */
const PAGE = 12;

router.get(
  "/reports",
  optionalAuth,
  wrap(async (req, res) => {
    const { status, ward, category, sort, q, page } = z
      .object({
        status: z.string().optional(),
        ward: z.string().optional(),
        category: z.string().optional(),
        q: z.string().trim().max(120).optional(),
        sort: z.enum(["recent", "discussed", "confirmed", "overdue"]).default("recent"),
        page: z.coerce.number().int().min(0).max(200).default(0),
      })
      .parse(req.query);

    const order = {
      recent: "created_at desc",
      // What people are actually talking about, which is not always the newest.
      discussed: "comment_count desc, corroboration_count desc, created_at desc",
      confirmed: "corroboration_count desc, follower_count desc, created_at desc",
      overdue: "overdue desc, created_at asc",
    }[sort];

    const filters = `
      where ($1::text is null or $1 = '' or
             ($1 = 'open' and status not in ('resolved')) or
             ($1 = 'overdue' and overdue) or
             ($1 = 'verified' and verification <> 'unverified') or
             status::text = $1)
        and ($2::text is null or $2 = '' or ward_code = $2)
        and ($3::text is null or $3 = '' or category = $3)
        and ($4::text is null or $4 = '' or
             ward_name ilike '%' || $4 || '%' or
             category  ilike '%' || $4 || '%' or
             summary   ilike '%' || $4 || '%' or
             ref       ilike '%' || $4 || '%')`;

    const args = [status || null, ward || null, category || null, q || null];

    const [{ rows }, { rows: matched }, { rows: totals }] = await Promise.all([
      query(
        `select * from public_reports ${filters}
         order by ${order} limit ${PAGE + 1} offset $5`,
        [...args, page * PAGE]
      ),
      query(`select count(*)::int as n from public_reports ${filters}`, args),
      query(
        `select count(*)::int                                    as total,
                count(*) filter (where status = 'resolved')::int as resolved,
                count(*) filter (where overdue)::int             as overdue
         from public_reports`
      ),
    ]);

    // One extra row is fetched purely to answer "is there more" without a
    // second count against the same predicate.
    const more = rows.length > PAGE;
    const window = more ? rows.slice(0, PAGE) : rows;
    const refs = window.map((r) => r.ref);

    // The photograph is the report. A civic feed without images is a table of
    // categories, and somebody scrolling it learns nothing they could not have
    // guessed — a thumbnail of a flooded underpass says more than the words
    // "Flooding · high · Ward L".
    //
    // Up to three per card, which is what a carousel can show before the point
    // of a feed card is lost; the card states the true total from image_count.
    const { rows: images } = await query(
      `select c.ref, i.storage_path
       from complaints c
       join complaint_images i on i.complaint_id = c.id and i.role = 'report'
       where c.ref = any($1)
       order by i.id`,
      [refs]
    );

    // What this particular reader has already done, so the card can say so
    // rather than inviting them to confirm something twice. Signed-out readers
    // skip the query entirely.
    const mine = req.user
      ? await query(
          `select c.ref,
                  exists (select 1 from complaint_follows f
                           where f.complaint_id = c.id and f.profile_id = $2) as following,
                  exists (select 1 from complaint_comments cm
                           where cm.complaint_id = c.id and cm.author_id = $2
                             and cm.kind = 'corroborate') as confirmed
           from complaints c where c.ref = any($1)`,
          [refs, req.user.id]
        )
      : { rows: [] };

    const byRef = new Map();
    for (const i of images) {
      if (!byRef.has(i.ref)) byRef.set(i.ref, []);
      byRef.get(i.ref).push(i.storage_path);
    }
    const state = new Map(mine.rows.map((r) => [r.ref, r]));

    res.json({
      reports: await Promise.all(
        window.map(async (r) => {
          const urls = await signAll((byRef.get(r.ref) || []).slice(0, 3));
          return {
            ...r,
            image_url: urls[0] || null,
            image_urls: urls,
            viewer_following: state.get(r.ref)?.following ?? false,
            viewer_confirmed: state.get(r.ref)?.confirmed ?? false,
          };
        })
      ),
      page,
      has_more: more,
      matched: matched[0].n,
      totals: totals[0],
    });
  })
);

/* ── What the city is talking about ─────────────────────────────────────── */
/**
 * Counted, not curated. Reports filed about one kind of problem in one ward in
 * the last thirty days — the view carries the definition so that the officer
 * hotspot work and this sidebar cannot drift apart.
 *
 * Challenges come back alongside because they are the same question asked at a
 * longer range: trending is what is happening this month, a challenge is what
 * kept happening until somebody was asked to solve it.
 */
router.get(
  "/trending",
  wrap(async (_req, res) => {
    const [trending, challenges] = await Promise.all([
      query(`select * from public_trending limit 6`),
      query(
        `select ch.ref, ch.title, ch.status, ch.reports_at_raise, ch.residents_affected,
                cat.name as category, w.name as ward,
                (select p.ref from projects p
                  where p.challenge_id = ch.id and p.stage <> 'abandoned' limit 1) as project_ref
         from challenges ch
         left join categories cat on cat.id = ch.category_id
         left join wards w on w.id = ch.ward_id
         where ch.status in ('open', 'matched', 'in_progress')
         order by ch.residents_affected desc, ch.reports_at_raise desc
         limit 5`
      ),
    ]);

    res.json({
      trending: trending.rows,
      challenges: challenges.rows,
      basis: "Reports filed in the last 30 days, grouped by ward and kind of problem.",
    });
  })
);

/* ── Challenges, as a resident sees them ────────────────────────────────── */
/**
 * A deliberately narrower view than /api/challenges/:ref.
 *
 * That endpoint also carries the pitches institutions submitted and the
 * matching scores behind them, which belong to the people deciding who gets the
 * work. A resident is owed the problem, the evidence it was raised from, and
 * what is being done about it — and nothing here should require remembering to
 * strip a field before rendering.
 */
router.get(
  "/challenges",
  wrap(async (req, res) => {
    const { status } = req.query;

    const { rows } = await query(
      `select ch.ref, ch.title, ch.summary, ch.status, ch.needs, ch.raised_at,
              ch.reports_at_raise, ch.residents_affected,
              cat.name as category, w.name as ward, d.name as department,
              (select count(*)::int from challenge_interest i
                where i.challenge_id = ch.id) as interested,
              pr.ref as project_ref, pr.title as project_title, pr.stage as project_stage,
              inst.name as institution
       from challenges ch
       left join categories cat on cat.id = ch.category_id
       left join wards w on w.id = ch.ward_id
       left join departments d on d.id = ch.department_id
       left join lateral (
         select p.ref, p.title, p.stage, p.institution_id
         from projects p where p.challenge_id = ch.id and p.stage <> 'abandoned'
         order by case p.stage when 'deployed' then 0 when 'pilot' then 1 else 2 end
         limit 1
       ) pr on true
       left join institutions inst on inst.id = pr.institution_id
       where ($1::text is null or $1 = '' or ch.status = $1)
       order by ch.residents_affected desc, ch.raised_at desc
       limit 40`,
      [status || null]
    );

    res.json({ challenges: rows });
  })
);

router.get(
  "/challenges/:ref",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select ch.id, ch.ref, ch.title, ch.summary, ch.status, ch.needs, ch.raised_at,
              ch.reports_at_raise, ch.residents_affected, ch.cluster_id, ch.complaint_id,
              cat.name as category, w.name as ward, w.code as ward_code, d.name as department
       from challenges ch
       left join categories cat on cat.id = ch.category_id
       left join wards w on w.id = ch.ward_id
       left join departments d on d.id = ch.department_id
       where ch.ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Challenge");
    const ch = rows[0];

    const [reports, project] = await Promise.all([
      // The evidence it was raised from. A challenge nobody reported is a
      // research topic, and being able to click through to the reports is what
      // makes that checkable rather than asserted.
      query(
        `select r.ref, r.category, r.ward_name, r.status, r.created_at,
                r.corroboration_count, r.overdue
         from complaints c
         join public_reports r on r.ref = c.ref
         where c.id = $2 or ($1::bigint is not null and c.cluster_id = $1)
         order by c.created_at desc limit 12`,
        [ch.cluster_id, ch.complaint_id]
      ),
      query(
        `select p.ref, p.title, p.stage, p.approach, p.impact_note, p.complaints_closed,
                p.started_at, p.deployed_at,
                inst.name as institution, inst.kind as institution_kind,
                partner.name as partner,
                (select count(*)::int from project_members m where m.project_id = p.id) as team_size
         from projects p
         join institutions inst on inst.id = p.institution_id
         left join institutions partner on partner.id = p.partner_id
         where p.challenge_id = $1 and p.stage <> 'abandoned'
         order by case p.stage when 'deployed' then 0 when 'pilot' then 1 else 2 end
         limit 1`,
        [ch.id]
      ),
    ]);

    res.json({
      challenge: { ...ch, id: undefined, cluster_id: undefined, complaint_id: undefined },
      reports: reports.rows,
      project: project.rows[0] || null,
    });
  })
);

/* ── One solution, and the problem it is for ────────────────────────────── */
/**
 * The lifecycle read forwards: problem, who took it on, what they built, what
 * changed. /api/projects/:ref answers the same question for the institution
 * running the work and names every student on the team; a public page has no
 * business publishing a list of students' full names against their university,
 * so this reports the team by discipline and count instead.
 */
router.get(
  "/solutions/:ref",
  wrap(async (req, res) => {
    const { rows } = await query(
      `select p.ref, p.title, p.stage, p.approach, p.impact_note, p.complaints_closed,
              p.started_at, p.deployed_at,
              ch.ref as challenge_ref, ch.title as challenge, ch.summary as challenge_summary,
              ch.reports_at_raise, ch.residents_affected, ch.needs,
              cat.name as category, w.name as ward,
              inst.name as institution, inst.kind as institution_kind,
              partner.name as partner
       from projects p
       join challenges ch on ch.id = p.challenge_id
       join institutions inst on inst.id = p.institution_id
       left join institutions partner on partner.id = p.partner_id
       left join categories cat on cat.id = ch.category_id
       left join wards w on w.id = ch.ward_id
       where p.ref = $1 and p.stage <> 'abandoned'`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Solution");

    const [milestones, team] = await Promise.all([
      query(
        `select m.title, m.due_on, m.done_at
         from project_milestones m
         join projects p on p.id = m.project_id
         where p.ref = $1 order by m.position`,
        [req.params.ref]
      ),
      query(
        `select coalesce(m.discipline, 'Team') as discipline, count(*)::int as n
         from project_members m
         join projects p on p.id = m.project_id
         where p.ref = $1
         group by m.discipline order by count(*) desc`,
        [req.params.ref]
      ),
    ]);

    res.json({ solution: rows[0], milestones: milestones.rows, team: team.rows });
  })
);

/* ── What there is to filter by ─────────────────────────────────────────── */
/**
 * Only wards and categories that actually have reports.
 *
 * A dropdown listing every ward in the city, most of them empty, is a list of
 * ways to reach a blank page. The counts come along because "Kurla (34)" tells
 * somebody whether the filter is worth pressing before they press it.
 */
router.get(
  "/filters",
  wrap(async (_req, res) => {
    const [wards, categories] = await Promise.all([
      query(
        `select ward_code as code, ward_name as name, count(*)::int as reports
         from public_reports where ward_code is not null
         group by ward_code, ward_name order by count(*) desc`
      ),
      query(
        `select category as name, count(*)::int as reports
         from public_reports where category is not null
         group by category order by count(*) desc`
      ),
    ]);

    res.json({ wards: wards.rows, categories: categories.rows });
  })
);

/* ── One box, four kinds of thing ───────────────────────────────────────── */
/**
 * The header has carried a search field since the first design with nothing
 * behind it, which is worse than having none — somebody types a ward name,
 * gets nothing, and concludes the city has no reports there.
 *
 * Four small queries rather than one union. They return different shapes and
 * the caller renders them under separate headings anyway; a union would flatten
 * them into a single list of strings and lose exactly the distinction the
 * person searching is looking for.
 */
router.get(
  "/search",
  wrap(async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(120) }).parse(req.query);
    const like = `%${q}%`;

    const [reports, challenges, solutions, areas] = await Promise.all([
      query(
        `select ref, category, ward_name, status, created_at, summary
         from public_reports
         where ward_name ilike $1 or category ilike $1 or summary ilike $1 or ref ilike $1
         order by created_at desc limit 6`,
        [like]
      ),
      query(
        `select ch.ref, ch.title, ch.status, ch.reports_at_raise, w.name as ward
         from challenges ch left join wards w on w.id = ch.ward_id
         where ch.title ilike $1 or ch.summary ilike $1 or w.name ilike $1 or ch.ref ilike $1
         order by ch.residents_affected desc limit 5`,
        [like]
      ),
      query(
        `select ref, title, stage, institution, ward, challenge
         from public_solutions
         where title ilike $1 or institution ilike $1 or challenge ilike $1
            or ward ilike $1 or ref ilike $1
         limit 5`,
        [like]
      ),
      query(
        `select w.code, w.name, count(c.id)::int as reports
         from wards w
         left join complaints c on c.ward_id = w.id
           and c.status not in ('withdrawn', 'rejected')
         where w.name ilike $1 or w.code ilike $1
         group by w.code, w.name
         order by count(c.id) desc limit 5`,
        [like]
      ),
    ]);

    res.json({
      query: q,
      reports: reports.rows,
      challenges: challenges.rows,
      solutions: solutions.rows,
      areas: areas.rows,
      total:
        reports.rows.length + challenges.rows.length +
        solutions.rows.length + areas.rows.length,
    });
  })
);

/* ── What has been happening, across everything ─────────────────────────── */
/**
 * The community page.
 *
 * Assembled from records that already exist rather than a posts table, because
 * a civic platform with its own free-text feed becomes a message board with a
 * council logo on it. Everything here is something that happened to a report, a
 * challenge or a project — a resident said something, an officer closed
 * something, a university took something on.
 */
router.get(
  "/community",
  wrap(async (_req, res) => {
    const [discussion, resolved, raised, projects, pulse] = await Promise.all([
      query(
        `select cm.id, cm.kind, cm.body, cm.created_at, cm.is_official,
                c.ref, cat.name as category, w.name as ward,
                case when p.full_name is null then null
                     else split_part(p.full_name, ' ', 1) ||
                          case when split_part(p.full_name, ' ', 2) <> ''
                               then ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.'
                               else '' end end as author
         from complaint_comments cm
         join complaints c on c.id = cm.complaint_id
         left join categories cat on cat.id = c.category_id
         left join wards w on w.id = c.ward_id
         left join profiles p on p.id = cm.author_id
         where not cm.hidden and c.status not in ('withdrawn', 'rejected')
         order by cm.created_at desc limit 12`
      ),
      query(
        `select ref, category, ward_name, resolved_at, corroboration_count
         from public_reports
         where status = 'resolved' and resolved_at is not null
         order by resolved_at desc limit 6`
      ),
      query(
        `select ch.ref, ch.title, ch.status, ch.raised_at, ch.reports_at_raise,
                ch.residents_affected, w.name as ward
         from challenges ch left join wards w on w.id = ch.ward_id
         order by ch.raised_at desc limit 5`
      ),
      query(
        `select ref, title, stage, institution, challenge, challenge_ref, ward
         from public_solutions
         order by case stage when 'deployed' then 0 when 'pilot' then 1 else 2 end
         limit 5`
      ),
      query(
        `select count(*)::int                                       as total,
                count(*) filter (where status = 'resolved')::int    as resolved,
                count(*) filter (where overdue)::int                as overdue,
                count(*) filter (where created_at > now() - interval '7 days')::int as this_week
         from public_reports`
      ),
    ]);

    res.json({
      discussion: discussion.rows,
      resolved: resolved.rows,
      challenges: raised.rows,
      solutions: projects.rows,
      pulse: pulse.rows[0],
    });
  })
);

/* ── One report, with its thread ────────────────────────────────────────── */
/**
 * How a status enum reads to somebody who does not work here.
 *
 * The history table records transitions between machine states. A resident
 * wants the sentence, and wants it in their own terms — "an officer was sent",
 * not "assigned". Anything unmapped falls through to the raw value rather than
 * being dropped, because a silent gap in a timeline is a lie about what
 * happened.
 */
/**
 * The classifier's answer, normalised for a public reader.
 *
 * Two generations of analysis are on record and they store confidence
 * differently — the mock writes `confidence` as a percentage, the trained
 * model writes `category_confidence` as a fraction. Reading the raw column in
 * the page would put "0.63% confidence" on screen for every real report.
 *
 * Nothing is returned below the threshold the model itself uses to decide it
 * has not recognised a photograph. A named category at 22% is not a finding,
 * and publishing it as one is how a report of open ground ends up captioned
 * "Broken streetlight".
 */
const CONFIDENT_ENOUGH = 45;

function publicAnalysis(row) {
  if (!row) return null;
  const raw = row.raw_response || {};

  const confidence =
    raw.category_confidence != null
      ? Math.round(Number(raw.category_confidence) * 100)
      : raw.confidence != null
      ? Math.round(Number(raw.confidence))
      : null;

  if (!raw.category || confidence == null || Number.isNaN(confidence)) return null;

  return {
    category: raw.category,
    confidence,
    severity: raw.severity_band || raw.severity || null,
    // Said rather than implied. A resident reading a confident-looking answer
    // deserves to know when a person is going to check it.
    needs_review: Boolean(raw.needs_human_review) || confidence < CONFIDENT_ENOUGH,
    recognised: confidence >= CONFIDENT_ENOUGH,
  };
}

const STEP = {
  submitted: "Reported by a resident",
  ai_analysis: "Photograph analysed",
  under_review: "Checked by the ward office",
  accepted: "Accepted as a civic issue",
  assigned: "Assigned to an officer",
  work_started: "Work started",
  work_completed: "Work reported complete",
  verification: "Waiting for the resident to confirm",
  resolved: "Resolved",
  reopened: "Reopened — the fix did not hold",
};

router.get(
  "/reports/:ref",
  optionalAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`select * from public_reports where ref = $1`, [req.params.ref]);
    if (!rows[0]) throw notFound("Report");
    const report = rows[0];

    const [comments, photos, history, related, viewer, analysis] = await Promise.all([
      query(
        `select cm.id, cm.kind, cm.body, cm.is_official, cm.created_at,
                p.full_name, p.avatar_path
         from complaint_comments cm
         left join profiles p on p.id = cm.author_id
         where cm.complaint_id = (select id from complaints where ref = $1)
           and not cm.hidden
         order by cm.created_at asc`,
        [req.params.ref]
      ),
      query(
        `select i.storage_path, i.role, i.created_at
         from complaint_images i
         join complaints c on c.id = i.complaint_id
         where c.ref = $1 and i.role in ('report', 'after')
         order by case i.role when 'report' then 0 else 1 end, i.id`,
        [req.params.ref]
      ),
      query(
        `select h.to_status::text as status, h.note, h.at
         from complaint_status_history h
         join complaints c on c.id = h.complaint_id
         where c.ref = $1
         order by h.at asc`,
        [req.params.ref]
      ),
      // Same problem, same area, not this one. Three is enough to establish a
      // pattern and few enough that it stays a footnote rather than a second
      // feed.
      query(
        `select ref, category, ward_name, status, created_at, corroboration_count
         from public_reports
         where ref <> $1 and category = $2
           and (ward_code = $3 or $3 is null)
         order by created_at desc limit 3`,
        [report.ref, report.category, report.ward_code]
      ),
      req.user
        ? query(
            `select
               exists (select 1 from complaint_follows f
                        join complaints c on c.id = f.complaint_id
                        where c.ref = $1 and f.profile_id = $2) as following,
               exists (select 1 from complaint_comments cm
                        join complaints c on c.id = cm.complaint_id
                        where c.ref = $1 and cm.author_id = $2
                          and cm.kind = 'corroborate') as confirmed`,
            [req.params.ref, req.user.id]
          )
        : Promise.resolve({ rows: [{ following: false, confirmed: false }] }),
      query(
        `select a.raw_response
         from complaint_ai_analysis a
         join complaints c on c.id = a.complaint_id
         where c.ref = $1`,
        [req.params.ref]
      ),
    ]);

    const urls = await signAll(photos.rows.map((p) => p.storage_path));
    const avatars = await signAll(comments.rows.map((c) => c.avatar_path), 86400);

    res.json({
      report,
      // Kept for anything still reading the single-image shape.
      image_url: urls[0] || null,
      images: photos.rows.map((p, i) => ({ url: urls[i], role: p.role })),
      timeline: [
        { status: "submitted", label: STEP.submitted, at: report.created_at },
        ...history.rows
          // The first transition into 'submitted' is the row above; showing it
          // twice makes the timeline look like the report was filed twice.
          .filter((h) => h.status !== "submitted")
          .map((h) => ({ status: h.status, label: STEP[h.status] || h.status, at: h.at, note: h.note })),
      ],
      related: related.rows,
      ai: publicAnalysis(analysis.rows[0]),
      viewer: {
        following: viewer.rows[0]?.following ?? false,
        confirmed: viewer.rows[0]?.confirmed ?? false,
        signed_in: Boolean(req.user),
      },
      comments: comments.rows.map((c, i) => ({
        id: c.id,
        kind: c.kind,
        body: c.body,
        is_official: c.is_official,
        created_at: c.created_at,
        // First name and initial only. A full name against a street address
        // and a timestamp identifies somebody.
        author: c.full_name
          ? `${c.full_name.split(" ")[0]} ${(c.full_name.split(" ")[1] || "")[0] || ""}.`.trim()
          : "A resident",
        avatar_url: avatars[i],
      })),
    });
  })
);

/* ── Following ──────────────────────────────────────────────────────────── */
/**
 * Keeping track of a problem that is not formally yours.
 *
 * The only thread between a person and a report used to be having filed it,
 * which meant the neighbour who confirmed a pothole had no way to hear that it
 * was fixed. Idempotent in both directions: pressing follow twice is the same
 * request, and a UI that has drifted out of sync should be able to correct
 * itself without an error.
 */
router.put(
  "/reports/:ref/follow",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`select id, status from complaints where ref = $1`, [req.params.ref]);
    if (!rows[0]) throw notFound("Report");
    if (["withdrawn", "rejected"].includes(rows[0].status)) {
      throw badRequest("This report is no longer public.");
    }

    await query(
      `insert into complaint_follows (profile_id, complaint_id) values ($1, $2)
       on conflict do nothing`,
      [req.user.id, rows[0].id]
    );

    const { rows: n } = await query(`select follower_count from complaints where id = $1`, [rows[0].id]);
    res.json({ following: true, follower_count: n[0].follower_count });
  })
);

router.delete(
  "/reports/:ref/follow",
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`select id from complaints where ref = $1`, [req.params.ref]);
    if (!rows[0]) throw notFound("Report");

    await query(`delete from complaint_follows where profile_id = $1 and complaint_id = $2`, [
      req.user.id,
      rows[0].id,
    ]);

    const { rows: n } = await query(`select follower_count from complaints where id = $1`, [rows[0].id]);
    res.json({ following: false, follower_count: n[0].follower_count });
  })
);

/** Everything one person is keeping an eye on. */
router.get(
  "/following",
  requireAuth,
  wrap(async (req, res) => {
    const [reports, challenges] = await Promise.all([
      query(
        `select r.ref, r.category, r.ward_name, r.status, r.overdue,
                r.created_at, r.comment_count, r.corroboration_count
         from complaint_follows f
         join complaints c on c.id = f.complaint_id
         join public_reports r on r.ref = c.ref
         where f.profile_id = $1
         order by f.created_at desc limit 40`,
        [req.user.id]
      ),
      query(
        `select ch.ref, ch.title, ch.status, ch.reports_at_raise, w.name as ward
         from challenge_follows f
         join challenges ch on ch.id = f.challenge_id
         left join wards w on w.id = ch.ward_id
         where f.profile_id = $1
         order by f.created_at desc limit 20`,
        [req.user.id]
      ),
    ]);

    res.json({ reports: reports.rows, challenges: challenges.rows });
  })
);

/* ── Leaderboards ──────────────────────────────────────────────────────── */
router.get(
  "/leaderboard",
  wrap(async (_req, res) => {
    const [residents, officers] = await Promise.all([
      query(`select * from resident_leaderboard order by position limit 20`),
      query(`select * from officer_leaderboard order by on_time_rate desc nulls last, resolved desc limit 20`),
    ]);

    res.json({
      residents: await Promise.all(
        residents.rows.map(async (r) => ({
          ...r,
          avatar_url: r.avatar_path ? await signedUrl(r.avatar_path, 86400) : null,
          avatar_path: undefined,
        }))
      ),
      officers: officers.rows,
      // Both rankings are stated, because a leaderboard whose rule is not
      // obvious invites people to guess at it — usually wrongly.
      basis: {
        residents:
          "Points from verified contributions. A duplicate earns nothing, and confirming " +
          "a fix earns more than filing one.",
        officers:
          "Closing within each complaint's own deadline, not how many were closed. " +
          "Volume is somebody else's decision; being on time is the officer's.",
      },
    });
  })
);

/* ── Commenting needs a session ─────────────────────────────────────────── */
router.post(
  "/reports/:ref/comments",
  requireAuth,
  wrap(async (req, res) => {
    // Confirming an issue is a click, not a piece of writing. Requiring text
    // for it meant the feed's "I have seen this too" had to invent a sentence
    // on the resident's behalf and post it under their name.
    const { kind, body } = z
      .object({
        kind: z.enum(["corroborate", "detail", "dispute", "resolved_already"]),
        body: z.string().trim().max(800).optional(),
      })
      .refine((v) => v.kind === "corroborate" || (v.body && v.body.length >= 2), {
        message: "Say what you want the officer to know.",
        path: ["body"],
      })
      .parse(req.body);

    const { rows } = await query(
      `select id, citizen_id, status from complaints where ref = $1`,
      [req.params.ref]
    );
    if (!rows[0]) throw notFound("Report");
    if (["withdrawn", "rejected"].includes(rows[0].status)) {
      throw badRequest("This report is closed to comments.");
    }

    // Staff comments carry weight a neighbour's does not, and a resident should
    // be able to tell them apart without reading the name.
    const isOfficial = ["officer", "super_admin", "global_admin"].includes(req.user.role);

    try {
      await query(
        `insert into complaint_comments (complaint_id, author_id, kind, body, is_official)
         values ($1,$2,$3,$4,$5)`,
        [rows[0].id, req.user.id, kind, body ?? null, isOfficial]
      );
    } catch (err) {
      // The partial unique index. One corroboration each, or a single resident
      // could push a report up the queue on their own.
      if (err.code === "23505") {
        throw badRequest("You have already said you have seen this one.");
      }
      throw err;
    }

    // The counters the feed renders, after the trigger has run. Returning them
    // means a card can update in place; without them the only honest option is
    // to refetch the whole page to move one number by one.
    const { rows: counts } = await query(
      `select comment_count, corroboration_count, dispute_count
       from complaints where id = $1`,
      [rows[0].id]
    );

    res.status(201).json({ ok: true, ...counts[0] });
  })
);

/* ── Everything residents have said, for the people who act on it ──────── */
router.get(
  "/comments",
  requireAuth,
  wrap(async (req, res) => {
    if (!["officer", "super_admin", "global_admin"].includes(req.user.role)) {
      throw badRequest("Staff only.");
    }

    const { kind } = req.query;

    /**
     * Comments were only readable one report at a time, which meant nobody
     * read them. A resident writing "this was fixed last week" on a complaint
     * an officer is about to be sent to is telling the city something useful,
     * and it was reaching nobody.
     *
     * Disputes first — those are the ones that change what happens next.
     */
    const { rows } = await query(
      `select cm.id, cm.kind, cm.body, cm.created_at, cm.is_official,
              c.ref, cat.name as category, w.code as ward_code,
              c.status, c.severity,
              c.assigned_officer is not null as assigned,
              case when c.anonymous then null else p.full_name end as author
       from complaint_comments cm
       join complaints c on c.id = cm.complaint_id
       left join categories cat on cat.id = c.category_id
       left join wards w on w.id = c.ward_id
       left join profiles p on p.id = cm.author_id
       where not cm.hidden
         and ($1::int is null or c.department_id = $1)
         and ($2::text is null or $2 = '' or cm.kind::text = $2)
       order by
         case cm.kind when 'dispute' then 0 when 'resolved_already' then 1 else 2 end,
         cm.created_at desc
       limit 100`,
      [req.user.role === "global_admin" ? null : req.user.departmentId, kind || null]
    );

    const { rows: counts } = await query(
      `select cm.kind::text, count(*)::int as n
       from complaint_comments cm
       join complaints c on c.id = cm.complaint_id
       where not cm.hidden and ($1::int is null or c.department_id = $1)
       group by cm.kind`,
      [req.user.role === "global_admin" ? null : req.user.departmentId]
    );

    res.json({
      comments: rows,
      counts: Object.fromEntries(counts.map((c) => [c.kind, c.n])),
      // Said plainly, because a queue ordered by something invisible is a queue
      // people scroll past.
      ordering: "Disputes first — those change what happens next.",
    });
  })
);

/* ── Moderation ────────────────────────────────────────────────────────── */
router.post(
  "/comments/:id/hide",
  requireAuth,
  wrap(async (req, res) => {
    if (!["super_admin", "global_admin"].includes(req.user.role)) {
      throw badRequest("Only an administrator can hide a comment.");
    }

    const { reason } = z.object({ reason: z.string().min(3).max(300) }).parse(req.body);

    // Hidden, not deleted. A removed comment that leaves no trace is
    // indistinguishable from one that was never made.
    await query(
      `update complaint_comments
       set hidden = true, hidden_by = $2, hidden_reason = $3
       where id = $1`,
      [req.params.id, req.user.id, reason]
    );

    await query(
      `insert into audit_logs (actor, action, entity, entity_id, after)
       values ($1, 'comment.hidden', 'complaint_comments', $2, $3)`,
      [req.user.id, req.params.id, JSON.stringify({ reason })]
    );

    res.json({ ok: true });
  })
);

export default router;
