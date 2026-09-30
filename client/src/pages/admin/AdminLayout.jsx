import AppShell from "../../components/AppShell.jsx";
import { Icon } from "../../components/Icons.jsx";
import { useAuth } from "../../lib/auth.jsx";

export default function AdminLayout() {
  const { profile } = useAuth();
  const isGlobal = profile?.role === "global_admin";
  const scopeLabel = isGlobal ? "Global super admin" : `${profile?.department_name || "Department"} super admin`;

  const nav = [
    // Grouped, because twenty flat items is a list nobody reads — the eye
    // stops at about seven. The groups are the four things an administrator
    // actually does here: watch the queue, run the innovation side, check the
    // machine, and manage the department.
    { group: "Today" },
    { to: "/admin", end: true, label: "Command centre", icon: Icon.grid },
    { to: "/admin/complaints", label: "Reports", icon: Icon.clipboard },
    { to: "/admin/clusters", label: "Groups & hotspots", icon: Icon.map },
    { to: "/admin/zones", label: "Work zones", icon: Icon.route },
    { to: "/admin/comments", label: "Comments", icon: Icon.file },

    { group: "Innovation" },
    { to: "/admin/challenges", label: "Challenges", icon: Icon.route },
    { to: "/admin/institutions", label: "Institutions", icon: Icon.building },
    { to: "/admin/proposals", label: "Proposal approvals", icon: Icon.file },

    { group: "The machine" },
    { to: "/admin/ai", label: "Model accuracy", icon: Icon.scan },
    { to: "/admin/duplicates", label: "Duplicate test", icon: Icon.search },
    { to: "/admin/review", label: "Image review", icon: Icon.camera },
    { to: "/admin/agent", label: "Operations agent", icon: Icon.sparkle },

    { group: "Department" },
    { to: "/admin/officers", label: "Officers", icon: Icon.user },
    { to: "/admin/staff", label: "Staff access", icon: Icon.shield },
    { to: "/admin/categories", label: "Categories", icon: Icon.file },
    { to: "/admin/contracts", label: "Contracts", icon: Icon.file },

    { group: "Records" },
    { to: "/admin/analytics", label: "Analytics", icon: Icon.trend },
    { to: "/admin/insights", label: "Today's brief", icon: Icon.bulb },
    { to: "/admin/ask", label: "Ask", icon: Icon.search },
    { to: "/admin/reports", label: "Reports", icon: Icon.file },
    { to: "/admin/audit", label: "Audit log", icon: Icon.shield },
  ];

  return (
    <AppShell
      nav={nav}
      scopeLabel={scopeLabel}
      searchPlaceholder="Search reports, wards, contracts…"
    />
  );
}
