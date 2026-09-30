import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api.js";
import PublicHeader from "../../components/PublicHeader.jsx";
import { LoadFailed, when } from "../../components/public/bits.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * One solution, read as a chain.
 *
 * Problem → solution → team → status → impact, in that order and never
 * reordered. A page that leads with the technology and mentions the civic
 * problem in passing is a research poster; the order here is what makes it a
 * civic record.
 *
 * The team is given by discipline and headcount rather than by name. Crediting
 * students is fair; publishing a roster of students' full names against their
 * university on a page anyone can read is not the same thing.
 */

const STAGES = {
  proposal: { label: "Proposed", tone: "pending" },
  approved: { label: "Approved", tone: "info" },
  building: { label: "Being built", tone: "info" },
  pilot: { label: "Pilot running", tone: "warn" },
  deployed: { label: "Deployed", tone: "ok" },
};

export default function SolutionDetail() {
  const { ref } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.publicSolution(ref).then(setData).catch((e) => setError(e.message));
  }, [ref]);

  useEffect(() => { setData(null); load(); }, [load]);

  if (error) {
    return (
      <>
        <PublicHeader back={{ to: "/solutions", label: "All solutions" }} />
        <main className="container" style={{ maxWidth: 760, padding: "var(--s-7) var(--s-5)" }}>
          <LoadFailed what="this solution" detail={error} onRetry={load} />
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PublicHeader back={{ to: "/solutions", label: "All solutions" }} />
        <main className="container" style={{ maxWidth: 760, padding: "var(--s-7) var(--s-5)" }} aria-busy="true">
          <span className="skel" style={{ height: 30, width: "60%", display: "block" }} />
          <span className="skel" style={{ height: 120, display: "block", marginTop: 20, borderRadius: "var(--r)" }} />
        </main>
      </>
    );
  }

  const s = data.solution;
  const stage = STAGES[s.stage] || STAGES.proposal;
  const done = data.milestones.filter((m) => m.done_at).length;

  return (
    <>
      <PublicHeader back={{ to: "/solutions", label: "All solutions" }} />

      <main className="container lifecycle">
        <div className="row row--wrap" style={{ gap: "var(--s-2)" }}>
          <span className="ref">{s.ref}</span>
          <span className="dotstat" data-tone={stage.tone}>
            <i aria-hidden="true" />
            {stage.label}
          </span>
        </div>

        {/* The chain, in the order the product argues it. */}
        <ol className="chain">
          <li className="chain__link">
            <span className="chain__k">Solving</span>
            <Link to={`/challenges/${s.challenge_ref}`} className="chain__v chain__v--link">
              {s.challenge}
            </Link>
            <span className="chain__note">
              {s.reports_at_raise} report{s.reports_at_raise === 1 ? "" : "s"} from{" "}
              {s.residents_affected} resident{s.residents_affected === 1 ? "" : "s"}
              {s.ward && ` in ${s.ward}`}
            </span>
          </li>

          <li className="chain__link">
            <span className="chain__k">Solution</span>
            <span className="chain__v">{s.title}</span>
            {s.approach && <span className="chain__note">{s.approach}</span>}
          </li>

          <li className="chain__link">
            <span className="chain__k">By</span>
            <span className="chain__v">{s.institution}</span>
            <span className="chain__note">
              {s.partner ? `with ${s.partner}` : "No industry partner"}
              {data.team.length > 0 && ` · ${data.team.map((t) => `${t.n} ${t.discipline}`).join(", ")}`}
            </span>
          </li>

          <li className="chain__link">
            <span className="chain__k">Status</span>
            <span className="chain__v">{stage.label}</span>
            <span className="chain__note">
              Started {when(s.started_at)}
              {s.deployed_at && ` · deployed ${when(s.deployed_at)}`}
              {data.milestones.length > 0 && ` · ${done} of ${data.milestones.length} milestones done`}
            </span>
          </li>

          <li className="chain__link" data-last="true">
            <span className="chain__k">Impact</span>
            {/* Only measured once deployed. Anything else is a forecast, and a
                forecast printed as an outcome is how a demo stops being
                trustworthy. */}
            <span className="chain__v">
              {s.stage === "deployed" && s.complaints_closed > 0
                ? `${s.complaints_closed} fewer reports since deployment`
                : s.stage === "deployed"
                ? "Deployed — no change in report volume measured yet"
                : "Not yet measurable"}
            </span>
            {s.impact_note && <span className="chain__note">{s.impact_note}</span>}
          </li>
        </ol>

        {data.milestones.length > 0 && (
          <section className="dcard" style={{ marginTop: "var(--s-6)" }}>
            <h2 className="dcard__title">Milestones</h2>
            <ol className="timeline">
              {data.milestones.map((m, i) => (
                <li
                  key={`${m.title}-${i}`}
                  className="timeline__step"
                  data-done={Boolean(m.done_at) || undefined}
                  data-last={i === data.milestones.length - 1 || undefined}
                >
                  <span className="timeline__mark" aria-hidden="true" />
                  <span className="timeline__when">{when(m.done_at || m.due_on)}</span>
                  <span className="timeline__what">
                    {m.title}
                    {!m.done_at && <em>due {when(m.due_on)}</em>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="lifecycle__links">
          <Link to={`/challenges/${s.challenge_ref}`} className="btn btn--sm btn--ghost">
            <Icon.flag width={14} height={14} /> The challenge
          </Link>
          <Link
            to={`/reports?category=${encodeURIComponent(s.category || "")}`}
            className="btn btn--sm btn--ghost"
          >
            <Icon.file width={14} height={14} /> Reports of this kind
          </Link>
        </div>
      </main>
    </>
  );
}
