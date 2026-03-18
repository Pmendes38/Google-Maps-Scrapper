-- QEdu live sync cache and provenance tracking.

CREATE TABLE IF NOT EXISTS school_qedu_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID REFERENCES school_leads(id) ON DELETE SET NULL,
    inep_code TEXT NOT NULL UNIQUE,
    source_snapshot_id UUID REFERENCES school_source_snapshots(id) ON DELETE SET NULL,
    qedu_hash TEXT NOT NULL,
    qedu_school JSONB NOT NULL DEFAULT '{}'::jsonb,
    qedu_censo JSONB NOT NULL DEFAULT '{}'::jsonb,
    qedu_tr JSONB NOT NULL DEFAULT '{}'::jsonb,
    qedu_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
    dependencia_id INTEGER,
    dependencia TEXT,
    localizacao_id INTEGER,
    localizacao TEXT,
    situacao_funcionamento TEXT,
    censo_ano INTEGER,
    tr_ano INTEGER,
    qtd_matriculas INTEGER,
    qtd_professores INTEGER,
    qtd_funcionarios INTEGER,
    taxa_aprovacao DECIMAL(5, 2),
    taxa_reprovacao DECIMAL(5, 2),
    taxa_abandono DECIMAL(5, 2),
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sqp_inep_code ON school_qedu_profiles(inep_code);
CREATE INDEX IF NOT EXISTS idx_sqp_lead_id ON school_qedu_profiles(lead_id);
CREATE INDEX IF NOT EXISTS idx_sqp_last_synced ON school_qedu_profiles(last_synced_at DESC);

DROP TRIGGER IF EXISTS trg_school_qedu_profiles_updated_at ON school_qedu_profiles;
CREATE TRIGGER trg_school_qedu_profiles_updated_at
BEFORE UPDATE ON school_qedu_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
