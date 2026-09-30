import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import PublicHeader from "../../components/PublicHeader.jsx";
import { Label, ErrorNote, Badge, SkeletonRows } from "../../components/Primitives.jsx";

/**
 * Applying to work on challenges, and waiting for a decision.
 *
 * One page for both, because an applicant's question changes from "how do I
 * apply" to "what happened to my application" and a separate status page would
 * be somewhere they have to remember to look.
 *
 * Expertise is the important field: matching runs on it, so an institution
 * claiming all twelve areas would match every challenge and crowd out the ones
 * that genuinely fit. The page says so rather than letting somebody tick
 * everything and wonder why they were turned down.
 */
const EXPERTISE = [
  { id: "civil", label: "Civil engineering" },
  { id: "water", label: "Water" },
  { id: "drainage", label: "Drainage" },
  { id: "roads", label: "Roads" },
  { id: "waste", label: "Waste" },
  { id: "public_health", label: "Public health" },
  { id: "ai", label: "AI / vision" },
  { id: "iot", label: "Sensors / IoT" },
  { id: "gis", label: "Mapping / GIS" },
  { id: "data", label: "Data analysis" },
  { id: "hardware", label: "Hardware" },
  { id: "mobile", label: "Mobile / app" },
];

export default function Join() {
  const { session, profile } = useAuth();
  const [existing, setExisting] = useState(undefined);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    institutionName: "", kind: "university", city: "",
    expertise: [], departments: "", statement: "", role: "university_admin",
  });

  useEffect(() => {
    if (!session) return;
    api.myInstitutionApplication()
      .then((r) => setExisting(r.application))
      .catch(() => setExisting(null));
  }, [session]);

  // Already approved and attached — they belong in the workspace, not here.
  if (profile?.institution_id) return <Navigate to="/campus/dashboard" replace />;

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (id) =>
    setForm((f) => ({
      ...f,
      expertise: f.expertise.includes(id)
        ? f.expertise.filter((x) => x !== id)
        : [...f.expertise, id],
    }));

  const ready =
    form.institutionName.trim().length >= 4 &&
    form.expertise.length > 0 &&
    form.statement.trim().length >= 40;

  return (
    <>
      <PublicHeader />

      <main className="container" style={{ maxWidth: 720, padding: "var(--s-8) var(--s-5) var(--s-9)" }}>
        <div className="eyebrow">Universities and industry</div>
        <h1 className="display d-lg" style={{ marginTop: "var(--s-3)" }}>
          Work on real community problems
        </h1>
        <p className="lede" style={{ marginTop: "var(--s-4)" }}>
          Challenges here come from problems residents actually reported, repeatedly. Your
          institution can take one on, form a team around it, and see what it changed.
        </p>

        {!session ? (
          <p className="prose" style={{ marginTop: "var(--s-6)" }}>
            <a href="/register" className="link">Create an account</a> first, then apply from here.
          </p>
        ) : existing === undefined ? (
          <div style={{ marginTop: "var(--s-6)" }}><SkeletonRows rows={1} height={90} /></div>
        ) : existing ? (
          <section className="sheet" style={{ marginTop: "var(--s-6)" }}>
            <div className="row row--between row--wrap" style={{ gap: "var(--s-3)" }}>
              <h2 className="h h-xl">{existing.institution_name}</h2>
              <Badge
                tone={
                  existing.status === "approved" ? "ok"
                  : existing.status === "rejected" ? "danger" : "pending"
                }
              >
                {existing.status === "pending" ? "waiting on a decision" : existing.status}
              </Badge>
            </div>

            <p className="prose" style={{ marginTop: "var(--s-4)" }}>
              {existing.status === "pending"
                ? "A city administrator reads every application. You will be notified either way."
                : existing.status === "approved"
                ? "Approved. Sign out and back in to reach your workspace."
                : existing.decision_note}
            </p>

            {existing.status === "rejected" && (
              <p className="label" style={{ marginTop: "var(--s-3)" }}>
                You can apply again with what that asks for.
              </p>
            )}
          </section>
        ) : (
          <form
            className="sheet"
            style={{ marginTop: "var(--s-6)" }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api.institutionApply({
                  ...form,
                  departments: form.departments.split(",").map((d) => d.trim()).filter(Boolean),
                });
                const r = await api.myInstitutionApplication();
                setExisting(r.application);
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span className="label">Institution</span>
              <input
                className="input"
                value={form.institutionName}
                onChange={(e) => set("institutionName")(e.target.value)}
                placeholder="Institute of Technology, Mumbai"
              />
            </label>

            <div className="field">
              <span className="label">Kind</span>
              <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                {[["university", "University"], ["industry", "Company"], ["research", "Research body"], ["ngo", "NGO"]]
                  .map(([id, l]) => (
                    <button
                      key={id}
                      type="button"
                      className="choice"
                      aria-pressed={form.kind === id}
                      onClick={() => setForm((f) => ({
                        ...f,
                        kind: id,
                        role: id === "industry" ? "industry_partner" : "university_admin",
                      }))}
                    >
                      {l}
                    </button>
                  ))}
              </div>
            </div>

            <label className="field">
              <span className="label">City</span>
              <input className="input" value={form.city} onChange={(e) => set("city")(e.target.value)} />
            </label>

            <div className="field">
              <span className="label">What you can actually work on</span>
              <p className="label" style={{ marginTop: 4 }}>
                Challenges are matched against these. Picking everything matches everything,
                which crowds out the institutions that genuinely fit — so pick what you would
                take on.
              </p>
              <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
                {EXPERTISE.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="choice"
                    aria-pressed={form.expertise.includes(e.id)}
                    onClick={() => toggle(e.id)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
              {form.expertise.length >= 8 && (
                <p className="label" style={{ marginTop: "var(--s-2)", color: "var(--warn)" }}>
                  That is {form.expertise.length} of 12. An approver will check it against your
                  departments.
                </p>
              )}
            </div>

            <label className="field">
              <span className="label">Departments</span>
              <input
                className="input"
                value={form.departments}
                onChange={(e) => set("departments")(e.target.value)}
                placeholder="Civil Engineering, Computer Science, Electronics"
              />
            </label>

            <label className="field">
              <span className="label">Why your institution</span>
              <textarea
                className="input"
                rows={5}
                value={form.statement}
                onChange={(e) => set("statement")(e.target.value)}
                placeholder="What you have worked on before, and what you would bring to a community challenge."
              />
            </label>

            {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}

            <button className="btn" style={{ marginTop: "var(--s-5)" }} disabled={!ready || busy}>
              {busy ? "Sending…" : "Apply"}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
