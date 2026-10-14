import { createClient } from "@supabase/supabase-js";
import { query } from "../db/pool.js";
import { HttpError, wrap } from "./errors.js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * The role hierarchy.
 *
 *   global_admin   city-wide. Appoints super admins. Seeded by hand.
 *        ↓ approves
 *   super_admin    one department. Appoints officers in that department.
 *        ↓ approves
 *   officer        field staff. Works assigned complaints.
 *
 *   citizen        reports issues. Never approved by anyone.
 *
 * Each tier appoints only the tier directly beneath it. A super admin cannot
 * create another super admin, and nobody can create a global admin through the
 * application — that one is a deliberate database action.
 */
/**
 * Municipal authority, ranked. requireMinRole compares against this.
 *
 * Institution roles are deliberately absent. They are not a rung on the
 * municipal ladder — a university admin does not outrank a ward officer, and
 * giving them a number would eventually let one stand in for the other. Routes
 * that serve institutions check institution_id and institution_role instead.
 */
export const ROLE_RANK = {
  citizen: 0,
  officer: 1,
  super_admin: 2,
  global_admin: 3,
};

/** Everyone who belongs to an institution rather than to the municipality. */
export const INSTITUTION_ROLES = ["university_admin", "faculty", "student", "industry_partner"];

export const isInstitutionUser = (role) => INSTITUTION_ROLES.includes(role);

export const ROLE_LABEL = {
  citizen: "resident",
  officer: "officer",
  super_admin: "department super admin",
  global_admin: "global super admin",
};

/** Who each role is allowed to approve. */
export const APPROVES = {
  global_admin: ["super_admin", "officer"],
  super_admin: ["officer"],
  officer: [],
  citizen: [],
};

export const canApprove = (actorRole, targetRole) =>
  (APPROVES[actorRole] || []).includes(targetRole);

export const rank = (role) => ROLE_RANK[role] ?? -1;

/**
 * Verifies the Supabase token, then reads the profile straight from Postgres.
 *
 * This used to go through PostgREST with an embedded `officers(department_id)`
 * join. When a user had no officers row the embed failed, the error was
 * discarded, and the role silently fell back to "citizen" — so a real global
 * admin got 403s with nothing in the logs to explain why. A plain LEFT JOIN has
 * no such failure mode, and a genuinely missing profile is now an explicit
 * error rather than a quiet demotion.
 */



export const requireAuth = wrap(async (req, _res, next) => {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  console.log("[auth debug]", {
    path: req.originalUrl,
    hasAuthorization: Boolean(authHeader),
    validBearerFormat: Boolean(match),
  });

  if (!token) {
    throw new HttpError(401, "Sign in to continue.");
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    console.error("[auth] Supabase token validation failed:", error?.message);
    throw new HttpError(401, "Your session has expired.");
  }

  // Keep your existing profile query, req.user assignment,
  // and next() here, unchanged.


  /**
   * Which department this person belongs to.
   *
   * Two columns can answer that. approve_staff_application() writes an officers
   * row for everyone it approves, super admins included, so officers is the
   * usual source — but profiles.department_id is set by other paths, and an
   * account that has one without the other used to resolve to no department at
   * all. That failed open rather than closed: every route computes its scope as
   * `role === 'global_admin' ? null : departmentId`, and a null departmentId is
   * indistinguishable from "city-wide", so a departmental super admin with no
   * officers row was shown every department's officers instead of their own.
   *
   * Officers wins where both are set, since that is what the approval flow
   * maintains; profiles is the fallback rather than nothing.
   */
  const { rows } = await query(
    `select p.id, p.role, p.full_name,
            coalesce(o.department_id, p.department_id) as department_id,
            o.active as officer_active, o.approved_at,
            coalesce(od.name, pd.name) as department_name
     from profiles p
     left join officers o on o.id = p.id
     left join departments od on od.id = o.department_id
     left join departments pd on pd.id = p.department_id
     where p.id = $1`,
    [data.user.id]
  );

  if (!rows[0]) {
    // The trigger on auth.users normally creates this. If it is missing the
    // account is genuinely broken, and pretending they are a citizen would hide
    // that until something failed further downstream.
    throw new HttpError(403, "Your profile has not been set up. Contact an administrator.");
  }

  const row = rows[0];

  req.user = {
    id: row.id,
    email: data.user.email,
    name: row.full_name,
    role: row.role,
    rank: rank(row.role),
    departmentId: row.department_id ?? null,
    departmentName: row.department_name ?? null,
    officerActive: row.officer_active ?? null,
    approvedAt: row.approved_at ?? null,
    approves: APPROVES[row.role] || [],
  };

  next();
});

