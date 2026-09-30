-- CivicLense 0023 — deduplication that actually looks at the image
--
-- Duplicate detection was designed around image embeddings. Nothing in this
-- pipeline ever produced one: every report is stored with `embedding: null`,
-- so the image term in the cluster score has always been exactly zero. Two
-- photographs of the same pothole were matched on distance and category alone,
-- and the visual half of the comparison was dead weight.
--
-- Perceptual hashing replaces it and needs no model. The Python service now
-- returns a 64-bit hash per photograph: reduce to 32x32 greyscale, DCT, keep
-- the low-frequency corner, threshold against the median.
--
-- Measured on structured test images: the same scene re-encoded at JPEG 60 and
-- half size differs by 0 bits, darkened by 35% or rotated 2 degrees by 4 bits,
-- and a different scene by 20. A threshold of 10 separates them cleanly.
--
-- Compared by Hamming distance, so "how similar" is a count of differing bits
-- rather than a cosine nobody can picture.

alter table complaint_images
  add column if not exists phash text;

create index if not exists complaint_images_phash
  on complaint_images(phash) where phash is not null;

-- ============================================================
-- Hamming distance between two hex hashes
-- ============================================================
-- Postgres has no bit-count over hex text, so the hashes are cast through
-- bigint. 64 bits does not fit in a signed bigint, hence two 32-bit halves.
create or replace function phash_distance(a text, b text)
returns int language sql immutable as $$
  -- XOR the two hashes and count the set bits. Postgres has no popcount over
  -- hex text, so each 64-bit hash goes through two 32-bit halves: hex to
  -- bit(32) to int, XOR, back to bit(32), then count the ones by deleting the
  -- zeroes from its text form.
  --
  -- Returns 64 — maximally different — when either side is missing, so a report
  -- with no hash never accidentally matches one that has one.
  select case
    when a is null or b is null or length(a) <> 16 or length(b) <> 16 then 64
    else
      length(replace(
        (((('x' || substr(a, 1, 8))::bit(32))::int
        # ((('x' || substr(b, 1, 8))::bit(32))::int))::bit(32))::text, '0', ''))
    + length(replace(
        (((('x' || substr(a, 9, 8))::bit(32))::int
        # ((('x' || substr(b, 9, 8))::bit(32))::int))::bit(32))::text, '0', ''))
  end;
$$;

-- ============================================================
-- Near-identical photographs, wherever they were taken
-- ============================================================
-- Deliberately not restricted by distance. Somebody re-uploading the same
-- photograph from a different GPS reading — or lifting one off the internet —
-- is exactly the case a distance-bounded search misses, and it is the one worth
-- catching.
create or replace function find_duplicate_images(p_hash text, p_within int default 10)
returns table (
  complaint_ref text,
  distance int,
  category text,
  status complaint_status,
  reported timestamptz
) language sql stable as $$
  select c.ref,
         phash_distance(i.phash, p_hash) as distance,
         cat.name,
         c.status,
         c.created_at
  from complaint_images i
  join complaints c on c.id = i.complaint_id
  left join categories cat on cat.id = c.category_id
  where i.phash is not null
    and i.role = 'report'
    and c.status not in ('withdrawn', 'rejected')
    and phash_distance(i.phash, p_hash) <= p_within
  order by distance, c.created_at
  limit 5;
$$;

-- ============================================================
-- Fold it into cluster scoring
-- ============================================================
-- The image term stops being dead weight. It carries 0.15 — real but not
-- decisive, because two genuinely different potholes on the same stretch of
-- road can look alike, and distance plus category remain the backbone.
create or replace function find_cluster_candidate(
  p_point geography, p_category int, p_text text, p_embedding vector(512),
  p_radius int default 250, p_window interval default '30 days',
  p_phash text default null
) returns table (cluster_id bigint, score numeric)
language sql stable as $$
  select c.id,
         (
             0.40 * (1 - least(st_distance(c.centroid, p_point) / p_radius, 1))
           + 0.35 * (case when c.category_id = p_category then 1 else 0 end)
           + 0.10 * coalesce(similarity(c.summary, p_text), 0)

           -- Visual similarity from the perceptual hash. Zero when either side
           -- has no hash, which is every report filed before this migration —
           -- so old data still clusters on distance and category as before.
           + 0.15 * coalesce(
               (select greatest(0, 1 - (min(phash_distance(ci.phash, p_phash))::numeric / 16))
                from complaint_images ci
                join complaints cp2 on cp2.id = ci.complaint_id
                where cp2.cluster_id = c.id and ci.phash is not null and p_phash is not null),
               0)
         )::numeric as score
  from clusters c
  where st_dwithin(c.centroid, p_point, p_radius)
    and c.last_reported > now() - p_window
    and c.status <> 'resolved'
  order by score desc
  limit 1;
$$;
