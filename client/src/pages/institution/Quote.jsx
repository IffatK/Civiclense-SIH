import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Filing a quotation.
 *
 * The total is computed from the line items rather than typed. A figure that
 * disagrees with its own breakdown is the first thing an assessor queries, and
 * there is no reason to let an institution submit one.
 *
 * Exclusions are asked for directly, because it is the most useful field on any
 * quotation and the one nobody fills in unless the form insists. "We are not
 * doing the civil works" prevents an argument four months later.
 */
const CATEGORIES = [
  ["people", "People"],
  ["equipment", "Equipment"],
  ["materials", "Materials"],
  ["travel", "Travel"],
  ["software", "Software"],
  ["other", "Other"],
];

const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(n || 0);

export default function Quote() {
  const { ref } = useParams();
  const navigate = useNavigate();

  const [guide, setGuide] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState({
    title: "", approach: "", durationWeeks: 12,
    deliverables: [""], assumptions: "", exclusions: "",
  });
  const [items, setItems] = useState([
    { description: "", category: "people", quantity: 1, unit_cost: 0 },
  ]);

  useEffect(() => {
    api.proposalGuide(ref).then(setGuide).catch((e) => setError(e.message));
  }, [ref]);

  const total = items.reduce((n, i) => n + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0);
  const deliverables = f.deliverables.map((d) => d.trim()).filter(Boolean);

  const ready =
    f.title.trim().length >= 8 &&
    f.approach.trim().length >= 100 &&
    deliverables.length > 0 &&
    items.some((i) => i.description.trim() && Number(i.unit_cost) > 0);

  const setItem = (i, k, v) =>
    setItems((prev) => prev.map((it, n) => (n === i ? { ...it, [k]: v } : it)));

  return (
    <div className="fade-in">
      <PageHead
        eyebrow={<Link to="/work" className="link">← Challenges</Link>}
        title="Submit a quotation"
        sub={guide?.challenge?.title}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {!guide ? (
        <SkeletonRows rows={3} height={140} />
      ) : (
        <div className="stack">
          {/* What the assessment weighs, said before they write rather than
              after they are turned down. */}
          <Panel title="What the city assesses this on" list>
            {guide.assessed_on.map((a) => (
              <div key={a} className="listrow">
                <Icon.check width={15} height={15} />
                <span style={{ fontSize: "var(--t-sm)" }}>{a}</span>
              </div>
            ))}
          </Panel>

          <Panel title="The work">
            <label className="field">
              <span className="label">Title</span>
              <input
                className="input"
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="Campus flood early warning"
              />
            </label>

            {guide.sections.filter((s) => s.required).slice(0, 2).map((s) => (
              <p key={s.heading} className="label" style={{ marginTop: "var(--s-3)" }}>
                <strong>{s.heading}</strong> — {s.prompt}
              </p>
            ))}

            <label className="field" style={{ marginTop: "var(--s-3)" }}>
              <span className="label">Your approach</span>
              <textarea
                className="input"
                rows={7}
                value={f.approach}
                onChange={(e) => setF({ ...f, approach: e.target.value })}
                placeholder="What you think is wrong, how you would find out, and who would do it."
              />
              <span className="label" style={{ display: "block", marginTop: 4 }}>
                {f.approach.trim().length} characters — at least 100.
              </span>
            </label>

            <label className="field">
              <span className="label">How many weeks</span>
              <input
                className="input"
                type="number"
                min={1}
                max={104}
                style={{ width: 120 }}
                value={f.durationWeeks}
                onChange={(e) => setF({ ...f, durationWeeks: e.target.value })}
              />
            </label>
          </Panel>

          <Panel
            title="What the city gets"
            action={<Badge tone="pending">{deliverables.length} deliverables</Badge>}
          >
            {f.deliverables.map((d, i) => (
              <div key={i} className="row" style={{ gap: "var(--s-2)", marginTop: i ? "var(--s-2)" : 0 }}>
                <input
                  className="input"
                  value={d}
                  onChange={(e) =>
                    setF({ ...f, deliverables: f.deliverables.map((x, n) => (n === i ? e.target.value : x)) })
                  }
                  placeholder="Catchment model and report"
                />
                {f.deliverables.length > 1 && (
                  <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => setF({ ...f, deliverables: f.deliverables.filter((_, n) => n !== i) })}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            <button
              className="btn--quiet"
              style={{ marginTop: "var(--s-3)", padding: 0 }}
              onClick={() => setF({ ...f, deliverables: [...f.deliverables, ""] })}
            >
              + Add another
            </button>
          </Panel>

          <Panel
            title="Costs"
            action={<span className="num" style={{ fontSize: "var(--t-lg)" }}>{money(total)}</span>}
          >
            <div className="scroll-x">
              <table className="table table--stack">
                <thead>
                  <tr><th>What</th><th>Kind</th><th>Qty</th><th>Each</th><th>Line</th><th /></tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td data-label="What">
                        <input
                          className="input"
                          value={it.description}
                          onChange={(e) => setItem(i, "description", e.target.value)}
                          placeholder="Two students, 12 weeks"
                        />
                      </td>
                      <td data-label="Kind">
                        <select
                          className="input"
                          value={it.category}
                          onChange={(e) => setItem(i, "category", e.target.value)}
                        >
                          {CATEGORIES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                        </select>
                      </td>
                      <td data-label="Qty">
                        <input
                          className="input" type="number" min="0.01" step="0.5" style={{ width: 80 }}
                          value={it.quantity}
                          onChange={(e) => setItem(i, "quantity", e.target.value)}
                        />
                      </td>
                      <td data-label="Each">
                        <input
                          className="input" type="number" min="0" style={{ width: 120 }}
                          value={it.unit_cost}
                          onChange={(e) => setItem(i, "unit_cost", e.target.value)}
                        />
                      </td>
                      <td data-label="Line" className="mono">
                        {money((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0))}
                      </td>
                      <td>
                        {items.length > 1 && (
                          <button
                            className="btn--quiet"
                            onClick={() => setItems(items.filter((_, n) => n !== i))}
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              className="btn--quiet"
              style={{ marginTop: "var(--s-3)", padding: 0 }}
              onClick={() =>
                setItems([...items, { description: "", category: "other", quantity: 1, unit_cost: 0 }])
              }
            >
              + Add a line
            </button>

            <p className="label" style={{ marginTop: "var(--s-4)" }}>
              The total is worked out from these lines. A quotation that shows its working is
              worth more than a round number — an assessor can question a line and cannot
              question a total.
            </p>
          </Panel>

          <Panel title="Assumptions and exclusions">
            <label className="field">
              <span className="label">What you are assuming</span>
              <textarea
                className="input" rows={3}
                value={f.assumptions}
                onChange={(e) => setF({ ...f, assumptions: e.target.value })}
                placeholder="Site access during working hours; ward office provides drainage plans."
              />
            </label>

            <label className="field">
              <span className="label">What you are not doing</span>
              <textarea
                className="input" rows={3}
                value={f.exclusions}
                onChange={(e) => setF({ ...f, exclusions: e.target.value })}
                placeholder="Civil works, permanent installation, ongoing maintenance beyond the pilot."
              />
              <span className="label" style={{ display: "block", marginTop: 4 }}>
                The most useful line on any quotation. Saying it now prevents an argument in
                four months.
              </span>
            </label>
          </Panel>

          <div className="row row--between row--wrap" style={{ gap: "var(--s-3)" }}>
            <span className="label">
              {money(total)} over {f.durationWeeks} weeks ·{" "}
              {money(total / Math.max(1, Number(f.durationWeeks)))} per week
            </span>

            <button
              className="btn"
              disabled={!ready || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api.submitQuotation({
                    challengeRef: ref,
                    ...f,
                    deliverables,
                    items: items.filter((i) => i.description.trim()),
                  });
                  navigate("/work/quotations");
                } catch (e) {
                  setError(e.message);
                  setBusy(false);
                }
              }}
            >
              {busy ? "Submitting…" : "Submit quotation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
