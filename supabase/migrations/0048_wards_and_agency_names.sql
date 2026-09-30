-- CivicLense 0048 — the rest of Mumbai, and two agency names that were placeholders
--
-- Reference data, not demo data. Both of these are wrong for every deployment,
-- not just for the demo, which is why they are here rather than in the seed
-- script.
--
-- 1. The wards table held thirteen rows, and three of those were duplicates of
--    the same place under different codes plus a "MUMBAI (catch-all)" row that
--    exists so a report outside every polygon still lands somewhere. MCGM has
--    twenty-four administrative wards. A ward filter offering half the city
--    looks broken, and reports in Mulund or Borivali were falling through to
--    the catch-all and appearing to be nowhere.
--
--    The geometries are axis-aligned bounding boxes around each ward's actual
--    extent, matching the approximation the original seed already used. They
--    are good enough to attribute a report to the right ward and are not
--    survey boundaries; anything doing real spatial analysis should load the
--    published MCGM shapefile over this.
--
-- 2. 'ABC Infrastructure Pvt Ltd' and 'XYZ Waste Services' were placeholder
--    contractor names visible on every complaint those contracts cover.

insert into wards (code, name, zone_id, geom) values
  ('B', 'Sandhurst Road / Dongri', (select id from zones where name = 'Zone 1 - South'),
   st_geogfromtext('MULTIPOLYGON(((72.830 18.945, 72.850 18.945, 72.850 18.968, 72.830 18.968, 72.830 18.945)))')),
  ('C', 'Marine Lines / Kalbadevi', (select id from zones where name = 'Zone 1 - South'),
   st_geogfromtext('MULTIPOLYGON(((72.818 18.940, 72.836 18.940, 72.836 18.960, 72.818 18.960, 72.818 18.940)))')),
  ('E', 'Byculla / Mazgaon', (select id from zones where name = 'Zone 1 - South'),
   st_geogfromtext('MULTIPOLYGON(((72.826 18.962, 72.852 18.962, 72.852 18.995, 72.826 18.995, 72.826 18.962)))')),
  ('F-South', 'Parel / Sewri', (select id from zones where name = 'Zone 2 - South Central'),
   st_geogfromtext('MULTIPOLYGON(((72.828 18.986, 72.856 18.986, 72.856 19.012, 72.828 19.012, 72.828 18.986)))')),
  ('H-East', 'Santacruz East / Kalina', (select id from zones where name = 'Zone 3 - West'),
   st_geogfromtext('MULTIPOLYGON(((72.836 19.062, 72.868 19.062, 72.868 19.098, 72.836 19.098, 72.836 19.062)))')),
  ('M-West', 'Chembur', (select id from zones where name = 'Zone 6 - North East'),
   st_geogfromtext('MULTIPOLYGON(((72.880 19.030, 72.912 19.030, 72.912 19.068, 72.880 19.068, 72.880 19.030)))')),
  ('P-South', 'Goregaon', (select id from zones where name = 'Zone 7 - North West'),
   st_geogfromtext('MULTIPOLYGON(((72.834 19.148, 72.868 19.148, 72.868 19.180, 72.834 19.180, 72.834 19.148)))')),
  ('P-North', 'Malad', (select id from zones where name = 'Zone 7 - North West'),
   st_geogfromtext('MULTIPOLYGON(((72.830 19.170, 72.868 19.170, 72.868 19.205, 72.830 19.205, 72.830 19.170)))')),
  ('R-South', 'Kandivali', (select id from zones where name = 'Zone 7 - North West'),
   st_geogfromtext('MULTIPOLYGON(((72.828 19.190, 72.866 19.190, 72.866 19.220, 72.828 19.220, 72.828 19.190)))')),
  ('R-Central', 'Borivali', (select id from zones where name = 'Zone 7 - North West'),
   st_geogfromtext('MULTIPOLYGON(((72.838 19.214, 72.876 19.214, 72.876 19.244, 72.838 19.244, 72.838 19.214)))')),
  ('R-North', 'Dahisar', (select id from zones where name = 'Zone 7 - North West'),
   st_geogfromtext('MULTIPOLYGON(((72.842 19.238, 72.880 19.238, 72.880 19.268, 72.842 19.268, 72.842 19.238)))')),
  ('T', 'Mulund', (select id from zones where name = 'Zone 6 - North East'),
   st_geogfromtext('MULTIPOLYGON(((72.938 19.155, 72.976 19.155, 72.976 19.192, 72.938 19.192, 72.938 19.155)))'))
on conflict (code) do nothing;

-- Names only. The contract numbers, coverage and SLA hours are untouched, so
-- every complaint already attributed to these contracts keeps its attribution.
update contracts set agency = 'Deshmukh Infraworks Pvt Ltd' where agency = 'ABC Infrastructure Pvt Ltd';
update contracts set agency = 'Nirmal Waste Services Pvt Ltd' where agency = 'XYZ Waste Services';
