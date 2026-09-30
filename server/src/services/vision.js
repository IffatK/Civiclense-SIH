import { completeJSON, aiProvider } from "./ai/index.js";

const SYSTEM = `You are the vision module of CivicLense, a municipal complaint platform in Mumbai.
You classify photographs of civic problems for routing to the correct department.

Rules you must follow:
· Authenticity is an assisted assessment, never a verdict. Stay calibrated and hedge. A photograph
  is never declared fake; at most it is flagged for human review.
· Severity must be justified by named factors, not asserted.
· If the photograph shows no reportable civic problem, say so rather than inventing one.
  Do not stretch an unrelated photo into the nearest category — "Other" exists for that.
· Describe what you can actually see. An officer reads this before travelling to the site
  and decides what to bring, so vagueness costs someone a wasted trip.
· Never invent detail that is not visible. If the extent is unclear, say it is unclear.
· Do NOT state measurements, distances or quantities. You cannot judge "three metres"
  from a photograph without a reference object, and a made-up number sends an officer
  out with the wrong equipment. Say "a large area" or "several metres of wall" instead.
· Do NOT assert consequences you cannot see. "Hazardous for pedestrians" is a claim
  about people who are not in the photograph. Describe the condition; let severity carry
  the judgement.
· Reddish-brown vertical staining on a wall is far more often paan or tobacco spitting
  than water damage, particularly at the base of a wall, in a corner, or beside a
  stairway. Water seepage usually shows dampness, efflorescence or algae, not dry
  rust-coloured streaks. Choose "Spitting / paan stains" when the staining is dry and
  reddish, and "Damp or seepage on a structure" when there is visible moisture.
· Confidence must reflect genuine certainty. If two categories look equally plausible,
  say 55, not 95. An overconfident wrong answer is worse than a hesitant one, because
  nobody thinks to check it.
· Do NOT score severity. A separate rules engine does that from the category, the
  map, the resident's answers and how long it has waited — all things you cannot see.
  Judging urgency from a photograph alone produces a number nobody can audit.
· Output raw JSON only. No markdown fences, no explanation before or after.`;

const SCHEMA = `Reply with ONLY a JSON object:
{
 "category": "<Pothole | Road crack | Open manhole | Broken footpath | Footpath encroachment | Garbage overflow | Illegal dumping | Construction debris | Dead animal | Water leakage | Flooding | Contaminated water | Broken pipeline | Broken streetlight | Exposed wire | Damaged traffic signal | Illegal parking | Road obstruction | Stagnant water | Unhygienic food stall | Public toilet unusable | Damaged park equipment | Fallen tree | Spitting / paan stains | Defaced wall or property | Public urination spot | Damp or seepage on a structure | Sewage overflow | Dangerous or dead tree | Persistent noise nuisance | Stray animal concern | Other>",
 "confidence": <0-100 integer>,
 "department": "<Roads & Infrastructure | Solid Waste Management | Water Supply | Street Lighting | Traffic | Public Health | Food Safety | Encroachment | Unclassified>",
 "severity": "<critical|high|medium|low>",
 "severity_score": <0-100 integer>,
 "severity_factors": [{"factor":"<short reason>","points":<integer>}],
 "authenticity": "<likely_genuine|possibly_ai_generated|possibly_manipulated|undetermined>",
 "authenticity_confidence": <0-100 integer>,
 "authenticity_notes": ["<short observation>"],
 "summary": "<one line an officer sees in a list — the issue and where it is>",
 "description": "<three to five sentences. What is visible, how large or severe it appears, what is immediately around it that matters (school, market, footpath, junction), and any hazard. Say plainly when something cannot be judged from the photograph.>",
 "observations": ["<specific visible detail>", "<another>", "<another>"],
 "recommended_action": "<what the officer should do or bring, in one line>",
 "is_civic_issue": <true|false>,
 "not_civic_reason": "<if is_civic_issue is false, what the photograph actually shows>"
}`;

