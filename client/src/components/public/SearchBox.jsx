import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { Icon } from "../Icons.jsx";

/**
 * The search that searches something.
 *
 * There has been a field in the header since the first design with nothing
 * behind it, which is worse than having none: somebody types a ward name, gets
 * nothing, and concludes the city has no reports there.
 *
 * Four kinds of result under four headings rather than one ranked list. A ward
 * and a report and a university project are not comparable things, and pouring
 * them into one column loses the distinction the person is searching for.
 */
export default function SearchBox({ onNavigate }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const navigate = useNavigate();

  // Debounced, and every in-flight answer older than the current keystroke is
  // discarded — without the guard a slow request for "ku" can land after "kurla"
  // and replace the right results with stale ones.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(null);
      return;
    }

    let live = true;
    const t = setTimeout(() => {
      api
        .publicSearch(term)
        .then((r) => live && setRes(r))
        .catch(() => live && setRes({ total: 0, reports: [], challenges: [], solutions: [], areas: [] }));
    }, 220);

    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const close = () => {
    setOpen(false);
    setQ("");
    onNavigate?.();
  };

  // Enter with no result chosen falls back to filtering the feed by the text,
  // which is a real answer rather than a dead end.
  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    navigate(`/reports?q=${encodeURIComponent(q.trim())}`);
    close();
  };

  const empty = res && res.total === 0;

  return (
    <div className="find" ref={box}>
      <form onSubmit={submit} className="find__form" role="search">
        <Icon.search width={16} height={16} aria-hidden="true" />
        <input
          className="find__input"
          type="search"
          value={q}
          placeholder="Search reports, areas, solutions"
          aria-label="Search CivicLense"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </form>

      {open && q.trim().length >= 2 && (
        <div className="find__panel" role="listbox">
          {!res && <p className="find__note">Searching…</p>}

          {empty && <p className="find__note">Nothing matches “{q.trim()}”.</p>}

          {res?.areas?.length > 0 && (
            <section>
              <p className="find__head">Areas</p>
              {res.areas.map((a) => (
                <Link key={a.code} to={`/reports?ward=${encodeURIComponent(a.code)}`} className="find__row" onClick={close}>
                  <Icon.pin width={14} height={14} />
                  <span>{a.name}</span>
                  <em>{a.reports} reports</em>
                </Link>
              ))}
            </section>
          )}

          {res?.reports?.length > 0 && (
            <section>
              <p className="find__head">Reports</p>
              {res.reports.map((r) => (
                <Link key={r.ref} to={`/reports/${r.ref}`} className="find__row" onClick={close}>
                  <Icon.file width={14} height={14} />
                  <span>
                    {r.category} — {r.ward_name}
                  </span>
                  <em>{r.ref}</em>
                </Link>
              ))}
            </section>
          )}

          {res?.challenges?.length > 0 && (
            <section>
              <p className="find__head">Challenges</p>
              {res.challenges.map((c) => (
                <Link key={c.ref} to={`/challenges/${c.ref}`} className="find__row" onClick={close}>
                  <Icon.flag width={14} height={14} />
                  <span>{c.title}</span>
                  <em>{c.reports_at_raise} reports</em>
                </Link>
              ))}
            </section>
          )}

          {res?.solutions?.length > 0 && (
            <section>
              <p className="find__head">Solutions</p>
              {res.solutions.map((s) => (
                <Link key={s.ref} to={`/solutions/${s.ref}`} className="find__row" onClick={close}>
                  <Icon.bulb width={14} height={14} />
                  <span>{s.title}</span>
                  <em>{s.institution}</em>
                </Link>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
