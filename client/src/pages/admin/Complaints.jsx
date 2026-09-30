import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import IssueMap from "../../components/IssueMap.jsx";
import AssignOfficer from "../../components/AssignOfficer.jsx";
import {
  ErrorNote, Badge, StatusBadge, SeverityBadge, Empty,
  PageHead, Thumb, Segment, SkeletonRows, Panel,
} from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";
import { ago } from "../../lib/format.js";

export default function Complaints() {
  // Open work by default. A queue that mixes finished and unfinished work is
  // not a queue — resolved complaints sat alongside live ones with a Reassign
  // button, and somebody sent an officer back to a job that was already done.
  // Closed work is still reachable through the status filter.
  const [filters, setFilters] = useState({
    status: "open", severity: "", ward: "", unassigned: "", overdue: "", q: "",
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [assigning, setAssigning] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.adminComplaints(filters).then(setData).catch((e) => setError(e.message));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  const rows = data?.complaints || [];
  const mappable = rows.filter(
    (r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
  );
  const unassignedCount = rows.filter((r) => !r.assigned_officer).length;
  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <div className="fade-in">
      <PageHead
        title="Complaints"
        sub={
          filters.status === "open"
            ? "Open work only — sorted by severity, then by deadline. Use the status filter for closed reports."
            : "Sorted by severity, then by how close each one is to its deadline."
        }
        actions={
          <Segment
            value={view}
            onChange={setView}
            options={[{ id: "list", label: "List" }, { id: "map", label: "Map" }]}
          />
        }
      />

      <div className="toolbar">
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Reference or address"
          value={filters.q}
          onChange={(e) => set("q")(e.target.value)}
        />
        <Select value={filters.severity} onChange={set("severity")} label="Any severity"
          options={["critical", "high", "medium", "low"]} />
        {/* The default is "open", so a plain "Any status" label made resolved
            work look deleted rather than filtered. The options say what they
            do, and "open" is named as the default rather than implied. */}
        <Select
          value={filters.status}
          onChange={set("status")}
          label="Everything"
          options={[
            { value: "open", label: "Open work" },
            { value: "submitted", label: "Submitted" },
            { value: "under_review", label: "Under review" },
            { value: "assigned", label: "Assigned" },
            { value: "work_started", label: "Work started" },
            { value: "verification", label: "Awaiting the resident" },
            { value: "resolved", label: "Resolved" },
            { value: "rejected", label: "Rejected" },
            { value: "reopened", label: "Reopened" },
          ]}
        />
        <Select value={filters.ward} onChange={set("ward")} label="Any ward" options={data?.wards || []} />

        <span className="toolbar__spacer" />
        <button
          className={filters.unassigned ? "btn btn--sm" : "btn btn--ghost btn--sm"}
          onClick={() => set("unassigned")(filters.unassigned ? "" : "true")}
        >
          Unassigned {unassignedCount > 0 && `(${unassignedCount})`}
        </button>
        <button
          className={filters.overdue ? "btn btn--sm" : "btn btn--ghost btn--sm"}
          onClick={() => set("overdue")(filters.overdue ? "" : "true")}
        >
          Past deadline {overdueCount > 0 && `(${overdueCount})`}
        </button>
      </div>

      {!data ? (
        <SkeletonRows rows={6} height={72} />
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 20 }}>
          <Empty title="Nothing matches" body="Loosen the filters to see more." />
        </div>
      ) : view === "map" ? (
        <div style={{ marginTop: "var(--s-5)" }}>
          {/* Only rows that can actually be plotted. The list is not filtered on
              location — a complaint filed before coordinates were stored, or one
              whose geocoding failed, carries a null lat. Passing it to Leaflet
              throws and the error boundary takes the whole page, which is the
              blank "This page hit a problem" screen. */}
          {mappable.length === 0 ? (
            <Empty
              title="Nothing to plot"
              body="None of these complaints have a location recorded. Switch to the list view."
            />
          ) : (
          <IssueMap
            center={[mappable[0].lat, mappable[0].lng]}
            complaints={mappable}
            height={520}
            showClusters={false}
            showLayerToggle
            onSelect={(c) => navigate(`/admin/complaints/${c.ref}`)}
          />
          )}

          {mappable.length < rows.length && (
            <p className="label" style={{ marginTop: "var(--s-3)" }}>
              {rows.length - mappable.length} of {rows.length} have no location recorded and are
              not shown here.
            </p>
          )}
        </div>
      ) : (
        <Panel className="panel--table" title={`${rows.length} complaints`} flush>
          <table className="table table--stack table--wide">
            <thead>
              <tr>
                <th className="col-ref">Ref</th>
                <th>Issue</th>
                <th className="col-sev">Severity</th>
                <th className="col-status">Status</th>
                <th className="col-officer">Officer</th>
                <th className="col-when">Deadline</th>
                <th className="col-action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.ref} data-severity={c.severity} data-overdue={c.overdue || undefined}>
                  <td data-label="Ref" className="mono">
                    <button className="link mono" onClick={() => navigate(`/admin/complaints/${c.ref}`)}>
                      {c.ref}
                    </button>
                  </td>
                  <td data-label="Issue" className="col-text">
                    <div className="cell-stack">
                      <Thumb src={c.image_url} alt="" fallback="—" />
                      <div>
                    <div className="truncate" style={{ fontWeight: 600 }}>{c.category}</div>
                    <div className="label truncate">
                      {c.address || `Ward ${c.ward_code}`}
                      {c.cluster_size > 1 && ` · ${c.cluster_size} in group`}
                    </div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Severity"><SeverityBadge severity={c.severity} /></td>
                  <td data-label="Status" className="col-status">
                    <div className="status-cell">
                      <StatusBadge status={c.status} />
                      {c.rework_count > 0 && <Badge tone="warn">returned ×{c.rework_count}</Badge>}
                    </div>
                  </td>
                  <td data-label="Officer">
                    {c.officer || <span className="muted">— unassigned</span>}
                  </td>
                  <td data-label="Deadline">
                    {/* How late, not just that it is late. Seven rows all
                        saying "overdue" in red rank equally; "6d over" against
                        "2h over" tells somebody which to open first. */}
                    <span style={{ color: c.overdue ? "var(--danger)" : "var(--text-2)" }}>
                      {c.overdue ? `${ago(c.sla_deadline)} over` : ago(c.sla_deadline)}
                    </span>
                  </td>
                  <td className="col-action" data-label="Action">
                    {/* A closed complaint has nothing to assign. Offering
                        "Reassign" on resolved work is how somebody ends up
                        sending an officer back to a job that was already done —
                        which is exactly what happened. */}
                    {["resolved", "rejected", "withdrawn"].includes(c.status) ? (
                      <span className="label">closed</span>
                    ) : (
                      /* Secondary, deliberately. Seven filled orange buttons
                         down a page all claim to be the most important thing on
                         it, so none of them is — the primary action belongs to
                         the page, not to every row of a list. */
                      <button className="btn btn--secondary btn--sm" onClick={() => setAssigning(c)}>
                        {c.assigned_officer ? "Reassign" : "Assign"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {assigning && (
        <AssignOfficer
          complaint={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); load(); }}
        />
      )}
    </div>
  );
}

function Select({ value, onChange, label, options }) {
  // Accepts plain strings or { value, label } — the status filter needs real
  // wording ("Awaiting the resident" rather than "verification"), the others
  // are fine as they are.
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o.replace(/_/g, " ") } : o
  );

  return (
    <select
      className="input"
      style={{ width: "auto" }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{label}</option>
      {items.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/**
 * Assignment is a deliberate act. The dialog shows current load and SLA record
 * for every candidate so the choice is informed, and only approved, active
 * officers appear — an unapproved account cannot be given work.
 */
