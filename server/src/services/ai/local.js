/**
 * The locally-trained classifier, as an AI provider.
 *
 * Every hosted option failed differently: Groq retired its vision models, the
 * Gemini free tier rate-limited under load, and both were wrong in ways nobody
 * could correct — paan staining came back as water leakage at 95% confidence.
 *
 * One MobileNetV2 model, 23 classes, 224×224. The 23rd is `non_civic_issue`,
 * and it is the gate: the same softmax that names the category also answers "is
 * this a civic problem at all", which is what stops a photograph of somebody's
 * lunch being filed as illegal dumping. There is no separate binary model, so
 * there is no second opinion to disagree with — the earlier pair could and did.
 *
 * The classes are not merged. An earlier model collapsed the four water
 * categories into one because it could not separate them; this one predicts
 * them apart, so a resident's flooding report reaches Drains rather than Water
 * Supply's leakage queue. Where it is unsure it says so and the resident
 * decides, which is the right division of labour: the model sees, the resident
 * knows.
 */
const BASE = process.env.LOCAL_VISION_URL || "http://localhost:8000";

/**
 * The model's slugs, in the product's own vocabulary.
 *
 * Every name on the right is a row in the categories table, because the
 * complaint route looks the category up by name and files anything it cannot
 * find with no category at all. `non_civic_issue` is absent on purpose — it
 * never becomes a category, it rejects the photograph.
 */
const DISPLAY = {
  broken_footpath: "Broken footpath",
  broken_streetlight: "Broken streetlight",
  construction_debris: "Construction debris",
  contaminated_water: "Contaminated water",
  damaged_park_equipment: "Damaged park equipment",
  damaged_traffic_signal: "Damaged traffic signal",
  damp_or_seepage: "Damp or seepage on a structure",
  dead_animal: "Dead animal",
  exposed_wire: "Exposed wire",
  fallen_tree: "Fallen tree",
  flooding: "Flooding",
  footpath_encroachment: "Footpath encroachment",
  garbage_overflow: "Garbage overflow",
  illegal_dumping: "Illegal dumping",
  illegal_parking: "Illegal parking",
  open_manhole: "Open manhole",
  pothole: "Pothole",
  public_toilet_unusable: "Public toilet unusable",
  road_crack: "Road crack",
  stray_animal_concern: "Stray animal concern",
  unhygienic_food_stall: "Unhygienic food stall",
  water_leakage: "Water leakage",
};

/**
 * Below this the classifier is guessing.
 *
 * Measured on the training set the category model is confident — 88% median.
 * On photographs taken with a phone it collapses to the low twenties, because
 * every training image was scraped from the web and it learned what a stock
 * photograph of a pothole looks like rather than what a pothole looks like.
 *
 * So a low score is not "which category" but "I do not recognise this at all",
 * and the interface has to say that rather than name the least-bad option.
 */
const GUESSING = 45;

