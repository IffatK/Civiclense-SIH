-- CivicLense 0037 — the problems patching does not fix
--
-- Run after 0025 and 0035.
--
-- Everything seeded so far is a problem an officer can close. These are the
-- other kind: reports the resident sent back because the fix did not hold, and
-- critical ones that keep returning to the same stretch of road.
--
-- That distinction is the whole argument for the university side. A pothole
-- filled three times in eight months is not a maintenance backlog, it is a
-- drainage or a sub-base problem that nobody has been asked to diagnose — and
-- the rework count is the evidence, sitting in the database, that patching is
-- not working.
--
-- Four challenges come out of this, each raised from reports that exist.

do $$
declare
  citizen uuid;
  raiser uuid;
  cat_pothole int; cat_flood int; cat_wire int; cat_manhole int;
  cluster_rec record;
  n int := 0;
begin
  select id into citizen from profiles where is_demo and role = 'citizen' limit 1;
  select id into raiser from profiles where role in ('global_admin','super_admin') limit 1;
  if raiser is null then raiser := citizen; end if;

  if citizen is null then
    raise notice 'Run 0025 first — no demo citizen exists.';
    return;
  end if;

  select id into cat_pothole from categories where code = 'POTHOLE';
  select id into cat_flood   from categories where code = 'FLOOD';
  select id into cat_wire    from categories where code = 'EXPOSEDWIRE';
  select id into cat_manhole from categories where code = 'MANHOLE';

  -- ============================================================
  -- 1. Reopened — the fix did not hold
  -- ============================================================
  -- rework_count is what makes these different from an ordinary backlog. Each
  -- was closed by an officer and sent back by the resident who reported it.
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, rework_count,
                          created_at, ai_confidence)
  select citizen, cat_pothole,
         st_setsrid(st_makepoint(72.8541 + (i * 0.0003), 19.1180 + (i * 0.0002)), 4326)::geography,
         (array[
           'Same pothole on the Andheri link road. Filled in March, open again by May.',
           'This has been patched twice. The edges crumble within weeks of the rain.',
           'Third time reporting this stretch. The filling material washes straight out.',
           'Patch from last month has already collapsed. Two-wheelers swerve into traffic.'
         ])[i],
         'critical', 84, 'reopened', 2 + (i % 2),
         now() - ((70 - i * 12) || ' days')::interval, 86
  from generate_series(1, 4) i;
  n := n + 4;

  -- ============================================================
  -- 2. Critical and recurring — a danger that returns
  -- ============================================================
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, rework_count,
                          created_at, ai_confidence)
  select citizen, cat_wire,
         st_setsrid(st_makepoint(72.8615 + (i * 0.0002), 19.1042 - (i * 0.0003)), 4326)::geography,
         (array[
           'Exposed cable at head height outside the school gate. Taped over, not replaced.',
           'The same cable is exposed again. Tape has perished in the sun.',
           'Live wire hanging by the school wall. Children walk under it twice a day.',
           'Reported this in April and again in June. Still only tape holding it.',
           'Sparking from the same junction box after rain.'
         ])[i],
         'critical', 92, case when i <= 2 then 'reopened' else 'assigned' end, i % 3,
         now() - ((55 - i * 9) || ' days')::interval, 89
  from generate_series(1, 5) i;
  n := n + 5;

  -- ============================================================
  -- 3. Open manholes — the most dangerous recurring category
  -- ============================================================
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, rework_count,
                          created_at, ai_confidence)
  select citizen, cat_manhole,
         st_setsrid(st_makepoint(72.8388 + (i * 0.0004), 19.0955 + (i * 0.0003)), 4326)::geography,
         (array[
           'Cover missing again on the Malad service road. Replaced in February.',
           'Same manhole open. A slab was put over it and has since been moved.',
           'Cover stolen for the third time this year. Nothing marking the hole.',
           'Open manhole beside the bus stop. Someone has put a branch in it as a warning.'
         ])[i],
         'critical', 95, case when i = 1 then 'reopened' else 'submitted' end, 1 + (i % 3),
         now() - ((40 - i * 8) || ' days')::interval, 91
  from generate_series(1, 4) i;
  n := n + 4;

  -- ============================================================
  -- 4. Flooding that returns every monsoon
  -- ============================================================
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, rework_count,
                          created_at, ai_confidence)
  select citizen, cat_flood,
         st_setsrid(st_makepoint(72.8702 + (i * 0.0003), 19.0640 - (i * 0.0002)), 4326)::geography,
         (array[
           'The subway floods every year. Desilting was done in May and it made no difference.',
           'Knee deep in the underpass again. This is the fourth monsoon running.',
           'Same underpass, same water. Pumps were installed and are not switched on.',
           'Water standing three days after the rain stopped. It has nowhere to drain.',
           'Underpass impassable. School buses are turning back at the junction.'
         ])[i],
         'critical', 88, case when i <= 2 then 'reopened' else 'verification' end, 1 + (i % 2),
         now() - ((34 - i * 6) || ' days')::interval, 87
  from generate_series(1, 5) i;
  n := n + 5;

  -- Ward, department and SLA from the coordinates and the rules, as the app does.
  update complaints c set ward_id = w.id
  from wards w
  where c.ward_id is null and w.code <> 'MUMBAI' and st_intersects(w.geom, c.location);

  update complaints c set department_id = cat.default_department_id
  from categories cat
  where c.department_id is null and cat.id = c.category_id;

  update complaints c
  set sla_deadline = c.created_at + (r.hours || ' hours')::interval
  from sla_rules r
  where c.sla_deadline is null and r.severity = c.severity
    and (r.category_id is null or r.category_id = c.category_id);

  raise notice '% hard cases seeded', n;
