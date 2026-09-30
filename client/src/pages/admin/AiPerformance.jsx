import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * What the classifier gets wrong.
 *
 * Deliberately not a single accuracy figure. "69% accurate" is a number nobody
 * can act on, and it hides the only thing worth knowing: which categories are
 * unreliable and what they get confused with.
 *
 * Every row here comes from somebody who disagreed with the model while
 * standing in front of the thing. That is better evidence than any test set,
 * and it was being thrown away until now.
 */
const VERDICT = {
  reliable: "ok",
  "sometimes wrong": "warn",
  "often wrong": "danger",
  "too few to judge": "pending",
};

export default function AiPerformance() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.aiPerformance().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="Model"
        title="What the AI gets wrong"
        sub={data?.note}
      />

      {!data ? (
        <SkeletonRows rows={4} height={110} />
      ) : (
        <div className="stack">
          <Panel title="Models in use" list>
            {data.models.filter((m) => m.active).map((m) => (
              <div key={m.id} className="listrow">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>{m.name}</span>
                  <span className="label" style={{ display: "block" }}>{m.notes}</span>
                </span>
                <span className="label">{m.trained_on} images</span>
              </div>
            ))}
          </Panel>

          {/* The most useful panel. Ranked by how often somebody had to correct
              it, which is the same as ranked by what to photograph next. */}
          <Panel title="What to collect more photographs of">
            {data.priorities.length === 0 ? (
              <Empty
                icon={Icon.camera}
                title="No corrections yet"
                body="When a resident or officer corrects a classification, it appears here with what the model mistook it for."
              />
            ) : (
              <div className="scroll-x">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Category</th><th>Corrected</th>
                      <th>Usually mistaken for</th><th>Confidence when wrong</th>
                      <th>More images needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.priorities.map((p) => (
                      <tr key={p.category}>
                        <td data-label="Category"><strong>{p.category}</strong></td>
                        <td data-label="Corrected" className="mono">{p.corrections}×</td>
                        <td data-label="Mistaken for">{p.usually_mistaken_for || "—"}</td>
                        <td data-label="Confidence" className="mono">
                          {p.avg_confidence_when_wrong ?? "—"}%
                        </td>
                        <td data-label="Needed">
                          {p.images_still_needed > 0 ? (
                            <Badge tone="warn">{p.images_still_needed} more</Badge>
                          ) : (
                            <Badge tone="ok">enough</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="label" style={{ marginTop: "var(--s-4)" }}>
              High confidence on a wrong answer is worse than low confidence — it means the model
              is certain about something it has not learned.
            </p>
          </Panel>

          <Panel title="Per category">
            <div className="scroll-x">
              <table className="table table--stack">
                <thead>
                  <tr><th>Category</th><th>Predicted</th><th>Corrected</th><th>Accuracy</th><th></th></tr>
                </thead>
                <tbody>
                  {data.reliability.map((r) => (
                    <tr key={r.category}>
                      <td data-label="Category">{r.category}</td>
                      <td data-label="Predicted" className="mono">{r.predicted_times}</td>
                      <td data-label="Corrected" className="mono">{r.corrected_times}</td>
                      <td data-label="Accuracy" className="mono">
                        {r.accuracy_pct != null ? `${r.accuracy_pct}%` : "—"}
                      </td>
                      <td data-label="">
                        <Badge tone={VERDICT[r.verdict] || "pending"}>{r.verdict}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="label" style={{ marginTop: "var(--s-4)" }}>
              A category nobody has corrected is not necessarily accurate — it may simply be one
              nobody has reported yet. "Too few to judge" says so rather than showing 100%.
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
