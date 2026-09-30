-- RLS policies cannot rely on a normal join through another RLS-protected
-- table. This function reads only the reviewer, their department, and the
-- proposal's challenge department; it grants no data access by itself.
create or replace function staff_can_review_challenge(p_challenge_id int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles reviewer
    left join officers officer on officer.id=reviewer.id
    join challenges challenge on challenge.id=p_challenge_id
    where reviewer.id=auth.uid()
      and (reviewer.role='global_admin' or (reviewer.role='super_admin' and officer.department_id=challenge.department_id))
  );
$$;

drop policy if exists "staff read submitted proposals" on campus_proposals;
drop policy if exists "staff read proposal versions" on campus_proposal_versions;
drop policy if exists "staff read proposal documents" on campus_documents;

create policy "staff read submitted proposals" on campus_proposals for select using (staff_can_review_challenge(challenge_id));
create policy "staff read proposal versions" on campus_proposal_versions for select using (exists (select 1 from campus_proposals proposal where proposal.id=campus_proposal_versions.proposal_id and staff_can_review_challenge(proposal.challenge_id)));
create policy "staff read proposal documents" on campus_documents for select using (proposal_id is not null and exists (select 1 from campus_proposals proposal where proposal.id=campus_documents.proposal_id and staff_can_review_challenge(proposal.challenge_id)));
