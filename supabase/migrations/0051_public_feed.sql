-- CivicLense 0051 — the public record as something a resident would read
--
-- public_reports was built for a table: category, ward, status, four counters.
-- Everything a row needs to become an administrative line and nothing it needs
-- to become a post. The feed it feeds is the front door of the product, and a
-- front door made of enum values is why the public side reads as a complaint
-- register rather than a place people come back to.
--
-- Four things are added, all of them already in the database and none of them
-- new judgement:
--
--   the words the resident wrote, which were visible to officers and to nobody
--   else — so the public feed showed a photograph and a category and left the
--   reader to guess what the person was actually reporting;
--
--   how many photographs there are, so a card can say there is a second angle
--   without a second query per row;
--
--   who is following it, which 0050 started recording and nothing read;
--
--   what came of it — the challenge it was folded into and the project working
--   on that challenge. This is the argument the whole product rests on and it
--   was reachable only by walking from the solutions page backwards.
--
-- The reporter's name is carried but never in full: first name and initial, and
-- null whenever the report was filed anonymously. A full name beside a ward and
-- a timestamp identifies somebody.

drop view if exists public_reports;

create view public_reports as
select
  c.ref,
  cat.name                                        as category,
  cat.code                                        as category_code,
  d.name                                          as department,
  c.severity,
  c.status,
  w.code                                          as ward_code,
  w.name                                          as ward_name,
  round(st_y(c.location::geometry)::numeric, 3)   as lat,
  round(st_x(c.location::geometry)::numeric, 3)   as lng,
  c.created_at,
  c.resolved_at,
  c.comment_count,
  c.corroboration_count,
  c.dispute_count,
  c.rework_count,
  c.follower_count,
  c.anonymous,

  -- What the resident actually said. The demo seeder tags its own rows so they
  -- can be found again; that tag is an internal marker and has no business on
  -- a public card.
  nullif(trim(regexp_replace(
    coalesce(c.description_canonical, c.description_original, ''),
    '^\[DEMO-SEED\]\s*', ''
  )), '')                                         as summary,

  -- First name and initial, or nothing. Never the full name, and never
  -- anything at all when the report was filed anonymously.
  case
    when c.anonymous then null
    when p.full_name is null then null
    else split_part(p.full_name, ' ', 1) ||
         case when split_part(p.full_name, ' ', 2) <> ''
              then ' ' || left(split_part(p.full_name, ' ', 2), 1) || '.'
              else '' end
  end                                             as reporter,

  (select count(*)::int from complaint_images i
    where i.complaint_id = c.id and i.role = 'report') as image_count,

  (c.sla_deadline < now() and c.resolved_at is null) as overdue,
  (c.assigned_officer is not null)                   as assigned,
  ct.agency                                          as agency,

  -- Where this report ended up. A challenge is raised either from the cluster a
  -- report belongs to or from the report itself; both are followed, because a
  -- resident does not care which route the city took to notice the pattern.
  ch.ref                                          as challenge_ref,
  ch.title                                        as challenge_title,
  pr.ref                                          as solution_ref,
  pr.title                                        as solution_title,
  pr.stage                                        as solution_stage,

  -- How much this report has been stood behind, in the order that matters.
  --
  -- A resident confirming the fix is the strongest signal there is: they went
  -- back and looked. An officer being sent is weaker but real — somebody
  -- decided it was worth a visit. Neighbours agreeing is weaker still, though
  -- several independent people is meaningfully different from one.
  --
  -- "unverified" is not an accusation. It means nobody has been yet, which is
  -- true of every report in its first hour.
  case
    when exists (
      select 1 from complaint_feedback f
      where f.complaint_id = c.id and f.resolved
    )                                   then 'confirmed_by_resident'
    when c.status = 'resolved'          then 'closed_by_officer'
    when c.assigned_officer is not null then 'officer_assigned'
    when c.corroboration_count >= 3     then 'confirmed_by_neighbours'
    when c.corroboration_count >= 1     then 'seen_by_others'
    else 'unverified'
  end as verification,

  -- Disputed separately, because it is not a lower rung of the same ladder.
  -- A report three people confirm and two say is already fixed is genuinely
  -- ambiguous, and flattening that into one score would hide the disagreement
  -- rather than show it.
  (c.dispute_count > 0)            as disputed

