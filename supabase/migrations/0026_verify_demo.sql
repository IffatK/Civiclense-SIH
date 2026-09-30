-- CivicLense 0026 — did the seed produce what it claimed?
--
-- The demo data contains four deliberate duplicate test cases. Whether they
-- grouped correctly is the only evidence that duplicate detection works, and
-- "it looked right" is not evidence.
--
-- Safe to run repeatedly. It reads and reports; it changes nothing.

create or replace function verify_demo_data()
returns table (test text, expected text, actual text, passed boolean)
language plpgsql as $$
declare
  a_cluster bigint;
  b_cluster bigint;
  c_cluster bigint;
  d_cluster bigint;
begin
  select cluster_id into a_cluster from complaints
   where description_original like 'Pothole near Main Road%';
  select cluster_id into b_cluster from complaints
   where description_original like 'Large pothole on Main Road%';
  select cluster_id into c_cluster from complaints
   where description_original like 'Pothole at the junction%';
  select cluster_id into d_cluster from complaints
   where description_original like 'Water pooling at the same spot%';

  -- The same pothole reported twice, forty metres and two days apart.
  test := 'A and B group together';
  expected := 'same group';
  actual := case when a_cluster is not null and a_cluster = b_cluster
                 then 'same group' else 'separate' end;
  passed := (a_cluster is not null and a_cluster = b_cluster);
  return next;

  -- A different pothole 600m away. Grouping these would mean the system had
  -- learned that same ward plus same category is enough, which would make
  -- every group it produces worthless.
  test := 'C stays separate (600m away, same category)';
  expected := 'separate';
  actual := case when c_cluster is distinct from a_cluster
                 then 'separate' else 'wrongly grouped with A' end;
  passed := (c_cluster is distinct from a_cluster);
  return next;

  -- Flooding at the same coordinates as the pothole. Grouping these would mean
  -- the system had learned that same place is enough.
  test := 'D stays separate (same spot, different problem)';
  expected := 'separate';
  actual := case when d_cluster is distinct from a_cluster
                 then 'separate' else 'wrongly grouped with A' end;
  passed := (d_cluster is distinct from a_cluster);
  return next;

  -- The recurring problems should have formed groups worth escalating.
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
  actual := coalesce((select count(*)::text || ' at ' || max(stage)
                      from projects where stage = 'pilot'), '0');
  passed := (select count(*) from projects where stage = 'pilot') = 1;
  return next;

  -- Reference data must have survived the reset untouched.
  test := 'reference data intact';
  expected := 'categories and wards present';
  actual := (select count(*)::text from categories) || ' categories, '
         || (select count(*)::text from wards) || ' wards';
  passed := (select count(*) from categories) > 20 and (select count(*) from wards) > 1;
  return next;
end $$;

select * from verify_demo_data();
