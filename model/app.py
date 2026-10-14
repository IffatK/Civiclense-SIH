from flask import Flask, render_template, request, send_from_directory, jsonify
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import os
import time
from werkzeug.utils import secure_filename

app = Flask(__name__)


# ============================================================
# UPLOAD FOLDER
# ============================================================

UPLOAD_FOLDER = "uploads"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# ============================================================
# LOAD TRAINED MODEL
# ============================================================

MODEL_PATH = "public_complaint_model_new.keras"

model = tf.keras.models.load_model(MODEL_PATH)

# Plain ASCII on purpose. The Windows console is cp1252 and a tick mark raises
# UnicodeEncodeError there, which killed the service on startup after the model
# had already loaded successfully.
print("[model] loaded", MODEL_PATH)


# ============================================================
# THE CLASS THAT MEANS "NOT A CIVIC PROBLEM"
# ============================================================
#
# There is no separate binary gate. The 23rd class is the gate: the same
# softmax that names the category also answers "is this a civic problem at
# all", and non_civic_issue winning is that answer.

NON_CIVIC = "non_civic_issue"


# ============================================================
# 22 CATEGORIES
# IMPORTANT:
# This order must match the training order.
# ============================================================

class_names = [
    "broken_footpath",
    "broken_streetlight",
    "construction_debris",
    "contaminated_water",
    "damaged_park_equipment",
    "damaged_traffic_signal",
    "damp_or_seepage",
    "dead_animal",
    "exposed_wire",
    "fallen_tree",
    "flooding",
    "footpath_encroachment",
    "garbage_overflow",
    "illegal_dumping",
    "illegal_parking",
    "non_civic_issue",
    "open_manhole",
    "pothole",
    "public_toilet_unusable",
    "road_crack",
    "stray_animal_concern",
    "unhygienic_food_stall",
    "water_leakage"
]


# A label list that has drifted from the trained model is the one failure that
# produces confident, plausible, wrong answers forever — every prediction is
# named as its neighbour and nothing looks broken. Caught at startup instead.

if model.output_shape[-1] != len(class_names):
    raise RuntimeError(
        f"{MODEL_PATH} predicts {model.output_shape[-1]} classes but class_names "
        f"lists {len(class_names)}. The list must match the training order exactly."
    )


# ============================================================
# CONFIDENCE THRESHOLD
# ============================================================

THRESHOLD = 60


# ============================================================
# CIVIC ISSUE INFORMATION
# ============================================================