function toAnalysis(r) {
  // The gate said this is not a civic problem. Respected rather than overridden:
  // filing it under a best-guess category is how a photograph of lunch ends up
  // in the Roads queue.
  if (r.is_civic === false) {
    return {
      category: "Other",
      confidence: Math.round(r.ai_confidence ?? 90),
      severity: "low",
      severity_score: 5,
      severity_factors: [],
      authenticity: "undetermined",
      authenticity_confidence: 0,
      authenticity_notes: [],
      summary: "This does not look like a civic problem.",
      description:
        r.ai_explanation ||
        "The photograph does not show anything on a public road, footpath or municipal asset.",
      observations: [],
      recommended_action: null,
      is_civic_issue: false,
      // Short on purpose. This becomes the summary, which is the single line an
      // officer reads in a list of two hundred reports; the classifier's full
      // paragraph is already the description above.
      not_civic_reason: "This does not look like a civic problem.",
    };
  }

  const key = r.category || r.category_key;
  const name = DISPLAY[key] || r.category_label || "Other";

  const confidence = Math.round(r.category_confidence ?? r.ai_confidence ?? 50);
  const guessing = confidence < GUESSING;

  // What the model's second and third choices were, when they are worth
  // showing. A resident correcting "pothole" to "road crack" is far quicker
  // when the alternative is already on screen than when the full list of
  // thirty-one categories is the only route.
  //
  // Two limits, both of them about not printing noise as a suggestion.
  //
  // Nothing at all when the top answer was already below the threshold: the
  // model has just said it does not recognise the photograph, and offering its
  // second guess in the same breath contradicts that. This is how an image of
  // open ground came back as "Not recognised" beside "Broken streetlight —
  // 18%", which is two answers the system cannot both mean.
  //
  // And 20% rather than 8% otherwise. In a 23-way softmax an 8% runner-up is
  // barely above the 4.3% a coin-flip would give it; putting it on screen next
  // to a name invites a resident to pick it.
  const RUNNER_UP_FLOOR = 20;
  const runnersUp = guessing
    ? []
    : (r.top_categories || [])
        .slice(1, 3)
        .filter((t) => DISPLAY[t.category] && t.confidence >= RUNNER_UP_FLOOR)
        .map((t) => ({ category: DISPLAY[t.category], confidence: Math.round(t.confidence) }));

  const notes = ["Classified locally. No image left this machine."];

  return {
    category: name,
    confidence,

    // Neutral on purpose. services/severity.js computes this from the map, the
    // resident's answers and how long it has waited — none of which a
    // photograph shows.
    severity: "medium",
    severity_score: 40,
    severity_factors: [],

    authenticity: "undetermined",
    authenticity_confidence: 0,
    authenticity_notes: notes,

    // Never assert that something was identified when the number says otherwise.
    // "A civic issue was detected" printed above "22% confidence" is a claim the
    // system cannot support, and it is the sentence a resident reads first.
    summary: guessing
      ? `Not recognised. The closest match was ${name}, at ${confidence}% — too low to rely on.`
      : r.needs_human_review
      ? `${name} suggested, but the model is unsure. Please confirm.`
      : `${name} identified with ${confidence}% confidence.`,

    description: guessing
      ? `The classifier did not recognise this photograph. It was trained on a small set ` +
        `of images and does not yet handle every kind of photo well, so this may be a ` +
        `perfectly ordinary problem it has simply not seen before. Choose the category ` +
        `yourself below — you know what you photographed.`
      : r.ai_explanation || `${name} identified in the photograph.`,

    observations: runnersUp.map((t) => `Could also be ${t.category} (${t.confidence}%)`),

    // What the service suggests an officer does. Advisory, and shown as such.
    recommended_action: (r.recommended_actions || [])[0] || null,
    is_civic_issue: true,
    not_civic_reason: null,
    // A guess always goes to the resident to confirm, and to triage if they
    // do not. Filing a 22% answer as fact is how a photograph of a person
    // ends up in a department's work queue.
    needs_confirmation: guessing || Boolean(r.needs_human_review),
    // A 64-bit perceptual hash of the photograph, for duplicate detection.
    // Deduplication was built around embeddings this pipeline never produced,
    // so the visual half of the comparison was always zero.
    phash: r.phash ?? null,
    low_confidence: guessing,
    alternatives: runnersUp,
  };
}

export const local = {
  label: "Local classifier",
  envKey: null,
  vision: true,
  // Whether it can be shown two images and reason about both.
  vision_comparison: false,
  defaultModel: "public-complaint-23",
  configured: () => true,

  async complete({ messages }) {
    const content = messages[messages.length - 1]?.content;
    const image = Array.isArray(content) && content.find((b) => b.type === "image");

    if (!image) {
      // Deliberately unhelpful. This service classifies photographs; a text
      // request reaching it means the routing is wrong, and answering
      // plausibly would hide that.
      const err = new Error(
        "The local classifier only handles images. Set AI_PROVIDER to a text provider " +
          "and AI_VISION_PROVIDER=local for photographs."
      );
      err.status = 400;
      throw err;
    }

    const form = new FormData();
    form.append(
      "image",
      new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType }),
      "photo.jpg"
    );

    let res;
    try {
      res = await fetch(`${BASE}/classify`, { method: "POST", body: form });
    } catch {
      const err = new Error(
        `The classifier is not running at ${BASE}. Start it with "python app.py" ` +
          `from the model folder.`
      );
      err.status = 503;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(
        (await res.json().catch(() => ({}))).error || `Classifier returned ${res.status}`
      );
      err.status = 502;
      throw err;
    }

    return JSON.stringify(toAnalysis(await res.json()));
  },
};
