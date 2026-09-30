import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api.js";
import {
  Panel, Badge, Label, ErrorNote, SkeletonRows, PageHead, Empty,
} from "../../components/Primitives.jsx";
import Modal from "../../components/Modal.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * What this institution could take on.
 *
 * Ranked by how many of a challenge's needs the institution's expertise covers,
 * and the reasoning is on the card. A percentage would be worse: "91% match" is
 * a number with no derivation, and nobody can argue with it. "Three of four
 * needs — civil, drainage, GIS; missing IoT" is something a faculty member can
 * check against their own departments in ten seconds.
 *
 * The gap is shown, not hidden. A university missing one need is precisely when
 * an industry partner is worth bringing in.
 */
export default function Challenges() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(null);

  const load = () => api.myChallenges().then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote onRetry={load}>{error}</ErrorNote>;

  return (
    <div className="fade-in">
      <PageHead
        eyebrow={data?.institution?.name}
        title="Challenges for you"
        sub="Ranked by how much of each challenge your expertise already covers."
      />

      {!data ? (
        <SkeletonRows rows={4} height={170} />
      ) : data.matched.length === 0 ? (
        <Empty
          icon={Icon.route}
          title="Nothing matches yet"
          body={
            `Challenges are matched against your expertise — ${
              (data.institution?.expertise || []).join(", ") || "none recorded"
            }. New ones appear as the city raises them.`
          }
        />
      ) : (
        <div className="stack">
          {data.matched.map((m) => (
            <Panel
              key={m.challenge_ref}
              title={m.title}
              action={
                <div className="row" style={{ gap: "var(--s-2)" }}>
                  {/* A count, not a percentage. It can be checked. */}
                  <Badge tone={m.matched === m.required ? "ok" : "info"}>
                    {m.matched} of {m.required} needs
                  </Badge>
                  {m.we_applied > 0 && <Badge tone="pending">you applied</Badge>}
                </div>
              }
            >
              <p className="prose">{m.summary}</p>

              <div className="figures" style={{ marginTop: "var(--s-4)" }}>
                <div className="figures__item">
                  <span className="figures__n">{m.reports_at_raise}</span>
                  <span className="figures__label">reports behind it</span>
                </div>
                <div className="figures__item">
                  <span className="figures__n">{m.residents_affected}</span>
                  <span className="figures__label">residents</span>
                </div>
                {m.total_interest > 0 && (
                  <div className="figures__item">
                    <span className="figures__n">{m.total_interest}</span>
                    <span className="figures__label">institutions interested</span>
                  </div>
                )}
              </div>

              <div className="row row--wrap" style={{ gap: "var(--s-5)", marginTop: "var(--s-4)" }}>
                <div>
                  <Label>You cover</Label>
                  <div className="row row--wrap" style={{ gap: 6, marginTop: 6 }}>
                    {m.matched_on.map((e) => (
                      <Badge key={e} tone="ok">{e.replace(/_/g, " ")}</Badge>
                    ))}
                  </div>
                </div>

                {m.gaps?.length > 0 && (
                  <div>
                    <Label>Not covered</Label>
                    <div className="row row--wrap" style={{ gap: 6, marginTop: 6 }}>
                      {m.gaps.map((e) => (
                        <Badge key={e} tone="pending">{e.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {m.gaps?.length > 0 && (
                <p className="label" style={{ marginTop: "var(--s-3)" }}>
                  A gap is not a reason not to apply — it is usually where an industry partner
                  comes in.
                </p>
              )}

              <div className="row row--between row--wrap" style={{ gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
                <span className="label">
                  <span className="ref">{m.challenge_ref}</span>
                  {m.ward && ` · ${m.ward}`}
                  {m.category && ` · ${m.category}`}
                </span>

                {m.we_applied > 0 ? (
                  <span className="label">Waiting on the city's decision</span>
                ) : (
                  <div className="row" style={{ gap: "var(--s-2)" }}>
                    {/* Two ways in, on purpose. Expressing interest is cheap and
                        signals early; a quotation is the real bid. An institution
                        that has to price the work before it can say anything at
                        all will say nothing. */}
                    <button className="btn btn--sm" onClick={() => navigate(`/work/quote/${m.challenge_ref}`)}>
                      Submit a quotation
                    </button>
                    <button className="btn btn--secondary btn--sm" onClick={() => setApplying(m)}>
                      Register interest
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {applying && (
        <ApplyDialog
          challenge={applying}
          onClose={() => setApplying(null)}
          onDone={() => { setApplying(null); load(); }}
        />
      )}
    </div>
  );
}

/**
 * Expressing interest.
 *
 * The pitch is required and substantial, because the city chooses between
 * institutions on it. A one-line "we are interested" gives an administrator
 * nothing to choose on, and the choice would fall back to whoever clicked first.
 */
function ApplyDialog({ challenge, onClose, onDone }) {
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      title="Put your institution forward"
      subtitle={challenge.title}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            disabled={busy || pitch.trim().length < 20}
            onClick={async () => {
              setBusy(true);
              try {
                await api.expressInterest(challenge.challenge_ref, pitch.trim());
                onDone();
              } catch (e) {
                setError(e.message);
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : "Send it"}
          </button>
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="prose">
        The city chooses between the institutions that apply. Say how you would approach it and
        which of your departments would be involved.
      </p>

      {challenge.gaps?.length > 0 && (
        <p className="prose" style={{ fontSize: "var(--t-sm)", marginTop: "var(--s-3)" }}>
          This one asks for {challenge.gaps.join(" and ")}, which your recorded expertise does
          not cover. Worth saying how you would handle that.
        </p>
      )}

      <label className="field" style={{ marginTop: "var(--s-4)" }}>
        <span className="label">Your approach</span>
        <textarea
          className="input"
          rows={5}
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          placeholder="What you would do first, and who would do it."
        />
      </label>

      {error && <div style={{ marginTop: "var(--s-3)" }}><ErrorNote>{error}</ErrorNote></div>}
    </Modal>
  );
}
