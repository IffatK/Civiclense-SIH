import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty,
} from "../../components/Primitives.jsx";
import Modal from "../../components/Modal.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Universities and companies asking to work on challenges.
 *
 * Approval is a real decision, not a formality. An approved institution sees
 * every open challenge in the city, and expertise is what matching runs on — an
 * institution claiming all twelve areas would match everything and crowd out
 * the ones that genuinely fit. That is why a person reads the statement rather
 * than a rule counting boxes.
 */

const KIND = {
  university: { label: "University", tone: "info" },
  industry: { label: "Industry", tone: "accent" },
  ngo: { label: "NGO", tone: "pending" },
  research: { label: "Research", tone: "info" },
};

export default function Institutions() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [directory, setDirectory] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("pending");
  const [deciding, setDeciding] = useState(null);

  const load = () =>
    api.institutionApplications(status).then(setData).catch((e) => setError(e.message));

  useEffect(() => { setData(null); load(); }, [status]);
  useEffect(() => {
    if (profile?.role === "global_admin") api.institutionDirectory().then(setDirectory).catch((e) => setError(e.message));
  }, [profile?.role]);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="Innovation ecosystem"
        title="Institutions"
        sub="Universities and companies asking to take on community challenges."
      />

      <div className="row row--wrap" style={{ gap: "var(--s-2)", marginBottom: "var(--s-5)" }}>
        {[["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Turned down"], ["", "All"]]
          .map(([id, label]) => (
            <button key={label} className="choice" aria-pressed={status === id} onClick={() => setStatus(id)}>
              {label}
            </button>
          ))}
      </div>

      {profile?.role === "global_admin" && (
        <section style={{ marginBottom: "var(--s-6)" }}>
          <Label>Global institute directory</Label>
          {!directory ? <SkeletonRows rows={2} height={96} /> : directory.institutions.length === 0 ? <Empty title="No institutions" body="Approved institutes will appear here." /> : (
            <div className="stack" style={{ marginTop: "var(--s-3)" }}>
              {directory.institutions.map((i) => <Panel key={i.id} title={i.name} action={<Badge tone={i.approved ? "ok" : "pending"}>{i.approved ? "approved" : "pending"}</Badge>}>
                <div className="row row--wrap" style={{ gap: 6 }}>
                  <Badge tone={(KIND[i.kind] || KIND.university).tone}>{(KIND[i.kind] || KIND.university).label}</Badge>
                  <span className="label">{i.city || "Location not recorded"} · {i.department_count} departments · {i.member_count} members · {i.active_project_count} active / {i.project_count} total projects</span>
                </div>
                {i.description && <p className="prose" style={{ marginTop: "var(--s-3)" }}>{i.description}</p>}
                <div className="row row--wrap" style={{ gap: 6, marginTop: "var(--s-3)" }}>{(i.expertise || []).map((x) => <span className="ref" key={x}>{x.replace(/_/g, " ")}</span>)}</div>
                <p className="label" style={{ marginTop: "var(--s-3)" }}>Departments: {(i.disciplines || []).join(" · ") || "Not recorded"} · Labs: {(i.laboratories || []).join(" · ") || "Not recorded"}</p>
              </Panel>)}
            </div>
          )}
        </section>
      )}

      {!data ? (
        <SkeletonRows rows={3} height={160} />
      ) : data.applications.length === 0 ? (
        <Empty
          icon={Icon.building ?? Icon.file}
          title={status === "pending" ? "Nothing waiting" : "Nothing here"}
          body="Institutions apply from the public site. Approved ones can see open challenges and put themselves forward."
        />
      ) : (
        <div className="stack">
          {data.applications.map((a) => {
            const kind = KIND[a.kind] || KIND.university;

            return (
              <Panel
                key={a.id}
                title={a.institution_name}
                action={
                  <div className="row" style={{ gap: "var(--s-2)" }}>
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                    {a.status !== "pending" && (
                      <Badge tone={a.status === "approved" ? "ok" : "danger"}>{a.status}</Badge>
                    )}
                    {a.already_known > 0 && <Badge tone="warn">already on file</Badge>}
                  </div>
                }
              >
                <p className="prose">{a.statement}</p>

                <div style={{ marginTop: "var(--s-4)" }}>
                  <Label>Expertise claimed</Label>
                  <div className="row row--wrap" style={{ gap: 6, marginTop: "var(--s-2)" }}>
                    {a.expertise.map((e) => (
                      <span key={e} className="ref">{e.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                  {/* Worth flagging. Matching runs on these, so an institution
                      claiming everything matches everything. */}
                  {a.expertise.length >= 8 && (
                    <p className="label" style={{ marginTop: "var(--s-2)", color: "var(--warn)" }}>
                      Claims {a.expertise.length} of 12 areas — worth checking against their
                      departments before approving.
                    </p>
                  )}
                </div>

                {a.departments?.length > 0 && (
                  <div style={{ marginTop: "var(--s-4)" }}>
                    <Label>Departments</Label>
                    <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: 4 }}>
                      {a.departments.join(" · ")}
                    </p>
                  </div>
                )}

                <div className="row row--between row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
                  <span className="label">
                    {a.applicant_name} · {a.applicant_email}
                    {a.city && ` · ${a.city}`}
                  </span>

                  {a.status === "pending" && (
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      <button className="btn btn--sm" onClick={() => setDeciding({ ...a, decision: "approved" })}>
                        Approve
                      </button>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => setDeciding({ ...a, decision: "rejected" })}
                      >
                        Turn down
                      </button>
                    </div>
                  )}
                </div>

                {a.decision_note && (
                  <p className="label" style={{ marginTop: "var(--s-3)" }}>{a.decision_note}</p>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {deciding && (
        <DecideDialog
          application={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); load(); }}
        />
      )}
    </div>
  );
}

function DecideDialog({ application, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const rejecting = application.decision === "rejected";
  // A rejection without a reason leaves somebody nothing to correct.
  const ready = !rejecting || note.trim().length >= 3;

  return (
    <Modal
      title={rejecting ? "Turn down this application" : "Approve this institution"}
      subtitle={application.institution_name}
      onClose={onClose}
      footer={
        <>
          <button
            className={rejecting ? "btn btn--danger" : "btn"}
            disabled={busy || !ready}
            onClick={async () => {
              setBusy(true);
              try {
                await api.decideInstitution(application.id, application.decision, note.trim() || undefined);
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : rejecting ? "Turn it down" : "Approve"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        {rejecting
          ? "They are told what you write here, so make it something they can act on."
          : "They will be able to see every open challenge, put themselves forward, and invite their own students and faculty."}
      </p>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">{rejecting ? "Reason" : "Note (optional)"}</span>
        <textarea
          className="input"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={rejecting ? "What would need to change?" : ""}
        />
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
