-- Keep the legacy /documents upload endpoint compatible with the submission
-- guard. It writes kind='proposal' but predates document_type; without this
-- normalization the uploaded PDF was invisible to the checklist.
create or replace function normalize_legacy_campus_document_type()
returns trigger language plpgsql as $$
begin
  if new.kind = 'proposal' and coalesce(new.document_type, 'other') = 'other' then
    new.document_type := 'proposal';
  end if;
  return new;
end;
$$;

drop trigger if exists campus_document_type_from_kind on campus_documents;
create trigger campus_document_type_from_kind
before insert on campus_documents
for each row execute function normalize_legacy_campus_document_type();

update campus_documents
set document_type = 'proposal'
where kind = 'proposal' and document_type = 'other';