end $$;

-- Regroup so the new reports form their own clusters.
select * from regroup_existing();

-- ============================================================
-- 5. Raise a challenge from each recurring group
-- ============================================================
-- Only from groups that carry rework. A group of four fresh reports is a busy
-- week; a group of four where three were sent back is a problem that patching
-- does not solve, and that is the one worth handing to a university.
do $$
declare
  raiser uuid;
  cl record;
begin
  select id into raiser from profiles where role in ('global_admin','super_admin') limit 1;
  if raiser is null then select id into raiser from profiles where is_demo limit 1; end if;

  for cl in
    select c.id, c.report_count, cat.code,
           (select sum(rework_count) from complaints cp where cp.cluster_id = c.id) as rework
    from clusters c
    join categories cat on cat.id = c.category_id
    where c.report_count >= 3
      and (select sum(rework_count) from complaints cp where cp.cluster_id = c.id) >= 2
      and not exists (select 1 from challenges ch where ch.cluster_id = c.id)
  loop
    if cl.code = 'POTHOLE' then
      perform raise_challenge_from_cluster(cl.id,
        'Road surface failing repeatedly on the same stretch',
        'Four reports over ten weeks describe the same stretch of link road, patched twice and '
        'failed twice. The filling material is washing out rather than wearing down, which '
        'points at water under the surface rather than at traffic load. Nobody has been asked '
        'to establish which.',
        array['civil','roads','drainage','data'], raiser);

    elsif cl.code = 'EXPOSEDWIRE' then
      perform raise_challenge_from_cluster(cl.id,
        'Exposed cabling recurring outside a school',
        'Five reports about the same junction outside a school gate, repaired with tape three '
        'times. The repairs hold until the next monsoon. The question is whether the enclosure '
        'is the wrong specification for the location or whether the fault is upstream.',
        array['hardware','public_health','iot'], raiser);

    elsif cl.code = 'MANHOLE' then
      perform raise_challenge_from_cluster(cl.id,
        'Manhole covers disappearing faster than they are replaced',
        'Four reports on one service road, three of them repeat visits. Covers are replaced and '
        'gone again within weeks. Replacing them faster is not working; what is missing is a way '
        'to know a cover has gone before a resident finds it.',
        array['iot','hardware','civil','gis'], raiser);

    elsif cl.code = 'FLOOD' then
      perform raise_challenge_from_cluster(cl.id,
        'Underpass flooding through four consecutive monsoons',
        'Five reports across the season describe the same underpass. Desilting was carried out '
        'and made no difference, and pumps were installed but are not being run. The recurring '
        'failure is not the drainage itself but that nobody knows it is filling until it is full.',
        array['civil','drainage','iot','gis','data'], raiser);
    end if;
  end loop;
end $$;

-- ============================================================
-- What the universities will see
-- ============================================================
select ch.ref, ch.title, ch.reports_at_raise as reports,
       ch.residents_affected as residents, ch.needs, ch.status
from challenges ch order by ch.residents_affected desc;
