import { useState } from "react";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, PageHead, Meter,
} from "../../components/Primitives.jsx";

/**
 * Two reports, side by side, with every factor scored separately.
 *
 * The composite is what the system acts on; the breakdown is what makes the
 * decision arguable. A single number invites nobody to ask what it is a number
 * of — "40 metres apart, same category, 3 of 64 image bits different" can be
 * checked against the actual photographs in about ten seconds.
 *
 * The bands are printed with what each one does. A threshold nobody can see is
 * a threshold nobody can challenge.
 */
const BAND = {
  near_certain: { tone: "ok", label: "Near certain" },
  probable: { tone: "info", label: "Probable" },
  possible: { tone: "warn", label: "Possible" },
  unrelated: { tone: "pending", label: "Unrelated" },
};

export default function DuplicateTest() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function compare(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.compareReports(a.trim(), b.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const band = result && (BAND[result.band] || BAND.unrelated);

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="Duplicate detection"
        title="Compare two reports"
        sub="Every factor scored separately, so a grouping decision can be checked rather than trusted."
      />

      <form onSubmit={compare} className="sheet">
        <div className="row row--wrap" style={{ gap: "var(--s-4)", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="label">First report</span>
            <input className="input" value={a} onChange={(e) => setA(e.target.value)} placeholder="CP-12" />
          </label>
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="label">Second report</span>
            <input className="input" value={b} onChange={(e) => setB(e.target.value)} placeholder="CP-14" />
          </label>
          <button className="btn" disabled={busy || !a.trim() || !b.trim()}>
            {busy ? "Comparing…" : "Compare"}
          </button>
        </div>

        {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
      </form>

      {result && (
        <>
          <Panel
            title="Result"
            action={<Badge tone={band.tone}>{band.label}</Badge>}
            style={{ marginTop: "var(--s-5)" }}
          >
            <div className="row row--between" style={{ marginBottom: "var(--s-3)" }}>
              <span className="label">Composite score</span>
              <span className="num" style={{ fontSize: "var(--t-xl)" }}>{result.total}</span>
            </div>
            <Meter value={result.total} tone={band.tone === "ok" ? "ok" : band.tone} />

            <div className="scroll-x" style={{ marginTop: "var(--s-5)" }}>
              <table className="table table--stack">
                <thead>
                  <tr><th>Factor</th><th>First</th><th>Second</th><th>Score</th><th>Weight</th><th>Adds</th></tr>
                </thead>
                <tbody>
                  {result.factors.map((f) => (
                    <tr key={f.factor}>
                      <td data-label="Factor"><strong>{f.factor}</strong></td>
                      <td data-label="First">{f.a_value || "—"}</td>
                      <td data-label="Second">{f.b_value || "—"}</td>
                      <td data-label="Score" className="mono">{f.score}</td>
                      <td data-label="Weight" className="mono">{f.weight}</td>
                      <td data-label="Adds" className="mono">{f.contributes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="label" style={{ marginTop: "var(--s-4)" }}>
              Location and category carry three quarters of the decision, because they are the
              two things every report has. Image and text are corroboration — a report with no
              photograph hash and no description still groups correctly on the first two.
            </p>
          </Panel>

          <Panel title="What each band does" list style={{ marginTop: "var(--s-5)" }}>
            {result.bands.map((b) => (
              <div key={b.id} className="listrow">
                <Badge tone={BAND[b.id].tone}>{b.label}</Badge>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="label">{b.from} and above</span>
                </span>
                <span style={{ fontSize: "var(--t-sm)" }}>{b.action}</span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}
