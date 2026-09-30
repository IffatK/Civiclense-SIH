import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { homeFor } from "../lib/auth-routing.js";

export default function ProtectedRoute({ roles, children }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div style={{ padding: "var(--sp-6)" }} className="label">Loading</div>;
  }
  if (!session) {
    // The whole location, not just the pathname. "/app/reports?status=open"
    // and "/app#following" both came back as "/app" before, so somebody sent
    // to sign in lost the filter or the section they were actually after.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/signin" replace state={{ from }} />;
  }
  if (roles && profile && !roles.includes(profile.role)) {
    return <Navigate to={homeFor(profile.role)} replace />;
  }
  return children;
}
