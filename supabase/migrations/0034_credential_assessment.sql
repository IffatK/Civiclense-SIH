-- CivicLense 0034 — helping an administrator choose between institutions
--
-- When three universities put themselves forward for the same challenge, an
-- administrator reads three paragraphs and picks one. That decision awards
-- public work, and at the moment nothing supports it and nothing records why.
--
-- This scores each applicant on things that can be checked. Deliberately not a
-- model: a black box telling a municipality which university to award work to
-- is exactly the kind of automated decision that should not exist, and one
-- nobody could defend if asked. Every point below traces to a fact, and the
-- breakdown is shown beside the total.
--
-- It ranks. It does not decide.

create or replace function assess_institution(p_institution int, p_challenge int)
returns table (factor text, detail text, points int, out_of int, note text)
language plpgsql stable as $$
declare
  inst record;
  ch record;
  matched int;
  required int;
  delivered int;
  abandoned int;
  avg_days numeric;
  team_size int;
  disciplines int;
begin
  select * into inst from institutions where id = p_institution;
  select * into ch from challenges where id = p_challenge;

  if inst is null or ch is null then
    raise exception 'No such institution or challenge';
  end if;

  -- ---- 1. Does their expertise cover what this needs ----
  matched := cardinality(array(select unnest(ch.needs) intersect select unnest(inst.expertise)));
  required := cardinality(ch.needs);

  factor := 'Expertise match';
  detail := matched::text || ' of ' || required::text || ' needs — '
         || coalesce(array_to_string(array(select unnest(ch.needs) intersect select unnest(inst.expertise)), ', '), 'none');
  points := case when required = 0 then 0 else (30.0 * matched / required)::int end;
  out_of := 30;
  note := case
    when matched = required then 'Covers everything this challenge asks for.'
    when matched = 0 then 'Covers none of it.'
    else 'Gaps: ' || array_to_string(array(select unnest(ch.needs) except select unnest(inst.expertise)), ', ')
         || '. Not disqualifying — this is where a partner helps.' end;
  return next;

  -- ---- 2. Have they finished anything before ----
  select count(*) filter (where stage = 'deployed'),
         count(*) filter (where stage = 'abandoned'),
         round(avg(extract(days from (deployed_at - started_at))), 0)
    into delivered, abandoned, avg_days
  from projects where institution_id = p_institution;

  factor := 'Track record';
  detail := delivered::text || ' delivered, ' || abandoned::text || ' abandoned';
  points := least(25, delivered * 10) - least(15, abandoned * 8);
  out_of := 25;
  note := case
    when delivered = 0 and abandoned = 0 then
      'No history either way. A first project is not a risk — everybody has one.'
    when abandoned > delivered then
      'More abandoned than delivered. Worth asking what happened before awarding another.'
    when avg_days is not null then 'Average ' || avg_days::text || ' days to deployment.'
    else 'Has delivered before.' end;
  return next;

  -- ---- 3. Are there actually people ----
  select count(*), count(distinct discipline)
    into team_size, disciplines
  from profiles p
  left join project_members pm on pm.profile_id = p.id
  where p.institution_id = p_institution;

  factor := 'People';
  detail := team_size::text || ' registered, ' || disciplines::text || ' disciplines';
  points := least(20, team_size * 3) + least(10, disciplines * 3);
  out_of := 20;
  note := case
    when team_size <= 1 then
      'One account. An institution of one cannot form the multidisciplinary team this needs.'
    when disciplines >= 3 then 'Several disciplines — good sign for work that spans them.'
    else 'Enough people to form a team.' end;
  return next;

  -- ---- 4. Is the institution near the problem ----
  factor := 'Locality';
  detail := coalesce(inst.city, 'no city recorded');
  points := case
    when inst.city is null then 0
    when exists (
      select 1 from wards w
      where w.id = ch.ward_id and lower(w.name) like '%' || lower(inst.city) || '%'
    ) then 15
    when lower(coalesce(inst.city, '')) = 'mumbai' then 12
    else 5 end;
  out_of := 15;
  note := case
    when inst.city is null then 'No city recorded, so proximity cannot be judged.'
    when points >= 12 then 'Local. Students can visit the site, which matters for fieldwork.'
    else 'Not local. Workable, but site visits will be harder.' end;
  return next;

  -- ---- 5. How much they said ----
  -- Length is a weak proxy and weighted accordingly. A short good pitch beats
  -- a long empty one, and no rule can tell them apart — this only flags the
  -- one-liners.
  factor := 'Application quality';
  detail := length(inst.name) || ' char name, statement on file';
  points := case
    when exists (select 1 from challenge_interest i
                  where i.institution_id = p_institution and i.challenge_id = p_challenge
                    and length(i.pitch) > 400) then 10
    when exists (select 1 from challenge_interest i
                  where i.institution_id = p_institution and i.challenge_id = p_challenge
                    and length(i.pitch) > 150) then 6
    else 2 end;
  out_of := 10;
  note := 'Length only. Read the pitch — this cannot tell a good short one from a bad long one.';
  return next;
end $$;

-- A single figure for sorting, with the caveat attached wherever it is shown.
create or replace function assessment_total(p_institution int, p_challenge int)
returns int language sql stable as $$
  select greatest(0, sum(points))::int from assess_institution(p_institution, p_challenge);
$$;
