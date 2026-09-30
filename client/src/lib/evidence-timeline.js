/** Build the shared evidence history used by resident, officer, and admin views. */
export function buildEvidenceTimeline(c) {
  const entries = [];

  for (const a of c.attempts || []) {
    if (a.rejected) {
      entries.push({
        kind: "rejected", title: "Resident sent it back", at: a.rejected_at || a.at,
        note: a.reason || "No reason was given.", noteLabel: "What they said", attempt: a.attempt,
      });
    }
    entries.push({
      kind: "submitted", title: a.attempt > 1 ? "New evidence uploaded" : "Officer submitted work",
      at: a.at, by: c.officer || c.officer_name, image_url: a.image_url, note: a.notes,
      verdict: a.verdict, scene_match: a.scene_match, attempt: a.attempt,
    });
  }

  if (c.status === "resolved") entries.unshift({ kind: "accepted", title: "Resident confirmed it was fixed", at: c.resolved_at });
  entries.push({
    kind: "reported", title: "Originally reported", at: c.created_at, by: c.citizen_name,
    image_url: c.before_image_url || c.image_url, note: c.description_original,
    noteLabel: c.description_original ? "What they wrote" : null,
  });
  return entries.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}