issue_descriptions = {

    "broken_footpath": {
        "title": "Broken Footpath",
        "description": (
            "A damaged or broken footpath has been identified in the "
            "uploaded image. Uneven, cracked, or damaged pedestrian "
            "pathways can cause inconvenience and safety risks for "
            "citizens, particularly children, elderly people, and "
            "persons with disabilities. The concerned municipal "
            "authority should inspect the location and carry out "
            "necessary repair work."
        )
    },

    "broken_streetlight": {
        "title": "Broken Streetlight",
        "description": (
            "A damaged or non-functioning streetlight has been "
            "identified in the uploaded image. Poor lighting can "
            "reduce visibility at night and increase safety risks "
            "for pedestrians and motorists. The concerned authority "
            "should inspect the streetlight and arrange repair or "
            "replacement as required."
        )
    },

    "construction_debris": {
        "title": "Construction Debris",
        "description": (
            "Construction debris has been identified in the uploaded "
            "image. Unremoved construction materials and waste can "
            "obstruct roads or footpaths, create accident hazards, "
            "and affect the cleanliness of public spaces. The "
            "responsible authority or contractor should arrange "
            "proper removal and disposal."
        )
    },

    "contaminated_water": {
        "title": "Contaminated Water",
        "description": (
            "Possible water contamination has been identified in the "
            "uploaded image. Contaminated water may pose risks to "
            "public health and the surrounding environment. The "
            "concerned water supply or municipal authority should "
            "inspect the reported location, identify the source of "
            "contamination, and take appropriate corrective action."
        )
    },

    "damaged_park_equipment": {
        "title": "Damaged Park Equipment",
        "description": (
            "Damaged public park equipment has been identified in the "
            "uploaded image. Broken or unsafe playground and recreational "
            "equipment can cause injuries to citizens, especially children. "
            "The concerned authority should inspect the equipment and "
            "repair, replace, or secure it as necessary."
        )
    },

    "damaged_traffic_signal": {
        "title": "Damaged Traffic Signal",
        "description": (
            "A damaged or malfunctioning traffic signal has been "
            "identified in the uploaded image. Faulty traffic signals "
            "can disrupt traffic movement and increase the risk of "
            "road accidents. The concerned traffic authority should "
            "inspect the signal and arrange timely repair or replacement."
        )
    },

    "damp_or_seepage": {
        "title": "Damp or Seepage",
        "description": (
            "Dampness or water seepage has been identified in the "
            "uploaded image. Continuous moisture or seepage can "
            "damage buildings, walls, roads, or other public "
            "infrastructure and may lead to further deterioration. "
            "The concerned authority should inspect the affected "
            "area and identify and address the source."
        )
    },

    "dead_animal": {
        "title": "Dead Animal",
        "description": (
            "A dead animal has been identified in the uploaded image. "
            "A deceased animal in a public area can create unpleasant "
            "conditions and potential hygiene and environmental "
            "concerns. The concerned municipal authority should "
            "arrange safe and appropriate removal and disposal."
        )
    },

    "exposed_wire": {
        "title": "Exposed Wire",
        "description": (
            "An exposed electrical wire has been identified in the "
            "uploaded image. Exposed wiring can create serious "
            "electrical and public safety hazards, particularly "
            "in areas accessible to pedestrians. The concerned "
            "electricity authority should secure the area and "
            "inspect and repair the wiring promptly."
        )
    },

    "fallen_tree": {
        "title": "Fallen Tree",
        "description": (
            "A fallen tree has been identified in the uploaded image. "
            "It may obstruct roads, footpaths, entrances, or public "
            "spaces and can create risks for pedestrians and motorists. "
            "The concerned municipal authority should inspect the "
            "location and arrange safe removal of the fallen tree."
        )
    },

    "flooding": {
        "title": "Flooding",
        "description": (
            "Flooding or significant water accumulation has been "
            "identified in the uploaded image. Flooded public areas "
            "can obstruct transportation and pedestrian movement "
            "and may create sanitation and safety concerns. The "
            "concerned authority should inspect the drainage system "
            "and take appropriate measures to restore normal conditions."
        )
    },

    "footpath_encroachment": {
        "title": "Footpath Encroachment",
        "description": (
            "Possible encroachment of a public footpath has been "
            "identified in the uploaded image. Obstruction of "
            "pedestrian pathways can restrict safe movement and "
            "may force pedestrians to walk on roads. The concerned "
            "municipal authority should inspect the location and "
            "take appropriate action according to applicable rules."
        )
    },

    "garbage_overflow": {
        "title": "Garbage Overflow",
        "description": (
            "Garbage overflow has been identified in the uploaded "
            "image. Accumulated waste can create unhygienic conditions, "
            "attract pests, produce unpleasant odours, and contribute "
            "to environmental pollution. The concerned sanitation "
            "department should arrange timely collection and ensure "
            "proper waste management."
        )
    },

    "illegal_dumping": {
        "title": "Illegal Dumping",
        "description": (
            "Possible illegal dumping of waste has been identified "
            "in the uploaded image. Disposal of waste in unauthorized "
            "public areas can cause environmental pollution, obstruct "
            "public spaces, and create hygiene concerns. The concerned "
            "municipal authority should inspect the location and take "
            "appropriate action for removal and prevention."
        )
    },

    "illegal_parking": {
        "title": "Illegal Parking",
        "description": (
            "Possible illegal or obstructive parking has been identified "
            "in the uploaded image. Improperly parked vehicles can "
            "obstruct traffic, pedestrian pathways, entrances, or "
            "emergency access. The concerned traffic or municipal "
            "authority should inspect the location and take appropriate "
            "action."
        )
    },

    "non_civic_issue": {
        "title": "Not a Civic Issue",
        "description": (
        "The uploaded image does not appear to represent a civic issue. "
        "It may contain a personal, unrelated, or non-public concern "
        "that does not require municipal or civic intervention. "
        "Please upload an image showing a public infrastructure, "
        "sanitation, traffic, environmental, or other civic-related issue "
        "if you want to submit a civic complaint."
        )
    },

    "open_manhole": {
        "title": "Open Manhole",
        "description": (
            "An open or damaged manhole has been identified in the "
            "uploaded image. An unsecured manhole can create a serious "
            "fall and accident hazard for pedestrians, cyclists, and "
            "vehicles. The concerned authority should immediately "
            "secure the location and arrange proper repair or covering."
        )
    },

    "pothole": {
        "title": "Pothole",
        "description": (
            "A pothole has been identified in the uploaded image. "
            "Potholes can affect vehicle stability, damage vehicles, "
            "and create accident risks for motorists and pedestrians. "
            "The concerned road authority should inspect the location "
            "and carry out appropriate road repair."
        )
    },

    "public_toilet_unusable": {
        "title": "Unusable Public Toilet",
        "description": (
            "A potentially unusable or poorly maintained public toilet "
            "has been identified in the uploaded image. Poor sanitation "
            "and inadequate maintenance can affect public hygiene and "
            "citizen well-being. The concerned authority should inspect "
            "the facility and arrange cleaning, maintenance, or repair."
        )
    },

    "road_crack": {
        "title": "Road Crack",
        "description": (
            "A road surface crack has been identified in the uploaded "
            "image. Road cracks may worsen over time due to traffic "
            "and weather conditions and can contribute to further "
            "surface deterioration. The concerned road authority "
            "should inspect the affected area and carry out necessary "
            "maintenance."
        )
    },

    "stray_animal_concern": {
        "title": "Stray Animal Concern",
        "description": (
            "A stray animal concern has been identified in the uploaded "
            "image. Stray animals in public areas can create safety "
            "risks for pedestrians, motorists, and the animals themselves, "
            "and may also contribute to traffic obstruction or accidents. "
            "The concerned municipal authority should inspect the reported "
            "location, assess the situation, and take appropriate measures "
            "for safe animal management and public safety."
        )
    },

    "unhygienic_food_stall": {
        "title": "Unhygienic Food Stall",
        "description": (
            "An unhygienic food stall has been identified in the uploaded "
            "image. Poor cleanliness, improper food handling, or inadequate "
            "sanitation at food stalls can create public health concerns. "
            "The concerned authority should inspect the stall and ensure "
            "that appropriate hygiene and food-safety practices are followed."
        )
    },

    "water_leakage": {
        "title": "Water Leakage",
        "description": (
            "Possible water leakage has been identified in the uploaded "
            "image. Continuous leakage can result in water wastage, "
            "damage surrounding infrastructure, and contribute to "
            "water accumulation. The concerned water supply authority "
            "should inspect the reported location and arrange necessary "
            "repair."
        )
    }
}


