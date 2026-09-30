-- Campus portal: university-owned workspaces layered on the existing
-- challenge → quotation → project flow. Records are deliberately private.

create table if not exists university_departments (
  id bigserial primary key,
  institution_id int not null references institutions(id) on delete cascade,
  name text not null,
  head_id uuid references profiles(id) on delete set null,
  disciplines text[] not null default '{}', expertise text[] not null default '{}',
  research_areas text[] not null default '{}', labs text[] not null default '{}',
  created_at timestamptz not null default now(), unique(institution_id, name)
);

create table if not exists university_challenge_reviews (
  id bigserial primary key, challenge_id int not null references challenges(id) on delete cascade,
  institution_id int not null references institutions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','saved','accepted','declined','information_requested')),
  department_ids bigint[] not null default '{}', faculty_mentor_id uuid references profiles(id) on delete set null,
  project_type text, disciplines text[] not null default '{}', initial_idea text,
  estimated_weeks int check(estimated_weeks between 1 and 260), note text,
  reviewed_by uuid references profiles(id) on delete set null, reviewed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(challenge_id, institution_id)
);

create table if not exists campus_proposals (
  id bigserial primary key, ref text unique not null default 'PROP-' || nextval('project_ref_seq'),
  institution_id int not null references institutions(id) on delete cascade,
  challenge_id int not null references challenges(id) on delete cascade,
  department_id bigint references university_departments(id) on delete set null,
  faculty_mentor_id uuid references profiles(id) on delete set null,
  title text not null, project_type text, duration_weeks int check(duration_weeks between 1 and 260),
  sections jsonb not null default '{}'::jsonb, status text not null default 'draft'
    check(status in ('draft','submitted','under_review','revision_requested','resubmitted','approved','rejected')),
  current_version int not null default 0, review_comment text, reviewed_by uuid references profiles(id), reviewed_at timestamptz,
  created_by uuid references profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists campus_proposals_institution_status on campus_proposals(institution_id,status,updated_at desc);

create table if not exists campus_proposal_versions (
  id bigserial primary key, proposal_id bigint not null references campus_proposals(id) on delete cascade,
  version int not null, sections jsonb not null, budget jsonb not null default '[]'::jsonb,
  submitted_by uuid references profiles(id), submitted_at timestamptz not null default now(),
  change_note text, unique(proposal_id,version)
);

create table if not exists campus_documents (
  id bigserial primary key, institution_id int not null references institutions(id) on delete cascade,
  proposal_id bigint references campus_proposals(id) on delete cascade, project_id int references projects(id) on delete cascade,
  kind text not null default 'other', filename text not null, mime_type text not null, size_bytes bigint not null,
  storage_path text not null, version int not null default 1, uploaded_by uuid references profiles(id), uploaded_at timestamptz not null default now(),
  unique(proposal_id, filename, version)
);

create table if not exists campus_audit_logs (
  id bigserial primary key, institution_id int not null references institutions(id) on delete cascade,
  actor uuid references profiles(id), action text not null, entity text not null, entity_id text not null,
  before jsonb, after jsonb, created_at timestamptz not null default now()
);

alter table university_departments enable row level security;
alter table university_challenge_reviews enable row level security;
alter table campus_proposals enable row level security;
alter table campus_proposal_versions enable row level security;
alter table campus_documents enable row level security;
alter table campus_audit_logs enable row level security;

-- API access is authenticated server-side; direct clients can only see rows from their institution.
create policy "campus members read departments" on university_departments for select using (institution_id = (select institution_id from profiles where id = auth.uid()));
create policy "campus members read reviews" on university_challenge_reviews for select using (institution_id = (select institution_id from profiles where id = auth.uid()));
create policy "campus members read proposals" on campus_proposals for select using (institution_id = (select institution_id from profiles where id = auth.uid()));
create policy "campus members read versions" on campus_proposal_versions for select using (exists (select 1 from campus_proposals p where p.id = proposal_id and p.institution_id = (select institution_id from profiles where id = auth.uid())));
create policy "campus members read documents" on campus_documents for select using (institution_id = (select institution_id from profiles where id = auth.uid()));
create policy "campus members read audit" on campus_audit_logs for select using (institution_id = (select institution_id from profiles where id = auth.uid()));
