import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import GovShell, { GovField } from "../gov/GovShell.jsx";
import { ErrorNote } from "../../components/Primitives.jsx";

/**
 * Registering an institution — account and application in one step.
 *
 * The two-step version asked somebody to sign up as a resident and then find an
 * apply page. This creates the account and files the application together,
 * exactly as staff registration does.
 *
 * Expertise is the field that matters. Matching runs on it, so an institution
 * ticking everything matches everything and crowds out the ones that genuinely
 * fit — the form says so rather than letting somebody tick all twelve and
 * wonder why they were turned down.
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

const KINDS = [
  ["university", "University"],
  ["industry", "Company"],
  ["research", "Research body"],
  ["ngo", "NGO"],
];

export default function CampusRegister() {
  const [f, setF] = useState({
    fullName: "", email: "", password: "",
    institutionName: "", kind: "university", city: "", website: "",
    expertise: [], departments: "", statement: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (id) =>
    setF((p) => ({
      ...p,
      expertise: p.expertise.includes(id)
        ? p.expertise.filter((x) => x !== id)
        : [...p.expertise, id],
    }));

  const ready =
    f.fullName.trim().length >= 2 &&
    f.email.includes("@") &&
    f.password.length >= 8 &&
    f.institutionName.trim().length >= 4 &&
    f.expertise.length > 0 &&
    f.statement.trim().length >= 40;

  if (done) {
    return (
      <GovShell
        surface="campus"
      badge="Campus portal"
        title="Application sent"
        sub="A city administrator reads every application."
        footer={<Link to="/campus" className="link">Sign in</Link>}
      >
        <p className="prose">
          You will be notified either way. If it is approved, signing in takes you straight to
          your workspace — matched challenges, your projects, and the people in your institution.
        </p>
      </GovShell>
    );
  }

  return (
    <GovShell
      surface="campus"
      badge="Campus portal"
      title="Register your institution"
      sub="Universities, colleges and companies working on community challenges."
      points={[
        { title: "Register with your institutional address",
          body: "A personal account cannot be checked against the institution you are naming." },
        { title: "A city administrator reads it",
          body: "Approval is a real decision — you will see every open challenge afterwards." },
        { title: "Invite your own people",
          body: "Faculty and students join through you, not through the municipality." },
      ]}
      footer={<>Already registered? <Link to="/campus" className="link">Sign in</Link></>}
    >
      <form
        className="stack-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.registerInstitution({
              ...f,
              departments: f.departments.split(",").map((d) => d.trim()).filter(Boolean),
            });
            setDone(true);
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <GovField label="Your name" value={f.fullName} onChange={set("fullName")} />
        <GovField label="Email" type="email" value={f.email} onChange={set("email")} autoComplete="username" />
        <GovField
          label="Password"
          type="password"
          value={f.password}
          onChange={set("password")}
          hint="At least eight characters."
          autoComplete="new-password"
        />

        <GovField label="Institution" value={f.institutionName} onChange={set("institutionName")} />

        <div>
          {/* GovShell's body is dark. A plain Label and textarea inherit the
              light-theme text colour and come out near-invisible on it — which
              is why half this form could not be read. */}
          <span className="label" style={{ color: "var(--on-dark-2)" }}>Kind</span>
          <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
            {KINDS.map(([id, l]) => (
              <button
                key={id}
                type="button"
                className="choice choice--dark"
                aria-pressed={f.kind === id}
                onClick={() => set("kind")(id)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <GovField label="City" value={f.city} onChange={set("city")} />

        <div>
          <span className="label" style={{ color: "var(--on-dark-2)" }}>
            What you can actually work on
          </span>
          <p className="label" style={{ marginTop: 4, color: "var(--on-dark-2)" }}>
            Challenges are matched against these. Picking everything matches everything, which
            crowds out the institutions that genuinely fit.
          </p>
          <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
            {EXPERTISE.map((e) => (
              <button
                key={e.id}
                type="button"
                className="choice choice--dark"
                aria-pressed={f.expertise.includes(e.id)}
                onClick={() => toggle(e.id)}
              >
                {e.label}
              </button>
            ))}
          </div>
          {f.expertise.length >= 8 && (
            <p className="label" style={{ marginTop: "var(--s-2)", color: "var(--warn)" }}>
              That is {f.expertise.length} of 12. An approver will check it against your departments.
            </p>
          )}
        </div>

        <GovField
          label="Departments"
          value={f.departments}
          onChange={set("departments")}
          hint="Comma separated. Civil Engineering, Computer Science…"
        />

        <div>
          <span className="label" style={{ color: "var(--on-dark-2)" }}>Why your institution</span>
          <textarea
            className="input"
            rows={4}
            style={{
              marginTop: "var(--s-2)",
              background: "var(--ink-900)",
              borderColor: "var(--ink-line)",
              color: "var(--on-dark)",
            }}
            value={f.statement}
            onChange={(e) => set("statement")(e.target.value)}
            placeholder="What you have worked on before, and what you would bring to a community challenge."
          />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button className="btn btn--block" disabled={!ready || busy}>
          {busy ? "Sending…" : "Apply"}
        </button>
      </form>
    </GovShell>
  );
}
