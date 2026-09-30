-- CivicLense 0025 — a demo dataset that tells one story
--
-- Run reset_demo_data('RESET DEMO DATA') first.
--
-- Everything here is connected. The reports around Kurla campus are the reports
-- the flooding challenge was raised from; the university matched to it has the
-- expertise the challenge asks for; the students on the team come from the
-- departments the work needs. Nothing is filler.
--
-- Three deliberate test cases for duplicate detection, because "it seems to
-- work" is not a claim anybody should accept:
--
--   A and B  — the same pothole, forty metres and two days apart. Must group.
--   C        — a different pothole, 600m away, same ward and category.
--              Must NOT group, or the system has learned that same ward means
--              same problem.
--   D        — waterlogging in the same spot as A. Must NOT group with it,
--              or the system has learned that same place means same problem.
--
-- Demo organisations are named as such. Claiming a real university has
-- partnered with a hackathon project would be a lie told in a database.

-- ============================================================
-- 0. The accounts this data belongs to
-- ============================================================
-- Self-contained on purpose. The reset deletes every demo profile, so a seed
-- that assumed one still existed would fail immediately after the thing it is
-- meant to follow. It creates what it needs and marks it demo, so the next
-- reset can clear it again.
do $$
declare
  citizen_id uuid := gen_random_uuid();
  admin_id uuid;
begin
  if not exists (select 1 from profiles where is_demo and role = 'citizen') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', citizen_id, 'authenticated', 'authenticated',
      'resident@demo.civiclense.in', crypt('CivicLense@2026', gen_salt('bf')),
      now(), now() - interval '60 days', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Demo Resident"}'::jsonb,
      '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into profiles (id, email, full_name, role, language, is_demo)
    values (citizen_id, 'resident@demo.civiclense.in', 'Demo Resident', 'citizen', 'en', true)
    on conflict (id) do nothing;
  end if;

  -- Anything the earlier seed created is demo data too, so a future reset
  -- clears it rather than leaving orphans behind.
  update profiles set is_demo = true
  where email like '%@example.com'
     or email like '%@mcgm.gov.in'
     or email like '%@demo.civiclense%';
end $$;

-- ============================================================
-- 1. Institutions
-- ============================================================
insert into institutions (name, kind, city, expertise, contact_name, contact_email, approved, approved_at)
values
  ('Demo Institute of Technology, Mumbai', 'university', 'Mumbai',
   array['civil','water','drainage','iot','gis','data'],
   'Dr. A. Kulkarni', 'kulkarni@demo.civiclense.in', true, now() - interval '40 days'),

  ('Demo College of Engineering, Thane', 'university', 'Thane',
   array['ai','data','mobile','public_health'],
   'Dr. S. Rane', 'rane@demo.civiclense.in', true, now() - interval '35 days'),

  ('Demo School of Architecture', 'university', 'Mumbai',
   array['civil','gis','public_health'],
   'Prof. N. Iyer', 'iyer@demo.civiclense.in', true, now() - interval '30 days'),

  ('Demo Institute of Environmental Studies', 'university', 'Navi Mumbai',
   array['waste','water','public_health','data'],
   'Dr. P. Menon', 'menon@demo.civiclense.in', true, now() - interval '28 days'),

  ('Demo Polytechnic, Kurla', 'university', 'Mumbai',
   array['hardware','iot','roads'],
   'Prof. R. Shaikh', 'shaikh@demo.civiclense.in', true, now() - interval '25 days'),

  -- Industry, marked plainly as demonstration organisations.
  ('Demo Sensors Pvt Ltd', 'industry', 'Mumbai',
   array['iot','hardware','data'],
   'K. Verma', 'verma@demo.civiclense.in', true, now() - interval '20 days'),

  ('Demo Analytics Labs', 'industry', 'Pune',
   array['ai','data','gis'],
   'M. Joshi', 'joshi@demo.civiclense.in', true, now() - interval '18 days'),

  ('Demo Water Systems', 'industry', 'Mumbai',
   array['water','drainage','civil'],
   'T. Desai', 'desai@demo.civiclense.in', true, now() - interval '15 days')
on conflict (name) do nothing;

-- ============================================================
-- 2. The reports the challenges come from
-- ============================================================
-- Written as a function so the coordinates and timings stay readable, and so
-- the duplicate test cases sit next to the explanation of what they prove.
create or replace function seed_demo_reports() returns int language plpgsql as $$
declare
  citizen uuid;
  cat_pothole int;
  cat_flood int;
  cat_garbage int;
  cat_footpath int;
  n int := 0;

