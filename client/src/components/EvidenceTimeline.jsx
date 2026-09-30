import { Badge, Label } from "./Primitives.jsx";
import { Icon } from "./Icons.jsx";

/**
 * The whole life of a complaint's evidence in one column.
 *
 * Scattered across panels — original photo here, rejection note there, latest
 * attempt somewhere else — nobody could answer the question that actually
 * matters: did this get better between attempts? Putting the photographs in
 * order, with what was said between them, makes that answerable at a glance.
 */

const relative = (iso) => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso);
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const exact = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";

const TONE = {
  reported:  { icon: Icon.camera, tone: "pending", label: "Reported" },
  submitted: { icon: Icon.check,  tone: "info",    label: "Work submitted" },
  rejected:  { icon: Icon.alert,  tone: "danger",  label: "Rejected by the resident" },
  accepted:  { icon: Icon.check,  tone: "ok",      label: "Confirmed fixed" },
};

export default function EvidenceTimeline({ entries, emptyText = "No evidence yet." }) {
  if (!entries?.length) {
    return <p className="prose" style={{ fontSize: "var(--t-sm)" }}>{emptyText}</p>;
  }

  return (
    <ol className="spine" style={{ margin: 0 }}>
      {entries.map((e, i) => {
        const meta = TONE[e.kind] || TONE.submitted;
        const Ico = meta.icon;
        const isLatest = i === 0;

        return (
          <li key={`${e.kind}-${i}`} className="spine__node" data-key={isLatest}>
            <div className="row row--between row--wrap" style={{ gap: "var(--s-2)" }}>
              <span className="row" style={{ gap: "var(--s-2)" }}>
                <Ico width={14} height={14} style={{ color: `var(--${meta.tone === "pending" ? "muted" : meta.tone})` }} />
                <strong style={{ fontSize: "var(--t-sm)" }}>{e.title || meta.label}</strong>
                {e.attempt > 1 && <Badge tone="pending">attempt {e.attempt}</Badge>}
              </span>

              {/* Relative for scanning, exact on hover for the record. */}
              <span className="label" title={exact(e.at)}>{relative(e.at)}</span>
            </div>

            {e.by && <div className="label" style={{ marginTop: 2 }}>{e.by}</div>}

            {e.image_url && (
              <a
                href={e.image_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: "block", marginTop: "var(--s-3)", maxWidth: 280 }}
              >
                <img
                  src={e.image_url}
                  alt={e.title || meta.label}
                  loading="lazy"
                  style={{
                    width: "100%", aspectRatio: "4/3", objectFit: "cover",
                    borderRadius: "var(--r)", border: "1px solid var(--line)",
                  }}
                />
              </a>
            )}

            {e.note && (
              <div
                style={{
                  marginTop: "var(--s-3)", padding: "var(--s-3) var(--s-4)",
                  background: e.kind === "rejected" ? "var(--danger-bg)" : "var(--surface-2)",
                  border: `1px solid ${e.kind === "rejected" ? "var(--danger-line)" : "var(--line)"}`,
                  borderRadius: "var(--r)",
                }}
              >
                {e.noteLabel && <Label>{e.noteLabel}</Label>}
                <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: e.noteLabel ? 4 : 0 }}>
                  {e.note}
                </p>
              </div>
            )}

            {e.verdict && (
              <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
                <Badge tone={e.verdict === "likely_completed" ? "ok" : "warn"}>
                  {e.verdict.replace(/_/g, " ")}
                </Badge>
                {e.scene_match != null && (
                  <Badge tone="pending">scene match {e.scene_match}%</Badge>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
