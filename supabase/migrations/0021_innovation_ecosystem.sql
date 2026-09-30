-- CivicLense 0021 — from complaint to challenge
--
-- Everything so far ends when an officer fixes something. That is the right
-- ending for a pothole and the wrong one for the fourth pothole on the same
-- stretch this year: patching it again is maintenance, and the recurrence is
-- the actual problem.
--
-- A challenge is what a recurring problem becomes when somebody decides it
-- needs solving rather than fixing. It is raised from complaints that already
-- exist, so it inherits real evidence — a challenge nobody reported is a
-- research topic, not a civic one.
--
-- The lifecycle is deliberately short. Proposal, approval, build, pilot,
-- deployed. Longer ones look thorough on a slide and produce projects that sit
-- in "testing" for a year because nobody agreed what leaving it required.

-- ============================================================
-- 1. Who can work on challenges
-- ============================================================
create table if not exists institutions (
  id serial primary key,
  name text not null unique,
  kind text not null default 'university'
    check (kind in ('university', 'industry', 'ngo', 'research')),

  city text,
  -- What they can actually do. Matching reads this, so it is a real field
  -- rather than prose: 'civil', 'water', 'ai', 'iot', 'gis', 'public_health'.
  expertise text[] not null default '{}',

  contact_name text,
  contact_email text,

  -- Approved by an administrator before they see anything. An open directory
  -- of unsolved civic problems is a directory of where a city is weak.
  approved boolean not null default false,
  approved_at timestamptz,

  created_at timestamptz default now()
);

create index if not exists institutions_expertise on institutions using gin(expertise);

-- People belong to an institution, and are the same profiles as everyone else.
-- A separate user table for students would mean a second sign-in, a second
-- password reset and a second place for an account to go stale.
alter table profiles
  add column if not exists institution_id int references institutions(id),
  add column if not exists institution_role text
    check (institution_role in ('faculty', 'student', 'partner_lead', 'partner_member'));

-- ============================================================
-- 2. The challenge
-- ============================================================
-- Own sequences for the reference numbers. Borrowing another table's — which
-- the first draft did — means every institution created silently advances the
-- challenge numbering, so refs jump and two counters that should be unrelated
-- are quietly coupled.
create sequence if not exists challenge_ref_seq;
create sequence if not exists project_ref_seq;

create table if not exists challenges (
  id serial primary key,
  ref text unique not null default 'CH-' || nextval('challenge_ref_seq'),

  title text not null,
  summary text not null,

  -- Where it came from. Both nullable: a challenge can be raised from one
  -- stubborn complaint or from a whole cluster, and an administrator can raise
  -- one directly when the pattern is obvious without being clustered.
  cluster_id bigint references clusters(id) on delete set null,
  complaint_id bigint references complaints(id) on delete set null,

  category_id int references categories(id),
  ward_id int references wards(id),
  department_id int references departments(id),

  -- What solving it would take. Drives matching, and is set by the person
  -- raising it rather than inferred — an administrator knows a flooding problem
  -- needs drainage modelling; a classifier does not.
  needs text[] not null default '{}',

  -- The evidence it inherits, frozen at the moment of raising. A challenge
  -- whose numbers move underneath it cannot be argued about.
  reports_at_raise int not null default 0,
  residents_affected int not null default 0,

  status text not null default 'open'
    check (status in ('open', 'matched', 'in_progress', 'delivered', 'closed')),

  raised_by uuid references profiles(id),
  raised_at timestamptz default now(),
  closed_at timestamptz
);

create index if not exists challenges_status on challenges(status);
create index if not exists challenges_needs on challenges using gin(needs);

