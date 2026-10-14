
import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, ErrorNote, PageHead, Meter,
} from "../../components/Primitives.jsx";

const BAND = {
  near_certain: { tone: "ok", label: "Near certain" },
  probable: { tone: "info", label: "Probable" },
  possible: { tone: "warn", label: "Possible" },
  unrelated: { tone: "pending", label: "Unrelated" },
};

function extractReports(response) {
  if (Array.isArray(response)) return response;

  for (const key of ["complaints", "reports", "items", "data"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }

  // Some paginated APIs return the records inside data.items.
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.data?.complaints)) return response.data.complaints;

  return [];
}

export default function DuplicateTest() {
  const [reports, setReports] = useState([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoadingReports(true);
      setError(null);

      try {
        const response = await api.adminComplaints();
        const list = extractReports(response);

        const uniqueReports = Array.from(
          new Map(
            list
              .filter((report) => report?.ref)
              .map((report) => [report.ref, report])
          ).values()
        ).sort((x, y) => String(y.ref).localeCompare(String(x.ref)));

        if (!cancelled) {
          setReports(uniqueReports);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Could not load reports: ${err.message}`);
        }
      } finally {
        if (!cancelled) {
          setLoadingReports(false);
        }
      }
    }

    loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleFirstChange(value) {
    setA(value);
    if (value === b) setB("");
    setResult(null);
    setError(null);
  }

  function handleSecondChange(value) {
    setB(value);
    if (value === a) setA("");
    setResult(null);
    setError(null);
  }

  async function compare(e) {
    e.preventDefault();

    if (!a || !b || a === b) {
      setError("Please select two different reports.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      setResult(await api.compareReports(a, b));
    } catch (err) {
      setError(err.message || "Could not compare these reports.");
    } finally {
      setBusy(false);
    }
  }

  const band = result
    ? BAND[result.band] || BAND.unrelated
    : null;

  const firstOptions = reports.filter((report) => report.ref !== b);
  const secondOptions = reports.filter((report) => report.ref !== a);

  function reportLabel(report) {
    const description =
      report.description_original ||
      report.description ||
      report.title ||
      report.category_name;

    return description
      ? `${report.ref} — ${String(description).slice(0, 65)}`
      : report.ref;
  }

  return (
    <div className="fade-in">
      <PageHead
        eyebrow="Duplicate detection"
        title="Compare two reports"
        sub="Every factor scored separately, so a grouping decision can be checked rather than trusted."
      />

      <form onSubmit={compare} className="sheet">
        <div
          className="row row--wrap"
          style={{
            gap: "var(--s-4)",
            alignItems: "flex-end",
          }}
        >
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            <span className="label">First report</span>
            <select
              className="input"
              value={a}
              onChange={(e) => handleFirstChange(e.target.value)}
              disabled={loadingReports || busy}
              required
            >
              <option value="">
                {loadingReports ? "Loading reports..." : "Select first report"}
              </option>

              {firstOptions.map((report) => (
                <option key={report.ref} value={report.ref}>
                  {reportLabel(report)}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            <span className="label">Second report</span>
            <select
              className="input"
              value={b}
              onChange={(e) => handleSecondChange(e.target.value)}
              disabled={loadingReports || busy}
              required
            >
              <option value="">
                {loadingReports ? "Loading reports..." : "Select second report"}
              </option>

              {secondOptions.map((report) => (
                <option key={report.ref} value={report.ref}>
                  {reportLabel(report)}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn"
            disabled={loadingReports || busy || !a || !b || a === b}
          >
            {busy ? "Comparing..." : "Compare"}
          </button>
        </div>

        {!loadingReports && reports.length === 0 && !error && (
          <p className="label" style={{ marginTop: "var(--s-3)" }}>
            No reports were returned by the admin complaints endpoint.
          </p>
        )}

        {error && (
          <div style={{ marginTop: "var(--s-4)" }}>
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </form>

      {result && (
        <>
          <Panel
            title="Result"
            action={<Badge tone={band.tone}>{band.label}</Badge>}
            style={{ marginTop: "var(--s-5)" }}
          >
            <div
              className="row row--between"
              style={{ marginBottom: "var(--s-3)" }}
            >
              <span className="label">Composite score</span>
              <span className="num" style={{ fontSize: "var(--t-xl)" }}>
                {result.total}
              </span>
            </div>

            <Meter
              value={result.total}
              tone={band.tone === "ok" ? "ok" : band.tone}
            />

            <div className="scroll-x" style={{ marginTop: "var(--s-5)" }}>
              <table className="table table--stack">
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>First</th>
                    <th>Second</th>
                    <th>Score</th>
                    <th>Weight</th>
                    <th>Adds</th>
                  </tr>
                </thead>
                <tbody>
                  {result.factors.map((f) => (
                    <tr key={f.factor}>
                      <td data-label="Factor">
                        <strong>{f.factor}</strong>
                      </td>
                      <td data-label="First">{f.a_value || "—"}</td>
                      <td data-label="Second">{f.b_value || "—"}</td>
                      <td data-label="Score" className="mono">{f.score}</td>
                      <td data-label="Weight" className="mono">{f.weight}</td>
                      <td data-label="Adds" className="mono">
                        {f.contributes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="label" style={{ marginTop: "var(--s-4)" }}>
              Location and category carry three quarters of the decision,
              because they are the two things every report has. Image and text
              are corroboration — a report with no photograph hash and no
              description still groups correctly on the first two.
            </p>
          </Panel>

          <Panel
            title="What each band does"
            list
            style={{ marginTop: "var(--s-5)" }}
          >
            {(result.bands || []).map((item) => (
              <div key={item.id} className="listrow">
                <Badge tone={(BAND[item.id] || BAND.unrelated).tone}>
                  {item.label}
                </Badge>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="label">{item.from} and above</span>
                </span>
                <span style={{ fontSize: "var(--t-sm)" }}>
                  {item.action}
                </span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}