# ============================================================
# PREDICTION
# ============================================================
#
# One place where an image becomes probabilities, shared by the demo page and
# by the /classify endpoint CivicLense calls. Two copies of the preprocessing
# would eventually disagree about resizing or normalisation, and the web page
# would then be a demo of something the platform does not actually run.

IMG_SIZE = (224, 224)


def predict(img):
    """Run one image through the loaded model and log inference timing."""
    started = time.perf_counter()

    # The model contains Rescaling(1./127.5, offset=-1), so do not normalise
    # pixels again here.
    array = np.expand_dims(
        np.asarray(img.convert("RGB").resize(IMG_SIZE), dtype=np.float32),
        axis=0,
    )

    print(f"[model] inference started; input_shape={array.shape}", flush=True)
    inference_started = time.perf_counter()

    # Direct invocation avoids Keras predict()'s data-adapter overhead for a
    # single image. Keep training=False so inference layers behave correctly.
    output = model(array, training=False)
    predictions = np.asarray(output)[0]

    print(
        f"[model] inference completed in {time.perf_counter() - inference_started:.2f}s; "
        f"total predict() time={time.perf_counter() - started:.2f}s",
        flush=True,
    )
    return predictions


def recommended_action(key):
    """
    The action line an officer sees.

    Every description ends with the sentence naming who should do what — "The
    concerned municipal authority should inspect the location and ...". That
    sentence is the recommended action, so it is taken from there rather than
    kept in a second table that can drift out of step with the first.
    """

    description = issue_descriptions.get(key, {}).get("description", "")

    sentences = [s.strip() for s in description.split(". ") if s.strip()]

    return sentences[-1].rstrip(".") + "." if sentences else None


