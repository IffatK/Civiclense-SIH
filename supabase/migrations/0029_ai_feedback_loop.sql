-- CivicLense 0029 — recording what the AI got wrong
--
-- Residents can already correct a misclassification, and officers can already
-- reject an image. Both are thrown away the moment they are acted on: the
-- complaint is filed under the right category and the correction leaves no
-- trace.
--
-- That is the single most valuable thing this system produces. A correction is
-- a labelled example, made by somebody standing in front of the thing, and it
-- is exactly what the model needs to stop scoring 27% on real phone photos
-- while scoring 88% on the stock images it was trained on.
--
-- This records them. It does not retrain anything — retraining is a deliberate
-- act with a person watching, not something a database does on a trigger.

-- ============================================================
-- 1. Which model said what
-- ============================================================
-- Without a version, "accuracy has improved" is unfalsifiable. A prediction has
-- to carry the model that made it or there is no way to tell a better model
-- from a quieter month.
create table if not exists model_versions (
  id serial primary key,
  name text not null,
  kind text not null check (kind in ('civic_gate', 'category', 'severity', 'authenticity')),

  -- What it was trained on, so a jump in accuracy can be attributed.
  trained_on int,
  trained_at timestamptz,
  notes text,

  -- Only one of each kind is live. Retiring the old one is how a rollback works.
  active boolean not null default false,
  activated_at timestamptz,
  retired_at timestamptz,

  created_at timestamptz default now()
);

create unique index if not exists one_active_model_per_kind
  on model_versions(kind) where active;

insert into model_versions (name, kind, trained_on, trained_at, active, activated_at, notes)
values
  ('civic-gate-v1', 'civic_gate', 655, now() - interval '30 days', true, now() - interval '30 days',
   'Binary civic/non-civic. Trained on web-scraped images; scores ~0.96 on phone photos '
   'regardless of content, so it discriminates on photo style rather than subject.'),
  ('category-14-v1', 'category', 655, now() - interval '30 days', true, now() - interval '30 days',
   '14 merged classes. 69% on held-out images, ~27% on real phone photos — the gap is the '
   'training set, not the architecture.')
on conflict do nothing;

-- Recorded on the complaint, beside ai_category_id, so a prediction and the
-- model that made it live together.
alter table complaints
  add column if not exists model_version_id int references model_versions(id);

-- ============================================================
-- 2. Corrections
-- ============================================================
-- Every disagreement with the model, from whoever was in a position to know.
create table if not exists ai_corrections (
  id bigserial primary key,
  complaint_id bigint references complaints(id) on delete cascade,

  -- What the model said, frozen. Reading it back off the complaint later would
  -- give the corrected value, which is the one thing this table exists to
  -- distinguish from.
  predicted_category_id int references categories(id),
  predicted_confidence numeric(5,2),
  model_version_id int references model_versions(id),

  corrected_category_id int references categories(id),

  -- Who corrected it, and how much weight that carries. A resident standing in
  -- front of the thing and an officer who went out to it are both better
  -- evidence than the model; an officer is better still, because they saw it
  -- after being sent.
  corrected_by uuid references profiles(id),
  corrector_role text not null check (corrector_role in ('resident', 'officer', 'admin')),

  kind text not null default 'category'
    check (kind in ('category', 'not_civic', 'was_civic', 'severity', 'duplicate')),

  note text,
  -- The photograph's perceptual hash, so a correction can be matched back to
  -- the image when a training set is assembled.
  phash text,

  created_at timestamptz default now()
);

create index if not exists corrections_by_model on ai_corrections(model_version_id, created_at desc);
create index if not exists corrections_by_kind on ai_corrections(kind);

-- ============================================================
-- 3. What the corrections say
-- ============================================================
-- The question worth answering is not "how accurate is the model" but "which
-- categories is it wrong about, and what does it confuse them with". The first
-- is a number nobody can act on; the second names the photographs to collect.
create or replace view model_accuracy as
select
  mv.name                                            as model,
  predicted.name                                     as predicted,
  corrected.name                                     as should_have_been,
  count(*)::int                                      as times,
  round(avg(c.predicted_confidence), 1)              as avg_confidence_when_wrong,
  max(c.created_at)                                  as last_seen
from ai_corrections c
left join model_versions mv on mv.id = c.model_version_id
left join categories predicted on predicted.id = c.predicted_category_id
left join categories corrected on corrected.id = c.corrected_category_id
where c.kind = 'category'
group by mv.name, predicted.name, corrected.name
order by times desc;

-- Per-category, including the cases where nobody corrected anything — a
-- category with no corrections and no reports is not accurate, it is untested.
create or replace view category_reliability as
select
  cat.name                                                          as category,
  count(distinct a.id)::int                                         as predicted_times,
  count(distinct c.id)::int                                         as corrected_times,
  case
    when count(distinct a.id) = 0 then null
    else round(100.0 * (1 - count(distinct c.id)::numeric
                        / nullif(count(distinct a.id), 0)), 1)
  end                                                               as accuracy_pct,
  case
    when count(distinct a.id) < 5 then 'too few to judge'
    when count(distinct c.id)::numeric / nullif(count(distinct a.id), 0) > 0.4
      then 'often wrong'
    when count(distinct c.id)::numeric / nullif(count(distinct a.id), 0) > 0.2
      then 'sometimes wrong'
    else 'reliable'
  end                                                               as verdict
from categories cat
-- complaints.ai_category_id, not complaint_ai_analysis. That table holds the
-- raw model response and has no category column at all — reading one off it
-- would have failed the moment this view was queried.
left join complaints a on a.ai_category_id = cat.id
left join ai_corrections c on c.predicted_category_id = cat.id
group by cat.name
order by corrected_times desc, predicted_times desc;

-- ============================================================
-- 4. What to photograph next
-- ============================================================
-- The most useful output of the whole feedback loop: a ranked list of what the
-- training set is missing. "Collect more images" is advice nobody can act on;
-- "forty more photographs of blocked drains, which the model calls flooding
-- three times in five" is a task.
create or replace view training_priorities as
select
  cat.name                                          as category,
  count(*)::int                                     as corrections,
  mode() within group (order by predicted.name)     as usually_mistaken_for,
  round(avg(c.predicted_confidence), 1)             as avg_confidence_when_wrong,
  greatest(0, 40 - count(*)::int)                   as images_still_needed
from ai_corrections c
join categories cat on cat.id = c.corrected_category_id
left join categories predicted on predicted.id = c.predicted_category_id
where c.kind = 'category'
group by cat.name
order by corrections desc;
