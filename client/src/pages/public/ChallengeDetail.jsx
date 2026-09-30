import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import PublicHeader from "../../components/PublicHeader.jsx";
import { LoadFailed, ago, when } from "../../components/public/bits.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * One challenge, with its evidence and its answer.
 *
 * Read top to bottom this is the product's whole argument in one page: people
 * reported something, it kept happening, the city named it as a problem, a
 * university took it on, and here is what changed. Every step of it is a link
 * to the records underneath, because an argument nobody can check is a slogan.
 */

const STATE = {
  open: { label: "Open for proposals", tone: "warn" },
  matched: { label: "Team selected", tone: "info" },
  in_progress: { label: "Being worked on", tone: "info" },
  delivered: { label: "Delivered", tone: "ok" },
  closed: { label: "Closed", tone: "pending" },
};

const STAGE = {
  proposal: "Proposed",
  approved: "Approved",
  building: "Being built",
  pilot: "Pilot running",
  deployed: "Deployed",
};

export default function ChallengeDetail() {
  const { ref } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.publicChallenge(ref).then(setData).catch((e) => setError(e.message));
  }, [ref]);

  useEffect(() => { setData(null); load(); }, [load]);

  if (error) {
    return (
      <>
        <PublicHeader back={{ to: "/challenges", label: "All challenges" }} />
        <main className="container" style={{ maxWidth: 760, padding: "var(--s-7) var(--s-5)" }}>
          <LoadFailed what="this challenge" detail={error} onRetry={load} />
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PublicHeader back={{ to: "/challenges", label: "All challenges" }} />
        <main className="container" style={{ maxWidth: 760, padding: "var(--s-7) var(--s-5)" }} aria-busy="true">
          <span className="skel" style={{ height: 30, width: "70%", display: "block" }} />
          <span className="skel" style={{ height: 90, display: "block", marginTop: 20, borderRadius: "var(--r)" }} />
        </main>
      </>
    );
  }

  const c = data.challenge;
  const s = STATE[c.status] || STATE.open;
  const p = data.project;

  return (
    <>
      <PublicHeader back={{ to: "/challenges", label: "All challenges" }} />

      <main className="container lifecycle">
        <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
          <span className="ref">{c.ref}</span>
          <span className="dotstat" data-tone={s.tone}>
            <i aria-hidden="true" />
            {s.label}
          </span>
        </div>

        <h1 className="detail__title" style={{ marginTop: "var(--s-3)" }}>{c.title}</h1>
        <p className="detail__by">
          {[c.ward, c.category, c.department].filter(Boolean).join(" · ")} · raised {ago(c.raised_at)}
        </p>

        <p className="detail__text">{c.summary}</p>

        <div className="lifecycle__figures">
          <div>
            <b>{c.reports_at_raise}</b>
            <span>reports it was raised from</span>
          </div>
          <div>
            <b>{c.residents_affected}</b>
            <span>residents behind those reports</span>
          </div>
          {c.needs?.length > 0 && (
            <div>
              <b>{c.needs.length}</b>
              <span>disciplines it needs</span>
            </div>
          )}
        </div>

        {c.needs?.length > 0 && (
          <div className="chips" style={{ marginTop: "var(--s-4)" }}>
            {c.needs.map((n) => (
              <span key={n} className="chip" aria-disabled="true" style={{ textTransform: "capitalize" }}>
                {n.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        {/* Problem → solution, in that order and on one page. */}
        {p && (
          <section className="dcard dcard--accent" style={{ marginTop: "var(--s-6)" }}>
            <p className="dcard__eyebrow">Being solved by</p>
            <h2 className="dcard__lead">{p.title}</h2>
            <p className="dcard__note">
              {p.institution}
              {p.partner && ` with ${p.partner}`}
              {p.team_size > 0 && ` · ${p.team_size}-person team`}
              {` · ${STAGE[p.stage] || p.stage}`}
            </p>

            {p.approach && <p className="detail__text" style={{ marginTop: "var(--s-3)" }}>{p.approach}</p>}

            {p.stage === "deployed" && p.complaints_closed > 0 && (
              <p className="dcard__note" style={{ marginTop: "var(--s-3)" }}>
                <b>{p.complaints_closed}</b> fewer reports since it was deployed
                {p.deployed_at && ` in ${when(p.deployed_at)}`}.
              </p>
            )}

            <Link to={`/solutions/${p.ref}`} className="btn btn--sm btn--ghost" style={{ marginTop: "var(--s-4)" }}>
              View solution <Icon.arrow width={14} height={14} />
            </Link>
          </section>
        )}

        <section className="dcard" style={{ marginTop: "var(--s-5)" }}>
          <h2 className="dcard__title">
            The reports behind it
            <span className="dcard__count">
              {data.reports.length} shown of {c.reports_at_raise}
            </span>
          </h2>

          {data.reports.length === 0 ? (
            <p className="dcard__empty">
              The reports this was raised from are no longer in the public record.
            </p>
          ) : (
            <ul className="stack" style={{ gap: "var(--s-2)" }}>
              {data.reports.map((r) => (
                <li key={r.ref}>
                  <Link to={`/reports/${r.ref}`} className="minirow">
                    <span className="minirow__what">
                      {r.category} in {r.ward_name}
                    </span>
                    <span className="minirow__meta">
                      {ago(r.created_at)}
                      {r.corroboration_count > 0 && ` · ${r.corroboration_count} confirmed`}
                      {r.overdue && " · overdue"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!p && (
          <p className="lifecycle__foot">
            No institution has taken this on yet. Universities and industry partners can apply
            through the <Link to="/campus" className="link">campus portal</Link>.
          </p>
        )}
      </main>
    </>
  );
}