def perceptual_hash(img):
    """
    A 64-bit difference hash, as 16 hex characters.

    CivicLense compares these in Postgres to catch the same photograph filed
    twice — see phash_distance() in migration 0023, which requires exactly this
    length and encoding.
    """

    pixels = np.asarray(
        img.convert("L").resize((9, 8), Image.LANCZOS),
        dtype=np.int16
    )

    value = 0

    for bit in (pixels[:, 1:] > pixels[:, :-1]).flatten():
        value = (value << 1) | int(bit)

    return format(value, "016x")


# ============================================================
# CLASSIFY — THE ENDPOINT CIVICLENSE CALLS
# ============================================================
#
# The Node server posts one image here and reads the JSON below; see
# server/src/services/ai/local.js, which turns it into the analysis a resident
# and an officer see. Nothing leaves this machine.


@app.route("/health")
def health():
    return jsonify({
        "ok": True,
        "model": MODEL_PATH,
        "classes": len(class_names)
    })


@app.route("/classify", methods=["POST"])
def classify():

    file = request.files.get("image")

    if file is None or file.filename == "":
        return jsonify({"error": "Attach an image as the 'image' field."}), 400

    try:
        img = Image.open(io.BytesIO(file.read()))
        img.load()
    except Exception:
        return jsonify({"error": "That file could not be read as an image."}), 400

    predictions = predict(img)

    order = np.argsort(predictions)[::-1]

    top = [
        {
            "category": class_names[i],
            "confidence": round(float(predictions[i] * 100), 2)
        }
        for i in order[:3]
    ]

    best = top[0]

    # The non-civic class only gets to reject a report when it is confident.
    # Winning a 23-way softmax at 30% is not a finding, and treating it as one
    # marks a genuine complaint as "not a civic problem" on the strength of the
    # model's own uncertainty — the most expensive mistake available here,
    # because the resident's report quietly stops being work for anybody.
    rejected = best["category"] == NON_CIVIC and best["confidence"] >= THRESHOLD

    if not rejected:
        # Whatever the best civic class is, even when non_civic_issue edged it
        # out. A low score travels with it and the interface says so.
        best = next(
            (t for t in top if t["category"] != NON_CIVIC),
            top[0]
        )

    key = best["category"]
    info = issue_descriptions.get(key, {})

    return jsonify({
        "is_civic": not rejected,
        "category": key,
        "category_label": info.get("title", key.replace("_", " ").title()),
        "category_confidence": best["confidence"],
        "ai_confidence": best["confidence"],
        "ai_explanation": info.get("description"),
        "needs_human_review": best["confidence"] < THRESHOLD,
        "top_categories": [t for t in top if t["category"] != NON_CIVIC],
        "recommended_actions": (
            [] if rejected else [a for a in [recommended_action(key)] if a]
        ),
        "phash": perceptual_hash(img),
    })


