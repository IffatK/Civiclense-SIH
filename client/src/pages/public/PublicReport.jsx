import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { useToast } from "../../lib/toast.jsx";
import { Badge } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import PublicHeader from "../../components/PublicHeader.jsx";
import Gallery from "../../components/public/Gallery.jsx";
import { StatusDot, ago, when, LoadFailed } from "../../components/public/bits.jsx";

/**
 * One report, in full.
 *
 * Evidence, what it is, what the classifier thought, what the city has done,
 * and then the discussion. In that order and with nothing between them.
 *
 * There used to be an interaction bar here — confirm, follow, share — and a
 * four-way kind picker above the comment box. All of it is gone. The page is
 * about a civic problem, and a row of engagement controls around it made it
 * look like a post to react to rather than a record to read. The one thing a
 * reader can do is say something, so that is the one control on the page.
 *
 * The follow and corroboration tables are untouched; they are simply no longer
 * driven from here. A table existing is not a reason to put a button on a page.
 */

/**
 * Labels for kinds a comment may already carry.
 *
 * Residents no longer choose one — writing a comment posts a comment. Older
 * comments, and anything an officer files through the staff tools, still have
 * a kind, and dropping the label would silently reclassify them as ordinary
 * remarks.
 */
const KIND_LABEL = {
  corroborate: { label: "Confirmed this", tone: "ok" },
  resolved_already: { label: "Says it is already fixed", tone: "pending" },
  dispute: { label: "Disputed", tone: "warn" },
};

