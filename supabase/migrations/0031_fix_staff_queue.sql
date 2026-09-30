-- CivicLense 0031 — the staff approval queue was silently empty
--
-- pending_applications_for() scopes a department head to their own department,
-- and reads that department from the officers table:
--
--     left join officers o on o.id = p_user
--     ...  and (p.role = 'global_admin' or a.department_id = o.department_id)
--
-- A super_admin with no officers row gets NULL from that join, the comparison
-- becomes NULL, and every application is filtered out. The queue shows
-- "nothing waiting" whether there is nothing waiting or the account simply has
-- no department recorded — and those are very different situations shown
-- identically.
--
-- The demo reset makes it worse: it deletes officer records, so a head who
-- could see applications yesterday sees none today with no error and no clue.

-- ============================================================
-- 1. A department that does not depend on the officers table
-- ============================================================
-- An administrator is not necessarily an officer. Requiring an officers row to
-- know which department somebody administers conflates two different things.
alter table profiles
  add column if not exists department_id int references departments(id);

-- Backfill from officers, which is where it has been living.
update profiles p
set department_id = o.department_id
from officers o
where o.id = p.id and p.department_id is null;

-- ============================================================
-- 2. Scope that degrades honestly
-- ============================================================
create or replace function pending_applications_for(p_user uuid)
returns setof staff_applications
language sql stable as $$
  select a.*
  from staff_applications a
  join profiles p on p.id = p_user
  left join officers o on o.id = p_user
  where a.status = 'pending'
    and can_approve(p.role, a.requested_role)
    and (
      p.role = 'global_admin'
      -- Either source of truth will do. Requiring the officers row meant a
      -- head without one saw nothing at all.
      or a.department_id = coalesce(p.department_id, o.department_id)
      -- And a head with no department recorded anywhere sees the queue rather
      -- than an empty page. Seeing too much is a visible problem somebody can
      -- report; seeing nothing looks like there is nothing to see.
      or coalesce(p.department_id, o.department_id) is null
    )
  order by a.created_at desc;
$$;

-- ============================================================
-- 3. Say when the queue is empty for the wrong reason
-- ============================================================
create or replace function staff_queue_health(p_user uuid)
returns table (waiting int, scope text, warning text)
language plpgsql as $$
declare
  r text;
  dept int;
  n int;
  total int;
begin
  select p.role::text, coalesce(p.department_id, o.department_id)
    into r, dept
  from profiles p left join officers o on o.id = p.id
  where p.id = p_user;

  select count(*) into n from pending_applications_for(p_user);
  select count(*) into total from staff_applications where status = 'pending';

  waiting := n;
  scope := case
    when r = 'global_admin' then 'every department'
    when dept is null then 'no department recorded'
    else (select name from departments where id = dept) end;

  warning := case
    when r = 'global_admin' then null
    when dept is null then
      'Your account has no department recorded, so scoping cannot be applied. '
      'You are seeing every pending application.'
    when n = 0 and total > 0 then
      total::text || ' applications are waiting, but none for your department.'
    else null end;

  return next;
end $$;