/**
 * Identifies the caller if it can, and lets them through either way.
 *
 * The public feed is readable by anyone and personal to whoever is signed in —
 * the same card has to be able to say "you confirmed this" without the page
 * behind it becoming a private one. Two endpoints, one public and one
 * authenticated, would mean two queries that must stay in agreement, and they
 * would not.
 *
 * A bad or expired token is treated as no token rather than as an error. The
 * caller asked for a public page; a stale tab should show them the feed, not a
 * 401 on a page that never needed a session.
 */
export const optionalAuth = (req, res, next) => {
  if (!req.headers.authorization) return next();
  requireAuth(req, res, (err) => {
    if (err) req.user = undefined;
    next();
  });
};

/** Exact-role gate. Use when a route belongs to specific tiers, not a floor. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) {
    return next(
      new HttpError(
        403,
        `This needs ${roles.map((r) => ROLE_LABEL[r] || r).join(" or ")} access. ` +
          `You are signed in as a ${ROLE_LABEL[req.user?.role] || "user with no role"}.`
      )
    );
  }
  next();
};

/**
 * Floor gate — this tier and everything above it. Preferred for most admin
 * routes, so adding a tier later does not mean editing every route list.
 */
export const requireMinRole = (minimum) => (req, _res, next) => {
  if (rank(req.user?.role) < rank(minimum)) {
    return next(
      new HttpError(
        403,
        `This needs at least ${ROLE_LABEL[minimum]} access. ` +
          `You are signed in as a ${ROLE_LABEL[req.user?.role] || "user with no role"}.`
      )
    );
  }
  next();
};

/**
 * Blocks a staff account that exists but has not been authorised, and one that
 * has been suspended. Having the role is not the same as being allowed to act.
 */
export const requireApprovedStaff = (req, _res, next) => {
  if (req.user.rank < ROLE_RANK.officer) {
    return next(new HttpError(403, "This area is for approved staff."));
  }
  if (req.user.role === "global_admin") return next(); // seeded, never approved

  if (!req.user.approvedAt) {
    return next(new HttpError(403, "Your account is still awaiting approval."));
  }
  if (req.user.officerActive === false) {
    return next(new HttpError(403, "Your account is suspended. Contact your department."));
  }
  next();
};

/**
 * Enforces who may approve whom, and that a super admin only ever appoints
 * within their own department. Attach after loading the application row onto
 * `req.application`.
 */
export const requireApprovalRights = (req, _res, next) => {
  const application = req.application;
  if (!application) return next(new HttpError(500, "No application loaded."));

  if (!canApprove(req.user.role, application.requested_role)) {
    return next(
      new HttpError(
        403,
        `A ${ROLE_LABEL[req.user.role]} cannot approve a ${ROLE_LABEL[application.requested_role]}. ` +
          (req.user.role === "super_admin"
            ? "Super admin requests are decided by a global super admin."
            : "")
      )
    );
  }

  if (
    req.user.role === "super_admin" &&
    application.department_id !== req.user.departmentId
  ) {
    return next(new HttpError(403, "You can only approve officers in your own department."));
  }

  next();
};

/** Convenience gates used across the routes. */
export const requireOfficer = [requireAuth, requireMinRole("officer"), requireApprovedStaff];
export const requireAdmin = [requireAuth, requireMinRole("super_admin"), requireApprovedStaff];
export const requireGlobalAdmin = [requireAuth, requireRole("global_admin")];
