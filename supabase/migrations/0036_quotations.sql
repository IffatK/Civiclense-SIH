-- CivicLense 0036 — quotations, and projects with more than one institution
--
-- Two things the model got wrong.
--
-- **One institution per project.** A university with the modelling and no
-- hardware, and a company with the sensors and nobody who understands municipal
-- drainage, are the normal case rather than the exception — the seed data
-- already contains exactly that pair, and the schema forced the city to pick
-- one and discard the other.
--
-- **No quotation.** An institution wrote a paragraph and the city awarded work
-- on it. Public money does not move on a paragraph: somebody has to say what it
-- costs, over what period, and what is delivered at the end.

-- ============================================================
-- 1. Quotations
-- ============================================================
create table if not exists quotations (
  id serial primary key,
  ref text unique not null default 'Q-' || nextval('project_ref_seq'),

  challenge_id int not null references challenges(id) on delete cascade,
  institution_id int not null references institutions(id) on delete cascade,

  -- A consortium bids as one. The lead submits, and names who else is in it,
  -- so the city assesses the group rather than pretending it is one body.
  partner_ids int[] not null default '{}',

  title text not null,
  approach text not null check (length(trim(approach)) between 100 and 5000),

  -- Deliberately separate from the total. A quotation that is only a number
  -- cannot be compared with one that itemises, and the itemised one is the one
  -- worth having.
  total_cost numeric(12,2) not null check (total_cost >= 0),
  currency char(3) not null default 'INR',

  duration_weeks int not null check (duration_weeks between 1 and 104),
  start_available date,

  -- What the city gets. Written by the bidder, checked by the assessor.
  deliverables text[] not null default '{}',
  assumptions text,
  -- What they are explicitly not doing. The most useful field on any quotation
  -- and the one nobody fills in unless asked directly.
  exclusions text,

  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'shortlisted', 'accepted', 'declined', 'withdrawn')),

  submitted_by uuid references profiles(id),
  submitted_at timestamptz default now(),

  decided_by uuid references profiles(id),
  decided_at timestamptz,
  decision_note text,

  unique (challenge_id, institution_id)
);

create index if not exists quotations_challenge on quotations(challenge_id, status);

-- Line items, so a total can be interrogated rather than trusted.
create table if not exists quotation_items (
  id serial primary key,
  quotation_id int not null references quotations(id) on delete cascade,

  description text not null,
  category text not null default 'other'
    check (category in ('people', 'equipment', 'materials', 'travel', 'software', 'other')),

  quantity numeric(10,2) not null default 1,
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  -- Stored rather than computed on read, so a historical quotation still shows
  -- the number the institution actually submitted.
  line_total numeric(12,2) generated always as (quantity * unit_cost) stored,

  position int not null default 0
);

create index if not exists quotation_items_quotation on quotation_items(quotation_id, position);

-- ============================================================
-- 2. Projects with several institutions
-- ============================================================
create table if not exists project_institutions (
  project_id int not null references projects(id) on delete cascade,
  institution_id int not null references institutions(id) on delete cascade,

  -- One lead, any number of partners. Somebody has to be answerable, and a
  -- consortium where everybody is equally responsible is one where nobody is.
  role text not null default 'partner' check (role in ('lead', 'partner')),
  contribution text,

  -- Their share of the awarded total, so the split is recorded rather than
  -- agreed in a meeting nobody minuted.
  agreed_cost numeric(12,2),

  joined_at timestamptz default now(),
  primary key (project_id, institution_id)
);

create unique index if not exists one_lead_per_project
  on project_institutions(project_id) where role = 'lead';

-- Backfill from the columns this replaces. The old ones stay for now — dropping
-- a column that routes still read would break the app mid-migration.
insert into project_institutions (project_id, institution_id, role)
select id, institution_id, 'lead' from projects where institution_id is not null
on conflict do nothing;

insert into project_institutions (project_id, institution_id, role)
select id, partner_id, 'partner' from projects where partner_id is not null
on conflict do nothing;

alter table projects
  add column if not exists quotation_id int references quotations(id),
  add column if not exists awarded_cost numeric(12,2);

