import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Icon } from "../Icons.jsx";

/**
 * The frame every public page sits in.
 *
 * Two columns, not three. There was a left rail here repeating the four links
 * the header already carries — a second navigation for the same four
 * destinations, costing 200px of a 1280px window and giving a reader nothing
 * they did not already have above the fold. The header is the navigation.
 *
 * The middle column is capped at 660px whatever the window does: a column of
 * photographs stops being readable long before it stops being wide. The right
 * rail is discovery, and everything in it is reachable as its own page, so a
 * phone loses nothing by not rendering it.
 */

/**
 * The discovery column.
 *
 * Counted from what residents actually filed in the last thirty days, and from
 * challenges that are actually open. If either query returns nothing the block
 * is not rendered — an empty "Trending" heading is a claim that nothing is
 * happening, which is a different statement from "we have not measured".
 */
function Discovery() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.trending().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <aside className="discover" aria-label="What is happening">
      {!data && (
        <section className="discover__card">
          <h2 className="discover__title">Trending</h2>
          <div className="skel" style={{ height: 16, marginTop: 12 }} />
          <div className="skel" style={{ height: 16, marginTop: 10 }} />
          <div className="skel" style={{ height: 16, marginTop: 10 }} />
        </section>
      )}

      {data?.trending?.length > 0 && (
        <section className="discover__card">
          <h2 className="discover__title">Trending now</h2>
          <ol className="trend">
            {data.trending.map((t, i) => (
              <li key={`${t.ward_code}-${t.category}`}>
                <Link
                  to={`/reports?ward=${encodeURIComponent(t.ward_code)}&category=${encodeURIComponent(t.category)}`}
                  className="trend__row"
                >
                  <span className="trend__n">{i + 1}</span>
                  <span className="trend__body">
                    <span className="trend__what">
                      {t.category} in {t.ward_name}
                    </span>
                    <span className="trend__meta">
                      {t.reports} report{t.reports === 1 ? "" : "s"}
                      {t.overdue > 0 && ` · ${t.overdue} overdue`}
                      {t.overdue === 0 && t.resolved > 0 && ` · ${t.resolved} resolved`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <p className="discover__note">{data.basis}</p>
        </section>
      )}

      {data?.challenges?.length > 0 && (
        <section className="discover__card">
          <h2 className="discover__title">Open challenges</h2>
          <ul className="stack" style={{ gap: "var(--s-3)" }}>
            {data.challenges.map((c) => (
              <li key={c.ref}>
                <Link to={`/challenges/${c.ref}`} className="trend__row">
                  <span className="trend__body">
                    <span className="trend__what">{c.title}</span>
                    <span className="trend__meta">
                      {c.reports_at_raise} report{c.reports_at_raise === 1 ? "" : "s"}
                      {c.ward && ` · ${c.ward}`}
                      {c.project_ref && " · being worked on"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/challenges" className="discover__more">
            All challenges <Icon.arrow width={14} height={14} />
          </Link>
        </section>
      )}
    </aside>
  );
}

/**
 * The city in three numbers, as a strip under the page heading rather than a
 * dashboard above the feed.
 *
 * It used to be three large figures that took the first screen of the page, so
 * a reader met a statistics block before they met a single report. The numbers
 * are worth stating and are not worth the fold.
 */
export function CityPulse({ totals }) {
  if (!totals) return null;

  return (
    <div className="citypulse">
      <span className="citypulse__label">City pulse</span>
      <span className="citypulse__item">
        <b>{totals.total}</b> reported
      </span>
      <span className="citypulse__item">
        <b>{totals.resolved}</b> resolved
      </span>
      <span className="citypulse__item" data-alert={totals.overdue > 0 || undefined}>
        <b>{totals.overdue}</b> overdue
      </span>
      <Link to="/community" className="citypulse__more">
        See all activity <Icon.arrow width={13} height={13} />
      </Link>
    </div>
  );
}

export default function PublicShell({ children, aside = true }) {
  return (
    <div className={`pubgrid${aside ? "" : " pubgrid--single"}`}>
      <main className="pubgrid__main">{children}</main>
      {aside && (
        <div className="pubgrid__side">
          <Discovery />
        </div>
      )}
    </div>
  );
}
