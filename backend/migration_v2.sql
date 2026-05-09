-- migration_v2.sql — Pure SQL version of Alembic revision 0003_v2_emotion_features
-- Use this for emergency manual application or environments without Python.
-- Idempotent: all ADD COLUMN statements use IF NOT EXISTS.
--
-- Apply:   psql -U <user> -d <db> -f migration_v2.sql
-- Rollback: see migration_v2_downgrade.sql (or run Alembic downgrade)

BEGIN;

-- ============================================================
-- songs table — v2 emotion columns
-- ============================================================

-- Russell circumplex arousal coordinate (valence already exists)
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS arousal FLOAT DEFAULT 0.5;

-- Normalised distance from circumplex centre [0,1]
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS intensity FLOAT DEFAULT 0.5;

-- Dominant Ekman emotion string
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS dominant_emotion VARCHAR(20);

-- Full probability distribution over 7 Ekman emotions (JSONB)
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS emotion_probs JSONB;

-- Pre-computed mood scores for all 10 UI moods (JSONB)
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS mood_scores JSONB;

-- Librosa-extracted audio features (cleaner naming than Spotify columns)
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS tempo_bpm FLOAT;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS energy_score FLOAT;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS acousticness_score FLOAT;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS danceability_score FLOAT;

-- Essentia ML classifier probabilities
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS ml_mood_happy FLOAT;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS ml_mood_sad FLOAT;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS ml_mood_relaxed FLOAT;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS ml_mood_aggressive FLOAT;

-- Pipeline audit columns
ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS features_extracted_at TIMESTAMP;

ALTER TABLE songs
    ADD COLUMN IF NOT EXISTS feature_extraction_version VARCHAR(10) NOT NULL DEFAULT 'v1';

-- ============================================================
-- songs — indexes
-- ============================================================

-- Composite BTREE on (valence, arousal) for circumplex range queries
CREATE INDEX IF NOT EXISTS ix_songs_valence_arousal
    ON songs (valence, arousal);

-- BTREE on dominant_emotion for emotion-filtered queries
CREATE INDEX IF NOT EXISTS ix_songs_dominant_emotion
    ON songs (dominant_emotion);

-- GIN on mood_scores JSONB for containment / key-existence queries
CREATE INDEX IF NOT EXISTS ix_songs_mood_scores
    ON songs USING GIN (mood_scores);

-- BTREE on feature_extraction_version for v1/v2 pool filtering
CREATE INDEX IF NOT EXISTS ix_songs_feature_version
    ON songs (feature_extraction_version);

-- ============================================================
-- users table — emotion vector
-- ============================================================

-- 7-dim float dict: {joy: 0.0, sadness: 0.0, anger: 0.0, …}
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS emotion_vector JSONB;

-- Mark the applied Alembic revision so `alembic current` stays accurate
-- (only needed if Alembic is also being used in the same environment)
-- INSERT INTO alembic_version (version_num)
-- VALUES ('0003_v2_emotion_features')
-- ON CONFLICT (version_num) DO NOTHING;

COMMIT;
