-- Almanac schema v3: website sales board.

-- A 10 × 5 board of 50 slots; a row here means that slot is sold. Each sale
-- carries its own down payment and monthly price so the terms can change per
-- client later without touching past sales.
CREATE TABLE website_sales (
  slot          INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 50),
  sold_on       TEXT NOT NULL,
  client        TEXT,
  down_cents    INTEGER NOT NULL DEFAULT 0 CHECK (down_cents >= 0),
  monthly_cents INTEGER NOT NULL DEFAULT 20000 CHECK (monthly_cents >= 0),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
