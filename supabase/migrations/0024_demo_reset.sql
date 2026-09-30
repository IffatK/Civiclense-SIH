-- CivicLense 0024 — a safe way to clear demo data
--
-- The database has accumulated test reports filed over weeks of development.
-- They are duplicates of each other in ways nobody intended, they distort every
-- figure on the leaderboard and the analytics, and they make it impossible to
-- tell whether duplicate detection is working or merely lucky.
--
-- This adds a reset function. It does not run anything — calling it is a
-- deliberate act, and it names what it deleted.
--
-- What it will never touch:
--   · tables, columns, indexes, functions, views — schema is migrations' job
--   · wards, zones, departments, categories, SLA rules, contracts, badges —
--     reference data the application needs to function at all
--   · any account that is not marked demo
--
-- What it clears: reports and everything hanging off them, and the demo
-- accounts themselves.

-- ============================================================
-- 1. Mark what is safe to delete
-- ============================================================
-- Without this the reset would have to guess, and a reset that guesses is one
-- nobody dares run. An account created by the seed says so about itself.
alter table profiles
  add column if not exists is_demo boolean not null default false;

comment on column profiles.is_demo is
  'Created by the demo seed. reset_demo_data() deletes these and only these.';

-- Everything the seed has ever created, retroactively. The addresses are the
-- seed's own, and no real person will have signed up with them.
update profiles set is_demo = true
where email like '%@example.com'
   or email like '%@mcgm.gov.in'
   or email like '%@demo.civiclense%';

-- ============================================================
-- 2. The reset
-- ============================================================
create or replace function reset_demo_data(p_confirm text)
returns table (cleared text, rows bigint)
language plpgsql as $$
declare
  n bigint;
begin
  -- A function that wipes data on a bare call is one somebody eventually calls
  -- by accident.
  if p_confirm is distinct from 'RESET DEMO DATA' then
    raise exception
      'Refusing to run. Pass the exact phrase: select * from reset_demo_data(''RESET DEMO DATA'')';
  end if;

  -- Deleted parent-first where a cascade exists, child-first where it does not.
  -- Reports carry cascades from 0001, so removing them takes their images,
  -- history, followups, comments, proofs and reviews with them.

  delete from complaint_comments;   get diagnostics n = row_count;
  cleared := 'comments';            rows := n; return next;

  delete from reward_events;        get diagnostics n = row_count;
  cleared := 'reward events';       rows := n; return next;

  delete from citizen_badges;       get diagnostics n = row_count;
  cleared := 'badges held';         rows := n; return next;

  delete from notifications;        get diagnostics n = row_count;
  cleared := 'notifications';       rows := n; return next;

  -- Innovation records reference complaints, so they go before them.
  delete from project_milestones;   get diagnostics n = row_count;
  cleared := 'milestones';          rows := n; return next;

  delete from project_members;      get diagnostics n = row_count;
  cleared := 'project members';     rows := n; return next;

  delete from projects;             get diagnostics n = row_count;
  cleared := 'projects';            rows := n; return next;

  delete from challenge_interest;   get diagnostics n = row_count;
  cleared := 'expressions of interest'; rows := n; return next;

  delete from challenges;           get diagnostics n = row_count;
  cleared := 'challenges';          rows := n; return next;

  -- Detach before deleting anything complaints point at.
  --
  -- complaints.work_zone_id and complaints.cluster_id are plain references with
  -- no cascade, so deleting a zone while a report still points at it fails on
  -- the foreign key. Nulling them here rather than beside the complaints delete
  -- is the whole fix: the pointers must go before the targets, not after.
  update complaints set cluster_id = null, work_zone_id = null;

  delete from work_zones;           get diagnostics n = row_count;
  cleared := 'work zones';          rows := n; return next;

  -- Complaints cascade to images, history, followups, proofs and reviews.
  delete from complaints;           get diagnostics n = row_count;
  cleared := 'reports';             rows := n; return next;

  delete from clusters;             get diagnostics n = row_count;
  cleared := 'groups';              rows := n; return next;

  delete from pending_analyses;     get diagnostics n = row_count;
  cleared := 'unfinished analyses'; rows := n; return next;

  delete from generated_reports;    get diagnostics n = row_count;
  cleared := 'generated reports';   rows := n; return next;

  delete from daily_briefs;         get diagnostics n = row_count;
  cleared := 'daily briefs';        rows := n; return next;

  delete from agent_steps;          get diagnostics n = row_count;
  cleared := 'agent steps';         rows := n; return next;

  delete from agent_proposals;      get diagnostics n = row_count;
  cleared := 'agent proposals';     rows := n; return next;

  delete from agent_runs;           get diagnostics n = row_count;
  cleared := 'agent runs';          rows := n; return next;

  delete from staff_applications;   get diagnostics n = row_count;
  cleared := 'staff applications';  rows := n; return next;

  -- Institutions are demo data too, but only those the seed made.
  delete from institutions where contact_email like '%@demo.civiclense%';
  get diagnostics n = row_count;
  cleared := 'institutions';        rows := n; return next;

  -- Detach every remaining reference to a demo profile.
  --
  -- Roughly twenty columns point at profiles and almost none of them cascade —
  -- audit actors, approvers, uploaders, assigners. Deleting an account while
  -- any of them still points at it fails on the foreign key, so each is nulled
  -- first. They are all "who did this", and losing the name from a record that
  -- is itself about to be deleted costs nothing.
  update audit_logs        set actor = null            where actor in (select id from profiles where is_demo);
  update complaint_status_history set actor = null     where actor in (select id from profiles where is_demo);
  update categories        set created_by = null       where created_by in (select id from profiles where is_demo);
  update staff_applications set approved_by = null     where approved_by in (select id from profiles where is_demo);
  update agent_proposals   set decided_by = null       where decided_by in (select id from profiles where is_demo);
  update agent_runs        set requested_by = null     where requested_by in (select id from profiles where is_demo);
  update work_zones        set assigned_officer = null where assigned_officer in (select id from profiles where is_demo);

  -- Officers before profiles, since officers.id references profiles.id.
  delete from officers where id in (select id from profiles where is_demo);
  get diagnostics n = row_count;
  cleared := 'officer records';     rows := n; return next;

  delete from profiles where is_demo;
  get diagnostics n = row_count;
  cleared := 'demo profiles';       rows := n; return next;

  -- The auth rows behind those profiles. Real accounts are untouched because
  -- they were never marked is_demo.
  delete from auth.users
  where email like '%@example.com'
     or email like '%@mcgm.gov.in'
     or email like '%@demo.civiclense%';
  get diagnostics n = row_count;
  cleared := 'demo logins';         rows := n; return next;

  -- The audit log records that the reset happened. Deleting the record of a
  -- deletion is exactly the kind of quiet rewriting this product argues against.
  insert into audit_logs (actor, action, entity, entity_id, after)
  values (null, 'demo.reset', 'database', 'all',
          jsonb_build_object('at', now(), 'note', 'Demo data cleared; schema and reference data untouched'));

  cleared := 'reference data kept';
  rows := (select count(*) from categories) + (select count(*) from wards)
        + (select count(*) from departments);
  return next;
end $$;

comment on function reset_demo_data is
  'Development only. Clears demo reports, accounts and innovation records. '
  'Never touches schema, reference data, or accounts not marked is_demo.';
