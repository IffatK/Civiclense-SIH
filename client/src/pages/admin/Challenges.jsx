import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Challenges raised from recurring problems, and who has applied.
 *
 * This page did not exist, which meant the applicants page it links to was
 * unreachable — an institution could put itself forward and no administrator
 * could ever see it, so nothing could ever be awarded. The whole innovation
 * path dead-ended at a route with nothing pointing at it.
 *
 * Ordered by how many residents are behind each one, not by date. A challenge
 * eleven people reported outranks a newer one reported by three.
 */
const STATUS = {
  open: { tone: "pending", label: "Open for proposals" },
  matched: { tone: "warn", label: "Applications in" },
  in_progress: { tone: "info", label: "Under way" },
  delivered: { tone: "ok", label: "Delivered" },
  closed: { tone: "pending", label: "Closed" },
};

export default function Challenges() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  const load = () => api.challenges(status).then(setData).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); }, [status]);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="Innovation ecosystem"
        title="Challenges"
        sub="Recurring problems raised from groups of reports. Universities and companies apply to take them on."
      />

      <div className="row row--wrap" style={{ gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
        {[["", "All"], ["open", "Open"], ["matched", "Applications in"],
          ["in_progress", "Under way"], ["delivered", "Delivered"]].map(([id, label]) => (
          <button key={label} className="choice" aria-pressed={status === id} onClick={() => setStatus(id)}>
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <SkeletonRows rows={4} height={150} />
      ) : data.challenges.length === 0 ? (
        <Empty
          icon={Icon.route}
          title="No challenges yet"
          body="Raise one from Groups & hotspots — any group of three or more reports can become a challenge."
          action={
            <button className="btn" onClick={() => navigate("/admin/clusters")}>
              Go to groups
            </button>
          }
        />
      ) : (
        <div className="stack">
          {data.challenges.map((c) => {
            const s = STATUS[c.status] || STATUS.open;

            return (
              <Panel
                key={c.ref}
                title={c.title}
                action={
                  <div className="row" style={{ gap: "var(--s-2)" }}>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {c.interested > 0 && (
                      <Badge tone="accent">
                        {c.interested} waiting on you
                      </Badge>
                    )}
                  </div>
                }
              >
                <p className="prose">{c.summary}</p>

                <div className="figures" style={{ marginTop: "var(--s-4)" }}>
                  <div className="figures__item">
                    <span className="figures__n">{c.reports_at_raise}</span>
                    <span className="figures__label">reports behind it</span>
                  </div>
                  <div className="figures__item">
                    <span className="figures__n">{c.residents_affected}</span>
                    <span className="figures__label">residents</span>
                  </div>
                  {c.interested > 0 && (
                    <div className="figures__item" data-alert="true">
                      <span className="figures__n">{c.interested}</span>
                      <span className="figures__label">institutions applied</span>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: "var(--s-4)" }}>
                  <Label>Needs</Label>
                  <div className="row row--wrap" style={{ gap: 6, marginTop: 6 }}>
                    {(c.needs || []).map((n) => (
                      <span key={n} className="ref">{n.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>

                <div className="row row--between row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
                  <span className="label">
                    <span className="ref">{c.ref}</span>
                    {c.ward && ` · ${c.ward}`}
                    {c.department && ` · ${c.department}`}
                  </span>

                  {/* The action that was unreachable. Only shown when somebody
                      has actually applied — a compare page with nothing to
                      compare is a dead end of its own. */}
                  {c.interested > 0 ? (
                    <button
                      className="btn btn--sm"
                      onClick={() => navigate(`/admin/challenges/${c.ref}/applicants`)}
                    >
                      Compare {c.interested} applicant{c.interested === 1 ? "" : "s"}
                    </button>
                  ) : c.project_ref ? (
                    <span className="label">Awarded · {c.project_ref}</span>
                  ) : (
                    <span className="label">Waiting for an institution to apply</span>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
