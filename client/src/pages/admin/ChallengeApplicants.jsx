import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty, Meter,
} from "../../components/Primitives.jsx";
import Modal from "../../components/Modal.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Choosing between the institutions that applied.
 *
 * Each is scored on things that can be checked — expertise overlap, what they
 * have finished before, how many people and disciplines they have, how close
 * they are. Every point traces to a fact and the breakdown sits beside the
 * total.
 *
 * Deliberately not a model. Something telling a municipality which university
 * to award public work to is exactly the kind of automated decision that should
 * not exist, and one nobody could defend if asked. It ranks; the administrator
 * decides, and the pitch is still the thing to read.
 */
export default function ChallengeApplicants() {
  const { ref } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(null);

  const load = () => api.assessApplicants(ref).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [ref]);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="Choosing"
        title={data?.challenge?.title || "Applicants"}
        sub={data?.caveat}
      />

      {!data ? (
        <SkeletonRows rows={3} height={220} />
      ) : data.applicants.length === 0 ? (
        <Empty
          icon={Icon.building}
          title="Nobody has applied yet"
          body="Approved institutions see this challenge ranked against their own expertise."
        />
      ) : (
        <div className="assess">
          {data.applicants.map((a, i) => (
            <article key={a.institution_id} className="assess__card" data-rank={i + 1}>
              <div className="row row--between row--wrap" style={{ gap: "var(--s-3)" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
                    <h2 className="h h-xl">{a.name}</h2>
                    <Badge tone={a.kind === "industry" ? "accent" : "info"}>{a.kind}</Badge>
                    {i === 0 && <Badge tone="ok">highest score</Badge>}
                  </div>
                  <p className="label" style={{ marginTop: 4 }}>{a.city || "no city recorded"}</p>
                </div>

                <div style={{ textAlign: "right", flex: "none" }}>
                  <div className="assess__score">{a.total}</div>
                  <div className="assess__of">of {a.out_of}</div>
                </div>
              </div>

              {/* The pitch first. The score is an aid to reading it, not a
                  replacement — and putting the number above the words would
                  invite somebody to skip them. */}
              <div style={{ marginTop: "var(--s-4)" }}>
                <Label>What they said</Label>
                <p className="prose" style={{ marginTop: "var(--s-2)" }}>{a.pitch}</p>
              </div>

              <div style={{ marginTop: "var(--s-5)" }}>
                <Label>How that score is made up</Label>
                <div style={{ marginTop: "var(--s-2)" }}>
                  {a.factors.map((f) => (
                    <div key={f.factor} className="assess__factor">
                      <span>
                        <b>{f.factor}</b>
                        <small>{f.detail}</small>
                        <small>{f.note}</small>
                      </span>
                      <span className="assess__bar">
                        <Meter value={f.out_of ? (f.points / f.out_of) * 100 : 0} tone="info" />
                      </span>
                      <span className="assess__points">{f.points}/{f.out_of}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="row" style={{ gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
                <button className="btn btn--sm" onClick={() => setAccepting(a)}>
                  Award it to {a.name.split(" ").slice(0, 2).join(" ")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {accepting && (
        <AwardDialog
          challengeRef={ref}
          applicant={accepting}
          onClose={() => setAccepting(null)}
          onDone={() => { setAccepting(null); load(); }}
        />
      )}
    </div>
  );
}

function AwardDialog({ challengeRef, applicant, onClose, onDone }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Award this challenge"
      subtitle={applicant.name}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            disabled={busy || title.trim().length < 8}
            onClick={async () => {
              setBusy(true);
              try {
                await api.acceptInterest(challengeRef, {
                  institutionId: applicant.institution_id,
                  title: title.trim(),
                  note: note.trim() || undefined,
                });
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Awarding…" : "Award it"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        This becomes a project with five milestones. The others are told they were not chosen —
        they see your note, so write something they can use.
      </p>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Project name</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Campus flood early warning"
        />
      </label>

      <label className="field">
        <span className="label">Note to the institutions (optional)</span>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
