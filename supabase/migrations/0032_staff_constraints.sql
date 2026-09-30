-- CivicLense 0032 — staff registration had almost no constraints
--
-- The form validated shapes and nothing else. Two people could register with
-- the same employee number, an application could name a department that does
-- not exist, and somebody turned down could reapply immediately and repeatedly
-- until an approver clicked the wrong button out of fatigue.
--
-- None of that is exotic. It is what happens when validation checks that a
-- field is a string of the right length and stops there.

-- ============================================================
-- 1. One employee, one account
-- ============================================================
-- Partial, so a rejected application does not permanently block the number —
-- a genuine officer whose first application was mishandled must be able to
-- reapply.
-- Existing duplicates would fail index creation, so the older ones are marked
-- rejected first. Deliberately keeping the newest: if somebody applied twice,
-- the second attempt is the one they meant.
update staff_applications a
set status = 'rejected',
    decision_note = coalesce(decision_note, 'Superseded by a later application under the same employee number')
where status = 'pending'
  and exists (
    select 1 from staff_applications b
    where lower(b.employee_id) = lower(a.employee_id)
      and b.id > a.id
      and b.status in ('pending', 'approved')
  );

create unique index if not exists one_live_application_per_employee
  on staff_applications(lower(employee_id))
  where status in ('pending', 'approved');

-- And the same person cannot have two open applications under different
-- employee numbers.
create unique index if not exists one_pending_application_per_user
  on staff_applications(user_id)
  where status = 'pending';

-- ============================================================
-- 2. The department has to exist
-- ============================================================
-- It was an unconstrained integer. An application naming department 999 sat in
-- the queue looking normal and failed only when somebody approved it.
-- NOT VALID: the constraint applies to every new row immediately, and existing
-- rows are left alone rather than failing the migration. A demo database with
-- one malformed application from three weeks ago should not stop the rule being
-- introduced — validate it later once the old rows are cleaned or gone.
do $$ begin
  alter table staff_applications
    add constraint staff_applications_department_fk
    foreign key (department_id) references departments(id)
    not valid;
exception when duplicate_object then null;
end $$;

-- A super_admin heads a department, so one is required. An officer without a
-- department cannot be assigned work, which is the entire point of the role.
do $$ begin
  alter table staff_applications
    add constraint staff_department_required
    check (department_id is not null)
    not valid;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 3. Employee numbers that look like employee numbers
-- ============================================================
-- Not a strict format — municipalities differ, and rejecting a real officer
-- over a hyphen would be worse than accepting an odd one. This only rules out
-- the obviously empty and the obviously fake.
-- Backreferences in a check constraint are portable in theory and a source of
-- surprise in practice, so this is expressed without one: at least three
-- characters, and at least two distinct ones.
do $$ begin
  alter table staff_applications
    add constraint employee_id_plausible
    check (
      length(trim(employee_id)) >= 3
      and length(replace(employee_id, substr(employee_id, 1, 1), '')) > 0
    )
    not valid;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 4. A cooling-off period after rejection
-- ============================================================
-- Somebody turned down could reapply the same afternoon, and repeatedly. An
-- approval queue filling with the same refused application is how a real one
-- gets missed.
create or replace function can_reapply(p_user uuid)
returns table (allowed boolean, reason text, retry_after timestamptz)
language plpgsql stable as $$
declare
  last_reject timestamptz;
  attempts int;
begin
  select max(decided_at), count(*)
    into last_reject, attempts
  from staff_applications
  where user_id = p_user and status = 'rejected';

  if last_reject is null then
    allowed := true; reason := null; retry_after := null;
    return next; return;
  end if;

  -- Widening: a first rejection is often a correctable mistake, a third is
  -- usually somebody who should not have access.
  retry_after := last_reject + (attempts * interval '3 days');
  allowed := now() >= retry_after;
  reason := case when allowed then null
    else 'A previous application was turned down. You can apply again after '
         || to_char(retry_after, 'DD Mon') || '.' end;

  return next;
end $$;

-- ============================================================
-- 5. Approval cannot promote past the approver
-- ============================================================
-- can_approve() already governs this, but only in the API. A direct write —
-- a bad script, a future route that forgets the check — could grant
-- global_admin. The database refuses it either way now.
do $$ begin
  alter table staff_applications
    add constraint no_self_granted_global_admin
    check (requested_role in ('officer', 'super_admin'))
    not valid;
exception when duplicate_object then null;
end $$;
