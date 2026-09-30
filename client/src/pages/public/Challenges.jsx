import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import PublicHeader from "../../components/PublicHeader.jsx";
import PublicShell from "../../components/public/Shell.jsx";
import { LoadFailed, Nothing, ago } from "../../components/public/bits.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Challenges — the problems that outgrew being fixed.
 *
 * The complaint workflow ends when an officer patches something, which is right
 * for a pothole and wrong for the fourth pothole on the same stretch this year.
 * A challenge is raised *from* reports that already exist, so every card here
 * carries the evidence it inherited: how many residents, over how long.
 *
 * The count is the point and is shown first. A challenge nobody reported is a
 * research topic, and the number is what lets a reader tell the difference
 * without taking anybody's word for it.
 */

const STATE = {
  open: { label: "Open for proposals", tone: "warn" },
  matched: { label: "Team selected", tone: "info" },
  in_progress: { label: "Being worked on", tone: "info" },
  delivered: { label: "Delivered", tone: "ok" },
  closed: { label: "Closed", tone: "pending" },
};

const TABS = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "delivered", label: "Delivered" },
];

export default function Challenges() {
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    api.publicChallenges(status).then(setData).catch((e) => setError(e.message));
  }, [status]);

  useEffect(load, [load]);

  return (
    <>
      <PublicHeader />

      <PublicShell>
        <header className="explore__head">
          <h1 className="explore__title">Problems the city is trying to solve</h1>
          <p className="explore__sub">
            When the same issue keeps coming back, patching it again is maintenance — the
            recurrence is the actual problem. These are the ones raised as challenges, each from
            reports residents already filed.
          </p>
        </header>

        <div className="chips" style={{ marginBottom: "var(--s-5)" }}>
          {TABS.map((t) => (
            <button key={t.label} className="chip" aria-pressed={status === t.id} onClick={() => setStatus(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {error ? (
          <LoadFailed what="challenges" detail={error} onRetry={load} />
        ) : !data ? (
          <div className="stack" style={{ gap: "var(--s-4)" }}>
            {[0, 1, 2].map((i) => (
              <span key={i} className="skel" style={{ height: 132, display: "block", borderRadius: "var(--r-lg)" }} />
            ))}
          </div>
        ) : data.challenges.length === 0 ? (
          <Nothing
            title="No challenges here yet"
            body="Challenges are raised once a pattern of reports is clear. Reports come first."
            action={<Link to="/reports" className="btn btn--sm">Explore reported issues</Link>}
          />
        ) : (
          <div className="stack" style={{ gap: "var(--s-4)" }}>
            {data.challenges.map((c) => {
              const s = STATE[c.status] || STATE.open;
              return (
                <Link key={c.ref} to={`/challenges/${c.ref}`} className="chal">
                  <div className="chal__top">
                    <span className="dotstat" data-tone={s.tone}>
                      <i aria-hidden="true" />
                      {s.label}
                    </span>
                    <span className="ref ref--plain">{c.ref}</span>
                  </div>

                  <h2 className="chal__title">{c.title}</h2>
                  <p className="chal__summary">{c.summary}</p>

                  <div className="chal__figures">
                    <span>
                      <b>{c.reports_at_raise}</b> reports behind it
                    </span>
                    {c.residents_affected > 0 && (
                      <span>
                        <b>{c.residents_affected}</b> residents
                      </span>
                    )}
                    {c.ward && (
                      <span>
                        <Icon.pin width={13} height={13} /> {c.ward}
                      </span>
                    )}
                    <span className="chal__ago">raised {ago(c.raised_at)}</span>
                  </div>

                  {c.project_ref ? (
                    <p className="chal__work">
                      <Icon.bulb width={14} height={14} />
                      {c.institution} is working on it — {c.project_title}
                    </p>
                  ) : c.interested > 0 ? (
                    <p className="chal__work">
                      <Icon.people width={14} height={14} />
                      {c.interested} {c.interested === 1 ? "institution has" : "institutions have"} put
                      themselves forward
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </PublicShell>
    </>
  );
}
