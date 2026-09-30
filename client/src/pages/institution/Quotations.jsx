import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, ErrorNote, SkeletonRows, PageHead, Empty,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Quotations this institution has submitted, and what happened to them.
 *
 * The count of competing bids is shown on each one. An institution that loses
 * three times against six bidders is in a different position from one that
 * loses three times against one, and hiding that would leave them guessing at
 * why.
 */
const STATUS = {
  submitted: { tone: "pending", label: "With the city" },
  shortlisted: { tone: "info", label: "Shortlisted" },
  accepted: { tone: "ok", label: "Awarded" },
  declined: { tone: "danger", label: "Not chosen" },
  withdrawn: { tone: "pending", label: "Withdrawn" },
};

const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
    .format(n || 0);

export default function Quotations() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.myQuotations().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead title="Our quotations" sub="What you have bid for, and where each one stands." />

      {!data ? (
        <SkeletonRows rows={3} height={110} />
      ) : data.quotations.length === 0 ? (
        <Empty
          icon={Icon.file}
          title="No quotations yet"
          body="Pick a challenge that matches your expertise and submit a quotation. The city compares them on cost, duration and what you deliver."
        />
      ) : (
        <div className="stack">
          {data.quotations.map((q) => {
            const s = STATUS[q.status] || STATUS.submitted;

            return (
              <Panel
                key={q.ref}
                title={q.title}
                action={<Badge tone={s.tone}>{s.label}</Badge>}
              >
                <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
                  For: {q.challenge}
                </p>

                <div className="figures" style={{ marginTop: "var(--s-4)" }}>
                  <div className="figures__item">
                    <span className="figures__n">{money(q.total_cost)}</span>
                    <span className="figures__label">quoted</span>
                  </div>
                  <div className="figures__item">
                    <span className="figures__n">{q.duration_weeks}</span>
                    <span className="figures__label">weeks</span>
                  </div>
                  {q.competing > 1 && (
                    <div className="figures__item">
                      <span className="figures__n">{q.competing}</span>
                      <span className="figures__label">institutions bidding</span>
                    </div>
                  )}
                </div>

                {q.decision_note && (
                  <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-4)" }}>
                    <strong>The city said: </strong>{q.decision_note}
                  </p>
                )}

                <p className="label" style={{ marginTop: "var(--s-4)" }}>
                  <span className="ref">{q.ref}</span> · submitted{" "}
                  {new Date(q.submitted_at).toLocaleDateString()}
                </p>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
