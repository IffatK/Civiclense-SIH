-- CivicLense 0033 — duplicate scores you can argue with
--
-- Clustering produces one composite number and stores nothing else. When a
-- report joins a group, the only record is that it scored above 0.62 — not
-- what pushed it there. Nobody can tell a match driven by two photographs of
-- the same pothole from one driven by two reports happening to share a ward.
--
-- Five factors, each stored, each visible:
--
--   location  — how close on the ground
--   category  — same category or not
--   image     — perceptual hash distance
--   text      — description similarity
--   time      — how close in time
--
-- And bands rather than a bare number, because "0.71" invites nobody to ask
-- what it is 0.71 of:
--
--   85-100  near certain      group automatically
--   70-84   probable          group, and say why
--   40-69   possible          show the resident before they file
--   0-39    unrelated         ignore
--
-- The weights are unchanged from 0023. This records the parts rather than
-- discarding them.

create table if not exists duplicate_scores (
  id bigserial primary key,

  complaint_id bigint not null references complaints(id) on delete cascade,
  -- What it was compared against. Either a group or a single earlier report —
  -- the second matters because the first report of a pair has no group yet.
  cluster_id bigint references clusters(id) on delete cascade,
  compared_to bigint references complaints(id) on delete cascade,

  location_score numeric(5,2) not null default 0,
  category_score numeric(5,2) not null default 0,
  image_score numeric(5,2) not null default 0,
  text_score numeric(5,2) not null default 0,
  time_score numeric(5,2) not null default 0,

  composite_score numeric(5,2) not null,
  band text not null check (band in ('near_certain', 'probable', 'possible', 'unrelated')),

  -- What was done about it, so a wrong grouping can be traced to the score
  -- that caused it rather than reconstructed from memory.
  outcome text check (outcome in ('grouped', 'shown_to_resident', 'ignored', 'overridden')),

  -- Distance and hash distance kept raw as well. "40 metres apart, 3 bits
  -- different" is checkable in a way that "0.86" is not.
  metres_apart int,
  phash_bits_apart int,
  hours_apart int,

  scored_at timestamptz default now()
);

create index if not exists duplicate_scores_complaint on duplicate_scores(complaint_id);
create index if not exists duplicate_scores_band on duplicate_scores(band, scored_at desc);

-- ============================================================
-- Banding
-- ============================================================
create or replace function score_band(p_score numeric)
returns text language sql immutable as $$
  select case
    when p_score >= 85 then 'near_certain'
    when p_score >= 70 then 'probable'
    when p_score >= 40 then 'possible'
    else 'unrelated'
  end;
$$;

-- ============================================================
-- The five factors, computed and kept
-- ============================================================
create or replace function score_duplicate(
  p_point geography,
  p_category int,
  p_text text,
  p_phash text,
  p_when timestamptz,
  p_cluster bigint
) returns table (
  location_score numeric, category_score numeric, image_score numeric,
  text_score numeric, time_score numeric, composite_score numeric,
  band text, metres_apart int, phash_bits_apart int, hours_apart int
) language sql stable as $$
  with target as (
    select c.id, c.centroid, c.category_id, c.summary, c.last_reported,
           (select ci.phash from complaint_images ci
             join complaints cp on cp.id = ci.complaint_id
            where cp.cluster_id = c.id and ci.phash is not null limit 1) as phash
    from clusters c where c.id = p_cluster
  ),
  parts as (
    select
      -- Linear to 250m, then nothing. A report 300m away is not "a bit of a
      -- match", it is a different problem.
      greatest(0, 100 * (1 - least(st_distance(t.centroid, p_point) / 250.0, 1)))::numeric as loc,
      (case when t.category_id = p_category then 100 else 0 end)::numeric                  as cat,
      -- 16 bits of 64 is the point where two photographs stop being the same
      -- scene, so the scale ends there rather than at 64.
      case when t.phash is null or p_phash is null then 0
           else greatest(0, 100 * (1 - phash_distance(t.phash, p_phash)::numeric / 16))
      end                                                                                  as img,
      (100 * coalesce(similarity(t.summary, p_text), 0))::numeric                          as txt,
      -- Full marks within a day, tapering to nothing at thirty.
      greatest(0, 100 * (1 - (extract(epoch from (p_when - t.last_reported)) / 86400.0 - 1) / 29.0))::numeric as tim,
      round(st_distance(t.centroid, p_point))::int                                         as metres,
      case when t.phash is null or p_phash is null then null
           else phash_distance(t.phash, p_phash) end                                       as bits,
      round(extract(epoch from (p_when - t.last_reported)) / 3600.0)::int                  as hours
    from target t
  )
  select
    round(loc, 2), round(cat, 2), round(img, 2), round(txt, 2), round(least(100, tim), 2),
    round(0.40 * loc + 0.35 * cat + 0.15 * img + 0.10 * txt, 2),
    score_band(0.40 * loc + 0.35 * cat + 0.15 * img + 0.10 * txt),
    metres, bits, hours
  from parts;