begin
  select id into citizen from profiles where is_demo and role = 'citizen' limit 1;
  if citizen is null then
    raise exception 'Seed the demo accounts first — no demo citizen exists';
  end if;

  select id into cat_pothole  from categories where code = 'POTHOLE';
  select id into cat_flood    from categories where code = 'FLOOD';
  select id into cat_garbage  from categories where code = 'GARBAGE';
  select id into cat_footpath from categories where code = 'FOOTPATH';

  -- ---- the flooding cluster, around a campus ----
  -- Five reports over three weeks in one place. This is what a recurring
  -- problem looks like in data, and it is what makes a challenge defensible.
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  select citizen, cat_flood,
         st_setsrid(st_makepoint(72.8890 + (i * 0.0004), 19.0730 + (i * 0.0003)), 4326)::geography,
         (array[
           'Water collects outside the college gate every time it rains. Students wade through it.',
           'Same waterlogging near the campus entrance. Ankle deep this morning.',
           'The road outside the polytechnic floods within ten minutes of rain starting.',
           'Waterlogging again at the campus gate. Two students slipped today.',
           'Drain outside the college is blocked, water has nowhere to go.'
         ])[i],
         'high', 68, 'submitted',
         now() - ((22 - i * 4) || ' days')::interval,
         82
  from generate_series(1, 5) i;
  n := n + 5;

  -- ---- waste around the same institutions ----
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  select citizen, cat_garbage,
         st_setsrid(st_makepoint(72.8912 + (i * 0.0003), 19.0745 - (i * 0.0002)), 4326)::geography,
         (array[
           'Bins outside the college overflow by midday, every day.',
           'Garbage piled next to the school wall again. Dogs get into it.',
           'Collection has not happened near the campus for four days.',
           'Overflowing bin at the college gate attracting flies.'
         ])[i],
         'medium', 52, 'submitted',
         now() - ((16 - i * 3) || ' days')::interval,
         79
  from generate_series(1, 4) i;
  n := n + 4;

  -- ---- accessibility, which is the education-specific one ----
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  select citizen, cat_footpath,
         st_setsrid(st_makepoint(72.8875 + (i * 0.0002), 19.0721 + (i * 0.0002)), 4326)::geography,
         (array[
           'The footpath to the school has no ramp. A wheelchair cannot get up it.',
           'Broken paving outside the college makes the entrance unusable for a wheelchair.',
           'No dropped kerb anywhere near the school gate.'
         ])[i],
         'medium', 48, 'submitted',
         now() - ((12 - i * 3) || ' days')::interval,
         71
  from generate_series(1, 3) i;
  n := n + 3;

  -- ============================================================
  -- The duplicate test cases
  -- ============================================================
  -- A: the original.
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  values (citizen, cat_pothole,
          st_setsrid(st_makepoint(72.9000, 19.0620), 4326)::geography,
          'Pothole near Main Road, deep enough to catch a scooter wheel.',
          'high', 62, 'submitted', now() - interval '6 days', 88);

  -- B: forty metres away, two days later. Same pothole, different phrasing and
  -- a slightly different GPS fix — which is what a second reporter actually
  -- produces. MUST group with A.
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  values (citizen, cat_pothole,
          st_setsrid(st_makepoint(72.90035, 19.06225), 4326)::geography,
          'Large pothole on Main Road. It has got worse since the rain.',
          'high', 65, 'submitted', now() - interval '4 days', 86);

  -- C: 600 metres away. Same ward, same category, genuinely a different
  -- pothole. MUST NOT group — if it does, the system has learned that same
  -- ward means same problem, which would make every group meaningless.
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  values (citizen, cat_pothole,
          st_setsrid(st_makepoint(72.9065, 19.0655), 4326)::geography,
          'Pothole at the junction near the market, separate from the Main Road one.',
          'medium', 51, 'submitted', now() - interval '3 days', 84);

  -- D: the same spot as A, different problem. MUST NOT group — if it does, the
  -- system has learned that same place means same problem.
  insert into complaints (citizen_id, category_id, location, description_original,
                          severity, severity_score, status, created_at, ai_confidence)
  values (citizen, cat_flood,
          st_setsrid(st_makepoint(72.90005, 19.06205), 4326)::geography,
          'Water pooling at the same spot on Main Road after yesterday''s rain.',
          'medium', 55, 'submitted', now() - interval '2 days', 77);

  n := n + 4;

  -- Ward and department, resolved from the coordinates rather than guessed.
  update complaints c
  set ward_id = w.id
  from wards w
  where c.ward_id is null
    and w.code <> 'MUMBAI'
    and st_intersects(w.geom, c.location);

  update complaints c
  set department_id = cat.default_department_id
  from categories cat
  where c.department_id is null and cat.id = c.category_id;

  -- SLA from the rules, not invented.
  update complaints c
  set sla_deadline = c.created_at + (r.hours || ' hours')::interval
  from sla_rules r
  where c.sla_deadline is null
    and r.severity = c.severity
    and (r.category_id is null or r.category_id = c.category_id);

  return n;
