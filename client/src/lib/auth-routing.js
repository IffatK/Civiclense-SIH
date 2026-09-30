/** Routes users to the workspace permitted by their authenticated role. */
export const homeFor = (role) =>
  ({
    citizen: "/app",
    officer: "/officer",
    super_admin: "/admin",
    global_admin: "/admin",
    university_admin: "/campus/dashboard",
    faculty: "/campus/dashboard",
    student: "/campus/dashboard",
    industry_partner: "/campus/dashboard",
  }[role] || "/app");
