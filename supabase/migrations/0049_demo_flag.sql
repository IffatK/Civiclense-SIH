-- CivicLense 0049 — mark demo records with a flag instead of a prefix
--
-- The demo seed identified its own rows by writing "[DEMO-SEED] " into the
-- front of every complaint description and challenge title, and its reset
-- deleted anything matching that prefix. It worked, but it put the marker in
-- the one field the whole demo exists to show: every report a visitor reads
-- opened with a tag, so the demo advertised itself as fake in the place where
-- it most needed to read real.
--
-- A boolean the reset can filter on does the same job without touching
-- content. profiles.is_demo has always worked this way; this extends the same
-- convention to the four tables everything else hangs off — a proposal reaches
-- its institution, a project reaches its challenge, a complaint's images and
-- analysis reach the complaint.
--
-- Defaults to false, so nothing already in the database becomes demo data by
-- being sat still, and a reset can never reach a real record.

alter table complaints   add column if not exists is_demo boolean not null default false;
alter table clusters     add column if not exists is_demo boolean not null default false;
alter table challenges   add column if not exists is_demo boolean not null default false;
alter table institutions add column if not exists is_demo boolean not null default false;

-- Reset walks these constantly and they are a small fraction of each table.
create index if not exists complaints_demo   on complaints(id)   where is_demo;
create index if not exists clusters_demo     on clusters(id)     where is_demo;
create index if not exists challenges_demo   on challenges(id)   where is_demo;
create index if not exists institutions_demo on institutions(id) where is_demo;

-- Adopt what the previous prefix-based seed left behind, so the first run of
-- the new seed clears it instead of leaving a second, unreachable demo dataset
-- alongside the new one.
update complaints   set is_demo = true where description_original like '[DEMO-SEED]%';
update clusters     set is_demo = true where summary like '[DEMO-SEED]%';
update challenges   set is_demo = true where title like '[DEMO-SEED]%';
update institutions set is_demo = true where name like '% — DEMO';