from complaints c
left join categories cat on cat.id = c.category_id
left join departments d on d.id = c.department_id
left join wards w on w.id = c.ward_id
left join contracts ct on ct.id = c.contract_id
left join profiles p on p.id = c.citizen_id
-- lateral rather than a plain join: a cluster can carry more than one challenge
-- and a plain join would duplicate the report once per challenge, which in a
-- feed means the same pothole appearing twice.
left join lateral (
  select ch2.id, ch2.ref, ch2.title
  from challenges ch2
  where ch2.complaint_id = c.id
     or (c.cluster_id is not null and ch2.cluster_id = c.cluster_id)
  order by ch2.raised_at desc
  limit 1
) ch on true
left join lateral (
  select p2.ref, p2.title, p2.stage
  from projects p2
  where p2.challenge_id = ch.id and p2.stage <> 'abandoned'
  order by case p2.stage when 'deployed' then 0 when 'pilot' then 1 else 2 end
  limit 1
) pr on true
where c.status not in ('withdrawn', 'rejected')
  and c.location is not null;

-- ============================================================
-- Confirming is an act, not a comment
-- ============================================================
-- "I have seen this too" is a click. The comment table required text for it,
-- so the only way to offer a one-tap confirmation was to write a sentence on
-- the resident's behalf and post it under their name — which is putting words
-- in somebody's mouth to satisfy a check constraint.
--
-- A corroboration may now carry no body. Everything else still must: a dispute
-- with no text tells an officer nothing they can act on.
alter table complaint_comments alter column body drop not null;

alter table complaint_comments drop constraint if exists complaint_comments_body_check;
alter table complaint_comments add constraint complaint_comments_body_check
  check (body is null or length(trim(body)) between 2 and 800);

alter table complaint_comments drop constraint if exists comment_needs_body;
alter table complaint_comments add constraint comment_needs_body
  check (kind = 'corroborate' or body is not null);

-- comment_count is read as "how many people are discussing this". A bare
-- confirmation is not discussion — it is already counted, separately and more
-- accurately, by corroboration_count. Counting it twice would inflate every
-- thread length in the feed by the number of people who tapped a button.
create or replace function refresh_comment_counts() returns trigger
language plpgsql as $$
declare target bigint := coalesce(new.complaint_id, old.complaint_id);
begin
  update complaints c set
    comment_count = sub.total,
    corroboration_count = sub.corroborated,
    dispute_count = sub.disputed
  from (
    select
      count(*) filter (where not hidden and body is not null)::int          as total,
      count(*) filter (where not hidden and kind = 'corroborate')::int      as corroborated,
      count(*) filter (where not hidden and kind in ('dispute','resolved_already'))::int as disputed
    from complaint_comments where complaint_id = target
  ) sub
  where c.id = target;

  return null;
end $$;

-- ============================================================
-- What the city is talking about
-- ============================================================
-- Trending is a real measurement or it is decoration. It is the count of
-- reports filed in one ward about one kind of problem in the last thirty days,
-- which is exactly the sentence a resident would use: "a lot of waterlogging
-- around Kurla lately".
--
-- A view rather than a query in the route, because the officer-facing hotspot
-- work will want the same definition and two definitions of "trending" that
-- disagree is worse than none.
create or replace view public_trending as
select
  w.code                                        as ward_code,
  w.name                                        as ward_name,
  cat.name                                      as category,
  count(*)::int                                 as reports,
  count(*) filter (where c.status = 'resolved')::int as resolved,
  count(*) filter (where c.sla_deadline < now() and c.resolved_at is null)::int as overdue,
  max(c.created_at)                             as last_reported
from complaints c
join wards w on w.id = c.ward_id
join categories cat on cat.id = c.category_id
where c.status not in ('withdrawn', 'rejected')
  and c.created_at > now() - interval '30 days'
group by w.code, w.name, cat.name
having count(*) >= 2
order by count(*) desc, max(c.created_at) desc;
