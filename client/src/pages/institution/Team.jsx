import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty,
} from "../../components/Primitives.jsx";
import Modal from "../../components/Modal.jsx";
import { Icon } from "../../components/Icons.jsx";
import { useAuth } from "../../lib/auth.jsx";

/**
 * The people in this institution.
 *
 * Students and faculty are invited here rather than applying to the city. A
 * university knows who its students are; a municipal administrator does not,
 * and should not be the bottleneck for every project team.
 *
 * Discipline is recorded because multidisciplinary teams are the point —
 * "Computer Science" beside "Civil Engineering" on a project is the evidence
 * of it, and inferring that from names would be guesswork.
 */
export default function Team() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [inviting, setInviting] = useState(false);
  const { profile } = useAuth();

  const load = () => api.institutionMembers().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const canInvite = ["university_admin", "faculty", "industry_partner"].includes(profile?.role);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        title="People"
        sub="Faculty and students who can work on your projects."
        actions={
          canInvite ? (
            <button className="btn btn--sm" onClick={() => setInviting(true)}>Invite someone</button>
          ) : null
        }
      />

      {!data ? (
        <SkeletonRows rows={4} height={60} />
      ) : (
        <>
          <Panel title={`${data.members.length} in your institution`} list>
            {data.members.map((m) => (
              <div key={m.id} className="listrow">
                <span className="avatar">{(m.full_name || "?").slice(0, 1)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>{m.full_name}</span>
                  <span className="label" style={{ display: "block" }}>{m.email}</span>
                </span>
                <Badge tone={m.institution_role === "faculty" ? "accent" : "pending"}>
                  {m.institution_role?.replace(/_/g, " ") || m.role}
                </Badge>
              </div>
            ))}
          </Panel>

          {data.pending.length > 0 && (
            <Panel title="Invited, not yet joined" list style={{ marginTop: "var(--s-5)" }}>
              {data.pending.map((p) => (
                <div key={p.email} className="listrow">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "var(--t-sm)" }}>{p.email}</span>
                    <span className="label" style={{ display: "block" }}>
                      {p.invited_role}{p.discipline && ` · ${p.discipline}`}
                    </span>
                  </span>
                  <span className="label">
                    lapses {new Date(p.expires_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </Panel>
          )}

          {data.members.length === 1 && data.pending.length === 0 && (
            <div style={{ marginTop: "var(--s-5)" }}>
              <Empty
                icon={Icon.user}
                title="Just you so far"
                body="Invite faculty and students so they can be put on project teams."
                action={
                  canInvite ? <button className="btn" onClick={() => setInviting(true)}>Invite someone</button> : null
                }
              />
            </div>
          )}
        </>
      )}

      {inviting && (
        <InviteDialog onClose={() => setInviting(false)} onDone={() => { setInviting(false); load(); }} />
      )}
    </div>
  );
}

function InviteDialog({ onClose, onDone }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [discipline, setDiscipline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Invite someone"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            disabled={busy || !email.includes("@")}
            onClick={async () => {
              setBusy(true);
              try {
                await api.inviteToInstitution({ email: email.trim(), role, discipline: discipline.trim() || undefined });
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Inviting…" : "Send invitation"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        They join your institution when they sign up with this address. The invitation lapses
        after fourteen days — one that still works months later is a credential nobody
        remembers issuing.
      </p>

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Email</span>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@university.edu" />
      </label>

      <div className="field">
        <span className="label">Role</span>
        <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
          {[["student", "Student"], ["faculty", "Faculty"], ["partner_member", "Partner staff"]].map(([id, l]) => (
            <button key={id} type="button" className="choice" aria-pressed={role === id} onClick={() => setRole(id)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="label">Discipline</span>
        <input
          className="input"
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          placeholder="Civil Engineering"
        />
        <span className="label" style={{ marginTop: 4, display: "block" }}>
          Shown on project teams. Multidisciplinary teams are the point, so this is recorded
          rather than guessed from a name.
        </span>
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
