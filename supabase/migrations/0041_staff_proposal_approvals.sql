-- Government proposal review for the existing campus_proposals system.
-- This does not duplicate proposals; it records each accountable decision.

create table if not exists campus_proposal_reviews (
  id bigserial primary key,
  proposal_id bigint not null references campus_proposals(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  decision text not null check (decision in ('under_review','revision_requested','approved','rejected')),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists campus_proposal_reviews_proposal on campus_proposal_reviews(proposal_id, created_at desc);

alter table campus_proposal_reviews enable row level security;

create policy "staff read submitted proposals" on campus_proposals for select using (
  exists (
    select 1 from profiles reviewer
    left join officers officer on officer.id = reviewer.id
    join challenges challenge on challenge.id = campus_proposals.challenge_id
    where reviewer.id = auth.uid()
      and (reviewer.role = 'global_admin' or (reviewer.role = 'super_admin' and officer.department_id = challenge.department_id))
  )
);
create policy "staff read proposal versions" on campus_proposal_versions for select using (
  exists (
    select 1 from campus_proposals proposal
    join challenges challenge on challenge.id = proposal.challenge_id
    join profiles reviewer on reviewer.id = auth.uid()
    left join officers officer on officer.id = reviewer.id
    where proposal.id = campus_proposal_versions.proposal_id
      and (reviewer.role = 'global_admin' or (reviewer.role = 'super_admin' and officer.department_id = challenge.department_id))
  )
);
create policy "staff read proposal documents" on campus_documents for select using (
  proposal_id is not null and exists (
    select 1 from campus_proposals proposal
    join challenges challenge on challenge.id = proposal.challenge_id
    join profiles reviewer on reviewer.id = auth.uid()
    left join officers officer on officer.id = reviewer.id
    where proposal.id = campus_documents.proposal_id
      and (reviewer.role = 'global_admin' or (reviewer.role = 'super_admin' and officer.department_id = challenge.department_id))
  )
);
create policy "proposal participants read review history" on campus_proposal_reviews for select using (
  exists (select 1 from campus_proposals proposal join profiles member on member.id=auth.uid() where proposal.id=campus_proposal_reviews.proposal_id and member.institution_id=proposal.institution_id)
  or exists (select 1 from campus_proposals proposal join challenges challenge on challenge.id=proposal.challenge_id join profiles reviewer on reviewer.id=auth.uid() left join officers officer on officer.id=reviewer.id where proposal.id=campus_proposal_reviews.proposal_id and (reviewer.role='global_admin' or (reviewer.role='super_admin' and officer.department_id=challenge.department_id)))
);
