-- Tie the existing quotation and private-document records to the existing
-- campus_proposals row. No parallel proposal, document, or quotation tables.

alter table campus_proposals add column if not exists submitted_at timestamptz;
alter table campus_proposals add column if not exists submitted_by uuid references profiles(id);

alter table quotations add column if not exists proposal_id bigint references campus_proposals(id) on delete cascade;
alter table quotations add column if not exists tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100);
alter table quotations add column if not exists updated_at timestamptz not null default now();
alter table quotation_items add column if not exists tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100);
create unique index if not exists one_quotation_per_campus_proposal on quotations(proposal_id) where proposal_id is not null;
create index if not exists quotations_proposal on quotations(proposal_id);

-- Preserve the original quotations model while attaching historical campus
-- records where the relationship is unambiguous.
update quotations q set proposal_id = p.id
from campus_proposals p
where q.proposal_id is null
  and q.challenge_id = p.challenge_id
  and q.institution_id = p.institution_id;

alter table campus_documents add column if not exists document_type text not null default 'other'
  check (document_type in ('proposal','technical','research','architecture','implementation','testing','quotation','approval','other'));
alter table campus_documents add column if not exists status text not null default 'uploaded'
  check (status in ('uploaded','replaced','archived'));
alter table campus_documents add column if not exists replaced_by bigint references campus_documents(id) on delete set null;

-- RLS is intentionally additive: direct campus clients remain institution
-- scoped, and staff use the existing challenge-scope policy from 0042.
drop policy if exists "campus members insert documents" on campus_documents;
create policy "campus members insert documents" on campus_documents for insert with check (
  institution_id = (select institution_id from profiles where id = auth.uid())
);
drop policy if exists "campus members update own documents" on campus_documents;
create policy "campus members update own documents" on campus_documents for update using (
  institution_id = (select institution_id from profiles where id = auth.uid())
) with check (institution_id = (select institution_id from profiles where id = auth.uid()));

drop policy if exists "campus members read quotations" on quotations;
create policy "campus members read quotations" on quotations for select using (
  institution_id = (select institution_id from profiles where id = auth.uid())
);
drop policy if exists "campus members write draft quotations" on quotations;
create policy "campus members write draft quotations" on quotations for all using (
  institution_id = (select institution_id from profiles where id = auth.uid()) and status = 'draft'
) with check (institution_id = (select institution_id from profiles where id = auth.uid()));

drop policy if exists "staff read proposal quotations" on quotations;
create policy "staff read proposal quotations" on quotations for select using (
  proposal_id is not null and exists (
    select 1 from campus_proposals p where p.id = quotations.proposal_id and staff_can_review_challenge(p.challenge_id)
  )
);
