# Demo accounts

Every account below is created by `npm run db:seed` (from `server/`) and exists
only in the demo dataset. They live on `demo.civiclense.in`, which is not a real
domain and receives no mail. None of these people exist.

**Password, every account:** `CivicLense@Demo2026`

Reseeding keeps the same accounts — the email is the stable identity, so
credentials written into a script or a slide keep working across reruns.

---

## The six roles

| Role | Email | Shows |
|---|---|---|
| Resident | `ayesha.shaikh@demo.civiclense.in` | The heaviest reporter in the dataset. Reports across the full lifecycle, confirmations, badges, and a top place on the leaderboard she earned from reward events rather than a number in a column. |
| Resident (quiet) | `ashwini.chavan@demo.civiclense.in` | Registered and never filed anything. What a new account actually looks like. |
| Ward officer | `sunil.ghorpade.officer@demo.civiclense.in` | Roads, L ward. A strong performer: assigned work, resolution proofs, and a high on-time rate on the officer leaderboard. |
| Ward officer (under pressure) | `ajay.survase.officer@demo.civiclense.in` | Encroachment. Carries genuinely overdue work and reports that were reopened — the other end of the same leaderboard. |
| Ward administrator | `surekha.bhalerao.staff@demo.civiclense.in` | Solid Waste Management. Complaint queues, challenges raised in the department, proposal approvals and the audit trail. |
| City administrator | `commissioner@demo.civiclense.in` | Every ward and department, all institutions, analytics, AI performance and the full audit log. |
| Campus coordinator | `coordinator.sahyadriinstitute@demo.civiclense.in` | Sahyadri Institute — the flooding storyline end to end: matched challenge, proposal through revision to approval, quotation, project, milestones and pilot results. |
| Faculty mentor | `meera.kulkarni.f1@demo.civiclense.in` | Dr Meera Kulkarni, Civil Engineering. Mentor on the Kurla flooding project; sees the proposal versions and the project workspace. |
| Student | `aarav.kulkarni.s1@demo.civiclense.in` | Team member on the flooding project, with skills, department and milestone assignments. |

---

## Campus coordinators, one per institution

| Institution | Email |
|---|---|
| Sahyadri Institute of Engineering & Technology | `coordinator.sahyadriinstitute@demo.civiclense.in` |
| Konkan College of Engineering | `coordinator.konkancollege@demo.civiclense.in` |
| Deccan Institute of Environmental Sciences | `coordinator.deccaninstitute@demo.civiclense.in` |
| Matoshri Institute of Technology | `coordinator.matoshriinstitute@demo.civiclense.in` |
| Vidyasagar Institute of Urban Planning | `coordinator.vidyasagarinstitute@demo.civiclense.in` |
| Anand Vidyapeeth College of Engineering | `coordinator.anandvidyapeeth@demo.civiclense.in` |
| Rachana Sansad Academy of Architecture & Design | `coordinator.rachanasansadacademy@demo.civiclense.in` |
| Bharati Institute of Public Health | `coordinator.bharatiinstitute@demo.civiclense.in` |
| Saraswati Institute of Technology & Management | `coordinator.saraswatiinstitute@demo.civiclense.in` |
| Ratnagiri College of Rural Technology | `coordinator.ratnagiricollege@demo.civiclense.in` |

## Ward administrators, one per department

`<firstname>.<lastname>.staff@demo.civiclense.in` — Nandkumar Pednekar (Roads),
Surekha Bhalerao (Solid Waste), Anwar Shaikh (Water Supply), Deepak Chindarkar
(Street Lighting), Rupali Gawand (Traffic), Vidya Sathe (Public Health), Zainab
Merchant (Food Safety), Bhaskar Ovhal (Storm Water Drains), Smita Karkera
(Gardens), Rajendra Waghmare (Encroachment).

## Everyone else

- **Officers** — `<firstname>.<lastname>.officer@demo.civiclense.in`, thirty of them across ten departments.
- **Residents** — `<firstname>.<lastname>@demo.civiclense.in`, sixty-two.
- **Faculty** — `<firstname>.<lastname>.f<n>@demo.civiclense.in`, numbered in the order they appear in `server/scripts/demo/people.js`.
- **Students** — `<firstname>.<lastname>.s<n>@demo.civiclense.in`, same convention.

Titles are dropped from the email, so Dr Meera Kulkarni is `meera.kulkarni.f1`.

---

## What to show, and where

**The full lifecycle, in one challenge.** Sign in as the Sahyadri coordinator and
open the Kurla waterlogging challenge. Nine resident reports over three months
became a cluster, the cluster became a challenge, the challenge matched four
institutions on overlapping expertise, one wrote a proposal, the ward office sent
it back for revision with a reason, the revised version was approved, a costed
plan was accepted, and the project is now in pilot with two rainfall events
recorded. The first proposal version is deliberately written the way a student
writes a first draft; the second is what it became after review.

**The leaderboards are computed, not typed.** The resident ranking is the sum of
each person's reward events; the officer ranking is resolution against the SLA
deadline recorded on each complaint. Both can be reproduced with SQL against the
tables, which is the only reason to believe them.

**Not everything succeeded.** One proposal was rejected, with the reviewer's
reason. Nine challenges have no proposal at all. Some reports were closed and
reopened because the resident said the problem came back, and the officers
carrying those look worse on the leaderboard, correctly.

---

## Removing it

```bash
cd server && npm run db:reset-demo
```

Deletes only records flagged as demo — `is_demo` on complaints, clusters,
challenges, institutions and profiles, and everything reachable from them — plus
the demo files under `demo-seed/` in storage. Reference data (wards, categories,
departments, contracts, establishments) is read by the seed and never written,
and anything not flagged demo is never touched. A demo account that some
non-demo record still points at is deliberately left in place rather than
deleted, so a reset can never orphan a real row.
