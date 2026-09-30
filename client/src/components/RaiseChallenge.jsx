import { useState } from "react";
import { api } from "../lib/api.js";
import Modal from "./Modal.jsx";
import { Label, ErrorNote } from "./Primitives.jsx";
import { useToast } from "../lib/toast.jsx";

/**
 * Turning a recurring problem into something somebody builds for.
 *
 * The dialog asks for two things the database cannot supply: what the underlying
 * problem is, as opposed to what was reported, and what solving it would take.
 *
 * The second is a list rather than prose because it drives matching. "Needs
 * drainage modelling and sensors" is a sentence; ["drainage", "iot"] is
 * something an institution's expertise can be compared against, and the
 * comparison is a count anybody can check rather than a similarity score
 * nobody can.
 */

const NEEDS = [
  { id: "civil", label: "Civil engineering" },
  { id: "water", label: "Water" },
  { id: "drainage", label: "Drainage" },
  { id: "roads", label: "Roads" },
  { id: "waste", label: "Waste" },
  { id: "public_health", label: "Public health" },
  { id: "ai", label: "AI / vision" },
  { id: "iot", label: "Sensors / IoT" },
  { id: "gis", label: "Mapping / GIS" },
  { id: "data", label: "Data analysis" },
  { id: "hardware", label: "Hardware" },
  { id: "mobile", label: "Mobile / app" },
];

export default function RaiseChallenge({ cluster, onClose, onDone, onExisting }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [needs, setNeeds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  const toggle = (id) =>
    setNeeds((n) => (n.includes(id) ? n.filter((x) => x !== id) : [...n, id]));

  const ready = title.trim().length >= 8 && summary.trim().length >= 30 && needs.length > 0;

  return (
    <Modal
      title="Raise this as a challenge"
      subtitle={`${cluster.ref} · ${cluster.report_count} reports from ${cluster.citizen_count} residents`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await api.raiseChallenge(cluster.ref, {
                  title: title.trim(),
                  summary: summary.trim(),
                  needs,
                });
                toast.success(`Challenge ${result.ref} was created.`);
                onDone();
              } catch (e) {
                if (e.status === 409 && e.details?.challengeRef) {
                  toast.info(`This group is already linked to ${e.details.challengeRef}.`);
                  onExisting?.(e.details.challengeRef);
                  return;
                }
                setError(e.message);
                toast.error(`Unable to raise challenge: ${e.message}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Raising…" : "Raise it"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        This group has been reported {cluster.report_count} times. Patching it again is
        maintenance; a challenge asks a university or a company to work out why it keeps
        happening.
      </p>

      <label className="field" style={{ marginTop: "var(--s-5)" }}>
        <span className="label">What is the underlying problem?</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Recurring flooding at the Kurla underpass"
        />
      </label>

      <label className="field">
        <span className="label">Why it keeps coming back</span>
        <textarea
          className="input"
          rows={4}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="What has been tried, and what the reports suggest is actually wrong."
        />
      </label>

      <div style={{ marginTop: "var(--s-5)" }}>
        <Label>What would solving it take?</Label>
        <p className="label" style={{ marginTop: 4 }}>
          Institutions are matched on these, so pick what the work needs rather than
          everything that might help.
        </p>

        <div className="row row--wrap" style={{ gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
          {NEEDS.map((n) => (
            <button
              key={n.id}
              type="button"
              className="choice"
              aria-pressed={needs.includes(n.id)}
              onClick={() => toggle(n.id)}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ marginTop: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
