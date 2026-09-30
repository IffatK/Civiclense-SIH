-- CivicLense 0027 — one clustering function, not two
--
-- 0023 added a perceptual-hash parameter to find_cluster_candidate. Adding a
-- parameter does not replace a function: `create or replace` only matches an
-- identical signature, so Postgres kept the six-argument version from 0001 and
-- created a seven-argument one alongside it.
--
-- Both then matched a six-argument call with a NULL in it, and Postgres
-- correctly refused to guess:
--
--     function find_cluster_candidate(...) is not unique
--
-- Dropping the old signature explicitly is the fix. `create or replace` is the
-- wrong tool whenever the argument list changes, and this is the second time
-- that has bitten — the same applies to views, which cannot change their
-- column list either.

drop function if exists find_cluster_candidate(geography, int, text, vector(512), int, interval);

-- The seven-argument version stays, and is now the only one. Restated here so
-- this migration is self-contained: applying it after a partial 0023 leaves a
-- working function either way.
create or replace function find_cluster_candidate(
  p_point geography, p_category int, p_text text, p_embedding vector(512),
  p_radius int default 250, p_window interval default '30 days',
  p_phash text default null
) returns table (cluster_id bigint, score numeric)
language sql stable as $$
  select c.id,
         (
           -- Distance and category carry the decision, because they are the two
           -- things every report actually has.
             0.40 * (1 - least(st_distance(c.centroid, p_point) / p_radius, 1))
           + 0.35 * (case when c.category_id = p_category then 1 else 0 end)
           + 0.10 * coalesce(similarity(c.summary, p_text), 0)

           -- Visual similarity from the perceptual hash, zero when either side
           -- lacks one — which is every report filed before hashing existed.
           + 0.15 * coalesce(
               (select greatest(0, 1 - (min(phash_distance(ci.phash, p_phash))::numeric / 16))
                from complaint_images ci
                join complaints cp2 on cp2.id = ci.complaint_id
                where cp2.cluster_id = c.id and ci.phash is not null and p_phash is not null),
               0)
         )::numeric as score
  from clusters c
  where st_dwithin(c.centroid, p_point, p_radius)
    and c.last_reported > now() - p_window
    and c.status <> 'resolved'
  order by score desc
  limit 1;
$$;

-- ============================================================
-- The caller has to be explicit too
-- ============================================================
-- `null` on its own has no type, which is half of why the call was ambiguous.
-- Casting it says which argument it is.
create or replace function regroup_existing() returns table (grouped int, groups int)
language plpgsql as $$
declare
  c record;
  match record;
  new_cluster bigint;
  n_grouped int := 0;
begin
  update complaints set cluster_id = null;
  delete from clusters;

  for c in
    select cp.id, cp.location, cp.category_id, cp.department_id,
           cp.citizen_id, cp.created_at,
           coalesce(cp.description_original, '') as text,
           (select ci.phash from complaint_images ci
             where ci.complaint_id = cp.id and ci.role = 'report' limit 1) as phash
    from complaints cp
    where cp.location is not null
      and cp.status not in ('withdrawn', 'rejected')
    order by cp.created_at
  loop
    select * into match
    from find_cluster_candidate(
      c.location, c.category_id, c.text,
      null::vector(512),        -- no embeddings are produced; see 0023
      250, '30 days'::interval,
      c.phash                   -- the perceptual hash, where one exists
    );

    if match.cluster_id is not null and match.score >= 0.62 then
      update complaints set cluster_id = match.cluster_id where id = c.id;

      update clusters set
        report_count  = (select count(*) from complaints where cluster_id = match.cluster_id),
        citizen_count = (select count(distinct citizen_id) from complaints where cluster_id = match.cluster_id),
        last_reported = greatest(last_reported, c.created_at),
        centroid      = (select st_centroid(st_collect(location::geometry))::geography
                         from complaints where cluster_id = match.cluster_id)
      where id = match.cluster_id;

      n_grouped := n_grouped + 1;
    else
      insert into clusters (category_id, department_id, centroid, radius_m,
                            report_count, citizen_count, first_reported, last_reported, status)
      values (c.category_id, c.department_id, c.location, 250,
              1, 1, c.created_at, c.created_at, 'submitted')
      returning id into new_cluster;

      update complaints set cluster_id = new_cluster where id = c.id;
    end if;
  end loop;

  update clusters set is_hotspot = (report_count >= 12);

  return query select n_grouped, (select count(*)::int from clusters where report_count > 1);
end $$;

select * from regroup_existing();
