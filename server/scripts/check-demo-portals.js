/**
 * Opens every portal the demo is meant to fill, as the roles that use them.
 *
 *   node scripts/check-demo-portals.js
 *
 * The seed validates the database. This validates the screens: it signs in as a
 * resident, an officer, a ward administrator, the city administrator and a
 * campus coordinator, calls the endpoint behind each section, and reports how
 * many records came back. A seed can satisfy every foreign key and still leave
 * a page blank because the endpoint filters on something the seed did not set,
 * and the only way to find that is to ask the endpoint.
 *
 * Requires the API running (npm run dev) and the demo seed applied.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const API = process.env.CHECK_API_URL || `http://localhost:${process.env.PORT || 4000}`;
const PASSWORD = "CivicLense@Demo2026";
const DOMAIN = "demo.civiclense.in";

const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function tokenFor(email) {
  const { data, error } = await auth.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Could not sign in as ${email}: ${error.message}`);
  return data.session.access_token;
}

/** How many records a response actually carries, whatever shape it arrived in. */
function size(body) {
  if (Array.isArray(body)) return body.length;
  if (!body || typeof body !== "object") return body == null ? 0 : 1;
  const arrays = Object.entries(body).filter(([, v]) => Array.isArray(v));
  if (arrays.length) return arrays.reduce((n, [, v]) => n + v.length, 0);
  const numbers = Object.values(body).filter((v) => typeof v === "number");
  if (numbers.length) return numbers.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  return Object.keys(body).length ? 1 : 0;
}

const results = [];

async function check(portal, section, token, path, { min = 1 } = {}) {
  let body;
  let status;
  try {
    const res = await fetch(`${API}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (e) {
    results.push({ portal, section, path, status: "unreachable", count: 0, ok: false, note: e.message });
    return null;
  }
  const count = status === 200 ? size(body) : 0;
  results.push({
    portal, section, path, status, count,
    ok: status === 200 && count >= min,
    note: status === 200 ? "" : body?.error || "",
  });
  return body;
}

const accounts = {
  resident: `ayesha.shaikh@${DOMAIN}`,
  officer: `sunil.ghorpade.officer@${DOMAIN}`,
  staff: `surekha.bhalerao.staff@${DOMAIN}`,
  admin: `commissioner@${DOMAIN}`,
  campus: `coordinator.sahyadriinstitute@${DOMAIN}`,
};

const tokens = {};
for (const [role, email] of Object.entries(accounts)) tokens[role] = await tokenFor(email);

// Public — no sign-in at all.
await check("Public", "Report feed", null, "/api/public/reports");
await check("Public", "Overdue filter", null, "/api/public/reports?sort=overdue");
await check("Public", "Most discussed", null, "/api/public/reports?sort=discussed");
await check("Public", "Ward filter", null, "/api/public/reports?ward=L");
await check("Public", "Leaderboards", null, "/api/public/leaderboard");
await check("Public", "Map statistics", null, "/api/geo/public-stats");

// Resident.
await check("Citizen", "My reports", tokens.resident, "/api/complaints/mine");
await check("Citizen", "Dashboard", tokens.resident, "/api/me/dashboard");
await check("Citizen", "Notifications", tokens.resident, "/api/notifications");
await check("Citizen", "Categories", tokens.resident, "/api/categories");

// Officer.
await check("Officer", "Assigned queue", tokens.officer, "/api/officer/queue");
await check("Officer", "Own performance", tokens.officer, "/api/officer/performance");

// Ward administrator.
await check("Staff", "Complaint list", tokens.staff, "/api/admin/complaints");
await check("Staff", "Resolved filter", tokens.staff, "/api/admin/complaints?status=resolved");
await check("Staff", "Clusters", tokens.staff, "/api/clusters");
await check("Staff", "Challenges", tokens.staff, "/api/challenges");
await check("Staff", "Proposal approvals", tokens.staff, "/api/admin/proposals?status=all");
await check("Staff", "Officers", tokens.staff, "/api/officers");
await check("Staff", "Work zones", tokens.staff, "/api/zones");
await check("Staff", "Audit log", tokens.staff, "/api/audit");
await check("Staff", "Review queue", tokens.staff, "/api/review", { min: 0 });
await check("Staff", "Duplicate detection", tokens.staff, "/api/admin/duplicates/recent");

// City administrator.
await check("Admin", "Command centre", tokens.admin, "/api/admin/overview");
await check("Admin", "Analytics", tokens.admin, "/api/metrics?days=90");
await check("Admin", "Insights", tokens.admin, "/api/insights");
await check("Admin", "AI performance", tokens.admin, "/api/admin/ai/performance");
await check("Admin", "Institution directory", tokens.admin, "/api/institutions/directory");
await check("Admin", "Projects", tokens.admin, "/api/projects");
await check("Admin", "Contracts", tokens.admin, "/api/contracts");
await check("Admin", "Generated reports", tokens.admin, "/api/reports");
await check("Admin", "Staff applications", tokens.admin, "/api/staff/applications?status=pending", { min: 0 });
await check("Admin", "Agent runs", tokens.admin, "/api/agent/runs", { min: 0 });

// Campus.
await check("Campus", "Dashboard", tokens.campus, "/api/campus/dashboard");
await check("Campus", "Matched challenges", tokens.campus, "/api/campus/challenges");
await check("Campus", "My challenges", tokens.campus, "/api/campus/my-challenges");
await check("Campus", "Proposals", tokens.campus, "/api/campus/proposals");
await check("Campus", "Projects", tokens.campus, "/api/campus/projects");
await check("Campus", "Departments", tokens.campus, "/api/campus/departments");
await check("Campus", "Institution profile", tokens.campus, "/api/campus/profile");
await check("Campus", "Campus analytics", tokens.campus, "/api/campus/analytics");
await check("Campus", "Quotations", tokens.campus, "/api/quotations/mine");
await check("Campus", "People", tokens.campus, "/api/institutions/members");
await check("Campus", "Notifications", tokens.campus, "/api/notifications");

const pad = (s, n) => String(s).padEnd(n);
let portal = null;
for (const r of results) {
  if (r.portal !== portal) { portal = r.portal; console.log(`\n${portal}`); }
  const mark = r.ok ? "ok  " : r.status === 200 ? "EMPTY" : "FAIL ";
  console.log(`  ${mark} ${pad(r.section, 24)} ${pad(r.count, 5)} ${pad(r.status, 12)} ${r.path}${r.note ? ` — ${r.note}` : ""}`);
}

const broken = results.filter((r) => !r.ok);
console.log(`\n${results.length - broken.length} of ${results.length} sections returned records.`);
if (broken.length) {
  console.log("Needs attention:");
  for (const r of broken) console.log(`  ${r.portal} / ${r.section} — ${r.status === 200 ? "returned nothing" : `HTTP ${r.status}`} at ${r.path}${r.note ? ` (${r.note})` : ""}`);
  process.exitCode = 1;
}
