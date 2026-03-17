CREATE TABLE IF NOT EXISTS inep_schools (
    co_entidade TEXT PRIMARY KEY,
    no_entidade TEXT,
    cnpj TEXT,
    tp_rede INTEGER,
    qt_mat_bas INTEGER,
    qt_mat_inf INTEGER,
    qt_mat_fund INTEGER,
    qt_mat_med INTEGER,
    nu_ideb_ai DECIMAL(4, 1),
    nu_ideb_af DECIMAL(4, 1),
    in_internet BOOLEAN,
    in_lab_informatica BOOLEAN,
    tp_situacao INTEGER,
    co_municipio TEXT,
    no_municipio TEXT,
    sg_uf CHAR(2),
    matched_lead_id UUID REFERENCES school_leads(id)
);

CREATE INDEX idx_inep_cnpj ON inep_schools(cnpj);
CREATE INDEX idx_inep_uf ON inep_schools(sg_uf);
