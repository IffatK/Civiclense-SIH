# CivicLense-AI

A civic reporting and societal-innovation platform. Residents report problems with photographs, video and location. An image pipeline classifies the evidence and scores severity. Related reports are grouped, and recurring problems can be promoted to challenges. Universities and companies then express interest in a challenge, submit itemised quotations, and, once the city awards one, run a project whose milestones are tracked.

The project was built for Smart India Hackathon 2026, problem statement SIH26043 (theme: Smart Education).

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Demo data](#demo-data)
- [The image classifier](#the-image-classifier)
- [Roles and portals](#roles-and-portals)
- [API overview](#api-overview)
- [Checks and scripts](#checks-and-scripts)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Licence and credits](#licence-and-credits)

---

## What it does

**For residents**
- Report a problem with one or more photographs or a short video (up to 30 MB), a location and a description.
- Report anonymously. Public pages show "Anonymous Citizen"; internal records keep the account link for follow-up, moderation and abuse prevention.
- Answer category-specific questions (for example, whether traffic is affected or whether there is standing water).
- Track each report, confirm or reject a fix, and see nearby issues.
- Earn points for verified contributions, shown on a leaderboard that is not based on report count.

**For the public (no sign-in needed)**
- Browse every report, including overdue ones. Overdue reports stay visible.
- View a map, the solutions page ("From problems to solutions") and the community leaderboards.
- Read comment threads. Comments are hidden rather than deleted, and each hide records a moderator and a reason.

**For municipal staff**
- Work queue for officers, grouped by what each job needs: a site visit, evidence already submitted, or sent back by a resident.
- SLA tracking per report, based on category, severity and policy rules.
- Department and ward routing from GPS coordinates. Ward boundaries are checked with PostGIS point-in-polygon tests.
- Groups and hotspots, work zones, comment review, AI accuracy reporting, a duplicate-comparison page, staff access approval, and an audit log.

**For universities and industry (the "campus" portal)**
- Register an institution (approved by the city) and invite faculty and students.
- See challenges ranked by how many of their needs the institution's recorded expertise covers, with the gaps shown.
- Express interest, submit an itemised quotation (the total is computed from the lines), and be awarded a project with five standard milestones.
- Track project stages and milestones. Only the city can mark a project deployed.

---

## Architecture

```
 Browser (React 18 + Vite)
   public site · citizen app · officer / admin · municipal portal · campus portal
            |  HTTPS / JSON                         |  Supabase Auth (sign-in)
            v                                       v
 Application server (Express 4, Node 20)  <-->  Supabase
   25 route modules · Zod validation           PostgreSQL + PostGIS + pgvector + pg_trgm
   role checks · rate limits · rule engines    Auth · Storage (photos, video)
            |
            |  HTTP  (LOCAL_VISION_URL, default http://localhost:8000)
            v
 Image service (Python, Flask)
   Stage 1: civic gate   (MobileNetV2, binary)
   Stage 2: category     (MobileNetV2, 14 labels)
   perceptual hash       (64-bit DCT)
```

The server holds the Supabase service-role key and performs authorisation itself. Row-level security is enabled on tables clients can reach directly, as a second line of defence.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3, React Router 6.26, Vite 5.4, Leaflet 1.9 with React Leaflet 4.2, Recharts 2.12, `@supabase/supabase-js` 2.45 |
| Backend | Node.js 20, Express 4.19, Zod 3.23, multer 1.4, `pg` 8.12, helmet 7.1, express-rate-limit 7.4 |
| Database | Supabase (PostgreSQL with PostGIS, pgvector, pg_trgm), Supabase Auth and Storage. Local Docker image: `postgis/postgis:16-3.4` |
| Image service | Python 3.10 to 3.12, TensorFlow (`tensorflow-cpu` 2.16 or later, below 3.0) with Keras 3, Pillow, h5py, Flask 3, gunicorn or waitress |
| Maps | OpenStreetMap tiles |

---

## Repository layout

```
civiclense/
├── client/              React + Vite app (public site, citizen, officer, admin, municipal and campus portals)
│   ├── src/pages/       public, citizen, officer, admin, gov, institution, campus
│   ├── src/components/  shared UI (AppShell, Primitives, maps, dialogs)
│   └── scripts/         check-jsx, check-css, check-glyphs
├── server/              Express API
│   ├── src/routes/      25 route modules, one per resource
│   ├── src/services/    severity, clustering, notifications, rewards, AI providers
│   ├── src/middleware/  auth, errors, rate limits
│   ├── src/db/          connection pool, schema check at boot
│   └── scripts/         check-imports, check-usage, doctor, models, check-ai
├── model/               Python image service
│   ├── server.py        Flask app (port 8000)
│   ├── predict_service.py   classifier pipeline and perceptual hash
│   ├── train_category_model.py, tune_threshold.py
│   ├── knowledge_base.py    category descriptions and templates
│   └── models/          trained .keras files and category_labels.json
├── supabase/
│   ├── migrations/      0001 to 0037, applied in order
│   └── seed.sql         base reference data
├── docs/                design notes
├── docker-compose.yml   database, API and web app
└── RUN.md               original run notes
```

---

## Prerequisites

- Node.js 20 or later, with npm
- Python 3.10, 3.11 or 3.12. **Not 3.13**: TensorFlow does not publish wheels for it yet.
- A Supabase project (free tier is enough), or Docker for a local PostgreSQL with PostGIS
- About 2 GB of free disk space for TensorFlow

---

## Quick start

You need three processes running: the image service, the API and the web app. The database can be Supabase or the local Docker container.

### 1. Image service (keep it running)

```bash
cd model
py -3.12 -m venv .venv                 # Windows; on macOS/Linux use: python3.12 -m venv .venv
.venv\Scripts\activate                 # Windows
# source .venv/bin/activate            # macOS / Linux
pip install -r requirements.txt
python server.py                       # listens on http://127.0.0.1:8000
```

If the install fails, run `python check_python.py` inside `model/`. It reports whether the Python version is the problem.

### 2. API server

```bash
cd server
npm install
# create server/.env (see Environment variables below)
npm run dev                            # http://localhost:4000
```

On start, the server checks that its required variables are set and prints which ones are missing and where to find them. It also checks the schema and reports any migration that has not been applied.

### 3. Web app

```bash
cd client
npm install
# create client/.env (see Environment variables below)
npm run dev                            # http://localhost:5173
```

Open http://localhost:5173. Residents sign in at `/signin`, municipal staff at `/gov`, and universities and companies at `/campus`.

### Option: Docker Compose (database, API and web app)

```bash
docker compose up --build
```

This starts PostGIS on port 54322, the API on port 4000 and the web app on port 5173. On first start PostGIS runs every file in `supabase/migrations` in name order, which includes the demo seed files `0025`, `0035` and `0037`. If you want an empty database, remove those three files from the mount in `docker-compose.yml` first. The image service is not in Compose; run it as in step 1. The Compose file expects `server/.env` and `client/.env` to exist.

---

## Environment variables

Create `server/.env` with these keys. Replace every placeholder with your own value. Never commit real values.

```bash
# --- required -------------------------------------------------------------
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase: Project Settings > API>
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/postgres   # Supabase: Database > Connection string > Session pooler
CLIENT_ORIGIN=http://localhost:5173

# --- server ---------------------------------------------------------------
PORT=4000
NODE_ENV=development
STORAGE_BUCKET=complaint-photos
RUN_JOBS=true                 # background jobs: escalations, purges, proposal expiry

# --- image service --------------------------------------------------------
AI_VISION_PROVIDER=local
LOCAL_VISION_URL=http://localhost:8000
AI_CACHE=true
AI_CACHE_MAX=500

# --- text providers (optional; "mock" works offline) -----------------------
AI_PROVIDER=mock              # mock | groq | gemini | ollama | openrouter
# GROQ_API_KEY=<key>          GROQ_MODEL=<model id>
# GEMINI_API_KEY=<key>        GEMINI_MODEL=<model id>
# OLLAMA_HOST=http://localhost:11434   OLLAMA_MODEL=<model name>
# OPENROUTER_API_KEY=<key>    OPENROUTER_MODEL=<model id>
AGENT_MAX_STEPS=8
AGENT_TIMEOUT_MS=60000
```

Create `client/.env`:

```bash
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key from Supabase: Project Settings > API>
```

The service-role key bypasses row-level security. Keep it on the server only. The anon key is the only Supabase key the browser may see.

---

## Database setup

The schema is built from 37 numbered migrations. Apply them in numeric order, from `0001` through `0037`, in the Supabase SQL Editor or with `psql`. Then run `supabase/seed.sql`.

Run each file to completion before the next. A failure partway through leaves later files unapplied, and the server's boot check will name the first missing migration.

Some migrations were corrected after first release. If you apply them to an existing database that has already run an earlier version, check the comments at the top of each file. The most common issues are noted in [Troubleshooting](#troubleshooting).

---

## Demo data

The demo data is for development only. It contains fictitious institutions, reports and accounts.

- `0024_demo_reset.sql` defines `reset_demo_data()`. It deletes demo records only (accounts marked `is_demo`) and never touches the schema, reference data or real accounts. It refuses to run unless you pass the exact phrase:

  ```sql
  select * from reset_demo_data('RESET DEMO DATA');
  ```

- `0025_demo_seed.sql`, `0035_seed_institutions.sql` and `0037_seed_hard_cases.sql` create the demonstration reports, institutions, applications and challenges.
- `0026_verify_demo.sql` prints pass or fail for the designed duplicate test cases.
- The API has an equivalent endpoint, `POST /api/admin/demo/reset` (global administrator only, disabled when `NODE_ENV=production`).

Demo accounts use a shared password defined in `0035_seed_institutions.sql`. Change it, or remove those accounts, before any shared or public deployment.

---

## The image classifier

Photographs pass through two stages.

1. **Civic gate.** A MobileNetV2 binary classifier decides whether the photograph shows a civic problem at all. Scores at or above 0.55 are treated as non-civic. Scores within 0.15 of the threshold are marked uncertain and sent to a person.
2. **Category model.** A 14-label MobileNetV2 classifier. Four groups of visually similar categories were merged, because a photograph cannot reliably separate seepage, leakage, flooding and contamination. A prediction is reported only at a confidence of 0.45 or more. If the top two labels are close and in the same group, the group is reported instead.

A 64-bit perceptual hash is also computed for every photograph. It is used for duplicate detection.

**Measured accuracy** (project records, held-out images):

| Class group | Before merging | After merging |
|---|---|---|
| Water-related issue | 41% / 25% | 72% |
| Road-surface damage | 63% / 0% | 69% |
| Waste accumulation | 89% / 0% | 79% |
| Overall | | 69% |

These are measured on web-sourced images. Accuracy on residents' phone photographs has not been measured and is expected to be lower. The weakest classes (`damaged_traffic_signal`, `illegal_parking`, `public_toilet_unusable`, `footpath_encroachment`) have fewer than 20 training images each.

To retrain:

```bash
cd model
python train_category_model.py --data dataset --merge-groups --min-images 10
```

The training images are not included in this repository. Put them in `model/dataset/<class>/` first. The script reports per-class accuracy and names the classes that need more photographs.

**Authenticity** is not assessed by the local pipeline. The field returns `undetermined` unless a configured vision provider supplies an assessment.

---

## Roles and portals

| Role | Sign-in | Can |
|---|---|---|
| Resident (`citizen`) | `/signin` | Report, follow, confirm fixes, comment, earn points |
| Officer (`officer`) | `/gov` | Work assigned jobs, upload evidence |
| Super admin (`super_admin`) | `/gov` | Assign work and approve staff for their own department |
| Global admin (`global_admin`) | `/gov` | Everything, across all departments |
| University admin, faculty, student, industry partner | `/campus` | Institutional workspace (challenges, quotations, projects, people) |

Staff accounts are requested through `/gov/register` and approved by a senior administrator. Institutions apply through `/campus/register` and are approved by a city administrator (super admin or global admin). Role ranks for municipal staff are `citizen < officer < super_admin < global_admin`. Institutional roles sit outside that ranking.

---

## API overview

All routes are under `/api`. Most require a Supabase bearer token. Public routes are read-only.

| Prefix | Purpose |
|---|---|
| `/complaints` | Submit a report, analyse a photograph, follow-up, confirmation |
| `/public` | Public feed, report pages, leaderboards, comments |
| `/officer`, `/officers` | Work queue, job evidence, performance |
| `/admin` | Administration, demo reset, AI performance, duplicate comparison |
| `/clusters`, `/zones` | Groups and hotspots, work zones |
| `/challenges`, `/projects`, `/quotations`, `/institutions` | Innovation ecosystem |
| `/staff` | Staff registration and approval |
| `/geo` | Ward lookup, public statistics, address search |
| `/notifications`, `/me`, `/reports`, `/insights`, `/analytics`, `/audit` | Supporting features |

The `/api/complaints/analyse` route is limited to 20 requests per minute per client. Other routes have a standard limit.

---

## Checks and scripts

There is no automated unit or end-to-end test suite yet. These checks run instead.

```bash
# server
cd server
npm run check          # every default import resolves; every module imports what it uses
npm run doctor         # environment and connectivity report
npm run models         # lists models the configured AI provider can use
npm run check:ai       # exercises the AI provider layer

# client
cd client
npm run check          # JSX components defined; CSS braces balanced; map glyphs cover all categories
npm run build          # production build
```

To check the classifier service on its own: `curl http://127.0.0.1:8000/health`.

---

## Troubleshooting

**`Could not find a version that satisfies the requirement tensorflow-cpu`**
You are on Python 3.13. Install Python 3.12 and create the virtual environment with it.

**Image service fails to load the `.keras` files**
Install TensorFlow 2.16 or later. Earlier versions cannot read the Keras 3 model files.

**Server stops at boot listing missing variables**
Add each named variable to `server/.env`. The message gives the exact place in the Supabase dashboard where the value is found.

**`ERROR: 42703 column ... does not exist` or the server returns a schema error**
A migration has not been applied. The server's boot check names the file. Apply it, then restart.

**`ERROR: 42725 function ... is not unique`**
An earlier version of a function still exists alongside a changed signature. `0027_fix_function_overload.sql` removes the old one.

**`ERROR: 42P16 cannot drop columns from view`**
`create or replace view` cannot change a view's column list. The corrected migrations drop the view first.

**`ERROR: 22P02 invalid input value for enum complaint_status`** or **`42804 ... is of type complaint_status but expression is of type text`**
A status value does not exist in the enum, or a `CASE` expression needs a cast. Use `(case ... end)::complaint_status`.

**Public pages show "Could not load"**
Check that `VITE_API_URL` points at the running API and that `CLIENT_ORIGIN` matches the web app's address.

---

## Known limitations

- The classifier is trained on a small set of web-sourced images. Accuracy on resident photographs has not been measured.
- Three trained labels (`footpath_encroachment`, `public_toilet_unusable`, `stray_animal_concern`) have no knowledge-base description yet. They currently show a generic description.
- Video is stored and routed to a person. It is not classified.
- The duplicate score does not yet include the time factor. Grouping is automatic, with no reviewer confirmation step.
- Report text is assembled from templates. A language model is optional and is used only for planning in the agent and for an optional opening paragraph.
- Interface translation is complete only for notifications (English, Hindi and Marathi).
- The demo institutions, accounts and reports are fictitious. No real partnership is implied.

---

## Licence and credits

Licence: [to be added by the copyright holder].

Author: [name of author or team].

Acknowledgements: Smart India Hackathon 2026 for problem statement SIH26043. The classifier uses MobileNetV2 pretrained weights (ImageNet). Maps use OpenStreetMap data.