-- ============================================================
-- 3. Interest, then a project
-- ============================================================
-- An institution expresses interest; an administrator accepts one. Two steps
-- rather than first-come, because the first to click is not always the right
-- one and a city should be able to choose.
create table if not exists challenge_interest (
  id serial primary key,
  challenge_id int not null references challenges(id) on delete cascade,
  institution_id int not null references institutions(id) on delete cascade,

  pitch text not null check (length(trim(pitch)) between 20 and 2000),
  submitted_by uuid references profiles(id),
  submitted_at timestamptz default now(),

  decision text check (decision in ('accepted', 'declined')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,

  unique (challenge_id, institution_id)
);

create table if not exists projects (
  id serial primary key,
  ref text unique not null default 'PR-' || nextval('project_ref_seq'),

  challenge_id int not null references challenges(id) on delete cascade,
  institution_id int not null references institutions(id),
  -- A second institution supporting the first — the industry partner to a
  -- university's team. Nullable, because plenty of projects have neither.
  partner_id int references institutions(id),

  title text not null,
  approach text,

  stage text not null default 'proposal'
    check (stage in ('proposal', 'approved', 'building', 'pilot', 'deployed', 'abandoned')),

  faculty_lead uuid references profiles(id),

  started_at timestamptz default now(),
  deployed_at timestamptz,

  -- What it changed, in the city's terms rather than the project's. A pilot
  -- that ran beautifully and closed no complaints has not solved anything.
  impact_note text,
  complaints_closed int not null default 0
);

create index if not exists projects_stage on projects(stage);

-- Who is on it. Multidisciplinary teams are the point, so the discipline is
-- recorded rather than left to be inferred from a name.
create table if not exists project_members (
  project_id int not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  discipline text,
  role text not null default 'member' check (role in ('lead', 'member', 'mentor')),
  added_at timestamptz default now(),
  primary key (project_id, profile_id)
);

-- ============================================================
-- 4. Milestones
-- ============================================================
-- Deliberately plain: a title, a date, and whether it happened. Milestone
-- systems accumulate approval states, sign-off chains and percentage
-- completions, and none of that answers the only question anybody asks, which
-- is whether the thing is late.
create table if not exists project_milestones (
  id serial primary key,
  project_id int not null references projects(id) on delete cascade,

  title text not null,
  due_on date,

  done_at timestamptz,
  note text,

  position int not null default 0
);

create index if not exists milestones_project on project_milestones(project_id, position);

-- ============================================================
-- 5. Matching
-- ============================================================
-- An overlap count, not a percentage.
--
-- "Civil Engineering — 91%" is a number with no derivation that invites the
-- question "91% of what". Two of three needs matched is checkable, and an
-- administrator can see the reasoning at a glance.
create or replace view challenge_matches as
select
  c.id                                    as challenge_id,
  c.ref                                   as challenge_ref,
  i.id                                    as institution_id,
  i.name                                  as institution,
  i.kind,
  i.expertise,
  c.needs,
  cardinality(array(select unnest(c.needs) intersect select unnest(i.expertise))) as matched,
  cardinality(c.needs)                    as required,
  array(select unnest(c.needs) intersect select unnest(i.expertise))              as matched_on
from challenges c
cross join institutions i
where i.approved
  and c.status in ('open', 'matched')
  and cardinality(array(select unnest(c.needs) intersect select unnest(i.expertise))) > 0;

-- ============================================================
-- 6. What the public sees
-- ============================================================
-- The argument the whole ecosystem rests on: this problem was reported by
-- residents, and this is what came of it.
create or replace view public_solutions as
select
  p.ref,
  p.title,
  p.stage,
  p.approach,
  p.impact_note,
  p.complaints_closed,
  p.deployed_at,
  ch.ref                                  as challenge_ref,
  ch.title                                as challenge,
  ch.reports_at_raise,
  cat.name                                as category,
  w.name                                  as ward,
  lead.name                               as institution,
  lead.kind                               as institution_kind,
  partner.name                            as partner,
  (select count(*)::int from project_members m where m.project_id = p.id) as team_size
from projects p
join challenges ch on ch.id = p.challenge_id
join institutions lead on lead.id = p.institution_id
left join institutions partner on partner.id = p.partner_id
left join categories cat on cat.id = ch.category_id
left join wards w on w.id = ch.ward_id
where p.stage <> 'abandoned';

-- ============================================================
-- 7. Raising a challenge from what residents reported
-- ============================================================
create or replace function raise_challenge_from_cluster(
  p_cluster bigint,
  p_title text,
  p_summary text,
  p_needs text[],
  p_by uuid
) returns int language plpgsql as $$
declare
  new_id int;
  src record;
begin
  select cl.id, cl.category_id, cl.department_id, cl.report_count, cl.citizen_count,
         (select c2.ward_id from complaints c2 where c2.cluster_id = cl.id limit 1) as ward_id
  into src
  from clusters cl where cl.id = p_cluster;

  if src is null then
    raise exception 'No such group: %', p_cluster;
  end if;

  insert into challenges (
    title, summary, cluster_id, category_id, ward_id, department_id,
    needs, reports_at_raise, residents_affected, raised_by
  )
  values (
    p_title, p_summary, src.id, src.category_id, src.ward_id, src.department_id,
    p_needs, src.report_count, src.citizen_count, p_by
  )
  returning id into new_id;

  return new_id;
end $$;
