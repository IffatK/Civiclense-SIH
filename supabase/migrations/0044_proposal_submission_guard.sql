-- Enforce the lifecycle at the database boundary too. This protects the
-- workflow if a stale browser or future route bypasses the Campus checklist.
create or replace function guard_campus_proposal_transition()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status = 'submitted')
         or (old.status = 'revision_requested' and new.status = 'resubmitted')
         or (old.status in ('submitted','resubmitted') and new.status = 'under_review')
         or (old.status = 'under_review' and new.status in ('revision_requested','approved','rejected'))) then
      raise exception 'Invalid proposal status transition from % to %', old.status, new.status using errcode = '23514';
    end if;
    if new.status in ('submitted','resubmitted') then
      if coalesce(trim(new.sections->>'problem'),'') = '' or coalesce(trim(new.sections->>'solution'),'') = ''
         or coalesce(trim(new.sections->>'implementation'),'') = '' or coalesce(trim(new.sections->>'impact'),'') = '' then
        raise exception 'Proposal is missing required content sections' using errcode = '23514';
      end if;
      if not exists (select 1 from quotations q where q.proposal_id = new.id) then
        raise exception 'Proposal requires an attached quotation' using errcode = '23514';
      end if;
      if not exists (select 1 from campus_documents d where d.proposal_id = new.id and d.document_type = 'proposal' and d.status = 'uploaded') then
        raise exception 'Proposal requires an uploaded proposal PDF or document' using errcode = '23514';
      end if;
      new.submitted_at = now();
      new.submitted_by = (select submitted_by from campus_proposal_versions where proposal_id = new.id order by version desc limit 1);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists campus_proposal_transition_guard on campus_proposals;
create trigger campus_proposal_transition_guard
before update of status on campus_proposals
for each row execute function guard_campus_proposal_transition();
