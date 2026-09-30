import { Link } from "react-router-dom";
import { Icon } from "../../components/Icons.jsx";

/**
 * A visually distinct entrance for staff.
 *
 * Deliberately not the resident sign-in with an extra checkbox. Someone landing
 * here should be able to tell within a second that this is the official portal
 * and not the public app — dark, sparse, and stating the access rule up front
 * rather than after a failed submission.
 */
export default function GovShell({
  title, sub, children, footer,
  badge = "Government portal",
  surface,
  points,
}) {
  return (
    <div data-surface={surface} className="portal on-dark">
      {/* The left panel says what this portal is for. A form alone on a black
          field is a login box; somebody arriving at a URL they were sent needs
          to know whose door this is before they type anything. */}
      <aside className="portal__aside">
        <span className="portal__grid" aria-hidden="true" />

        <div className="portal__body">
          <Link to="/" className="row" style={{ gap: 10, textDecoration: "none" }}>
            <span
              style={{
                width: 34, height: 34, borderRadius: 9, background: "var(--accent)",
                color: "#fff", display: "grid", placeItems: "center",
                fontFamily: "var(--display)", fontWeight: 800, fontSize: 13,
              }}
            >
              CP
            </span>
            <span className="display" style={{ fontSize: 17, color: "#fff" }}>CivicLense</span>
          </Link>

          <span className="portal__eyebrow" style={{ marginTop: "var(--s-7)" }}>
            <Icon.shield width={13} height={13} /> {badge}
          </span>

          <h1 className="portal__title">{title}</h1>
          {sub && <p className="portal__lede">{sub}</p>}

          {/* The sequence somebody is about to take part in, not a feature list.
              Numbered because it genuinely is a sequence. */}
          {points?.length > 0 && (
            <div className="portal__points">
              {points.map((p, i) => (
                <div key={p.title} className="portal__point">
                  <i>{i + 1}</i>
                  <span>
                    <b>{p.title}</b>
                    <span>{p.body}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="portal__foot">
          Residents report issues at <Link to="/" className="link">the public app</Link>.
        </p>
      </aside>

      <main className="portal__main">
        <div className="portal__form">
          {children}
          {footer && (
            <p style={{ marginTop: "var(--s-6)", fontSize: "var(--t-sm)", color: "var(--on-dark-2)" }}>
              {footer}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export function GovField({ label, value, onChange, hint, ...rest }) {
  return (
    <label className="field" style={{ display: "block" }}>
      <span className="label" style={{ color: "var(--on-dark-2)" }}>{label}</span>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}
        {...rest}
      />
      {hint && (
        <span style={{ display: "block", marginTop: 6, fontSize: "var(--t-xs)", color: "var(--on-dark-2)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function GovSelect({ label, value, onChange, children }) {
  return (
    <label className="field" style={{ display: "block" }}>
      <span className="label" style={{ color: "var(--on-dark-2)" }}>{label}</span>
      <select
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--ink-900)", borderColor: "var(--ink-line)", color: "var(--on-dark)" }}
      >
        {children}
      </select>
    </label>
  );
}
