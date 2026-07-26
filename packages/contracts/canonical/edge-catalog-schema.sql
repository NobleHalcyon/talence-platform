-- Talence read-only robot catalog snapshot schema
-- Snapshot schema version: 1
-- This file defines the logical SQLite contract. The generated artifact is immutable.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;
PRAGMA user_version = 1;

CREATE TABLE snapshot_meta (
  singleton_id                INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  catalog_version             TEXT NOT NULL,
  snapshot_schema_version     INTEGER NOT NULL CHECK (snapshot_schema_version = 1),
  game_code                   TEXT NOT NULL CHECK (game_code = 'mtg'),
  generated_at                TEXT NOT NULL,
  provider_observed_at        TEXT NOT NULL,
  source_sha256               TEXT NOT NULL CHECK (length(source_sha256) = 64),
  api_contract_version        TEXT NOT NULL,
  minimum_client_version      TEXT NOT NULL,
  sets_count                  INTEGER NOT NULL CHECK (sets_count >= 0),
  oracle_cards_count          INTEGER NOT NULL CHECK (oracle_cards_count >= 0),
  printings_count             INTEGER NOT NULL CHECK (printings_count >= 0),
  faces_count                 INTEGER NOT NULL CHECK (faces_count >= 0),
  prices_count                INTEGER NOT NULL CHECK (prices_count >= 0)
);

CREATE TABLE sets (
  set_id                      TEXT PRIMARY KEY,
  code                        TEXT NOT NULL COLLATE NOCASE,
  name                        TEXT NOT NULL,
  set_type                    TEXT,
  released_at                 TEXT,
  parent_set_id               TEXT,
  digital                     INTEGER NOT NULL CHECK (digital IN (0, 1)),
  icon_svg_uri                TEXT,
  FOREIGN KEY (parent_set_id) REFERENCES sets(set_id)
);
CREATE UNIQUE INDEX uq_sets_code ON sets(code COLLATE NOCASE);
CREATE INDEX idx_sets_released_at ON sets(released_at);

CREATE TABLE oracle_cards (
  oracle_card_id              TEXT PRIMARY KEY,
  name                        TEXT NOT NULL,
  normalized_name             TEXT NOT NULL,
  mana_cost                   TEXT,
  mana_value                  REAL,
  type_line                   TEXT,
  oracle_text                 TEXT,
  colors_json                 TEXT NOT NULL,
  color_identity_json         TEXT NOT NULL,
  keywords_json               TEXT NOT NULL,
  reserved                    INTEGER NOT NULL CHECK (reserved IN (0, 1))
);
CREATE INDEX idx_oracle_cards_normalized_name ON oracle_cards(normalized_name);
CREATE INDEX idx_oracle_cards_mana_value ON oracle_cards(mana_value);

CREATE TABLE printings (
  printing_id                 TEXT PRIMARY KEY,
  oracle_card_id              TEXT,
  set_id                      TEXT NOT NULL,
  collector_number            TEXT NOT NULL,
  language                    TEXT NOT NULL,
  printed_name                TEXT,
  rarity                      TEXT,
  layout                      TEXT,
  released_at                 TEXT,
  digital                     INTEGER NOT NULL CHECK (digital IN (0, 1)),
  promo                       INTEGER NOT NULL CHECK (promo IN (0, 1)),
  oversized                   INTEGER NOT NULL CHECK (oversized IN (0, 1)),
  variation                   INTEGER NOT NULL CHECK (variation IN (0, 1)),
  finishes_json               TEXT NOT NULL,
  frame_effects_json          TEXT NOT NULL,
  border_color                TEXT,
  artist                      TEXT,
  scryfall_uri                TEXT,
  default_browse              INTEGER NOT NULL CHECK (default_browse IN (0, 1)),
  FOREIGN KEY (oracle_card_id) REFERENCES oracle_cards(oracle_card_id),
  FOREIGN KEY (set_id) REFERENCES sets(set_id)
);
CREATE INDEX idx_printings_oracle_card ON printings(oracle_card_id);
CREATE INDEX idx_printings_set_collector ON printings(set_id, collector_number, language);
CREATE INDEX idx_printings_default_browse ON printings(default_browse, digital, released_at);

CREATE TABLE faces (
  face_id                     TEXT PRIMARY KEY,
  printing_id                 TEXT NOT NULL,
  face_index                  INTEGER NOT NULL CHECK (face_index >= 0),
  name                        TEXT NOT NULL,
  mana_cost                   TEXT,
  type_line                   TEXT,
  oracle_text                 TEXT,
  colors_json                 TEXT NOT NULL,
  power                       TEXT,
  toughness                   TEXT,
  loyalty                     TEXT,
  defense                     TEXT,
  artist                      TEXT,
  image_small_uri             TEXT,
  image_normal_uri            TEXT,
  image_large_uri             TEXT,
  image_png_uri               TEXT,
  art_crop_uri                TEXT,
  border_crop_uri             TEXT,
  FOREIGN KEY (printing_id) REFERENCES printings(printing_id) ON DELETE CASCADE,
  UNIQUE (printing_id, face_index)
);
CREATE INDEX idx_faces_printing ON faces(printing_id, face_index);

CREATE TABLE legalities (
  oracle_card_id              TEXT NOT NULL,
  format_code                 TEXT NOT NULL,
  legality                    TEXT NOT NULL CHECK (legality IN ('legal', 'not_legal', 'restricted', 'banned')),
  PRIMARY KEY (oracle_card_id, format_code),
  FOREIGN KEY (oracle_card_id) REFERENCES oracle_cards(oracle_card_id) ON DELETE CASCADE
);

CREATE TABLE current_prices (
  printing_id                 TEXT NOT NULL,
  provider                    TEXT NOT NULL,
  currency                    TEXT NOT NULL,
  finish                      TEXT NOT NULL CHECK (finish IN ('nonfoil', 'foil', 'etched')),
  amount                      TEXT NOT NULL,
  observed_at                 TEXT NOT NULL,
  ingested_at                 TEXT NOT NULL,
  PRIMARY KEY (printing_id, provider, currency, finish),
  FOREIGN KEY (printing_id) REFERENCES printings(printing_id) ON DELETE CASCADE
);
CREATE INDEX idx_current_prices_printing ON current_prices(printing_id);

CREATE TABLE external_ids (
  entity_type                 TEXT NOT NULL CHECK (entity_type IN ('oracle_card', 'printing', 'set')),
  entity_id                   TEXT NOT NULL,
  provider                    TEXT NOT NULL,
  identifier_type             TEXT NOT NULL,
  identifier_value            TEXT NOT NULL,
  PRIMARY KEY (provider, identifier_type, identifier_value)
);
CREATE INDEX idx_external_ids_entity ON external_ids(entity_type, entity_id);

-- Contentless FTS table populated deterministically by the snapshot generator.
CREATE VIRTUAL TABLE oracle_cards_fts USING fts5(
  oracle_card_id UNINDEXED,
  name,
  normalized_name,
  type_line,
  oracle_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Generation acceptance checks:
--   PRAGMA quick_check;              -- must return "ok"
--   PRAGMA foreign_key_check;        -- must return zero rows
--   SELECT user_version FROM pragma_user_version; -- must equal 1
-- The generator must VACUUM only after all rows and indexes are complete.
