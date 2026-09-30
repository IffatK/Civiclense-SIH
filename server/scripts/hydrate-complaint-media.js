/** Backfill private bucket media for legacy demo complaints that have no image. */
import "dotenv/config";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const storage = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../seed-assets/images");
const bucket = process.env.STORAGE_BUCKET || "complaint-media";
const assets = { FLOOD: "water/flooding-01.png", GARBAGE: "waste/garbage-overflow-01.png", DUMPING: "waste/garbage-overflow-01.png" };
const uploaded = new Map();
try {
  const { rows } = await db.query(`select c.id,c.citizen_id,cat.code from complaints c join categories cat on cat.id=c.category_id where not exists (select 1 from complaint_images i where i.complaint_id=c.id)`);
  for (const complaint of rows) {
    const asset = assets[complaint.code] || "roads/pothole-01.png";
    let path = uploaded.get(asset);
    if (!path) {
      path = `demo-assets/backfill/${asset}`;
      const { error } = await storage.storage.from(bucket).upload(path, await readFile(join(root, asset)), { contentType: "image/png", upsert: true });
      if (error) throw new Error(error.message);
      uploaded.set(asset, path);
    }
    await db.query("insert into complaint_images(complaint_id,storage_path,role,uploaded_by,exif) values($1,$2,'report',$3,$4)", [complaint.id, path, complaint.citizen_id, JSON.stringify({ source: "CivicLens demo evidence" })]);
  }
  console.log(`Attached evidence to ${rows.length} complaints.`);
} finally { await db.end(); }
