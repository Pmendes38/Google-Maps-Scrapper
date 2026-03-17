CREATE TABLE IF NOT EXISTS school_leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    place_type TEXT,
    school_segment TEXT,
    is_private TEXT,
    phone_number TEXT,
    phone_formatted TEXT,
    whatsapp_ready TEXT,
    website TEXT,
    email TEXT,
    address TEXT,
    bairro TEXT,
    city TEXT,
    state CHAR(2),
    cep CHAR(8),
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    reviews_count INTEGER,
    reviews_average DECIMAL(3, 1),
    opens_at TEXT,
    place_id TEXT UNIQUE,
    maps_url TEXT,
    introduction TEXT,
    cep_logradouro TEXT,
    cep_bairro TEXT,
    cep_cidade TEXT,
    cep_uf CHAR(2),
    cep_lat DECIMAL(10, 7),
    cep_lng DECIMAL(10, 7),
    cnpj CHAR(14),
    razao_social TEXT,
    situacao_cadastral TEXT,
    data_abertura DATE,
    capital_social DECIMAL(15, 2),
    porte TEXT,
    cnae_principal TEXT,
    cnae_descricao TEXT,
    socios JSONB,
    inep_code TEXT,
    total_matriculas INTEGER,
    matriculas_infantil INTEGER,
    matriculas_fundamental INTEGER,
    matriculas_medio INTEGER,
    ideb_ai DECIMAL(4, 1),
    ideb_af DECIMAL(4, 1),
    tem_internet BOOLEAN,
    tem_lab_informatica BOOLEAN,
    ai_score INTEGER CHECK (ai_score BETWEEN 0 AND 100),
    icp_match TEXT CHECK (icp_match IN ('alto', 'medio', 'baixo', NULL)),
    pain_points JSONB,
    abordagem_sugerida TEXT,
    prioridade TEXT CHECK (prioridade IN ('imediata', 'normal', 'baixa', NULL)),
    justificativa_score TEXT,
    scored_at TIMESTAMPTZ,
    pipeline_stage TEXT DEFAULT 'Novo' CHECK (pipeline_stage IN ('Novo','Qualificado','1° Contato','Proposta Enviada','Ganho','Perdido')),
    owner TEXT,
    notes TEXT,
    next_action TEXT,
    last_touch TIMESTAMPTZ,
    source TEXT DEFAULT 'gmaps_scraper',
    data_quality INTEGER CHECK (data_quality BETWEEN 0 AND 100),
    scraped_at TIMESTAMPTZ,
    enriched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sl_state ON school_leads(state);
CREATE INDEX idx_sl_segment ON school_leads(school_segment);
CREATE INDEX idx_sl_is_private ON school_leads(is_private);
CREATE INDEX idx_sl_ai_score ON school_leads(ai_score DESC NULLS LAST);
CREATE INDEX idx_sl_icp ON school_leads(icp_match);
CREATE INDEX idx_sl_pipeline ON school_leads(pipeline_stage);
CREATE INDEX idx_sl_cnpj ON school_leads(cnpj);
CREATE INDEX idx_sl_whatsapp ON school_leads(whatsapp_ready);
CREATE INDEX idx_sl_prioridade ON school_leads(prioridade);
CREATE INDEX idx_sl_geo ON school_leads(latitude, longitude);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_school_leads_updated_at
BEFORE UPDATE ON school_leads
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