export default function PublicReport() {
  const { ref } = useParams();
  const { session } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const thread = useRef(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(
    () => api.publicReport(ref).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)),
    [ref]
  );

  useEffect(() => { setData(null); load(); }, [load]);

  // Arriving from a card's "Discuss" link should land on the discussion, not
  // at the top of a long page with an anchor the browser resolved before the
  // section existed.
  useEffect(() => {
    if (data && window.location.hash === "#discussion") {
      thread.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  const signIn = () => navigate("/signin", { state: { from: `/reports/${ref}` } });

  /**
   * Post a comment.
   *
   * The toast follows the database, not the click. An earlier version of this
   * pattern reported success as soon as the request was sent; here the await
   * has to resolve before anything is cleared or announced, and a rejection
   * keeps the person's text in the box so they are not made to retype it.
   */
  async function post(e) {
    e.preventDefault();

    const text = body.trim();
    if (text.length < 2) return;
    if (!session) {
      toast.error("Please log in to join the discussion.");
      return signIn();
    }

    setPosting(true);
    try {
      await api.addComment(ref, "detail", text);
      await load();
      setBody("");
      toast.success("Comment posted successfully.");
    } catch (err) {
      toast.error(err.message || "Couldn’t post your comment. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  if (error && !data) {
    return (
      <>
        <PublicHeader back={{ to: "/reports", label: "Back to Explore" }} />
        <main className="container" style={{ maxWidth: 720, padding: "var(--s-7) var(--s-5)" }}>
          <LoadFailed what="this report" detail={error} onRetry={load} />
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PublicHeader back={{ to: "/reports", label: "Back to Explore" }} />
        <main className="detail" aria-busy="true">
          <div className="detail__left">
            <span className="skel" style={{ aspectRatio: "4 / 3", display: "block", borderRadius: "var(--r-lg)" }} />
          </div>
          <div className="detail__right">
            <span className="skel" style={{ height: 26, width: "70%", display: "block" }} />
            <span className="skel" style={{ height: 14, width: "50%", display: "block", marginTop: 14 }} />
            <span className="skel" style={{ height: 90, display: "block", marginTop: 20, borderRadius: "var(--r)" }} />
          </div>
        </main>
      </>
    );
  }

  const r = data.report;
  const where = r.ward_name || r.ward_code || "Mumbai";
  const comments = data.comments.filter((c) => c.body);
  const ai = data.ai;

  return (
    <>
      <PublicHeader back={{ to: "/reports", label: "Back to Explore" }} />

      <main className="detail">
        <div className="detail__left">
          <Gallery images={data.images.map((i) => i.url)} alt={r.category} ratio="4 / 3" eager />

          {/* A photograph the officer took after the work, where there is one.
              It is the only evidence that "resolved" means anything. */}
          {data.images.some((i) => i.role === "after") && (
            <p className="detail__caption">Includes the photograph taken after the work.</p>
          )}
        </div>

        <div className="detail__right">
          <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
            <span className="ref">{r.ref}</span>
            <StatusDot report={r} />
          </div>

          <h1 className="detail__title">
            {r.category} in {where}
          </h1>

          <p className="detail__by">
            Reported by {r.anonymous || !r.reporter ? "an anonymous resident" : r.reporter} ·{" "}
            {ago(r.created_at)}
          </p>

          <div className="detail__facts">
            {r.department && (
              <span>
                <Icon.building width={15} height={15} /> {r.department}
              </span>
            )}
            <span>
              <Icon.pin width={15} height={15} /> {where}
            </span>
            {r.severity && (
              <span style={{ textTransform: "capitalize" }}>
                <Icon.alert width={15} height={15} /> {r.severity} severity
              </span>
            )}
            {r.agency && (
              <span>
                <Icon.shield width={15} height={15} /> Maintained by {r.agency}
              </span>
            )}
          </div>

          {r.summary && (
            <>
              <h2 className="detail__h">Description</h2>
              <p className="detail__text">{r.summary}</p>
            </>
          )}

          {/* What the classifier thought, stated as a reading rather than a
              verdict. Omitted entirely when nothing was recorded — an empty
              "AI analysis" heading claims a check that never ran. */}
          {ai && (
            <>
              <h2 className="detail__h">AI analysis</h2>
              <div className="aicard">
                <div className="aicard__row">
                  <span className="aicard__k">Possible issue</span>
                  <span className="aicard__v">{ai.recognised ? ai.category : "Not recognised"}</span>
                </div>
                <div className="aicard__row">
                  <span className="aicard__k">Confidence</span>
                  <span className="aicard__v">{ai.confidence}%</span>
                </div>
                <p className="aicard__note">
                  {ai.recognised
                    ? ai.needs_review
                      ? "A first reading from the photograph. A ward officer confirms the category before any work is scheduled."
                      : "A first reading from the photograph, not a decision. The category on this report is what the city acts on."
                    : "Too low to route on. The category on this report was set by a person, not by the model."}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ---- everything below runs the full width ---- */}
        <div className="detail__below">
          <section className="dcard">
            <h2 className="dcard__title">What has happened</h2>
            <ol className="timeline">
              {data.timeline.map((t, i) => (
                <li key={`${t.status}-${i}`} className="timeline__step" data-last={i === data.timeline.length - 1 || undefined}>
                  <span className="timeline__mark" aria-hidden="true" />
                  <span className="timeline__when">{when(t.at)}</span>
                  <span className="timeline__what">
                    {t.label}
                    {t.note && <em>{t.note}</em>}
                  </span>
                </li>
              ))}
            </ol>
            {r.overdue && (
              <p className="dcard__note" data-alert="true">
                This is past the deadline the department set for itself. It stays in the public
                record either way.
              </p>
            )}
          </section>

          {/* ---- the discussion ---- */}
          <section className="dcard" id="discussion" ref={thread}>
            <h2 className="dcard__title">
              Community discussion
              <span className="dcard__count">
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </span>
            </h2>

            {comments.length === 0 ? (
              <p className="dcard__empty">
                No comments yet. Be the first to share something useful about this issue.
              </p>
            ) : (
              <ul className="talk">
                {comments.map((c) => (
                  <li key={c.id} className={`talk__item${c.is_official ? " talk__item--official" : ""}`}>
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="talk__face" />
                    ) : (
                      <span className="talk__face" aria-hidden="true">{c.author.slice(0, 1)}</span>
                    )}

                    <div className="talk__body">
                      <p className="talk__head">
                        <span className="talk__who">{c.author}</span>
                        <span className="talk__when">· {ago(c.created_at)}</span>
                        {c.is_official && <Badge tone="accent">ward officer</Badge>}
                        {KIND_LABEL[c.kind] && (
                          <Badge tone={KIND_LABEL[c.kind].tone}>{KIND_LABEL[c.kind].label}</Badge>
                        )}
                      </p>
                      <p className="talk__text">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={post} className="writer">
              <textarea
                className="input writer__box"
                rows={3}
                placeholder="Write a comment..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Write a comment"
              />

              <div className="writer__foot">
                {!session && (
                  <span className="writer__note">
                    <Link to="/signin" state={{ from: `/reports/${ref}` }} className="link">Log in</Link>{" "}
                    to join the discussion.
                  </span>
                )}
                <button className="btn btn--sm" disabled={posting || body.trim().length < 2}>
                  {posting ? "Posting…" : "Post comment"}
                </button>
              </div>
            </form>
          </section>

          {data.related.length > 0 && (
            <section className="dcard">
              <h2 className="dcard__title">
                Similar nearby
                <span className="dcard__count">{data.related.length} more like this in {where}</span>
              </h2>
              <ul className="stack" style={{ gap: "var(--s-2)" }}>
                {data.related.map((x) => (
                  <li key={x.ref}>
                    <Link to={`/reports/${x.ref}`} className="minirow">
                      <span className="minirow__what">
                        {x.category} in {x.ward_name}
                      </span>
                      <span className="minirow__meta">{ago(x.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* The lifecycle, where this report reached it. Omitted rather than
              shown empty — "no challenge yet" is a promise the product has not
              made. */}
          {r.challenge_ref && (
            <section className="dcard dcard--accent">
              <h2 className="dcard__title">This became a challenge</h2>
              <p className="dcard__lead">{r.challenge_title}</p>
              <p className="dcard__note">
                Reports like this one kept arriving, so the city raised it as a problem to be
                solved rather than repeatedly patched.
              </p>
              <Link to={`/challenges/${r.challenge_ref}`} className="btn btn--sm btn--ghost">
                View challenge <Icon.arrow width={14} height={14} />
              </Link>

              {r.solution_ref && (
                <>
                  <hr className="dcard__rule" />
                  <p className="dcard__lead">{r.solution_title}</p>
                  <p className="dcard__note">
                    A university or industry team is working on this challenge — currently{" "}
                    {String(r.solution_stage).replace(/_/g, " ")}.
                  </p>
                  <Link to={`/solutions/${r.solution_ref}`} className="btn btn--sm btn--ghost">
                    View solution <Icon.arrow width={14} height={14} />
                  </Link>
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
