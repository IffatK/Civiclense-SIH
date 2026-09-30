import { Icon } from "../Icons.jsx";

/**
 * The small shared pieces of the public interface.
 *
 * Kept together because each is a handful of lines and the alternative — a file
 * per badge — makes the import list longer than the components.
 */

/** "3h ago", "yesterday", "last month". Precision nobody needs is noise. */
export function ago(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;

  const days = Math.round(mins / 1440);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 60) return "last month";
  return `${Math.round(days / 30)} months ago`;
}

export function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Status as a dot and three words.
 *
 * The previous card carried four filled badges — severity, status, overdue and
 * verification — which competed for the same glance and so none of them won.
 * One line wins by being the only one.
 *
 * Overdue outranks everything: a report that is late is late whatever else is
 * true of it, and that is the fact a resident is owed first.
 */
export function StatusDot({ report }) {
  const s = report.overdue
    ? { tone: "danger", label: "Overdue" }
    : report.status === "resolved"
    ? { tone: "ok", label: "Resolved" }
    : report.assigned
    ? { tone: "info", label: "Officer assigned" }
    : report.status === "under_review" || report.status === "ai_analysis"
    ? { tone: "warn", label: "Under review" }
    : report.verification === "unverified"
    ? { tone: "pending", label: "Not yet verified" }
    : { tone: "warn", label: "Waiting" };

  return (
    <span className="dotstat" data-tone={s.tone}>
      <i aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** A feed's worth of grey boxes, shaped like the cards that will replace them. */
export function PostSkeleton({ count = 3 }) {
  return (
    <div className="stack" style={{ gap: "var(--s-5)" }}>
      {Array.from({ length: count }, (_, i) => (
        <article className="post post--skeleton" key={i} aria-hidden="true">
          <header className="post__head">
            <span className="skel skel--face" />
            <div style={{ flex: 1 }}>
              <span className="skel" style={{ height: 12, width: "38%", display: "block" }} />
              <span className="skel" style={{ height: 10, width: "22%", display: "block", marginTop: 8 }} />
            </div>
          </header>
          <span className="skel" style={{ height: 16, width: "62%", display: "block", margin: "var(--s-3) 0" }} />
          <span className="skel" style={{ aspectRatio: "16 / 10", display: "block", borderRadius: "var(--r)" }} />
          <span className="skel" style={{ height: 12, display: "block", marginTop: "var(--s-4)" }} />
          <span className="skel" style={{ height: 12, width: "70%", display: "block", marginTop: 8 }} />
        </article>
      ))}
    </div>
  );
}

/**
 * When the feed cannot be loaded at all.
 *
 * A retry rather than an apology. The usual cause is one failed request, and
 * the cheapest fix is the one the person can perform themselves.
 */
export function LoadFailed({ what = "civic activity", onRetry, detail }) {
  return (
    <div className="failed">
      <Icon.alert width={22} height={22} />
      <p className="failed__title">Couldn’t load {what}.</p>
      {detail && <p className="failed__detail">{detail}</p>}
      {onRetry && (
        <button className="btn btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Nothing here, and what to do about it. */
export function Nothing({ title, body, action }) {
  return (
    <div className="nothing">
      <Icon.clipboard width={22} height={22} />
      <p className="nothing__title">{title}</p>
      {body && <p className="nothing__body">{body}</p>}
      {action}
    </div>
  );
}

