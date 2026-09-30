import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty, SeverityBadge,
} from "../../components/Primitives.jsx";
import Modal from "../../components/Modal.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * What residents are saying, across every report.
 *
 * Comments were readable one report at a time, which meant nobody read them. A
 * resident writing "this was fixed last week" on a complaint an officer is
 * about to be sent to is telling the city something worth acting on, and it was
 * reaching nobody.
 *
 * Disputes lead, because those are the ones that change what happens next. A
 * queue sorted by recency would bury them under agreement.
 */

const KINDS = [
  { id: "", label: "Everything" },
  { id: "dispute", label: "Disputed", tone: "warn" },
  { id: "resolved_already", label: "Already fixed", tone: "warn" },
  { id: "corroborate", label: "Confirmed", tone: "ok" },
  { id: "detail", label: "Added detail", tone: "info" },
];

const ago = (iso) => {
  const h = Math.round((Date.now() - new Date(iso)) / 36e5);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

export default function Comments() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState("");
  const [hiding, setHiding] = useState(null);
  const navigate = useNavigate();

  const load = () => api.staffComments(kind).then(setData).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); }, [kind]);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const counts = data?.counts || {};

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="What residents are saying"
        title="Comments"
        sub={data?.ordering}
      />

      <div className="row row--wrap" style={{ gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
        {KINDS.map((k) => (
          <button key={k.label} className="choice" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
            {k.id && counts[k.id] ? ` (${counts[k.id]})` : ""}
          </button>
        ))}
      </div>

      {!data ? (
        <SkeletonRows rows={6} height={84} />
      ) : data.comments.length === 0 ? (
        <Empty icon={Icon.file} title="Nothing here" body="Comments residents leave on reports appear here." />
      ) : (
        <div className="stack">
          {data.comments.map((c) => {
            const k = KINDS.find((x) => x.id === c.kind);
            // A dispute on work already assigned is the case worth surfacing:
            // somebody is about to be sent to a job a resident says is done.
            const urgent = ["dispute", "resolved_already"].includes(c.kind) && c.assigned;

            return (
              <div
                key={c.id}
                className="card card--pad"
                style={urgent ? { borderLeft: "3px solid var(--warn)" } : undefined}
              >
                <div className="row row--between row--wrap" style={{ gap: "var(--s-3)" }}>
                  <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
                    <Badge tone={k?.tone || "pending"}>{k?.label || c.kind}</Badge>
                    {c.is_official && <Badge tone="accent">from an officer</Badge>}
                    {urgent && <Badge tone="warn">an officer is already assigned</Badge>}
                  </div>
                  <span className="label">{ago(c.created_at)}</span>
                </div>

                <p className="prose" style={{ marginTop: "var(--s-3)" }}>{c.body}</p>

                <div className="row row--between row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-4)" }}>
                  <button
                    className="btn--quiet"
                    style={{ padding: 0 }}
                    onClick={() => navigate(`/admin/complaints/${c.ref}`)}
                  >
                    <span className="ref">{c.ref}</span>{" "}
                    {c.category} · {c.ward_code} <SeverityBadge severity={c.severity} />
                  </button>

                  <button className="btn--quiet" style={{ color: "var(--danger)" }} onClick={() => setHiding(c)}>
                    Hide
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hiding && (
        <HideDialog comment={hiding} onClose={() => setHiding(null)} onDone={() => { setHiding(null); load(); }} />
      )}
    </div>
  );
}

/**
 * Hidden, never deleted, and always with a reason.
 *
 * A comment that vanishes without trace is indistinguishable from one that was
 * never made — which is precisely the kind of quiet rewriting this product
 * exists to prevent. The reason goes to the audit log under the name of
 * whoever hid it.
 */
function HideDialog({ comment, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Hide this comment"
      subtitle={comment.ref}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn btn--danger"
            disabled={busy || reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await api.hideComment(comment.id, reason.trim());
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Hiding…" : "Hide it"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        It stops appearing on the report. The comment itself is kept, along with your name and
        the reason — moderation that leaves no trace is not moderation.
      </p>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Why</span>
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Abusive, off topic, personal information…"
        />
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
