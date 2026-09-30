-- CivicLense 0028 — universities can sign in
--
-- The innovation ecosystem exists in the schema and nobody outside the
-- municipality can reach it. Challenges, matching, projects and milestones are
-- all there, and every one of them is operated by an administrator acting on a
-- university's behalf — which is not an ecosystem, it is an administrator with
-- extra paperwork.
--
-- This adds the roles and the way in.

-- ============================================================
-- 1. Roles
-- ============================================================
-- Four, not one. A faculty mentor approving a proposal and a student updating a
-- milestone are different permissions, and collapsing them into "university
-- user" would mean any student could commit their institution to a project.
do $$ begin
  alter type app_role add value if not exists 'university_admin';
  alter type app_role add value if not exists 'faculty';
  alter type app_role add value if not exists 'student';
  alter type app_role add value if not exists 'industry_partner';
exception when duplicate_object then null;
end $$;

commit;

-- ============================================================
-- 2. Applying to join
-- ============================================================
-- Deliberately mirrors staff_applications rather than inventing a second
-- pattern. An institution applies, an administrator decides, and until then it
-- sees nothing — an open directory of a city's unsolved problems is a directory
-- of where that city is weak.
create table if not exists institution_applications (
  id serial primary key,

  -- The institution may not exist yet; the application is what creates it.
  institution_name text not null,
  kind text not null default 'university'
    check (kind in ('university', 'industry', 'ngo', 'research')),
  city text,
  website text,

  -- Claimed at application time and checked by whoever approves. Expertise is
  -- what matching runs on, so an institution claiming everything would match
  -- everything — which is why a human reads it.
  expertise text[] not null default '{}',
  departments text[] not null default '{}',

  applicant_id uuid not null references profiles(id) on delete cascade,
  applicant_role text not null default 'university_admin'
    check (applicant_role in ('university_admin', 'faculty', 'industry_partner')),

  -- Why this institution, in their words. An approver needs something to judge
  -- beyond a name and a list of tags.
  statement text not null check (length(trim(statement)) between 40 and 2000),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,

  created_at timestamptz default now(),

  -- One live application per applicant. Without this a refused applicant can
  -- simply apply again on the same afternoon.
  unique (applicant_id, institution_name)
);

create index if not exists institution_applications_pending
  on institution_applications(status) where status = 'pending';

-- ============================================================
-- 3. Approving one
-- ============================================================
create or replace function approve_institution(
  p_application int,
  p_by uuid,
  p_note text default null
) returns int language plpgsql as $$
declare
  app record;
  inst_id int;
begin
  select * into app from institution_applications where id = p_application;

  if app is null then
    raise exception 'No such application';
  end if;
  if app.status <> 'pending' then
    raise exception 'That application has already been decided';
  end if;

  -- Reuse an institution of the same name rather than creating a second one.
  -- Two records for one university would split its projects across both and
  -- neither would show the real picture.
  select id into inst_id from institutions where lower(name) = lower(app.institution_name);

  if inst_id is null then
    insert into institutions (name, kind, city, expertise, approved, approved_at)
    values (app.institution_name, app.kind, app.city, app.expertise, true, now())
    returning id into inst_id;
  else
    update institutions
    set approved = true,
        approved_at = coalesce(approved_at, now()),
        -- Expertise accumulates rather than being replaced. A second department
        -- joining should widen what the institution can take on, not overwrite
        -- what the first one claimed.
        expertise = array(select distinct unnest(expertise || app.expertise))
    where id = inst_id;
  end if;

  update profiles
  set role = app.applicant_role::app_role,
      institution_id = inst_id,
      institution_role = case app.applicant_role
                           when 'faculty' then 'faculty'
                           when 'industry_partner' then 'partner_lead'
                           else 'faculty'
                         end
  where id = app.applicant_id;

  update institution_applications
  set status = 'approved', decided_by = p_by, decided_at = now(), decision_note = p_note
  where id = p_application;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_by, 'institution.approved', 'institutions', inst_id::text,
          jsonb_build_object('name', app.institution_name, 'applicant', app.applicant_id));

  return inst_id;
end $$;

-- ============================================================
-- 4. Adding people to an institution
-- ============================================================
-- Students and further faculty are invited by their own institution rather than
-- applying to the city. A university knows who its students are; a municipal
-- administrator does not, and should not be the bottleneck for every project
-- team.
create table if not exists institution_invites (
  id serial primary key,
  institution_id int not null references institutions(id) on delete cascade,

  email text not null,
  invited_role text not null check (invited_role in ('faculty', 'student', 'partner_member')),
  discipline text,

  invited_by uuid references profiles(id),
  invited_at timestamptz default now(),

  -- Short-lived on purpose. An invitation that works six months later is a
  -- credential nobody remembers issuing.
  expires_at timestamptz default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles(id),

  unique (institution_id, email)
);

create index if not exists invites_open
  on institution_invites(email) where accepted_at is null;

create or replace function accept_institution_invite(p_email text, p_profile uuid)
returns int language plpgsql as $$
declare
  inv record;
begin
  select * into inv from institution_invites
  where lower(email) = lower(p_email)
    and accepted_at is null
    and expires_at > now()
  order by invited_at desc limit 1;

  if inv is null then
    return null;
  end if;

  update profiles
  set role = case inv.invited_role
               when 'faculty' then 'faculty'::app_role
               when 'student' then 'student'::app_role
               else 'industry_partner'::app_role
             end,
      institution_id = inv.institution_id,
      institution_role = inv.invited_role
  where id = p_profile;

  update institution_invites
  set accepted_at = now(), accepted_by = p_profile
  where id = inv.id;

  return inv.institution_id;
end $$;

-- ============================================================
-- 5. Matching, with the reasoning attached
-- ============================================================
-- The existing view returns an overlap count. This adds what an institution
-- actually needs to decide: which of its own expertise matched, and what the
-- challenge asks for that it does not have.
--
-- A gap is not a disqualification. A university missing one of four needs is
-- exactly the case where an industry partner is worth bringing in, and hiding
-- the gap would hide the reason to.
create or replace view challenge_matches_detailed as
select
  c.id                as challenge_id,
  c.ref               as challenge_ref,
  c.title,
  c.summary,
  c.status,
  c.reports_at_raise,
  c.residents_affected,
  cat.name            as category,
  w.name              as ward,
  i.id                as institution_id,
  i.name              as institution,
  c.needs,
  array(select unnest(c.needs) intersect select unnest(i.expertise))  as matched_on,
  array(select unnest(c.needs) except select unnest(i.expertise))     as gaps,
  cardinality(array(select unnest(c.needs) intersect select unnest(i.expertise))) as matched,
  cardinality(c.needs) as required
from challenges c
cross join institutions i
left join categories cat on cat.id = c.category_id
left join wards w on w.id = c.ward_id
where i.approved
  and c.status in ('open', 'matched')
  and cardinality(array(select unnest(c.needs) intersect select unnest(i.expertise))) > 0;
