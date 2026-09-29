-- Almanac schema v2: vision board, travel map, screen time.

-- Places are unique locations on the map. A place is "visited" once you've been
-- there (with or without dated visits), "want" while it's on the bucket list,
-- and "home" for where you live. Coordinates are WGS84 degrees.
CREATE TABLE places (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  region       TEXT,
  country      TEXT,
  country_code TEXT,
  lat          REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng          REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  status       TEXT NOT NULL DEFAULT 'visited' CHECK (status IN ('visited', 'want', 'home')),
  notes        TEXT,
  deleted_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A dated stay at a place. A trip across several places is several visits
-- sharing a title.
CREATE TABLE visits (
  id         INTEGER PRIMARY KEY,
  place_id   INTEGER NOT NULL REFERENCES places (id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  title      TEXT,
  notes      TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (end_date >= start_date)
);
CREATE INDEX visits_dates ON visits (start_date, end_date) WHERE deleted_at IS NULL;
CREATE INDEX visits_place ON visits (place_id) WHERE deleted_at IS NULL;

-- Vision board cards: an image or a quote, optionally tied to a goal (which
-- then shows live progress) or a bucket-list place.
CREATE TABLE vision_items (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('image', 'quote')),
  title       TEXT,
  body        TEXT,
  area        TEXT,
  image       TEXT,
  thumb       TEXT,
  width       INTEGER,
  height      INTEGER,
  tone        TEXT,
  goal_id     INTEGER REFERENCES goals (id) ON DELETE SET NULL,
  place_id    INTEGER REFERENCES places (id) ON DELETE SET NULL,
  target_date TEXT,
  achieved_on TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per day. Categories are optional minutes per category, as JSON
-- (e.g. {"Social": 95, "Entertainment": 40}).
CREATE TABLE screen_time (
  date       TEXT PRIMARY KEY,
  minutes    INTEGER NOT NULL CHECK (minutes BETWEEN 0 AND 1440),
  pickups    INTEGER CHECK (pickups IS NULL OR pickups >= 0),
  categories TEXT,
  notes      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