end $$;

select seed_demo_reports() as reports_created;

-- ============================================================
-- 3. Group them, then raise the challenges
-- ============================================================
select rebuild_work_zones();
select * from regroup_existing();

-- The three challenges, each from a group that actually exists.
do $$
declare
  raiser uuid;
  cl record;
begin
  -- Falls back to the demo resident if no administrator exists. The challenge
  -- needs an author for the audit trail; who it was matters less than the
  -- record being complete.
  select id into raiser from profiles where role in ('global_admin','super_admin') limit 1;
  if raiser is null then
    select id into raiser from profiles where is_demo limit 1;
  end if;

  for cl in
    select c.id, c.report_count, cat.code
    from clusters c
    join categories cat on cat.id = c.category_id
    where c.report_count >= 3
  loop
    if cl.code = 'FLOOD' then
      perform raise_challenge_from_cluster(
        cl.id,
        'Recurring waterlogging around educational institutions',
        'Five separate residents have reported the same stretch outside a campus flooding '
        'within minutes of rain starting. Clearing the drain has not held. The underlying '
        'question is why this catchment fills faster than the drainage can carry, and what '
        'early warning would let the college act before students are wading through it.',
        array['civil','drainage','iot','gis'],
        raiser
      );

    elsif cl.code = 'GARBAGE' then
      perform raise_challenge_from_cluster(
        cl.id,
        'Waste collection failing around schools and colleges',
        'Four reports in a fortnight describe bins around educational institutions '
        'overflowing before the collection round reaches them. The pattern suggests the '
        'schedule does not match how quickly these particular bins fill, rather than a '
        'collection being missed.',
        array['waste','data','iot'],
        raiser
      );

    elsif cl.code = 'FOOTPATH' then
      perform raise_challenge_from_cluster(
        cl.id,
        'Educational buildings unreachable by wheelchair',
        'Three reports describe approaches to schools and colleges with no ramp, no dropped '
        'kerb and broken paving. Each could be patched individually; the recurring version '
        'is that nobody holds a map of which educational buildings are actually reachable.',
        array['civil','gis','mobile'],
        raiser
      );
    end if;
  end loop;
end $$;

-- ============================================================
-- 4. One challenge taken up, so the lifecycle is visible
-- ============================================================
-- Only one, and only as far as pilot. A seed showing four completed
-- deployments would be claiming an impact this project has not had.
do $$
declare
  ch record;
  uni int;
  partner int;
  proj int;
begin
  select id, ref into ch from challenges
  where title like 'Recurring waterlogging%' limit 1;

  if ch.id is null then return; end if;

  select id into uni from institutions where name like 'Demo Institute of Technology%';
  select id into partner from institutions where name like 'Demo Sensors%';

  insert into challenge_interest (challenge_id, institution_id, pitch, decision, decided_at)
  values (
    ch.id, uni,
    'Our civil engineering department has catchment modelling experience and the electronics '
    'lab has built low-cost water level sensors before. We would model the catchment first to '
    'establish why it fills, then instrument the two worst points for early warning.',
    'accepted', now() - interval '18 days'
  );

  insert into projects (challenge_id, institution_id, partner_id, title, approach, stage, started_at)
  values (
    ch.id, uni, partner,
    'Campus flood early warning',
    'Catchment modelling to establish why the drainage under-performs, then low-cost water '
    'level sensors at the two worst points feeding a simple alert to the college.',
    'pilot', now() - interval '17 days'
  )
  returning id into proj;

  insert into project_milestones (project_id, title, due_on, done_at, position) values
    (proj, 'Proposal accepted',     (now() - interval '17 days')::date, now() - interval '17 days', 1),
    (proj, 'Catchment surveyed',    (now() - interval '10 days')::date, now() - interval '11 days', 2),
    (proj, 'Sensors built',         (now() - interval '4 days')::date,  now() - interval '3 days',  3),
    (proj, 'Pilot running',         (now() + interval '10 days')::date, null, 4),
    (proj, 'Deployed and measured', (now() + interval '40 days')::date, null, 5);

  update challenges set status = 'in_progress' where id = ch.id;
end $$;

drop function if exists seed_demo_reports();
