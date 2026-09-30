-- CivicLense 0050 — following, and a search that searches something
--
-- Two features the public interface needs and the database could not answer.
--
-- FOLLOWING. A resident who reports a pothole cares what happens to it. So
-- does the neighbour who confirmed it, and they had no way to say so — the
-- only thread between a person and a report was having filed it. Following is
-- how somebody keeps track of a problem that is not formally theirs, and it is
-- the difference between a feed you read once and one you come back to.
--
-- Two tables rather than one polymorphic one. A single follows(subject_type,
-- subject_id) cannot have a foreign key, so a deleted challenge would leave
-- rows pointing at nothing and every read would need a join it cannot express.
-- These are four columns each; the duplication is cheaper than the ambiguity.
--
-- SEARCH. The header has had a search field in the design from the start with
-- nothing behind it. Trigram indexes make an ILIKE over these columns fast
-- enough to answer as somebody types, without adding a search service to a
-- project that has one database.

-- ============================================================
-- 1. Following
-- ============================================================
create table if not exists complaint_follows (
  profile_id   uuid   not null references profiles(id)   on delete cascade,
  complaint_id bigint not null references complaints(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (profile_id, complaint_id)
);

create table if not exists challenge_follows (
  profile_id   uuid not null references profiles(id)   on delete cascade,
  challenge_id int  not null references challenges(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (profile_id, challenge_id)
);

-- Read in two directions: everything one person follows, and everyone
-- following one thing. The primary key covers the first; these cover the second.
create index if not exists complaint_follows_by_target on complaint_follows(complaint_id);
create index if not exists challenge_follows_by_target on challenge_follows(challenge_id);

-- A count on the report, so a feed of sixty does not run sixty subqueries.
-- Maintained by trigger for the same reason comment_count is: a number kept by
-- hand drifts, and a follower count that disagrees with the table is worse
-- than no follower count.
alter table complaints add column if not exists follower_count int not null default 0;

create or replace function refresh_follower_count() returns trigger
language plpgsql as $$
declare target bigint := coalesce(new.complaint_id, old.complaint_id);
begin
  update complaints c
  set follower_count = (select count(*)::int from complaint_follows f where f.complaint_id = target)
  where c.id = target;
  return null;
end $$;

drop trigger if exists follower_counts on complaint_follows;
create trigger follower_counts
  after insert or delete on complaint_follows
  for each row execute function refresh_follower_count();

-- The person who filed a report follows it by definition — they are the one
-- the status notifications already go to. Recording that explicitly means the
-- following list is complete on the first load rather than empty until they
-- press a button on their own report.
insert into complaint_follows (profile_id, complaint_id, created_at)
select c.citizen_id, c.id, c.created_at
from complaints c
where c.citizen_id is not null and c.status <> 'withdrawn'
on conflict do nothing;

-- ============================================================
-- 2. Search
-- ============================================================
-- Trigram indexes over what a resident would actually type: a place, a kind of
-- problem, the name of a project. Not over description_original — a resident
-- searching "Kurla" wants the reports in Kurla, not every report whose text
-- happens to mention it, and ranking one against the other needs a search
-- engine rather than an index.
create index if not exists reports_search_address on complaints using gin (address gin_trgm_ops);
create index if not exists challenges_search_title on challenges using gin (title gin_trgm_ops);
create index if not exists challenges_search_summary on challenges using gin (summary gin_trgm_ops);
create index if not exists projects_search_title on projects using gin (title gin_trgm_ops);
create index if not exists categories_search_name on categories using gin (name gin_trgm_ops);
create index if not exists wards_search_name on wards using gin (name gin_trgm_ops);
