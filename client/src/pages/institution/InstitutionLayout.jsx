import { Navigate } from "react-router-dom";
import { useAuth } from "../../lib/auth.jsx";
import AppShell from "../../components/AppShell.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * The workspace a university or company works in.
 *
 * Neither a public website nor a municipal dashboard. A faculty member arrives
 * with one question — what should we take on, and how is the work we already
 * took on going — so the navigation is four items and the first screen answers
 * both.
 *
 * It reuses AppShell rather than inventing a third chrome. Three visually
 * unrelated shells in one product is how an application stops feeling like one
 * product.
 */
const NAV = [
  { to: "/work", end: true, label: "Challenges", icon: Icon.route },
  { to: "/work/quotations", label: "Our quotations", icon: Icon.file },
  { to: "/work/projects", label: "Our projects", icon: Icon.clipboard },
  { to: "/work/team", label: "People", icon: Icon.user },
];

export default function InstitutionLayout() {
  const { profile, loading } = useAuth();

  if (loading) return <div className="label" style={{ padding: 40 }}>Loading</div>;

  // An account whose application has not been approved has no institution, and
  // an empty workspace would just look broken. Sending them to the application
  // page tells them where they actually are in the process.
  if (!profile?.institution_id) return <Navigate to="/join" replace />;

  return (
    // Wrapped rather than passed through, because AppShell has no surface prop
    // and adding one to a component three roles share would be the wrong place
    // for it.
    <div data-surface="campus" style={{ display: "contents" }}>
      {/* AppShell renders the Outlet itself, the way the citizen and admin
          layouts use it. Passing children instead would render nothing. */}
      <AppShell
      nav={NAV}
      scopeLabel={profile?.institution_role === "student" ? "Student" : "Institution"}
      searchPlaceholder="Search challenges…"
      tip={{
        title: "How matching works",
        body:
          "Challenges are ranked by how many of their needs your expertise covers. " +
          "Gaps are shown too — they are usually where an industry partner helps.",
      }}
    />
    </div>
  );
}
