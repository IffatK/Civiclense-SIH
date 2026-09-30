import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import Modal from "./Modal.jsx";
import { Badge, Meter, ErrorNote, Loading, Label } from "./Primitives.jsx";

/**
 * Choosing an officer is a judgement, not a dropdown — load and record matter
 * more than the name. Both places that assign use this, so the decision looks
 * the same wherever you make it.
 */
/**
 * `onAssign` lets a caller do the assigning itself.
 *
 * Without it this always called api.assignOfficer for a single complaint, so a
 * work zone — which assigns every report inside it in one call — could reuse
 * the picker but never learn which officer was chosen. The default keeps every
 * existing caller working unchanged.
 */
export default function AssignOfficer({ complaint, onClose, onDone, onAssign }) {
  const [officers, setOfficers] = useState(null);
  const [department, setDepartment] = useState(null);
  const [picked, setPicked] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.assignableOfficers(complaint.ref)
      .then((r) => {
        setOfficers(r.officers);
        setDepartment(r.department);
        setPicked(r.officers[0]?.id ?? null); // lightest load first
      })
      .catch((e) => setError(e.message));
  }, []);

  async function confirm() {
    setBusy(true);
    try {
      if (onAssign) await onAssign(picked);
      else await api.assignOfficer(complaint.ref, picked);
      onDone(picked);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const chosen = officers?.find((o) => o.id === picked);

  const shown = !officers
    ? []
    : officers.filter((o) =>
        `${o.name} ${o.designation || ""} ${o.department || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      );

  return (
    <Modal
      title={`Assign ${complaint.category}`}
      subtitle={`${complaint.ref} · ${complaint.address || complaint.ward_code || ""}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={confirm} disabled={busy || !picked}>
            {busy ? "Assigning…" : chosen ? `Assign to ${chosen.name.split(" ")[0]}` : "Assign"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      {error && <div style={{ marginBottom: "var(--s-4)" }}><ErrorNote>{error}</ErrorNote></div>}

      {!officers ? (
        <Loading label="Finding available officers" />
      ) : officers.length === 0 ? (
        <p className="prose">
          No approved officers in this department yet. Approve a staff request first, then come back.
        </p>
      ) : (
        <>
          {complaint.rework_count > 0 && (
            <div
              style={{
                padding: "var(--s-3) var(--s-4)", marginBottom: "var(--s-4)",
                background: "var(--warn-bg)", border: "1px solid var(--warn-line)",
                borderRadius: "var(--r)",
              }}
            >
              <strong style={{ fontSize: "var(--t-sm)" }}>
                Returned {complaint.rework_count} time{complaint.rework_count === 1 ? "" : "s"}
              </strong>
              <p className="prose" style={{ fontSize: "var(--t-xs)", marginTop: 3 }}>
                The resident rejected earlier work. Consider whether a different officer, or a
                different approach, is needed.
              </p>
            </div>
          )}

          {/* A department with thirty officers makes scrolling the wrong tool. */}
          {officers.length > 6 && (
            <input
              className="input"
              placeholder="Search by name or designation"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: "var(--s-4)" }}
            />
          )}

          <Label>
            {search ? `${shown.length} matching` : "Sorted by who has the lightest caseload"}
          </Label>

          {shown.length === 0 && (
            <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
              Nobody matches “{search}”.
            </p>
          )}

          <div style={{ marginTop: "var(--s-3)" }}>
            {shown.map((o, i) => (
              <label key={o.id} className="pick" data-selected={picked === o.id}>
                <input
                  type="radio"
                  name="officer"
                  checked={picked === o.id}
                  onChange={() => setPicked(o.id)}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row row--between" style={{ gap: "var(--s-3)" }}>
                    <strong className="truncate">{o.name}</strong>
                    {i === 0 && <Badge tone="accent">lightest load</Badge>}
                  </div>

                  <div className="label truncate" style={{ marginTop: 2 }}>
                    {o.designation || o.department}
                    {o.email && ` · ${o.email}`}
                  </div>

                  <div className="row" style={{ gap: "var(--s-4)", marginTop: "var(--s-3)" }}>
                    <span style={{ flex: 1, maxWidth: 160 }}>
                      <Meter
                        value={Math.min(100, o.open_cases * 12)}
                        tone={o.open_cases > 8 ? "danger" : o.open_cases > 4 ? "warn" : "ok"}
                      />
                    </span>
                    <span className="label" style={{ flex: "none" }}>
                      {o.open_cases} open
                      {o.sla != null && ` · ${o.sla}% on time`}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-5)" }}>
            The officer must upload an after-photo before this reaches verification, and the resident
            confirms before it closes. Assignment alone resolves nothing.
          </p>
        </>
      )}
    </Modal>
  );
}
