export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what) => new HttpError(404, `${what} not found`);
export const badRequest = (msg, details) => new HttpError(400, msg, details);

/** Wraps async route handlers so rejected promises reach the error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Postgres schema errors that mean "a migration has not been run".
 *
 * These arrived as an opaque 500 with the reason only in the terminal — a
 * missing column reads as "the server is broken" in the browser when it
 * actually means one SQL file has not been applied. Naming it turns half an
 * hour of confusion into one obvious action.
 */
const SCHEMA_ERRORS = {
  "42703": "column",       // undefined_column
  "42P01": "table",        // undefined_table
  "22P02": "enum value",   // invalid_text_representation, usually a new enum label
};

/**
 * Postgres integrity codes that describe a correctable request rather than a
 * fault. Left as 500 they reached the browser as "Something went wrong on our
 * side", which says nothing a person could act on.
 */
const INTEGRITY_ERRORS = {
  // check_violation. The proposal workflow guards raise their own readable
  // message; a plain column constraint does not, and its text names internals.
  "23514": [400, (err) => (/violates check constraint/i.test(err.message) ? "That change is not allowed while the record is in this state." : err.message)],
  "23505": [409, () => "That record already exists."],                      // unique_violation
  "23503": [400, () => "That refers to a record which does not exist."],    // foreign_key_violation
  "23502": [400, () => "A required field was missing."],                    // not_null_violation
};

/** Upload failures are about the file somebody chose, not about the server. */
const MULTER_ERRORS = {
  LIMIT_FILE_SIZE: "That file is larger than the 15 MB limit.",
  LIMIT_UNEXPECTED_FILE: "That file was sent under an unexpected field name.",
  LIMIT_FILE_COUNT: "Only one file can be uploaded at a time.",
};

const isZodError = (err) => err?.name === "ZodError" && Array.isArray(err.issues);

/** "body.items.0.unitCost must be a number" — the field, not just "invalid". */
const zodDetails = (err) =>
  err.issues.map((issue) => ({
    field: issue.path.join(".") || "(body)",
    message: issue.message,
  }));

export function errorHandler(err, _req, res, _next) {
  // Zod throws a plain Error subclass with no status, so validation failures
  // used to fall through to the 500 branch — where console.error(err) itself
  // threw inside util.inspect and Express answered with an HTML error page.
  // The browser then had no JSON to read and every rejected form looked like a
  // silent failure.
  if (isZodError(err)) {
    const details = zodDetails(err);
    console.warn("[validation]", details);
    return res.status(400).json({ error: "Invalid request.", details });
  }

  if (err?.name === "MulterError") {
    console.warn("[upload]", err.code, err.field);
    return res.status(400).json({ error: MULTER_ERRORS[err.code] || "That file could not be accepted." });
  }

  const integrity = INTEGRITY_ERRORS[err.code];
  if (integrity && !err.status) {
    const [status, message] = integrity;
    console.warn("[integrity]", err.code, err.detail || err.message);
    return res.status(status).json({ error: message(err) });
  }

  const status = err.status || 500;
  // Never let logging an unexpected error become the error. Some libraries
  // attach getters that throw during inspection, which is how a 400 turned
  // into an unhandled crash.
  if (status >= 500) {
    try { console.error(err); } catch { console.error(err?.stack || String(err?.message || err)); }
  }

  if (SCHEMA_ERRORS[err.code]) {
    const what = SCHEMA_ERRORS[err.code];
    return res.status(500).json({
      error:
        `The database is missing a ${what} this feature needs — a migration has not been run. ` +
        `Check the [schema] line the server printed at startup, which names the file.`,
      detail: err.message,
      hint: "Run the outstanding migrations in supabase/migrations, in order.",
    });
  }

  // 500 stays opaque — it can carry stack traces and internals.
  //
  // 502 is different: it means a service *we* depend on failed, and the reason
  // is about them, not us. Hiding it meant every upstream failure looked
  // identical in the browser and could only be diagnosed from the terminal,
  // which cost far more time than the detail was ever worth protecting.
  const upstream = status === 502 || status === 503;

  res.status(status).json({
    error: status === 500 ? "Something went wrong on our side." : err.message,
    details: status < 500 || upstream ? err.details : undefined,
  });
}
