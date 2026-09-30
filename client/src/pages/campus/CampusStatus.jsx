import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import GovShell from "../gov/GovShell.jsx";
import { Badge, ErrorNote, Loading } from "../../components/Primitives.jsx";

/** A live approval state, not a dead end that asks users to sign out. */
export default function CampusStatus() {
  const { profile, refresh } = useAuth();
  const [app, setApp] = useState(undefined); const [error, setError] = useState(null);
  const check = async () => { try { await refresh(); const r = await api.myInstitutionApplication(); setApp(r.application); } catch (e) { setError(e.message); } };
  useEffect(() => { check(); }, []);
  if (profile?.institution_id && profile?.institution_approved) return <Navigate to="/campus/dashboard" replace />;
  if (app === undefined) return <Loading label="Checking university access" />;
  if (error) return <ErrorNote onRetry={check}>{error}</ErrorNote>;
  const rejected = app?.status === "rejected";
  return <GovShell surface="campus" badge="Campus portal" title={rejected ? "Application declined" : "University approval pending"} sub={app?.institution_name || "Institution access"}>
    <Badge tone={rejected ? "danger" : "warn"}>{app?.status || "No application"}</Badge>
    <p className="prose" style={{color:"var(--on-dark-2)",marginTop:14}}>{rejected ? (app.decision_note || "No reason was provided. Contact the city administrator.") : "An administrator is validating this institution. This page checks your current access; once approved, Continue opens the Campus Workspace without signing out."}</p>
    <div className="row" style={{gap:10,marginTop:24}}><button className="btn" onClick={check}>Check access again</button><Link className="btn btn--ghost-dark" to="/">Return home</Link></div>
  </GovShell>;
}
