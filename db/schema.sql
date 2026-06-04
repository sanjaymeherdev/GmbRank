-- ============================================================
-- GBP RANK TRACKER - NEON POSTGRES SCHEMA
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- BUSINESSES (owned by a user)
CREATE TABLE IF NOT EXISTS businesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- LOCATIONS (belong to a business)
CREATE TABLE IF NOT EXISTS locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_string TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, location_string)
);

-- KEYWORD SETS (belong to a location)
CREATE TABLE IF NOT EXISTS keyword_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  set_name    TEXT NOT NULL,
  keywords    TEXT[] NOT NULL,
  version     INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RANK RESULTS (one row per keyword per check run)
CREATE TABLE IF NOT EXISTS rank_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_set_id  UUID NOT NULL REFERENCES keyword_sets(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  position        INT,               -- NULL means not found
  business_title  TEXT,
  address         TEXT,
  phone           TEXT,
  rating          TEXT,
  reviews         TEXT,
  checked_at      TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for fast lookups
CREATE INDEX IF NOT EXISTS idx_businesses_user_id     ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_locations_business_id  ON locations(business_id);
CREATE INDEX IF NOT EXISTS idx_keyword_sets_location  ON keyword_sets(location_id);
CREATE INDEX IF NOT EXISTS idx_rank_results_kset      ON rank_results(keyword_set_id);
CREATE INDEX IF NOT EXISTS idx_rank_results_checked   ON rank_results(keyword_set_id, checked_at DESC);
