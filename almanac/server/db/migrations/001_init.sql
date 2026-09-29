-- Almanac schema v1.
--
-- Conventions
--   · Dates are local calendar dates 'YYYY-MM-DD'; clock times are 'HH:MM'.
--   · Money is integer cents. Mass is kilograms, length centimetres (REAL).
--   · Top-level records are soft-deleted (deleted_at) so every delete can be undone
--     and nothing historical disappears by accident. Child rows cascade with parents.
--   · Nothing that can be derived is stored, except `minutes` and `earned_cents` on
--     work sessions, which the server computes from the same row on every write, and
--     `personal_records`, a rebuildable cache of PR detection.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE projects (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  client            TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  color             TEXT,
  hourly_rate_cents INTEGER,
  notes             TEXT,
  completed_on      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX projects_name ON projects (name COLLATE NOCASE);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX categories_name ON categories (name COLLATE NOCASE);

CREATE TABLE work_sessions (
  id                INTEGER PRIMARY KEY,
  date              TEXT NOT NULL,
  start_time        TEXT,
  end_time          TEXT,
  break_minutes     INTEGER NOT NULL DEFAULT 0,
  minutes           INTEGER NOT NULL CHECK (minutes >= 0),
  project_id        INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  category_id       INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  description       TEXT,
  pay_type          TEXT NOT NULL DEFAULT 'hourly' CHECK (pay_type IN ('hourly', 'flat', 'unpaid')),
  hourly_rate_cents INTEGER,
  flat_amount_cents INTEGER,
  earned_cents      INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  deleted_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX work_sessions_date ON work_sessions (date) WHERE deleted_at IS NULL;
CREATE INDEX work_sessions_project ON work_sessions (project_id, date) WHERE deleted_at IS NULL;

CREATE TABLE income (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  source       TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('flat', 'project', 'other')),
  project_id   INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  category_id  INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  notes        TEXT,
  deleted_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX income_date ON income (date) WHERE deleted_at IS NULL;

-- Every dollar earned, from either source. Money screens read only this view.
CREATE VIEW earnings AS
  SELECT 'session' AS source, id, date, earned_cents AS cents, project_id, category_id,
         CASE pay_type WHEN 'flat' THEN 'flat' ELSE 'hourly' END AS kind,
         COALESCE(NULLIF(description, ''), 'Work session') AS label, minutes
    FROM work_sessions
   WHERE deleted_at IS NULL AND earned_cents > 0
  UNION ALL
  SELECT 'income', id, date, amount_cents, project_id, category_id, kind, source, 0
    FROM income
   WHERE deleted_at IS NULL;

CREATE TABLE days (
  date       TEXT PRIMARY KEY,
  rating     INTEGER CHECK (rating IN (1, 2, 3)), -- 1 bad · 2 okay · 3 good · NULL not rated
  rated_at   TEXT,
  journal    TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL,
  time       TEXT,
  body       TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX notes_date ON notes (date) WHERE deleted_at IS NULL;

CREATE TABLE accomplishments (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  text         TEXT NOT NULL,
  is_milestone INTEGER NOT NULL DEFAULT 0,
  deleted_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX accomplishments_date ON accomplishments (date) WHERE deleted_at IS NULL;

CREATE TABLE exercises (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  muscle_group TEXT,
  kind         TEXT NOT NULL DEFAULT 'weighted' CHECK (kind IN ('weighted', 'bodyweight')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX exercises_name ON exercises (name COLLATE NOCASE);

CREATE TABLE workouts (
  id               INTEGER PRIMARY KEY,
  date             TEXT NOT NULL,
  name             TEXT NOT NULL,
  start_time       TEXT,
  duration_minutes INTEGER,
  notes            TEXT,
  deleted_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX workouts_date ON workouts (date) WHERE deleted_at IS NULL;

CREATE TABLE workout_exercises (
  id          INTEGER PRIMARY KEY,
  workout_id  INTEGER NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises (id),
  position    INTEGER NOT NULL DEFAULT 0,
  notes       TEXT
);
CREATE INDEX workout_exercises_workout ON workout_exercises (workout_id);
CREATE INDEX workout_exercises_exercise ON workout_exercises (exercise_id);

CREATE TABLE sets (
  id                  INTEGER PRIMARY KEY,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises (id) ON DELETE CASCADE,
  position            INTEGER NOT NULL DEFAULT 0,
  weight_kg           REAL,
  reps                INTEGER,
  rpe                 REAL,
  is_warmup           INTEGER NOT NULL DEFAULT 0,
  notes               TEXT
);
CREATE INDEX sets_workout_exercise ON sets (workout_exercise_id);

-- Rebuildable cache. Recomputed per exercise whenever that exercise's sets change.
CREATE TABLE personal_records (
  id             INTEGER PRIMARY KEY,
  exercise_id    INTEGER NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
  workout_id     INTEGER NOT NULL REFERENCES workouts (id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('weight', 'e1rm', 'reps')),
  weight_kg      REAL,
  reps           INTEGER,
  value          REAL NOT NULL,
  previous_value REAL
);
CREATE INDEX personal_records_date ON personal_records (date);
CREATE INDEX personal_records_exercise ON personal_records (exercise_id, date);

CREATE TABLE body_metrics (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  weight_kg    REAL,
  waist_cm     REAL,
  chest_cm     REAL,
  arms_cm      REAL,
  forearms_cm  REAL,
  shoulders_cm REAL,
  thighs_cm    REAL,
  calves_cm    REAL,
  neck_cm      REAL,
  body_fat_pct REAL,
  notes        TEXT,
  deleted_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX body_metrics_date ON body_metrics (date) WHERE deleted_at IS NULL;

-- One set of progress photos per month. Image files live on disk under the data
-- directory; rows hold paths relative to it, so a backup restores them intact.
CREATE TABLE photo_sets (
  id         INTEGER PRIMARY KEY,
  month      TEXT NOT NULL,
  date       TEXT NOT NULL,
  note       TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX photo_sets_month ON photo_sets (month) WHERE deleted_at IS NULL;

CREATE TABLE photos (
  id         INTEGER PRIMARY KEY,
  set_id     INTEGER NOT NULL REFERENCES photo_sets (id) ON DELETE CASCADE,
  angle      TEXT NOT NULL CHECK (angle IN ('front', 'side', 'back', 'other')),
  file       TEXT NOT NULL,
  thumb      TEXT,
  mime       TEXT,
  width      INTEGER,
  height     INTEGER,
  bytes      INTEGER,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX photos_set ON photos (set_id) WHERE deleted_at IS NULL;

CREATE TABLE goals (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  metric      TEXT NOT NULL,
  period      TEXT NOT NULL CHECK (period IN ('day', 'week', 'month', 'year', 'custom', 'target')),
  recurring   INTEGER NOT NULL DEFAULT 1,
  start_date  TEXT,
  end_date    TEXT,
  target      REAL NOT NULL,
  baseline    REAL,
  exercise_id INTEGER REFERENCES exercises (id) ON DELETE SET NULL,
  project_id  INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  position    INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE goal_checkins (
  id         INTEGER PRIMARY KEY,
  goal_id    INTEGER NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  value      REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX goal_checkins_goal ON goal_checkins (goal_id, date);

-- Written reflections. The numbers in a review are always derived live.
CREATE TABLE reviews (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('week', 'month', 'year')),
  period_start TEXT NOT NULL,
  answers      TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX reviews_period ON reviews (kind, period_start);
