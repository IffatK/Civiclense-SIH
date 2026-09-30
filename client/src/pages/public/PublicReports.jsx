import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import PublicHeader from "../../components/PublicHeader.jsx";
import PublicShell, { CityPulse } from "../../components/public/Shell.jsx";
import PostCard from "../../components/public/PostCard.jsx";
import { PostSkeleton, LoadFailed, Nothing } from "../../components/public/bits.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Explore — the front page of the product.
 *
 * What it replaced was a stack of grey rows carrying four badges each:
 * accurate, and unreadable, because severity, status, overdue and verification
 * competed for the same glance and none of them won. Worse, it read as a
 * complaint register, which is a fair description of the data and a poor one of
 * what the data is for.
 *
 * This is a feed of what residents saw. The photograph leads, the words they
 * wrote follow, and everything the city did about it is one line underneath.
 * Overdue work stays in it — a public record that quietly dropped late reports
 * would be advertising.
 *
 * Filter state lives in the URL. The trending sidebar, the search box and the
 * ward links all navigate here with parameters, and a filter held in component
 * state would make every one of those a dead link.
 */

const SORTS = [
  { id: "recent", label: "Newest" },
  { id: "discussed", label: "Most discussed" },
  { id: "confirmed", label: "Most confirmed" },
  { id: "overdue", label: "Longest waiting" },
];

const STATES = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "overdue", label: "Overdue" },
  { id: "verified", label: "Verified" },
];

export default function PublicReports() {
  const [params, setParams] = useSearchParams();

  const sort = params.get("sort") || "recent";
  const status = params.get("status") || "";
  const ward = params.get("ward") || "";
  const category = params.get("category") || "";
  const q = params.get("q") || "";

  const [pages, setPages] = useState([]);      // one entry per loaded page
  const [state, setState] = useState("loading"); // loading | ready | failed
  const [error, setError] = useState(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totals, setTotals] = useState(null);
  const [matched, setMatched] = useState(null);
  const [filters, setFilters] = useState(null);
  const [sheet, setSheet] = useState(false);

  const args = { sort, status, ward, category, q };

  const load = useCallback(() => {
    setState("loading");
    setError(null);
    api
      .publicReports({ ...args, page: 0 })
      .then((d) => {
        setPages([d.reports]);
        setMore(d.has_more);
        setTotals(d.totals);
        setMatched(d.matched);
        setState("ready");
      })
      .catch((e) => {
        setError(e.message);
        setState("failed");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, status, ward, category, q]);

  useEffect(load, [load]);

  // Fetched once. The ward and category lists change when somebody files a
  // report, which is not often enough to justify refetching them per filter
  // press.
  useEffect(() => {
    api.publicFilters().then(setFilters).catch(() => setFilters(null));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const d = await api.publicReports({ ...args, page: pages.length });
      setPages((p) => [...p, d.reports]);
      setMore(d.has_more);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const reports = pages.flat();
  const filtered = Boolean(status || ward || category || q);
  const wardName = filters?.wards.find((w) => w.code === ward)?.name;

  const controls = (
    <>
      <div className="filters__group">
        <p className="filters__label">Sort</p>
        <div className="chips">
          {SORTS.map((s) => (
            <button key={s.id} className="chip" aria-pressed={sort === s.id} onClick={() => set("sort", s.id === "recent" ? "" : s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filters__group">
        <p className="filters__label">Show</p>
        <div className="chips">
          {STATES.map((s) => (
            <button key={s.label} className="chip" aria-pressed={status === s.id} onClick={() => set("status", s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filters__group filters__group--row">
        <label className="filters__select">
          <span className="filters__label">Area</span>
          <select className="input" value={ward} onChange={(e) => set("ward", e.target.value)}>
            <option value="">Everywhere</option>
            {filters?.wards.map((w) => (
              <option key={w.code} value={w.code}>
                {w.name} ({w.reports})
              </option>
            ))}
          </select>
        </label>

        <label className="filters__select">
          <span className="filters__label">Kind</span>
          <select className="input" value={category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Everything</option>
            {filters?.categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.reports})
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );

  return (
    <>
      <PublicHeader />

      <PublicShell>
        <header className="explore__head">
          <h1 className="explore__title">
            {wardName ? `What's happening around ${wardName}?` : "What's happening around Mumbai?"}
          </h1>
          <p className="explore__sub">
            See what residents are reporting, what communities are discussing, and what is
            being solved. Nobody is named, and locations are shown to the area rather than the
            doorstep.
          </p>
        </header>

        <CityPulse totals={totals} />

        {q && (
          <p className="explore__applied">
            Showing reports matching “{q}”.{" "}
            <button className="link" onClick={() => set("q", "")}>Clear</button>
          </p>
        )}

        {/* Desktop and tablet get the controls inline; a phone gets one button
            that opens them, because six filters above the first card pushes the
            feed off the screen. */}
        <div className="filters">{controls}</div>

        <div className="filters__mobile">
          <button className="btn btn--sm btn--ghost" onClick={() => setSheet(true)}>
            <Icon.grid width={15} height={15} /> Filters
            {filtered && <span className="filters__dot" aria-label="filters applied" />}
          </button>
          {matched != null && state === "ready" && (
            <span className="filters__count">{matched} reports</span>
          )}
        </div>

        {state === "loading" ? (
          <PostSkeleton count={3} />
        ) : state === "failed" ? (
          <LoadFailed what="civic activity" detail={error} onRetry={load} />
        ) : reports.length === 0 ? (
          <Nothing
            title={filtered ? "Nothing matches those filters" : "No reports yet"}
            body={
              filtered
                ? "Try a wider area, or clear the filters to see everything residents have reported."
                : "When residents start reporting issues, they appear here."
            }
            action={
              filtered ? (
                <button className="btn btn--sm" onClick={() => setParams({}, { replace: true })}>
                  Clear filters
                </button>
              ) : (
                <Link to="/register" className="btn btn--sm">Report an issue</Link>
              )
            }
          />
        ) : (
          <>
            <div className="stack" style={{ gap: "var(--s-5)" }}>
              {reports.map((r) => (
                <PostCard key={r.ref} report={r} />
              ))}
            </div>

            {more && (
              <button className="btn btn--ghost btn--block loadmore" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}

            {!more && (
              <p className="explore__foot">
                That is everything matching. Reports withdrawn by the person who filed them, and
                those an officer judged not to be civic matters, are not listed — everything else
                is, including work that is running late.
              </p>
            )}
          </>
        )}
      </PublicShell>

      {sheet && (
        <div className="sheetup" role="dialog" aria-label="Filters">
          <button className="sheetup__scrim" aria-label="Close filters" onClick={() => setSheet(false)} />
          <div className="sheetup__panel">
            <div className="sheetup__grab" aria-hidden="true" />
            <div className="filters filters--sheet">{controls}</div>
            <div className="sheetup__foot">
              <button className="btn btn--ghost btn--sm" onClick={() => setParams({}, { replace: true })}>
                Clear all
              </button>
              <button className="btn btn--sm" onClick={() => setSheet(false)}>
                Show {matched ?? ""} reports
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
