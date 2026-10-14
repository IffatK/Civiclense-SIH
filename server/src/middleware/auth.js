
import { createClient } from "@supabase/supabase-js";
import { query } from "../db/pool.js";
import { HttpError, wrap } from "./errors.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("[auth] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(
  supabaseUrl || "http://127.0.0.1:54321",
  supabaseServiceRoleKey || "missing-service-role-key"
);

/**
 * Role hierarchy:
 *
 * global_admin -> appoints super admins
 * super_admin  -> appoints officers in their department
 * officer      -> field staff
 * citizen      -> reports issues
 *
 * A global admin must be created through a deliberate database action.
 */

export const ROLE_RANK = {
  citizen: 0,
  officer: 1,
  super_admin: 2,
  global_admin: 3,
};

/** Everyone who belongs to an institution rather than the municipality. */
export const INSTITUTION_ROLES = [
  "university_admin",
  "faculty",
  "student",
  "industry_partner",
];

export const isInstitutionUser = (role) =>
  INSTITUTION_ROLES.includes(role);

export const ROLE_LABEL = {
  citizen: "resident",
  officer: "officer",
  super_admin: "department super admin",
  global_admin: "global super admin",
};

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
 * Verifies the Supabase token, then reads the profile directly from Postgres.
 */
export const requireAuth = wrap(async (req, _res, next) => {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  console.log("[auth debug]", {
    path: req.originalUrl,
    hasAuthorization: Boolean(authHeader),
    validBearerFormat: Boolean(match),
    supabaseUrlConfigured: Boolean(supabaseUrl),
    serviceRoleKeyConfigured: Boolean(supabaseServiceRoleKey),
  });

  if (!token) {
    throw new HttpError(401, "Sign in to continue.");
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[auth] Supabase environment variables are missing.");
    throw new HttpError(
      503,
      "Authentication service is not configured."
    );
  }

  const { data, error } = await supabase.auth.getUser(token);

if (error || !data?.user) {
  console.error("[auth] Supabase validation failure:", {
    name: error?.name,
    message: error?.message,
    status: error?.status,
    cause: error?.cause?.message,
    causeCode: error?.cause?.code,
    originalError: error?.originalError?.message,
    originalErrorCode: error?.originalError?.cause?.code,
  });

  throw new HttpError(
    error?.status === 0 ? 503 : 401,
    error?.status === 0
      ? "Authentication service temporarily unavailable."
      : "Your session is invalid or expired."
  );
}

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
    throw new HttpError(
      403,
      "Your profile has not been set up. Contact an administrator."
    );
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
 * Identifies the caller if possible, allowing public access either way.
 * Invalid or expired tokens are treated as an anonymous user.
 */
export const optionalAuth = (req, res, next) => {
  if (!req.headers.authorization) return next();

  requireAuth(req, res, (err) => {
    if (err) {
      req.user = undefined;
    }

    next();
  });
};

/** Exact-role gate. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) {
    return next(
      new HttpError(
        403,
        `This needs ${roles.map((r) => ROLE_LABEL[r] || r).join(" or ")} access. ` +
          `You are signed in as a ${
            ROLE_LABEL[req.user?.role] || "user with no role"
          }.`
      )
    );
  }

  next();
};

/** Floor gate: this role and every role above it. */
export const requireMinRole = (minimum) => (req, _res, next) => {
  if (rank(req.user?.role) < rank(minimum)) {
    return next(
      new HttpError(
        403,
        `This needs at least ${ROLE_LABEL[minimum]} access. ` +
          `You are signed in as a ${
            ROLE_LABEL[req.user?.role] || "user with no role"
          }.`
      )
    );
  }

  next();
};

/** Blocks staff accounts that are pending approval or suspended. */
export const requireApprovedStaff = (req, _res, next) => {
  if (req.user.rank < ROLE_RANK.officer) {
    return next(
      new HttpError(403, "This area is for approved staff.")
    );
  }

  if (req.user.role === "global_admin") {
    return next();
  }

  if (!req.user.approvedAt) {
    return next(
      new HttpError(403, "Your account is still awaiting approval.")
    );
  }

  if (req.user.officerActive === false) {
    return next(
      new HttpError(
        403,
        "Your account is suspended. Contact your department."
      )
    );
  }

  next();
};

/**
 * Enforces approval permissions and department scope.
 * Attach after loading the application into req.application.
 */
export const requireApprovalRights = (req, _res, next) => {
  const application = req.application;

  if (!application) {
    return next(new HttpError(500, "No application loaded."));
  }

  if (!canApprove(req.user.role, application.requested_role)) {
    return next(
      new HttpError(
        403,
        `A ${ROLE_LABEL[req.user.role]} cannot approve a ${
          ROLE_LABEL[application.requested_role]
        }. ` +
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
    return next(
      new HttpError(
        403,
        "You can only approve officers in your own department."
      )
    );
  }

  next();
};

/** Convenience middleware groups used across routes. */
export const requireOfficer = [
  requireAuth,
  requireMinRole("officer"),
  requireApprovedStaff,
];

export const requireAdmin = [
  requireAuth,
  requireMinRole("super_admin"),
  requireApprovedStaff,
];

export const requireGlobalAdmin = [
  requireAuth,
  requireRole("global_admin"),
];
