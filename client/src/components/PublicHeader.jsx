import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Logo } from "./Primitives.jsx";
import { Icon } from "./Icons.jsx";
import { useAuth } from "../lib/auth.jsx";
import SearchBox from "./public/SearchBox.jsx";

/**
 * The header every public page shares.
 *
 * Four destinations, a search that works, and one action. Deliberately light:
 * the citizen side of this product is a website, not a console. An
 * administrator navigates all day and earns a sidebar; a resident reading one
 * report does not.
 *
 * On a phone the links become a drawer rather than wrapping onto a second row.
 * Four of them plus a search field will not fit across 360px, and a header that
 * grows to three rows pushes the feed — the thing they came for — off the
 * screen.
 */
export default function PublicHeader({ back }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session, profile, signOut } = useAuth();
  const [drawer, setDrawer] = useState(false);

  const LINKS = [
    { to: "/reports", label: "Explore", end: true },
    { to: "/challenges", label: "Challenges" },
    { to: "/solutions", label: "Solutions" },
    { to: "/community", label: "Community" },
  ];

  // A drawer that survives navigation covers the page somebody just asked for.
  useEffect(() => setDrawer(false), [pathname]);

  // A fixed-position overlay over a scrolling page scrolls the page behind it,
  // which on a phone reads as the drawer being broken.
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawer]);

  const home =
    profile?.institution_id ? "/campus/dashboard"
    : profile?.role === "citizen" ? "/app"
    : "/admin";

  return (
    <>
      <header className="pubhead">
        <div className="pubhead__inner">
          <Link to="/" aria-label="CivicLense home" className="pubhead__mark">
            <Logo />
          </Link>

          <nav className="pubhead__nav">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="pubhead__link"
                aria-current={
                  (l.end ? pathname === l.to : pathname.startsWith(l.to)) ? "page" : undefined
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="pubhead__find">
            <SearchBox />
          </div>

          <div className="pubhead__actions">
            {/* Universities and companies. Shown to visitors and residents
                alike, hidden only once somebody already belongs to an
                institution — applying requires an account, so hiding it from
                anyone signed in was backwards. */}
            {!profile?.institution_id && (
              <Link to="/campus" className="pubhead__link pubhead__link--wide">Campus portal</Link>
            )}

            {session ? (
              <>
                <Link to={home} className="btn btn--sm">
                  {profile?.institution_id ? "Workspace"
                   : profile?.role === "citizen" ? "My reports" : "Dashboard"}
                </Link>
                {/* Somebody whose institution application is still pending is
                    bounced here from /work, and had no way out at all. */}
                <button className="pubhead__link pubhead__link--wide" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/signin" className="pubhead__link pubhead__link--wide">Log in</Link>
                <Link to="/register" className="btn btn--sm">Report an issue</Link>
              </>
            )}
          </div>

          <button
            className="pubhead__burger"
            aria-label="Menu"
            aria-expanded={drawer}
            onClick={() => setDrawer((v) => !v)}
          >
            {drawer ? <Icon.close width={20} height={20} /> : <Icon.menu width={20} height={20} />}
          </button>
        </div>
      </header>

      {/* The same four destinations, stacked. Not a second navigation with its
          own contents — a phone-shaped rendering of this one. */}
      {drawer && (
        <div className="drawer" role="dialog" aria-label="Navigation">
          <div className="drawer__sheet">
            <div className="drawer__find">
              <SearchBox onNavigate={() => setDrawer(false)} />
            </div>

            <nav className="drawer__nav">
              {LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="drawer__link"
                  aria-current={
                    (l.end ? pathname === l.to : pathname.startsWith(l.to)) ? "page" : undefined
                  }
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="drawer__foot">
              {!profile?.institution_id && <Link to="/campus" className="link">Campus portal</Link>}
              {session ? (
                <>
                  <Link to={home} className="link">
                    {profile?.institution_id ? "Workspace"
                     : profile?.role === "citizen" ? "My reports" : "Dashboard"}
                  </Link>
                  <button className="link" onClick={signOut}>Sign out</button>
                </>
              ) : (
                <Link to="/signin" className="link">Log in</Link>
              )}

              {/* Reporting needs an account, so a signed-out visitor is sent to
                  make one rather than to a protected route that bounces them. */}
              <Link to={session ? "/app/report" : "/register"} className="btn btn--block">
                <Icon.camera width={16} height={16} /> Report an issue
              </Link>
            </div>
          </div>
          <button className="drawer__scrim" aria-label="Close menu" onClick={() => setDrawer(false)} />
        </div>
      )}

      {/* A named destination, not just "back". Browser history is unreliable
          here — somebody arriving from a shared link has nothing behind them,
          and a back button that does nothing is worse than none. */}
      {back && (
        <div className="container" style={{ paddingTop: "var(--s-5)" }}>
          <button
            className="btn--quiet"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate(back.to);
            }}
          >
            ← {back.label}
          </button>
        </div>
      )}
    </>
  );
}
