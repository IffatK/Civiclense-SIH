import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty, Meter,
} from "../../components/Primitives.jsx";
import Modal from "../../components/Modal.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * What this institution has taken on, and how far along it is.
 *
 * Five stages, and the last one is "deployed and measured" rather than
 * "deployed". A project that shipped and closed no complaints has demonstrated
 * a problem rather than solved one, and the stage list should not let anybody
 * forget that.
 *
 * The institution cannot mark its own work deployed. That is a claim about the
 * city, so the city makes it — the same reasoning as an officer being unable to
 * close their own complaint.
 */
const STAGES = [
  { id: "proposal", label: "Proposal" },
  { id: "approved", label: "Approved" },
  { id: "building", label: "Building" },
  { id: "pilot", label: "Pilot" },
  { id: "deployed", label: "Deployed", cityOnly: true },
];

export default function Projects() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = () => api.myChallenges().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        eyebrow={data?.institution?.name}
        title="Our projects"
        sub="Challenges your institution has taken on."
      />

      {!data ? (
        <SkeletonRows rows={3} height={150} />
      ) : data.projects.length === 0 ? (
        <Empty
          icon={Icon.clipboard}
          title="No projects yet"
          body="Put your institution forward for a challenge and the city will decide. Accepted challenges become projects here."
        />
      ) : (
        <div className="stack">
          {data.projects.map((p) => {
            const at = STAGES.findIndex((s) => s.id === p.stage);

            return (
              <Panel
                key={p.ref}
                title={p.title}
                action={<Badge tone={p.stage === "deployed" ? "ok" : "info"}>{p.stage}</Badge>}
              >
                <p className="prose" style={{ fontSize: "var(--t-sm)" }}>
                  From: {p.challenge}
                </p>

                {/* Milestones as a fraction, not a percentage. Three of five is
                    a fact; 60% invites nobody to ask which three. */}
                <div style={{ marginTop: "var(--s-4)" }}>
                  <div className="row row--between">
                    <Label>Milestones</Label>
                    <span className="label">{p.done} of {p.total}</span>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Meter value={p.total ? (p.done / p.total) * 100 : 0} tone="ok" />
                  </div>
                </div>

                <div className="steps" style={{ marginTop: "var(--s-4)" }}>
                  {STAGES.map((s, i) => (
                    <span key={s.id} className="step" data-state={i < at ? "done" : i === at ? "now" : "todo"}>
                      <span className="step__n">{i < at ? "✓" : i + 1}</span>
                      <span>{s.label}</span>
                    </span>
                  ))}
                </div>

                <div className="row row--between row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
                  <span className="label">
                    <span className="ref">{p.ref}</span> · {p.team_size} on the team
                  </span>
                  <button className="btn btn--sm btn--secondary" onClick={() => setOpen(p)}>
                    Update progress
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {open && (
        <StageDialog project={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />
      )}
    </div>
  );
}

function StageDialog({ project, onClose, onDone }) {
  const [stage, setStage] = useState(project.stage);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Update progress"
      subtitle={project.title}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            disabled={busy || stage === project.stage}
            onClick={async () => {
              setBusy(true);
              try {
                await api.setProjectStage(project.ref, stage, note.trim() || undefined);
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <Label>Stage</Label>
      <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
        {STAGES.map((s) => (
          <button
            key={s.id}
            className="choice"
            aria-pressed={stage === s.id}
            disabled={s.cityOnly}
            onClick={() => setStage(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Said rather than left as a disabled button somebody puzzles over. */}
      <p className="label" style={{ marginTop: "var(--s-3)" }}>
        Only a city administrator can mark a project deployed — it is a statement about the
        city rather than about the work.
      </p>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Note (optional)</span>
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