const AUTHENTICITY_LABEL = {
  likely_genuine: "Likely camera image",
  possibly_ai_generated: "Possibly AI generated",
  possibly_manipulated: "Possibly manipulated",
  undetermined: "Unable to determine",
};

/**
 * Every category the vision layer may return, and every one of them is a row in
 * the categories table — a name that is not on this list becomes "Other", and a
 * name on this list that is not in the table files a complaint with no category
 * at all. They have to be kept in step.
 *
 * The six added for the 23-class classifier are marked; before that they fell
 * through to "Other", so a photograph the model had correctly named as a fallen
 * tree reached an officer as an unclassified report.
 */
const CATEGORIES = [
  "Pothole", "Road crack", "Open manhole", "Broken footpath", "Garbage overflow",
  "Illegal dumping", "Dead animal", "Water leakage", "Flooding", "Broken pipeline",
  "Broken streetlight", "Exposed wire", "Damaged traffic signal", "Illegal parking",
  "Road obstruction", "Stagnant water", "Unhygienic food stall",
  // Predicted by the local classifier, and categories in their own right.
  "Construction debris", "Contaminated water", "Damaged park equipment",
  "Fallen tree", "Footpath encroachment", "Public toilet unusable",
  // Added after paan staining down a wall was classified as water leakage.
  // Rust-coloured vertical streaks genuinely resemble water damage, and with no
  // category for spitting the nearest visual match was the only answer available.
  "Spitting / paan stains", "Defaced wall or property", "Public urination spot",
  "Damp or seepage on a structure", "Sewage overflow", "Dangerous or dead tree",
  "Persistent noise nuisance", "Stray animal concern",
  "Other",
];

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));

/**
 * Free models drift from the schema more than paid ones do — a category that is
 * close but not on the list, a confidence as "high" instead of a number. The
 * result is normalised here so the rest of the app can trust its shape.
 */
function normalise(raw) {
  // If the model says this is not a civic issue, respect that rather than
  // letting a best-guess category through. A mouldy orange is not a pothole,
  // and filing it as one puts it in a work queue nobody triaged.
  if (raw.is_civic_issue === false) {
    return {
      category: "Other",
      confidence: clamp(raw.confidence || 0),
      department: "Ward Office — triage",
      severity: "low",
      severity_score: 5,
      severity_factors: [],
      authenticity: "undetermined",
      authenticity_confidence: 0,
      authenticity_notes: [],
      authenticity_label: AUTHENTICITY_LABEL.undetermined,
      summary: raw.not_civic_reason || "This does not appear to show a civic problem.",
      description: String(raw.description || raw.not_civic_reason || "The photograph does not show a reportable civic issue."),
      observations: Array.isArray(raw.observations) ? raw.observations.map(String).slice(0, 6) : [],
      recommended_action: null,
      is_civic_issue: false,
      not_civic_reason: raw.not_civic_reason ? String(raw.not_civic_reason) : null,
    };
  }

  const category = CATEGORIES.find((c) => c.toLowerCase() === String(raw.category || "").toLowerCase())
    || CATEGORIES.find((c) => String(raw.category || "").toLowerCase().includes(c.toLowerCase()))
    || "Other";

  const severity = ["critical", "high", "medium", "low"].includes(raw.severity)
    ? raw.severity
    : "medium";

  const authenticity = AUTHENTICITY_LABEL[raw.authenticity] ? raw.authenticity : "undetermined";

  return {
    category,
    confidence: clamp(raw.confidence),
    department: raw.department || "Unclassified",
    severity,
    severity_score: clamp(raw.severity_score || 40),
    severity_factors: Array.isArray(raw.severity_factors)
      ? raw.severity_factors
          .filter((f) => f && f.factor)
          .map((f) => ({ factor: String(f.factor), points: clamp(f.points, 0, 60) }))
      : [],
    authenticity,
    phash: raw.phash ?? null,
    authenticity_confidence: clamp(raw.authenticity_confidence || 50),
    authenticity_notes: Array.isArray(raw.authenticity_notes) ? raw.authenticity_notes.map(String) : [],
    authenticity_label: AUTHENTICITY_LABEL[authenticity],
    summary: String(raw.summary || "No summary was produced for this photograph."),
    description: String(raw.description || raw.summary || "No description was produced."),
    observations: Array.isArray(raw.observations)
      ? raw.observations.map(String).filter(Boolean).slice(0, 6)
      : [],
    recommended_action: raw.recommended_action ? String(raw.recommended_action) : null,
    is_civic_issue: raw.is_civic_issue !== false,
    not_civic_reason: raw.not_civic_reason ? String(raw.not_civic_reason) : null,

    // How much of this to believe.
    //
    // The local classifier says when it did not recognise a photograph, and the
    // resident's screen asks them to pick the category instead of presenting a
    // guess as an answer. These three fields were being dropped here, so that
    // screen never appeared and a 22% answer was shown as settled.
    low_confidence: Boolean(raw.low_confidence),
    needs_confirmation: Boolean(raw.needs_confirmation),
    alternatives: Array.isArray(raw.alternatives) ? raw.alternatives : [],
  };
}

