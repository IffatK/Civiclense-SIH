import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import PublicHeader from "../../components/PublicHeader.jsx";
import PublicShell, { CityPulse } from "../../components/public/Shell.jsx";
import { LoadFailed, Nothing, ago } from "../../components/public/bits.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Community — everything that happened, across everything.
 *
 * Assembled from records that already exist rather than from a posts table.
 * A civic platform that grows its own free-text feed becomes a message board
 * with a council logo on it; every entry here is something that happened to a
 * report, a challenge or a project, and every one of them is a link to the
 * record it describes.
 *
 * The ordering is deliberate. Discussion first, because that is where residents
 * are talking to each other; resolutions second, because that is the city
 * answering; challenges and solutions last, because those move on a scale of
 * months and would otherwise sit at the top unchanged for weeks.
 */

const KIND = {
  corroborate: { label: "confirmed this", tone: "ok" },
  detail: { label: "added", tone: "info" },
  dispute: { label: "disputed", tone: "warn" },
  resolved_already: { label: "says it is already fixed", tone: "pending" },
};

export default function Community() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.communityFeed().then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <PublicHeader />

      <PublicShell>
        <header className="explore__head">
          <h1 className="explore__title">What’s happening in your neighbourhood?</h1>
          <p className="explore__sub">
            Residents confirming each other’s reports, departments closing them, and the
            university teams working on the problems that keep coming back.
          </p>
          <div className="explore__cta">
            <Link to={session ? "/app/report" : "/register"} className="btn btn--sm">
              <Icon.camera width={15} height={15} /> Report an issue
            </Link>
            <Link to="/reports" className="btn btn--sm btn--ghost">
              Explore the feed
            </Link>
          </div>
        </header>

        <CityPulse totals={data?.pulse} />

        {error ? (
          <LoadFailed what="community activity" detail={error} onRetry={load} />
        ) : !data ? (
          <div className="stack" style={{ gap: "var(--s-4)" }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="skel" style={{ height: 74, display: "block", borderRadius: "var(--r)" }} />
            ))}
          </div>
        ) : (
          <div className="stack" style={{ gap: "var(--s-6)" }}>
            {data.pulse?.this_week > 0 && (
              <p className="community__pulse">
                <b>{data.pulse.this_week}</b> reports filed in the last seven days.
              </p>
            )}

            <section>
              <h2 className="community__h">Residents are discussing</h2>
              {data.discussion.length === 0 ? (
                <Nothing
                  title="No discussion yet"
                  body="Confirming a neighbour’s report, or adding what the photograph does not show, starts one."
                />
              ) : (
                <ul className="stack" style={{ gap: "var(--s-3)" }}>
                  {data.discussion.map((c) => {
                    const k = KIND[c.kind] || KIND.detail;
                    return (
                      <li key={c.id}>
                        <Link to={`/reports/${c.ref}#discussion`} className="activity">
                          <span className="activity__face" aria-hidden="true">
                            {c.author ? c.author.slice(0, 1) : <Icon.user width={16} height={16} />}
                          </span>
                          <span className="activity__body">
                            <span className="activity__line">
                              <b>{c.author || "A resident"}</b> {k.label} on{" "}
                              <em>
                                {c.category}
                                {c.ward && ` in ${c.ward}`}
                              </em>
                              {c.is_official && <span className="activity__tag">ward officer</span>}
                            </span>
                            {c.body && <span className="activity__quote">“{c.body}”</span>}
                            <span className="activity__when">{ago(c.created_at)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {data.resolved.length > 0 && (
              <section>
                <h2 className="community__h">Recently resolved</h2>
                <ul className="stack" style={{ gap: "var(--s-2)" }}>
                  {data.resolved.map((r) => (
                    <li key={r.ref}>
                      <Link to={`/reports/${r.ref}`} className="minirow">
                        <span className="minirow__what">
                          <Icon.check width={14} height={14} /> {r.category} in {r.ward_name}
                        </span>
                        <span className="minirow__meta">
                          resolved {ago(r.resolved_at)}
                          {r.corroboration_count > 0 && ` · ${r.corroboration_count} had confirmed it`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.challenges.length > 0 && (
              <section>
                <h2 className="community__h">Challenges the city raised</h2>
                <ul className="stack" style={{ gap: "var(--s-2)" }}>
                  {data.challenges.map((c) => (
                    <li key={c.ref}>
                      <Link to={`/challenges/${c.ref}`} className="minirow">
                        <span className="minirow__what">
                          <Icon.flag width={14} height={14} /> {c.title}
                        </span>
                        <span className="minirow__meta">
                          {c.reports_at_raise} reports
                          {c.ward && ` · ${c.ward}`} · raised {ago(c.raised_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.solutions.length > 0 && (
              <section>
                <h2 className="community__h">University and industry teams</h2>
                <ul className="stack" style={{ gap: "var(--s-2)" }}>
                  {data.solutions.map((s) => (
                    <li key={s.ref}>
                      <Link to={`/solutions/${s.ref}`} className="minirow">
                        <span className="minirow__what">
                          <Icon.bulb width={14} height={14} /> {s.title}
                        </span>
                        <span className="minirow__meta">
                          {s.institution} · {String(s.stage).replace(/_/g, " ")} · solving “{s.challenge}”
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="community__foot">
              Everything above links to the record it describes. Nothing on this page is written
              here — it is what residents, officers and university teams did elsewhere in the
              product.
            </p>
          </div>
        )}
      </PublicShell>
    </>
  );
}
