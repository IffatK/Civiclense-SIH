# CivicLense

## Run it

```bash
# 1 · the classifier — must be running before the server
cd model
py -3.12 -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt
python app.py                                         # stays running on :8000

# 2 · the API
cd server && npm install && npm run dev

# 3 · the app
cd client && npm install && npm run dev
```

**Python 3.10–3.12.** TensorFlow has no 3.13 wheels. `python check_python.py`
in the model folder says which problem you have if the install fails.

Run every migration in `supabase/migrations` in numeric order (currently through
`0051_public_feed.sql`), then `seed.sql`. The Campus migration also requires a
private Supabase Storage bucket named `campus-private` (or set
`CAMPUS_STORAGE_BUCKET` to an existing private bucket); do not make proposal
documents public.

## Connected demo data

```bash
cd server && npm run db:seed        # build it
cd server && npm run db:reset-demo  # remove it, and nothing else
```

Roughly seven months of a city using the platform: 62 residents, 30 officers,
around 270 reports across all 24 wards, 34 challenges raised from clusters of
those reports, ten universities with their departments, faculty and students,
and the proposals, costed plans, projects and milestones that came out of them.
Everything connects — a project traces back through its proposal and challenge
to the individual reports residents filed.

Deterministic, so a rerun produces the same dataset and yesterday's screenshot
still matches. Demo rows carry `is_demo` and the reset deletes only those, so it
can never reach a real record. Evidence photographs come from the classifier's
own training set, filed by what they show, and proposal documents are generated
PDFs — every stored path has a real file behind it.

Credentials and a tour of what each account demonstrates are in
[`DEMO_ACCOUNTS.md`](DEMO_ACCOUNTS.md).

---

## What runs on what

**Photographs → your own trained model.** One MobileNetV2 over 23 classes, the
23rd being `non_civic_issue` — the same softmax that names the category answers
"is this a civic problem at all". No key, no quota, nothing leaves the machine.

**Everything else → queries and templates.** Daily briefs, cluster summaries,
the assistant, notifications and report sections are assembled from SQL. Every
sentence is a format string over a real figure, so it is always correct, instant,
free, and works when nothing else does.

That is not a compromise. A model summarising municipal figures will eventually
write a sentence the figures do not support, in a document carrying the
corporation's name — and the briefs stopped working entirely when a provider
retired a model id, which is an absurd way to lose a page of numbers you already
had.

**Two things still want a language model,** and neither is load-bearing:

- The agent's tool selection, which is genuinely free-form
- An optional opening paragraph on generated reports

`AI_PROVIDER=mock` covers both offline. Set `groq` or `gemini` only if you want
real prose in those two places.

---

## The classifier

`model/app.py` serves two things from one model. `POST /classify` takes an
`image` field and returns the JSON the Node server reads — the category, the
confidence, the model's runner-up guesses, and a perceptual hash for duplicate
detection. `GET /` is a page you can drop a photo onto to see the same answer,
which is useful when the question is "is the model wrong or is the wiring
wrong".

23 classes, 224×224, 64.75% on held-out images. The classes are no longer
merged: an earlier model collapsed the four water categories into one because it
could not separate them, which meant a flooding report routed to Water Supply's
leakage queue. This one predicts them apart and says when it is unsure.

Two thresholds, and they mean different things:

| | Where | Meaning |
|---|---|---|
| 60% | `app.py` | Below this, the answer is flagged for a human. `non_civic_issue` must also clear it before a photograph is rejected as non-civic at all — winning a 23-way softmax at 30% is not a finding. |
| 45% | `local.js` | Below this the resident is asked "what is this a photo of?" rather than shown a guess dressed as an answer. |

**Weakest classes and why:** `footpath_encroachment` (10 images),
`illegal_parking` (13), `public_toilet_unusable` (15),
`damaged_traffic_signal` (17). All under 20. That is the entire gap — no
architecture change substitutes for photographs.

```bash
cd model
python split_dataset.py     # static/dataset → dataset_split/{train,validation}
python train_model.py       # writes public_complaint_model_new.keras
```

`class_names` in `app.py` must stay in the order `train_model.py` prints, which
is alphabetical. It is checked against the model's output size at startup,
because a label list that has drifted produces confident wrong answers forever
and nothing looks broken.