# ============================================================
# SERVE UPLOADED IMAGES
# ============================================================

@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(
        app.config["UPLOAD_FOLDER"],
        filename
    )


# ============================================================
# MAIN ROUTE
# ============================================================

@app.route("/", methods=["GET", "POST"])
def index():

    result = None
    confidence = None
    status = None
    image_path = None
    issue_info = None
    error = None

    if request.method == "POST":

        # ----------------------------------------------------
        # CHECK IMAGE UPLOAD
        # ----------------------------------------------------

        if "image" not in request.files:

            return render_template(
                "index.html",
                error="Please upload an image."
            )

        file = request.files["image"]

        if file.filename == "":

            return render_template(
                "index.html",
                error="Please select an image."
            )

        # ----------------------------------------------------
        # CHECK FILE TYPE
        # ----------------------------------------------------

        allowed_extensions = {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp"
        }

        original_filename = file.filename

        extension = os.path.splitext(
            original_filename
        )[1].lower()

        if extension not in allowed_extensions:

            return render_template(
                "index.html",
                error="Please upload a JPG, JPEG, PNG, or WEBP image."
            )

        # ----------------------------------------------------
        # SECURE FILENAME
        # ----------------------------------------------------

        filename = secure_filename(
            original_filename
        )

        if not filename:

            return render_template(
                "index.html",
                error="Invalid image filename."
            )

        # ----------------------------------------------------
        # SAVE IMAGE
        # ----------------------------------------------------

        filepath = os.path.join(
            app.config["UPLOAD_FOLDER"],
            filename
        )

        file.save(filepath)

        # ----------------------------------------------------
        # IMAGE PREPROCESSING
        # ----------------------------------------------------

        try:

            img = Image.open(filepath)

            # ------------------------------------------------
            # AI PREDICTION
            # ------------------------------------------------
            #
            # Same preprocessing and same model as /classify, so this page
            # shows what the platform actually does.

            predictions = predict(img)

            predicted_index = int(
                np.argmax(predictions)
            )

            # Safety check
            if predicted_index >= len(class_names):

                return render_template(
                    "index.html",
                    error="The AI model returned an invalid prediction."
                )

            # ------------------------------------------------
            # GET RESULT
            # ------------------------------------------------

            result = class_names[
                predicted_index
            ]

            confidence = float(
                predictions[predicted_index] * 100
            )

            # Professional display name
            display_name = result.replace(
                "_",
                " "
            ).title()

            # ------------------------------------------------
            # GET DESCRIPTION
            # ------------------------------------------------

            issue_info = issue_descriptions.get(
                result,
                {
                    "title": display_name,
                    "description": (
                        "The civic issue has been identified "
                        "by the AI system."
                    )
                }
            )

            # ------------------------------------------------
            # CONFIDENCE STATUS
            # ------------------------------------------------

            if confidence >= THRESHOLD:

                status = "Automatically Detected"

            else:

                status = (
                    "Low Confidence - Manual Review Required"
                )

            # ------------------------------------------------
            # IMAGE URL
            # ------------------------------------------------

            image_path = "/uploads/" + filename

        except Exception as e:

            print(
                "[model] image processing error:",
                e
            )

            return render_template(
                "index.html",
                error=(
                    "The uploaded file could not be "
                    "processed as an image."
                )
            )

    # ========================================================
    # SEND RESULTS TO HTML
    # ========================================================

    return render_template(
        "index.html",
        result=result,
        confidence=confidence,
        status=status,
        image_path=image_path,
        issue_info=issue_info,
        error=error
    )


# ============================================================
# RUN APPLICATION
# ============================================================


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        debug=False
    )
