-- CivicLense 0030 — say what actually happened
--
-- The verification reported "wrongly grouped with A" for two tests that were
-- not grouped at all. That is my bug, not the clustering's:
--
--     null is distinct from null  →  false
--
-- so a report with no cluster and a reference with no cluster compared as
-- identical, and the check announced a wrong grouping where there was no
-- grouping. Combined with "no group formed" and "0 challenges", the real story
-- is almost certainly that the seed never created any reports.
--
-- This replaces the check with one that can tell the three cases apart —
-- grouped correctly, grouped wrongly, and not present — and adds a diagnostic
-- that says which.

create or replace function diagnose_demo()
-- `found` is not available as a name here: plpgsql defines FOUND as a boolean
-- that is reset after every statement, so an output column called found
-- collides with it and assigning text fails with
--     invalid input syntax for type boolean
returns table (thing text, detail text, meaning text)
language plpgsql as $$
declare
  n_reports int;
  n_clusters int;
  n_grouped int;
  n_challenges int;
  n_citizens int;
begin
  select count(*) into n_reports from complaints;
  select count(*) into n_clusters from clusters;
  select count(*) into n_grouped from clusters where report_count > 1;
  select count(*) into n_challenges from challenges;
  select count(*) into n_citizens from profiles where is_demo and role = 'citizen';

  thing := 'demo citizen';
  detail := n_citizens::text;
  meaning := case when n_citizens = 0
    then 'The seed had nobody to file reports as. Re-run 0025 — it creates one now.'
    else 'Present.' end;
  return next;

  thing := 'reports';
  detail := n_reports::text;
  meaning := case
    when n_reports = 0 then 'Nothing was created. 0025 rolled back — most likely it ran before 0027 fixed the ambiguous function, so the whole file failed.'
    when n_reports < 16 then 'Fewer than the seed creates. Something failed partway.'
    else 'As expected.' end;
  return next;

  thing := 'groups';
  detail := n_clusters::text || ' total, ' || n_grouped::text || ' with more than one report';
  meaning := case
    when n_reports = 0 then 'Nothing to group.'
    when n_grouped = 0 then 'Reports exist but nothing grouped — run regroup_existing() and check the thresholds.'
    else 'Grouping is working.' end;
  return next;

  thing := 'challenges';
  detail := n_challenges::text;
  meaning := case
    when n_grouped = 0 then 'None possible — challenges are raised from groups of three or more.'
    when n_challenges = 0 then 'Groups exist but no challenge was raised. The seed block may have found no administrator.'
    else 'Raised.' end;
  return next;

  thing := 'what to do';
  detail := case
    when n_reports = 0 then 'run 0025 again'
    when n_grouped = 0 then 'run: select * from regroup_existing();'
    when n_challenges = 0 then 'run 0025 again'
    else 'nothing — the chain is intact' end;
  meaning := 'Migrations 0022 to 0029 must all be applied first, in order.';
  return next;
end $$;

-- ============================================================
-- The verification, told honestly
-- ============================================================
create or replace function verify_demo_data()
returns table (test text, expected text, actual text, passed boolean)
language plpgsql as $$
declare
  a_cluster bigint; b_cluster bigint; c_cluster bigint; d_cluster bigint;
  a_found boolean; b_found boolean; c_found boolean; d_found boolean;
begin
  select cluster_id, true into a_cluster, a_found from complaints
   where description_original like 'Pothole near Main Road%';
  select cluster_id, true into b_cluster, b_found from complaints
   where description_original like 'Large pothole on Main Road%';
  select cluster_id, true into c_cluster, c_found from complaints
   where description_original like 'Pothole at the junction%';
  select cluster_id, true into d_cluster, d_found from complaints
   where description_original like 'Water pooling at the same spot%';

  -- Three outcomes, not two. "Not present" is a different failure from
  -- "grouped wrongly", and reporting one as the other sends somebody looking
  -- at thresholds when the data was never created.
  test := 'A and B group together';
  expected := 'same group';
  actual := case
    when not coalesce(a_found, false) or not coalesce(b_found, false)
      then 'test reports missing — run 0025'
    when a_cluster is null or b_cluster is null then 'neither was grouped'
    when a_cluster = b_cluster then 'same group'
    else 'separate' end;
  passed := coalesce(a_cluster = b_cluster, false);
  return next;

  test := 'C stays separate (600m away, same category)';
  expected := 'separate';
  actual := case
    when not coalesce(c_found, false) then 'test report missing — run 0025'
    when c_cluster is null and a_cluster is null then 'neither was grouped'
    when c_cluster is not null and c_cluster = a_cluster then 'wrongly grouped with A'
    else 'separate' end;
  -- Only a pass when both exist and genuinely differ.
  passed := coalesce(c_found, false) and coalesce(a_found, false)
            and (c_cluster is null or a_cluster is null or c_cluster <> a_cluster);
  return next;

  test := 'D stays separate (same spot, different problem)';
  expected := 'separate';
  actual := case
    when not coalesce(d_found, false) then 'test report missing — run 0025'
    when d_cluster is null and a_cluster is null then 'neither was grouped'
    when d_cluster is not null and d_cluster = a_cluster then 'wrongly grouped with A'
    else 'separate' end;
  passed := coalesce(d_found, false) and coalesce(a_found, false)
            and (d_cluster is null or a_cluster is null or d_cluster <> a_cluster);
  return next;

  test := 'flooding reports formed one group';
  expected := '5 reports';
  actual := coalesce((
    select report_count::text || ' reports'
    from clusters c join categories cat on cat.id = c.category_id
    where cat.code = 'FLOOD' and c.report_count > 1
    order by report_count desc limit 1
  ), 'no group formed');
  passed := actual = '5 reports';
  return next;

  test := 'challenges raised from groups';
  expected := '3 challenges';
  actual := (select count(*)::text || ' challenges' from challenges);
  passed := (select count(*) from challenges) = 3;
  return next;

  test := 'one project under way';
  expected := '1 at pilot';
  actual := coalesce((select count(*)::text || ' at pilot' from projects where stage = 'pilot'), '0');
  passed := (select count(*) from projects where stage = 'pilot') = 1;
  return next;

  test := 'reference data intact';
  expected := 'categories and wards present';
  actual := (select count(*)::text from categories) || ' categories, '
         || (select count(*)::text from wards) || ' wards';
  passed := (select count(*) from categories) > 20 and (select count(*) from wards) > 1;
  return next;
end $$;

select * from diagnose_demo();
