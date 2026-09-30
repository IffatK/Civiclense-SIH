-- CivicLense 0022 — make grouping actually happen
--
-- Nothing has ever grouped, and the scoring explains why.
--
-- The weights were distance 0.35, category 0.20, text similarity 0.20, image
-- similarity 0.25, against a threshold of 0.62. Text and image carry 45% of the
-- decision — but descriptions are optional and most residents leave them blank,
-- and the local classifier produces no embeddings at all, so both terms are
-- almost always zero.
--
-- Two reports of the same pothole, ten metres apart, therefore score about
-- 0.55: distance nearly full, category full, everything else nothing. Just
-- under the bar. The system was built so that only reports with both a written
-- description and an image embedding could ever be grouped, which is a
-- condition that has never once been met.
--
-- The fix is to weight what is actually observed. Same category in the same
-- place is a duplicate; text and image are corroboration when present, not the
-- basis of the decision.

create or replace function find_cluster_candidate(
  p_point geography, p_category int, p_text text, p_embedding vector(512),
  p_radius int default 250, p_window interval default '30 days'
) returns table (cluster_id bigint, score numeric)
language sql stable as $$
  select c.id,
         (
           -- Distance and category together carry the decision, because they
           -- are the two things every report has.
             0.45 * (1 - least(st_distance(c.centroid, p_point) / p_radius, 1))
           + 0.35 * (case when c.category_id = p_category then 1 else 0 end)

           -- Corroboration when it exists. Both terms are zero for a report
           -- with no description and no embedding, and that is now survivable:
           -- 0.80 from the first two clears the threshold on its own.
           + 0.10 * coalesce(similarity(c.summary, p_text), 0)
           + 0.10 * coalesce(1 - (min(ci.embedding <=> p_embedding)), 0)
         )::numeric as score
  from clusters c
  left join complaints cp on cp.cluster_id = c.id
  left join complaint_images ci on ci.complaint_id = cp.id and ci.role = 'report'
  where st_dwithin(c.centroid, p_point, p_radius)
    -- 30 days rather than 72 hours. A pothole reported on Monday and again the
    -- following week is the same pothole; the old window meant anything filed
    -- more than three days apart could never join, which is most of how a real
    -- city reports things.
    and c.last_reported > now() - p_window
    and c.status <> 'resolved'
  group by c.id
  order by score desc
  limit 1;
$$;

-- ============================================================
-- Group what has already been filed
-- ============================================================
-- Everything reported so far was scored under the old weights and left
-- ungrouped. Rerunning the match tells the story the data always contained.
create or replace function regroup_existing() returns table (grouped int, groups int)
language plpgsql as $$
declare
  c record;
  match record;
  new_cluster bigint;
  n_grouped int := 0;
begin
  -- Start clean: clusters built under the old scoring are mostly singletons.
  update complaints set cluster_id = null;
  delete from clusters;

  for c in
    select cp.id, cp.location, cp.category_id, cp.department_id,
           cp.citizen_id, cp.created_at,
           coalesce(cp.description_original, '') as text
    from complaints cp
    where cp.location is not null
      and cp.status not in ('withdrawn', 'rejected')
    order by cp.created_at
  loop
    select * into match
    from find_cluster_candidate(c.location, c.category_id, c.text, null, 250, '30 days');

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
      -- 'submitted', not 'open'. clusters.status reuses the complaint_status
      -- enum, which has no 'open' value — it goes submitted → assigned →
      -- resolved like a complaint does. Inventing a status here failed the
      -- whole regroup at the first ungrouped report.
      insert into clusters (category_id, department_id, centroid, radius_m,
                            report_count, citizen_count, first_reported, last_reported, status)
      values (c.category_id, c.department_id, c.location, 250,
              1, 1, c.created_at, c.created_at, 'submitted')
      returning id into new_cluster;

      update complaints set cluster_id = new_cluster where id = c.id;
    end if;
  end loop;

  -- A cluster of one is not a group. Kept in the table because a second report
  -- tomorrow needs something to join, but hidden from anything that counts
  -- groups — twelve singletons are not twelve hotspots.
  update clusters set is_hotspot = (report_count >= 12);

  return query select n_grouped, (select count(*)::int from clusters where report_count > 1);
end $$;

select * from regroup_existing();
