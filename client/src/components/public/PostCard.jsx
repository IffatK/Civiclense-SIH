import { Link } from "react-router-dom";
import { Icon } from "../Icons.jsx";
import Gallery from "./Gallery.jsx";
import { StatusDot, ago } from "./bits.jsx";

/**
 * One report, as a resident would meet it.
 *
 * A post: who, what they saw, the photograph at full width, where it is and
 * who owns it. The card used to carry an action bar — confirm, discuss, share,
 * follow — and that has gone. Those are engagement controls, and a feed of
 * civic problems reads as a feed of things to react to when it is wrapped in
 * them. What makes this social is the photograph and the discussion, not a row
 * of buttons around them.
 *
 * The comment count stays, because it is a fact about the report and the way
 * into the conversation rather than a score. It is the stored count of
 * comments with text on this report's id, not a number kept for display.
 */
export default function PostCard({ report }) {
  const r = report;
  const to = `/reports/${r.ref}`;
  const where = r.ward_name || r.ward_code || "Mumbai";
  const shots = (r.image_urls?.length ? r.image_urls : [r.image_url]).filter(Boolean);
  const multiple = shots.length > 1;

  return (
    <article className="post">
      <header className="post__head">
        <span className="post__face" aria-hidden="true">
          {r.anonymous || !r.reporter ? <Icon.user width={18} height={18} /> : r.reporter.slice(0, 1)}
        </span>
        <div className="post__who">
          <span className="post__name">
            {r.anonymous || !r.reporter ? "Anonymous resident" : r.reporter}
          </span>
          <span className="post__when">
            {where} · {ago(r.created_at)}
          </span>
        </div>
        <StatusDot report={r} />
      </header>

      <Link to={to} className="post__headline">
        {r.category} in {where}
      </Link>

      {/* A single photograph is the link to the report. A carousel is not: its
          arrows and dots are buttons, and a button inside an anchor is invalid
          markup that assistive technology reads as one confused control. */}
      {multiple ? (
        <div className="post__shot">
          <Gallery images={shots} total={r.image_count} alt={r.category} />
        </div>
      ) : (
        <Link to={to} className="post__shot" aria-label={`Open ${r.ref}`}>
          <Gallery images={shots} total={r.image_count} alt={r.category} />
        </Link>
      )}

      {r.summary && <p className="post__text">{r.summary}</p>}

      <div className="post__facts">
        <span>
          <Icon.pin width={14} height={14} /> {where}
        </span>
        {r.department && (
          <span>
            <Icon.building width={14} height={14} /> {r.department}
          </span>
        )}
      </div>

      {/* Where this one ended up, when it ended up anywhere. On the card rather
          than only on the detail page, because the lifecycle is the argument
          and burying it one click down loses it. */}
      {r.challenge_ref && (
        <Link to={`/challenges/${r.challenge_ref}`} className="post__thread">
          <Icon.flag width={14} height={14} />
          Part of the challenge “{r.challenge_title}”
          {r.solution_ref && ` · ${r.solution_title} is working on it`}
        </Link>
      )}

      <div className="post__bar">
        <Link to={`${to}#discussion`} className="act">
          <Icon.chat width={16} height={16} />
          <span>
            {r.comment_count > 0
              ? `${r.comment_count} ${r.comment_count === 1 ? "comment" : "comments"}`
              : "Join the discussion"}
          </span>
        </Link>

        <Link to={to} className="post__full">
          See full report <Icon.arrow width={13} height={13} />
        </Link>
      </div>
    </article>
  );
}
