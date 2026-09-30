-- Preserve the unit entered in the Campus quotation builder. Previously the UI
-- accepted it but a reload could not restore the separate field.
alter table quotation_items
  add column if not exists unit text not null default '' check (char_length(unit) <= 40);
