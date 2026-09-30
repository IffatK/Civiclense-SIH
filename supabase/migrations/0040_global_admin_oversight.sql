-- A global super admin is the accountable city-wide escalation authority.
-- Department super admins remain scoped to their own officers, while the
-- global role can inspect and decide every pending staff request.

create or replace function can_approve(actor_role app_role, target_role app_role)
returns boolean language sql immutable as $$
  select (actor_role = 'global_admin' and target_role in ('super_admin', 'officer'))
      or (actor_role = 'super_admin' and target_role = 'officer');
$$;

create or replace function pending_applications_for(p_user uuid)
returns setof staff_applications
language sql stable as $$
  select a.*
  from staff_applications a
  join profiles p on p.id = p_user
  left join officers o on o.id = p_user
  where a.status = 'pending'
    and can_approve(p.role, a.requested_role)
    and (p.role = 'global_admin' or a.department_id = o.department_id)
  order by a.created_at desc;
$$;

drop policy if exists "approvers read their queue" on staff_applications;
create policy "approvers read their queue" on staff_applications for select
  using (exists (
    select 1 from profiles p left join officers o on o.id = p.id
    where p.id = auth.uid()
      and can_approve(p.role, staff_applications.requested_role)
      and (p.role = 'global_admin' or staff_applications.department_id = o.department_id)
  ));
