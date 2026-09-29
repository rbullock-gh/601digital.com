# Almanac

A private, local-first personal operating system: work, money, projects,
training, body, progress photos, a daily rating and journal, a vision board, a
travel map, and screen time. Each thing is logged once, and every dashboard,
calendar, goal, review and insight is derived from those records.

It runs on your own machine. There are no accounts, no cloud, and no analytics.

## Running it

Requires Node 20 or newer.

```bash
cd almanac
npm install
npm run serve        # builds the app, then starts it
# → http://127.0.0.1:4321
```

After the first build, `npm start` is enough. On first launch you choose between
**Start fresh** (your real data) and **Explore with sample data**. The sample
dataset is kept in a separate database. Delete it from the banner or from
Settings whenever you're ready.

For development with hot reload: `npm run dev` (Vite on :5173, API on :4321).

### Where your data lives

Everything is in **`~/Almanac`** unless you set `ALMANAC_DATA_DIR`:

```
~/Almanac/
  almanac.db          SQLite database — every record
  photos/YYYY/MM/     Progress photos, exactly as uploaded (never re-encoded)
  backups/            Automatic daily database snapshots (last 14) and any
                      copies set aside before a restore, import or reset
  sample/             The sample dataset, if you loaded one (safe to delete)
```

### Using it on your phone

Almanac is a web app, so any device that can reach the server can use it. Add it
to your home screen for an app-like, full-screen experience.

```bash
ALMANAC_HOST=0.0.0.0 ALMANAC_PASSCODE='choose-something' npm start
```

- `ALMANAC_HOST=0.0.0.0` lets other devices on your network connect
  (open `http://<your-computer's-ip>:4321` on your phone).
- `ALMANAC_PASSCODE` turns on a simple lock screen. Set it whenever Almanac is
  reachable from anything other than your own computer.
- To reach it away from home without exposing it to the internet, use a private
  network such as Tailscale and open the machine's Tailscale address.
- The live camera guide for progress photos (last month's photo as an overlay)
  needs HTTPS or localhost. Everywhere else, photo upload uses the phone's
  normal camera and picker.

| Variable            | Default         | Purpose                                  |
| ------------------- | --------------- | ---------------------------------------- |
| `ALMANAC_DATA_DIR`  | `~/Almanac`     | Where the database and photos live       |
| `ALMANAC_PORT`      | `4321`          | HTTP port                                |
| `ALMANAC_HOST`      | `127.0.0.1`     | Interface to listen on                   |
| `ALMANAC_PASSCODE`  | (off)           | Require a passcode (cookie, 1 year)      |

## Backups

Settings → Your data:

- **Download backup** creates one `.zip` with the database, every photo, and a
  manifest. It restores everything.
- **Restore** replaces current data with a backup. What was there is first moved
  to `backups/before-restore-<time>/`.
- **Export JSON / Import JSON** covers every record as readable JSON. Photos
  aren't included; use the zip for those.
- **CSV exports** cover work sessions, income, all earnings, workout sets, PRs,
  body measurements, days with journal entries, screen time, and trips.
- Deleting anything moves it to **Recently deleted**, where it can be restored.
  Reset moves the whole dataset into `backups/` rather than destroying it.

Keep a copy of the backup zip somewhere other than this computer.

## How it's built

```
server/                 Fastify + better-sqlite3 (TypeScript, run with tsx)
  db/migrations/        Versioned SQL schema (PRAGMA user_version)
  domain/               All business logic: work, fitness (PR detection), body
                        & photos, days, goals, stats, summaries, insights,
                        reviews, search, backup/restore, sample data,
                        travel (places, visits, offline city search),
                        screen time, vision board
  routes/api.ts         JSON API
src/                    React 19 + React Router + TanStack Query (Vite)
  components/           Shell, charts (SVG, no chart library), year grid,
                        travel map (d3-geo), dialogs, command palette,
                        quick add, timer
  pages/                One file per screen
  features/             Forms and pieces shared between screens
  styles/               Design tokens (light, dark, Tiffany) and components
shared/                 Date math, units, types — used by both sides
tests/                  Domain tests (Vitest) and a Playwright workflow test
```

Principles the code follows:

- **One entry, everything updates.** Totals are never stored. Every
  screen computes from the raw records, and every write refreshes every view.
- **Dates are local calendar dates.** The browser sends its date and time with
  each request, so "today" is always yours, wherever the server runs.
- **Units are stored canonically** (kg, cm, cents) and converted for display.
  Changing lb/kg or in/cm never loses precision.
- **Rates are snapshotted** on each work session, so changing a default rate
  never rewrites past earnings.
- **PRs are detected** from sets (heaviest weight, estimated 1RM by Epley, and
  more reps at a load than ever before). They're recomputed whenever a workout
  is edited or deleted, and the first session of an exercise is the baseline.
- **Insights are arithmetic**, shown only above minimum sample sizes.
  Relationships between areas are labelled as correlations.
- **Screen time is a limit, not a total.** Screen-time goals pass while your
  average over the days you logged stays under the target; an unlogged day is
  never counted as a pass.
- **The map is offline.** Country and state shapes (Natural Earth, via
  `world-atlas` / `us-atlas`) and a 138,000-city list (GeoNames, via
  `all-the-cities`) ship with the app. City search, dropping a pin, and drawing
  the map all happen on your machine. No tile servers or geocoding APIs.
- **Vision cards check themselves off.** A card linked to a target goal is
  achieved when the goal is reached. One linked to a bucket-list place is
  achieved when you log a trip there. Images are stored exactly as uploaded.

## Tests

```bash
npm test             # domain tests (dates, earnings, PRs, goals, ratings,
                     # screen time, travel, vision board, backup/restore,
                     # sample isolation)
npm run test:e2e     # builds, boots a throwaway server, drives the real UI
npm run typecheck
```