/**
 * What is in the photograph. Perception only.
 *
 * Severity used to be part of this answer, which was the wrong division of
 * labour: a language model returning "severity_score: 85" gives a number with
 * no derivation, varying between runs on the same image. See services/severity.js —
 * the category comes from here, the score comes from rules.
 */
export async function classifyPhoto({ base64, mimeType, context }) {
  const raw = await completeJSON({
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mimeType, data: base64 },
          { type: "text", text: `${SCHEMA}\n\nContext: ${context || "no additional context supplied"}.` },
        ],
      },
    ],
  });

  return normalise(raw);
}

/** Compares a resident's before photo with an officer's after photo. */
export async function verifyResolution({ before, after }) {
  /**
   * Compares the before and after photographs — where a provider can.
   *
   * The local classifier cannot. It takes one image and names a category; it
   * has no notion of two photographs being the same place. Asked to compare, it
   * classified the after-photo and returned that, which the officer's screen
   * then rendered as "Pothole identified with 69% confidence · scene match 0% ·
   * verdict inconclusive" — a classification dressed up as a comparison, and
   * the most misleading thing on that page.
   *
   * So it now declines. An honest "not available" sends the photographs to the
   * resident, who is the one who decides anyway, rather than manufacturing a
   * verdict from a model that never looked at both images.
   *
   * Proper comparison needs no language model at all: ORB feature matching for
   * "same place", SSIM over the aligned region for "did it change". Both are
   * classical computer vision and would run in the Python service beside the
   * classifier. See docs/REPLACING-THE-AI.md.
   */
  if (!aiProvider.vision_comparison) {
    return {
      scene_match: null,
      change_detected: null,
      verdict: "not_checked",
      summary:
        "No automatic comparison was run — the local classifier reads one photograph at a " +
        "time. The resident compares the two and decides.",
    };
  }

  const raw = await completeJSON({
    system:
      "You compare two photographs of the same reported problem, taken before and after " +
      "work. Judge whether they show the same place and whether the problem is gone. " +
      "Say inconclusive when you cannot tell — a wrong verdict is worse than no verdict.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", mimeType: before.mimeType, data: before.base64 },
          { type: "image", mimeType: after.mimeType, data: after.base64 },
          {
            type: "text",
            text:
              'First image is BEFORE, second is AFTER. Reply with raw JSON only:\n' +
              '{"scene_match":<0-100>,"change_detected":<true|false>,' +
              '"verdict":"<likely_completed|inconclusive|not_completed>","summary":"<two sentences>"}',
          },
        ],
      },
    ],
    maxTokens: 400,
  });

  return {
    scene_match: clamp(raw.scene_match),
    change_detected: Boolean(raw.change_detected),
    verdict: ["likely_completed", "inconclusive", "not_completed"].includes(raw.verdict)
      ? raw.verdict
      : "inconclusive",
    summary: String(raw.summary || "The comparison was inconclusive."),
  };
}