$$;

-- ============================================================
-- Comparing two specific reports, for the test page
-- ============================================================
create or replace function compare_reports(p_a text, p_b text)
returns table (
  factor text, a_value text, b_value text, score numeric, weight numeric, contributes numeric
) language plpgsql stable as $$
declare
  a record; b record;
  loc numeric; cat numeric; img numeric; txt numeric;
begin
  select c.id, c.ref, c.location, c.category_id, c.created_at,
         coalesce(c.description_original, '') as text,
         cat.name as category_name,
         (select ci.phash from complaint_images ci
           where ci.complaint_id = c.id and ci.role = 'report' limit 1) as phash
    into a
  from complaints c left join categories cat on cat.id = c.category_id where c.ref = p_a;

  select c.id, c.ref, c.location, c.category_id, c.created_at,
         coalesce(c.description_original, '') as text,
         cat.name as category_name,
         (select ci.phash from complaint_images ci
           where ci.complaint_id = c.id and ci.role = 'report' limit 1) as phash
    into b
  from complaints c left join categories cat on cat.id = c.category_id where c.ref = p_b;

  if a is null or b is null then
    raise exception 'One of those references does not exist';
  end if;

  loc := greatest(0, 100 * (1 - least(st_distance(a.location, b.location) / 250.0, 1)));
  cat := case when a.category_id = b.category_id then 100 else 0 end;
  img := case when a.phash is null or b.phash is null then 0
              else greatest(0, 100 * (1 - phash_distance(a.phash, b.phash)::numeric / 16)) end;
  txt := 100 * coalesce(similarity(a.text, b.text), 0);

  factor := 'Location'; a_value := round(st_distance(a.location, b.location))::text || ' m apart';
  b_value := ''; score := round(loc, 1); weight := 0.40; contributes := round(0.40 * loc, 1);
  return next;

  factor := 'Category'; a_value := coalesce(a.category_name, '—');
  b_value := coalesce(b.category_name, '—'); score := cat; weight := 0.35;
  contributes := round(0.35 * cat, 1); return next;

  factor := 'Image';
  a_value := case when a.phash is null or b.phash is null then 'no photo hash on one of them'
                  else phash_distance(a.phash, b.phash)::text || ' of 64 bits differ' end;
  b_value := ''; score := round(img, 1); weight := 0.15; contributes := round(0.15 * img, 1);
  return next;

  factor := 'Text'; a_value := left(a.text, 60); b_value := left(b.text, 60);
  score := round(txt, 1); weight := 0.10; contributes := round(0.10 * txt, 1); return next;

  factor := 'TOTAL'; a_value := a.ref; b_value := b.ref;
  score := round(0.40 * loc + 0.35 * cat + 0.15 * img + 0.10 * txt, 1);
  weight := 1.00; contributes := score;
  return next;
end $$;
