import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import PublicHeader from "../../components/PublicHeader.jsx";
import { LoadFailed, Nothing } from "../../components/public/bits.jsx";
import { Icon, CATEGORY_ICON } from "../../components/Icons.jsx";

/**
 * What came of what residents reported.
 *
 * The feed ends at "fixed", which is the right ending for a pothole. This page
 * is for the problems that kept coming back until somebody built something —
 * the argument that separates a civic platform from a complaint form.
 *
 * Every card names the problem before it names the work. A solution shown
 * without its problem is a research output; shown with it, it is an answer, and
 * the reader can follow the link and check that the problem was real.
 */

const STAGES = {
  proposal: { label: "Proposed", tone: "pending" },
  approved: { label: "Approved", tone: "info" },
  building: { label: "Being built", tone: "info" },
  pilot: { label: "Pilot running", tone: "warn" },
  deployed: { label: "Deployed", tone: "ok" },
};

export default function Solutions() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.solutions().then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  return (
    <>
      <PublicHeader />

      <main className="container showcase">
        <header className="explore__head explore__head--center">
          <h1 className="explore__title">Solutions from the community</h1>
          <p className="explore__sub">
            Some problems need more than a quick fix. These are the ones students, universities
            and industry partners took on — what they built, and what it changed.
          </p>
        </header>

        {error ? (
          <LoadFailed what="solutions" detail={error} onRetry={load} />
        ) : !data ? (
          <div className="showcase__grid">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skel" style={{ height: 320, display: "block", borderRadius: "var(--r-lg)" }} />
            ))}
          </div>
        ) : data.solutions.length === 0 ? (
          <Nothing
            title="No solution projects yet"
            body="Recurring problems appear here when a university or industry partner takes one up. Reports come first — a challenge nobody reported is a research topic, not a civic one."
            action={<Link to="/reports" className="btn btn--sm">Explore reported issues</Link>}
          />
        ) : (
          <div className="showcase__grid">
            {data.solutions.map((s) => {
              const stage = STAGES[s.stage] || STAGES.proposal;
              const Mark = CATEGORY_ICON[s.category] || Icon.bulb;

              return (
                <Link key={s.ref} to={`/solutions/${s.ref}`} className="sol">
                  {/* No photographs of prototypes exist in the record, so the
                      card draws its own mark from the category rather than
                      reserving space for an image that will never arrive. */}
                  <div className="sol__mark" aria-hidden="true">
                    <Mark width={30} height={30} />
                  </div>

                  <div className="sol__body">
                    <span className="dotstat" data-tone={stage.tone}>
                      <i aria-hidden="true" />
                      {stage.label}
                    </span>

                    <h2 className="sol__title">{s.title}</h2>

                    <p className="sol__problem">
                      <span>Solving</span>
                      {s.challenge}
                    </p>

                    <p className="sol__by">
                      {s.institution}
                      {s.partner && ` with ${s.partner}`}
                    </p>

                    <div className="sol__figures">
                      <span>
                        <b>{s.reports_at_raise}</b> reports behind it
                      </span>
                      {s.team_size > 0 && (
                        <span>
                          <b>{s.team_size}</b> on the team
                        </span>
                      )}
                      {/* Only once deployed. A pilot claiming closed reports
                          before it has run is a forecast, not a measurement. */}
                      {s.stage === "deployed" && s.complaints_closed > 0 && (
                        <span>
                          <b>{s.complaints_closed}</b> fewer reports since
                        </span>
                      )}
                    </div>

                    <span className="sol__go">
                      View solution <Icon.arrow width={14} height={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <p className="showcase__foot">
          Every project here traces back to reports residents filed. Demo organisations are named
          as such — no real institution has been claimed as a partner.
        </p>
      </main>
    </>
  );
}