-- ============================================================
-- 3. Comparing quotations
-- ============================================================
-- Cost per week and cost per deliverable, because a total on its own says
-- nothing. The cheapest quotation over twice the duration is not the cheapest.
create or replace view quotation_comparison as
select
  q.id, q.ref, q.challenge_id, q.title, q.status,
  i.name                                            as institution,
  i.kind,
  q.total_cost, q.currency, q.duration_weeks,
  round(q.total_cost / nullif(q.duration_weeks, 0), 2)             as cost_per_week,
  cardinality(q.deliverables)                                      as deliverable_count,
  round(q.total_cost / nullif(cardinality(q.deliverables), 0), 2)  as cost_per_deliverable,
  cardinality(q.partner_ids)                                       as partner_count,
  (select count(*)::int from quotation_items it where it.quotation_id = q.id) as line_items,
  -- A quotation with no line items is a number somebody wrote down. Worth
  -- flagging rather than ranking alongside one that shows its working.
  (select count(*) from quotation_items it where it.quotation_id = q.id) = 0 as unitemised,
  q.submitted_at
from quotations q
join institutions i on i.id = q.institution_id
where q.status in ('submitted', 'shortlisted', 'accepted');

-- ============================================================
-- 4. Awarding
-- ============================================================
-- Accepts one quotation and creates the project with everyone in it — the lead
-- and every partner named in the bid, in one transaction rather than three
-- screens.
create or replace function award_quotation(p_quotation int, p_by uuid, p_note text default null)
returns text language plpgsql as $$
declare
  q record;
  new_project int;
  new_ref text;
  partner int;
begin
  select * into q from quotations where id = p_quotation;
  if q is null then raise exception 'No such quotation'; end if;
  if q.status = 'accepted' then raise exception 'That quotation has already been accepted'; end if;

  insert into projects (challenge_id, institution_id, title, approach, stage,
                        quotation_id, awarded_cost)
  values (q.challenge_id, q.institution_id, q.title, q.approach, 'approved',
          q.id, q.total_cost)
  returning id, ref into new_project, new_ref;

  insert into project_institutions (project_id, institution_id, role, agreed_cost)
  values (new_project, q.institution_id, 'lead', q.total_cost);

  foreach partner in array q.partner_ids loop
    insert into project_institutions (project_id, institution_id, role)
    values (new_project, partner, 'partner')
    on conflict do nothing;
  end loop;

  insert into project_milestones (project_id, title, position)
  select new_project, m.title, m.pos
  from (values ('Quotation accepted', 1), ('Approach agreed', 2),
               ('Prototype built', 3), ('Pilot running', 4),
               ('Deployed and measured', 5)) as m(title, pos);

  update quotations
  set status = case when id = p_quotation then 'accepted' else 'declined' end,
      decided_by = p_by, decided_at = now(),
      decision_note = case when id = p_quotation then p_note else p_note end
  where challenge_id = q.challenge_id and status in ('submitted', 'shortlisted');

  update challenges set status = 'in_progress' where id = q.challenge_id;

  insert into audit_logs (actor, action, entity, entity_id, after)
  values (p_by, 'quotation.accepted', 'quotations', q.ref,
          jsonb_build_object('project', new_ref, 'cost', q.total_cost));

  return new_ref;
end $$;

-- ============================================================
-- 5. Institutions on the leaderboard
-- ============================================================
-- Ranked on work delivered, not on quotations submitted. Bidding for everything
-- is not a contribution, and a board that rewarded it would fill with
-- institutions that bid and never build.
create or replace view institution_leaderboard as
select
  i.id,
  i.name,
  i.kind,
  i.city,
  count(distinct pi.project_id) filter (where p.stage = 'deployed')::int   as delivered,
  count(distinct pi.project_id) filter (where p.stage in ('building','pilot'))::int as active,
  count(distinct pi.project_id) filter (where pi.role = 'lead')::int       as led,
  count(distinct pi.project_id) filter (where pi.role = 'partner')::int    as supported,
  coalesce(sum(p.complaints_closed) filter (where p.stage = 'deployed'), 0)::int as reports_stopped,
  count(distinct pm.profile_id)::int                                      as people_involved,
  count(distinct q.id)::int                                               as quotations_submitted,
  rank() over (
    order by count(distinct pi.project_id) filter (where p.stage = 'deployed') desc,
             coalesce(sum(p.complaints_closed) filter (where p.stage = 'deployed'), 0) desc,
             count(distinct pi.project_id) filter (where p.stage in ('building','pilot')) desc
  ) as position
from institutions i
left join project_institutions pi on pi.institution_id = i.id
left join projects p on p.id = pi.project_id
left join project_members pm on pm.project_id = p.id
left join quotations q on q.institution_id = i.id
where i.approved
group by i.id, i.name, i.kind, i.city
having count(distinct pi.project_id) > 0;
