CREATE TABLE IF NOT EXISTS pipeline_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES school_leads(id) ON DELETE CASCADE,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    owner TEXT,
    notes TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ph_lead ON pipeline_history(lead_id);
CREATE INDEX idx_ph_changed ON pipeline_history(changed_at DESC);

CREATE OR REPLACE FUNCTION log_pipeline_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage THEN
        INSERT INTO pipeline_history (lead_id, from_stage, to_stage, owner)
        VALUES (NEW.id, OLD.pipeline_stage, NEW.pipeline_stage, NEW.owner);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_history ON school_leads;

CREATE TRIGGER trg_pipeline_history
AFTER UPDATE ON school_leads
FOR EACH ROW EXECUTE FUNCTION log_pipeline_change();
