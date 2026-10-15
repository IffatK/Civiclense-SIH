
// server/index.js

// Load environment variables before modules that read process.env.
import "dotenv/config";
import { checkEnvironment } from "./config.js";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import me from "./routes/me.js";
import complaints from "./routes/complaints.js";
import clusters from "./routes/clusters.js";
import zones from "./routes/zones.js";
import publicRoutes from "./routes/public.js";
import challenges from "./routes/challenges.js";
import projects from "./routes/projects.js";
import institutions from "./routes/institutions.js";
import quotations from "./routes/quotations.js";
import geo from "./routes/geo.js";
import officer from "./routes/officer.js";
import officers from "./routes/officers.js";
import contracts from "./routes/contracts.js";
import admin from "./routes/admin.js";
import assistant from "./routes/assistant.js";
import audit from "./routes/audit.js";
import notifications from "./routes/notifications.js";
import metrics from "./routes/analytics.js";
import insights from "./routes/insights.js";
import reports from "./routes/reports.js";
import review from "./routes/review.js";
import agent from "./routes/agent.js";
import staff from "./routes/staff.js";
import categories from "./routes/categories.js";
import followups from "./routes/followups.js";
import campus from "./routes/campus.js";

import { errorHandler } from "./middleware/errors.js";
import { startScheduler } from "./jobs/scheduler.js";
import { aiProvider } from "./services/ai/index.js";
import { checkSchema } from "./db/schema-check.js";

// Validate required environment variables.
checkEnvironment();

const app = express();

app.set("trust proxy", 1);

// --------------------------------------------------
// SECURITY
// --------------------------------------------------

app.use(helmet());

// --------------------------------------------------
// CORS
// --------------------------------------------------

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://civiclense-sih.vercel.app",
  "https://civiclense-sih-git-main-iffatks-projects.vercel.app",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);

    // Allow matching Vercel preview deployments.
    return (
      url.protocol === "https:" &&
      /^civiclense-[a-z0-9-]+-iffatks-projects\.vercel\.app$/i.test(
        url.hostname
      )
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      console.error("[CORS] Rejected origin:", origin);

      return callback(
        new Error(`Origin not allowed by CORS: ${origin}`)
      );
    },
    credentials: true,
  })
);

// --------------------------------------------------
// RATE LIMITERS
// --------------------------------------------------

const standard = rateLimit({
  windowMs: 60_000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const ai = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

// --------------------------------------------------
// REQUEST PARSING
// --------------------------------------------------

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "CivicLense API",
  });
});

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

app.use("/api/me", standard, me);
app.use("/api/staff", standard, staff);
app.use("/api/categories", standard, categories);
app.use("/api/followups", standard, followups);

// AI classification has a stricter rate limit.
app.use("/api/complaints/analyse", ai);

// Keep this after the specific analyse route.
app.use("/api/complaints", standard, complaints);

app.use("/api/clusters", standard, clusters);
app.use("/api/zones", standard, zones);

// Public routes.
app.use("/api/public", standard, publicRoutes);

app.use("/api/challenges", standard, challenges);
app.use("/api/projects", standard, projects);
app.use("/api/institutions", standard, institutions);
app.use("/api/quotations", standard, quotations);
app.use("/api/campus", standard, campus);
app.use("/api/geo", standard, geo);
app.use("/api/officer", standard, officer);
app.use("/api/officers", standard, officers);
app.use("/api/contracts", standard, contracts);
app.use("/api/admin", standard, admin);
app.use("/api/audit", standard, audit);
app.use("/api/notifications", standard, notifications);

// Use the metrics path to avoid analytics-related ad-blocker filters.
app.use("/api/metrics", standard, metrics);

app.use("/api/review", standard, review);
app.use("/api/assistant", standard, assistant);
app.use("/api/insights", standard, insights);
app.use("/api/reports", standard, reports);

// Only starting an agent run gets this additional rate limit.
app.use(
  "/api/agent/run",
  rateLimit({
    windowMs: 60_000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/api/agent", standard, agent);

// --------------------------------------------------
// SUPABASE CONNECTIVITY DIAGNOSTIC
// --------------------------------------------------

app.get("/api/diagnostics/supabase", async (_req, res) => {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return res.status(503).json({
        reachable: false,
        error: "Supabase environment variables are missing.",
      });
    }

    const response = await fetch(`${url}/auth/v1/health`, {
      headers: {
        apikey: key,
      },
      signal: AbortSignal.timeout(10_000),
    });

    console.log("[supabase connectivity]", {
      status: response.status,
    });

    return res.status(200).json({
      reachable: true,
      supabaseStatus: response.status,
    });
  } catch (err) {
    console.error("[supabase connectivity]", {
      name: err?.name,
      message: err?.message,
      cause: err?.cause?.message,
      code: err?.cause?.code,
    });

    return res.status(503).json({
      reachable: false,
      error: "Could not connect to Supabase.",
    });
  }
});

// --------------------------------------------------
// UNKNOWN API ROUTES
// --------------------------------------------------

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "API endpoint not found.",
  });
});

// Keep the error handler after all routes.
app.use(errorHandler);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const port = Number(process.env.PORT) || 4000;

const server = app.listen(port, async () => {
  console.log(`CivicLense API listening on :${port}`);

  try {
    await checkSchema();
    console.log("[schema] schema check completed");
  } catch (err) {
    console.error("[schema] schema check failed:", {
      message: err?.message,
      stack: err?.stack,
    });
  }

  if (!aiProvider.configured) {
    console.warn(
      `[ai] ${aiProvider.label} has no API key — ` +
        "classification and briefs may be unavailable. " +
        "See docs/AI-PROVIDERS.md."
    );
  }

  if (process.env.RUN_JOBS !== "false") {
    try {
      startScheduler();
    } catch (err) {
      console.error("[scheduler] failed to start:", {
        message: err?.message,
        stack: err?.stack,
      });
    }
  }
});

server.on("error", (err) => {
  console.error("[server] failed:", {
    message: err?.message,
    code: err?.code,
    stack: err?.stack,
  });
});

export default app;
