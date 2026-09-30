-- CivicLense 0047 — the classifier is now one model, not two
--
-- The pair that came before it were a binary civic/non-civic gate and a
-- 14-class category model. They were replaced by a single MobileNetV2 trained
-- on 23 classes, where the 23rd class — non_civic_issue — is the gate. The same
-- softmax that names the category answers whether there is a civic problem at
-- all, so the two can no longer contradict each other, which the old pair did:
-- the gate scored ~0.96 on almost any phone photograph regardless of subject.
--
-- Every correction a resident or officer makes is recorded against the model
-- that made the prediction. If the retired rows stay active, corrections to the
-- new model are filed against the old one and the training data is worthless —
-- "category-14 was wrong 40 times" about predictions it never made.

update model_versions
set active = false,
    retired_at = now()
where active
  and name in ('civic-gate-v1', 'category-14-v1');

-- Registered under both kinds because one model now does both jobs, and both
-- correction paths — 'was_civic' and 'category' — look up an active version by
-- kind. Two rows naming the same file is honest about that; a null model on
-- half the corrections would not be.
insert into model_versions (name, kind, trained_on, trained_at, active, activated_at, notes)
values
  ('public-complaint-23', 'civic_gate', 653, now(), true, now(),
   'MobileNetV2, 224x224, 23 classes. non_civic_issue is the gate: it rejects a '
   'photograph only when it wins the softmax at 60% or more, because winning a '
   '23-way vote at 30% is not a finding and would silently drop real reports.'),
  ('public-complaint-23', 'category', 653, now(), true, now(),
   'MobileNetV2, 224x224, 22 civic classes plus non_civic_issue. 64.75% on '
   'held-out images. Classes are no longer merged — water, road and waste '
   'categories are predicted apart, so flooding routes to Drains rather than to '
   'Water Supply. Below 45% the resident is asked to choose instead.')
on conflict do nothing;
