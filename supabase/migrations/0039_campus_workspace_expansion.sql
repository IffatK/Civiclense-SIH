-- Expand the Campus Portal around the existing institutions/profiles/projects
-- records. These fields are institution-owned and remain private.

alter table institutions add column if not exists website text;
alter table institutions add column if not exists description text;
alter table institutions add column if not exists logo_path text;
alter table institutions add column if not exists disciplines text[] not null default '{}';
alter table institutions add column if not exists research_areas text[] not null default '{}';
alter table institutions add column if not exists laboratories text[] not null default '{}';
alter table institutions add column if not exists capabilities text[] not null default '{}';

create table if not exists campus_member_details (
  profile_id uuid primary key references profiles(id) on delete cascade,
  department_id bigint references university_departments(id) on delete set null,
  designation text, study_year int check(study_year between 1 and 8),
  specialization text, skills text[] not null default '{}', interests text[] not null default '{}',
  research_areas text[] not null default '{}', availability text,
  previous_projects text, updated_at timestamptz not null default now()
);

alter table project_milestones add column if not exists description text;
alter table project_milestones add column if not exists start_on date;
alter table project_milestones add column if not exists status text not null default 'not_started'
  check(status in ('not_started','in_progress','under_review','completed','delayed'));
alter table project_milestones add column if not exists assigned_member_ids uuid[] not null default '{}';

create table if not exists project_tasks (
  id bigserial primary key, project_id int not null references projects(id) on delete cascade,
  title text not null, description text, assignee_id uuid references profiles(id) on delete set null,
  status text not null default 'not_started' check(status in ('not_started','in_progress','under_review','completed','blocked')),
  due_on date, created_by uuid references profiles(id), created_at timestamptz not null default now()
);
create table if not exists project_messages (
  id bigserial primary key, project_id int references projects(id) on delete cascade,
  challenge_id int references challenges(id) on delete cascade, body text not null check(length(trim(body)) between 1 and 4000),
  author_id uuid not null references profiles(id), created_at timestamptz not null default now(),
  check(project_id is not null or challenge_id is not null)
);
create table if not exists project_outcomes (
  id bigserial primary key, project_id int not null unique references projects(id) on delete cascade,
  prototype_status text, testing_summary text, pilot_summary text, deployment_summary text,
  impact_summary text, measurable_outcomes jsonb not null default '{}'::jsonb, updated_by uuid references profiles(id), updated_at timestamptz not null default now()
);

alter table campus_member_details enable row level security;
alter table project_tasks enable row level security;
alter table project_messages enable row level security;
alter table project_outcomes enable row level security;
create policy "campus reads member detail" on campus_member_details for select using (exists(select 1 from profiles me join profiles member on member.id=campus_member_details.profile_id where me.id=auth.uid() and me.institution_id=member.institution_id));
