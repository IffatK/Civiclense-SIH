import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import PublicHeader from "../../components/PublicHeader.jsx";
import { Badge, ErrorNote, SkeletonRows, Segment, Empty } from "../../components/Primitives.jsx";
import { Icon } from "../../components/Icons.jsx";

/**
 * Who is doing the work, on both sides.
 *
 * A table ranks; a podium rewards. The top three carry the visual weight
 * because standing on it is what makes somebody file the next report — and
 * positions four and below stay a list, which is the right shape for them.
 *
 * Two boards measuring different things, and the basis of each is printed
 * rather than left to be guessed:
 *
 * Residents rank on points from verified contributions, not report count. A
 * duplicate earns nothing and confirming a fix earns more than filing one, so
 * the person on top helped most rather than filed most.
 *
 * Officers rank on closing within each complaint's own deadline. Volume is a
 * decision somebody else made when they assigned the work; being on time is
 * the officer's.
 */

const initials = (name) =>
  (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function Face({ url, name, className }) {
  return url ? (
    <img src={url} alt="" className={className} />
  ) : (
    <span className={className}>{initials(name)}</span>
  );
}

export default function Leaderboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("residents");
  const { profile } = useAuth();

  useEffect(() => {
    api.leaderboard().then(setData).catch((e) => setError(e.message));
  }, []);

  const rows = data?.[tab] || [];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const leader = rows[0];

  // The scale everything is measured against, so a bar means the same thing
  // in every row.
  const best = tab === "residents" ? leader?.points || 1 : leader?.on_time_rate || 1;
  const scoreOf = (r) => (tab === "residents" ? r.points : r.on_time_rate ?? 0);
  const labelOf = (r) =>
    tab === "residents" ? `${r.points} pts` : `${r.on_time_rate ?? "—"}% on time`;
  const subOf = (r) =>
    tab === "residents"
      ? `${r.reports} reports · ${r.confirmations} confirmed`
      : `${r.department || "—"} · ${r.resolved} resolved`;

  // Where the person reading it stands. Somebody at fortieth should not have to
  // scroll to find themselves.
  const mine = rows.findIndex((r) => r.id === profile?.id);

  return (
    <>
      <PublicHeader />

      <main className="container" style={{ maxWidth: 820, padding: "var(--s-8) var(--s-5) var(--s-9)" }}>
        <h1 className="display d-lg">Who is doing the work</h1>

        <div style={{ marginTop: "var(--s-5)" }}>
          <Segment
            value={tab}
            onChange={setTab}
            options={[
              { id: "residents", label: "Residents" },
              { id: "officers", label: "Officers" },
            ]}
          />
        </div>

        {data && <p className="prose" style={{ marginTop: "var(--s-4)" }}>{data.basis[tab]}</p>}

        {error ? (
          <div style={{ marginTop: "var(--s-6)" }}><ErrorNote>{error}</ErrorNote></div>
        ) : !data ? (
          <div style={{ marginTop: "var(--s-6)" }}><SkeletonRows rows={5} height={70} /></div>
        ) : rows.length === 0 ? (
          <div style={{ marginTop: "var(--s-6)" }}>
            <Empty
              icon={Icon.user}
              title={tab === "officers" ? "No officer qualifies yet" : "Nobody on the board yet"}
              body={
                tab === "officers"
                  ? "An officer appears after closing five reports. One job closed on time is not a record."
                  : "Points come from filing reports that get acted on, and from confirming fixes."
              }
            />
          </div>
        ) : (
          <>
            {/* Second, first, third — so the tallest sits in the middle. */}
            <div className="podium">
              {[top[1], top[0], top[2]].map((r, i) => {
                if (!r) return <div key={i} />;
                const place = [2, 1, 3][i];

                return (
                  <div key={r.id} className="podium__slot" data-place={place}>
                    <span className="podium__star">{place}</span>
                    <Face url={r.avatar_url} name={r.full_name} className="podium__face" />
                    <div className="podium__name">{r.full_name}</div>
                    <div className="podium__sub">{subOf(r)}</div>
                    <div className="podium__score">{labelOf(r)}</div>
                    {tab === "residents" && r.badges > 0 && (
                      <div style={{ marginTop: "var(--s-3)" }}>
                        <Badge tone="accent">{r.badges} badges</Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {rest.length > 0 && (
              <div className="ranks">
                {rest.map((r, i) => (
                  <div
                    key={r.id}
                    className={`rankrow${r.id === profile?.id ? " rankrow--you" : ""}`}
                  >
                    <span className="rankrow__place">{r.position ?? i + 4}</span>
                    <Face url={r.avatar_url} name={r.full_name} className="rankrow__face" />

                    <span style={{ minWidth: 0 }}>
                      <span className="rankrow__name truncate">{r.full_name}</span>
                      <span className="rankrow__sub" style={{ display: "block" }}>{subOf(r)}</span>
                    </span>

                    <span>
                      <span className="rankrow__score">{labelOf(r)}</span>
                      <span className="rankrow__bar">
                        <i style={{ width: `${Math.max(4, (scoreOf(r) / best) * 100)}%` }} />
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Not on the board at all — worth saying, with what would put them
                there, rather than leaving them to wonder. */}
            {profile?.role === "citizen" && tab === "residents" && mine === -1 && (
              <p className="label" style={{ marginTop: "var(--s-5)" }}>
                You are not on the board yet. Points come from filing reports that get acted
                on, and from confirming a fix once an officer says it is done.
              </p>
            )}
          </>
        )}

        {tab === "officers" && rows.length > 0 && (
          <p className="label" style={{ marginTop: "var(--s-5)" }}>
            An officer whose work residents send back shows a lower rating even where the
            on-time figure looks good. Closing quickly and closing properly are different things.
          </p>
        )}
      </main>
    </>
  );
}
