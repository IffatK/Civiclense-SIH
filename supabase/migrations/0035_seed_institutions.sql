-- CivicLense 0035 — institutions that can actually sign in
--
-- 0025 created institution records but no accounts, so there was nobody to log
-- in as and the whole campus side could only be looked at, never used.
--
-- This adds working logins for three of them, and — more importantly — puts
-- two applications in the approval queue and one interest against a challenge,
-- so the admin side has something to decide rather than four empty pages.
--
-- Every address is @demo.civiclense.in. Real institutional domains are not used
-- for accounts nobody at those institutions created.

do $$
declare
  uni_id int; poly_id int; sensors_id int;
  faculty_id uuid := gen_random_uuid();
  student_id uuid := gen_random_uuid();
  partner_id uuid := gen_random_uuid();
  pending_a uuid := gen_random_uuid();
  pending_b uuid := gen_random_uuid();
  ch record;
begin
  select id into uni_id from institutions where name like 'Demo Institute of Technology%';
  select id into poly_id from institutions where name like 'Demo Polytechnic%';
  select id into sensors_id from institutions where name like 'Demo Sensors%';

  if uni_id is null then
    raise notice 'Run 0025 first — no demo institutions exist.';
    return;
  end if;

  -- ---- accounts that work ----
  -- The same shape the app creates: an auth row, a profile, and an institution
  -- link. Password for all of them: CivicLense@2026
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', faculty_id, 'authenticated', 'authenticated',
     'faculty@demo.civiclense.in', crypt('CivicLense@2026', gen_salt('bf')),
     now(), now() - interval '40 days', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Dr. A. Kulkarni"}'::jsonb, '', '', '', ''),

    ('00000000-0000-0000-0000-000000000000', student_id, 'authenticated', 'authenticated',
     'student@demo.civiclense.in', crypt('CivicLense@2026', gen_salt('bf')),
     now(), now() - interval '30 days', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Priya Raut"}'::jsonb, '', '', '', ''),

    ('00000000-0000-0000-0000-000000000000', partner_id, 'authenticated', 'authenticated',
     'partner@demo.civiclense.in', crypt('CivicLense@2026', gen_salt('bf')),
     now(), now() - interval '25 days', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"K. Verma"}'::jsonb, '', '', '', ''),

    ('00000000-0000-0000-0000-000000000000', pending_a, 'authenticated', 'authenticated',
     'applicant1@demo.civiclense.in', crypt('CivicLense@2026', gen_salt('bf')),
     now(), now() - interval '3 days', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Prof. S. Deshpande"}'::jsonb, '', '', '', ''),

    ('00000000-0000-0000-0000-000000000000', pending_b, 'authenticated', 'authenticated',
     'applicant2@demo.civiclense.in', crypt('CivicLense@2026', gen_salt('bf')),
     now(), now() - interval '1 day', now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"R. Bhatia"}'::jsonb, '', '', '', '')
  on conflict (id) do nothing;

  insert into profiles (id, email, full_name, role, language, is_demo, institution_id, institution_role)
  values
    (faculty_id, 'faculty@demo.civiclense.in', 'Dr. A. Kulkarni', 'faculty', 'en', true, uni_id, 'faculty'),
    (student_id, 'student@demo.civiclense.in', 'Priya Raut', 'student', 'en', true, uni_id, 'student'),
    (partner_id, 'partner@demo.civiclense.in', 'K. Verma', 'industry_partner', 'en', true, sensors_id, 'partner_lead'),
    -- These two have no institution yet. That is the point: their applications
    -- are what the admin queue is for.
    (pending_a, 'applicant1@demo.civiclense.in', 'Prof. S. Deshpande', 'citizen', 'en', true, null, null),
    (pending_b, 'applicant2@demo.civiclense.in', 'R. Bhatia', 'citizen', 'en', true, null, null)
  on conflict (id) do nothing;

  -- ---- two applications waiting on a decision ----
  insert into institution_applications
    (institution_name, kind, city, expertise, departments, applicant_id, applicant_role, statement)
  values
    ('Demo University of Engineering, Pune', 'university', 'Pune',
     array['civil','drainage','gis','data'],
     array['Civil Engineering','Environmental Engineering','Computer Science'],
     pending_a, 'university_admin',
     'Our civil department has run catchment surveys across three municipal wards, and the '
     'environmental group maintains a rainfall dataset going back six years. We would want to '
     'start with the drainage challenges rather than the sensing ones — modelling is what we '
     'are actually good at, and we would bring in a partner for hardware.'),

    ('Demo Urban Systems Pvt Ltd', 'industry', 'Mumbai',
     array['iot','hardware','data','ai','gis','mobile','water','waste'],
     array['Hardware','Firmware','Data'],
     pending_b, 'industry_partner',
     'We build low-cost environmental sensors and have deployed them for two private campuses. '
     'We are interested in the water and waste challenges and can supply hardware at cost for a '
     'pilot in exchange for the deployment data.')
  on conflict do nothing;

  -- ---- somebody already competing for a challenge ----
  -- So the compare-applicants page has something in it rather than an empty
  -- state that looks like a broken feature.
  select id into ch from challenges where title like 'Waste collection failing%' limit 1;

  if ch.id is not null then
    insert into challenge_interest (challenge_id, institution_id, pitch, submitted_by)
    values
      (ch.id, poly_id,
       'Our electronics students have built fill-level sensors before, as a final-year project. '
       'We would instrument six bins around the two worst campuses, log fill rates for a month, '
       'and work out whether the collection schedule or the bin capacity is the actual problem. '
       'We do not have anybody on waste policy, so we would want the ward office involved from '
       'the start rather than at the end.',
       faculty_id),
      (ch.id, sensors_id,
       'We would supply sensors at cost and handle the data pipeline. We have done fill-level '
       'monitoring commercially, so the hardware is not the interesting part — what we do not '
       'have is anybody who understands municipal collection rounds, which is why we would want '
       'to do this alongside a university rather than alone.',
       partner_id)
    on conflict do nothing;

    update challenges set status = 'matched' where id = ch.id and status = 'open';
  end if;

  -- ---- a team on the project that already exists ----
  insert into project_members (project_id, profile_id, discipline, role)
  select p.id, faculty_id, 'Civil Engineering', 'lead'
  from projects p where p.title like 'Campus flood%'
  on conflict do nothing;

  insert into project_members (project_id, profile_id, discipline, role)
  select p.id, student_id, 'Computer Science', 'member'
  from projects p where p.title like 'Campus flood%'
  on conflict do nothing;

  update projects set faculty_lead = faculty_id where title like 'Campus flood%';

  raise notice E'\n=== campus accounts ===\n'
    'faculty@demo.civiclense.in    faculty, Demo Institute of Technology\n'
    'student@demo.civiclense.in    student, same institution\n'
    'partner@demo.civiclense.in    industry, Demo Sensors\n'
    'applicant1@demo.civiclense.in application pending\n'
    'applicant2@demo.civiclense.in application pending\n\n'
    'Password for all: CivicLense@2026\n';
end $$;
