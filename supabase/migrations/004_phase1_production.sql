-- Phase 1 production foundations:
-- 1) source snapshots
-- 2) incremental INEP ingestion metadata
-- 3) lead quality audits

CREATE TABLE IF NOT EXISTS school_source_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_name TEXT NOT NULL,
    source_version TEXT,
    snapshot_mode TEXT NOT NULL DEFAULT 'incremental'
        CHECK (snapshot_mode IN ('full', 'incremental')),
    watermark TEXT,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    records_read INTEGER NOT NULL DEFAULT 0,
    records_changed INTEGER NOT NULL DEFAULT 0,
    records_upserted INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sss_source_status ON school_source_snapshots(source_name, status);
CREATE INDEX IF NOT EXISTS idx_sss_started_at ON school_source_snapshots(started_at DESC);

DROP TRIGGER IF EXISTS trg_school_source_snapshots_updated_at ON school_source_snapshots;
CREATE TRIGGER trg_school_source_snapshots_updated_at
BEFORE UPDATE ON school_source_snapshots
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS school_source_snapshot_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_id UUID NOT NULL REFERENCES school_source_snapshots(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_hash TEXT NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (snapshot_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ssi_entity ON school_source_snapshot_items(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ssi_snapshot ON school_source_snapshot_items(snapshot_id);

ALTER TABLE inep_schools
    ADD COLUMN IF NOT EXISTS source_name TEXT,
    ADD COLUMN IF NOT EXISTS source_hash TEXT,
    ADD COLUMN IF NOT EXISTS source_last_ingested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source_snapshot_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_inep_source_snapshot'
    ) THEN
        ALTER TABLE inep_schools
            ADD CONSTRAINT fk_inep_source_snapshot
            FOREIGN KEY (source_snapshot_id)
            REFERENCES school_source_snapshots(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inep_source_hash ON inep_schools(source_hash);
CREATE INDEX IF NOT EXISTS idx_inep_source_snapshot ON inep_schools(source_snapshot_id);

UPDATE inep_schools
SET source_name = COALESCE(source_name, 'inep_microdados_censo_escolar')
WHERE source_name IS NULL;

CREATE TABLE IF NOT EXISTS school_lead_quality_audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL UNIQUE REFERENCES school_leads(id) ON DELETE CASCADE,
    audit_version TEXT NOT NULL DEFAULT 'v1',
    quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
    presence_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    issues JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_snapshot_id UUID REFERENCES school_source_snapshots(id) ON DELETE SET NULL,
    audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slqa_score ON school_lead_quality_audits(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_slqa_audited_at ON school_lead_quality_audits(audited_at DESC);

DROP TRIGGER IF EXISTS trg_school_lead_quality_audits_updated_at ON school_lead_quality_audits;
CREATE TRIGGER trg_school_lead_quality_audits_updated_at
BEFORE UPDATE ON school_lead_quality_audits
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

