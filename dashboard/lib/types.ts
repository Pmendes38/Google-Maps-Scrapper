export type SchoolSegment =
  | "creche/bercario"
  | "educacao infantil"
  | "ensino fundamental"
  | "ensino medio"
  | "ensino tecnico"
  | "ensino superior"
  | "idiomas/bilingue"
  | "ed. basica"
  | "indefinido";

export type ICPMatch = "alto" | "medio" | "baixo";
export type Prioridade = "imediata" | "normal" | "baixa";
export type PipelineStage =
  | "Novo"
  | "Qualificado"
  | "1° Contato"
  | "Proposta Enviada"
  | "Ganho"
  | "Perdido";

export interface SchoolLead {
  id: string;
  name: string;
  place_type: string | null;
  school_segment: SchoolSegment | null;
  is_private: "Sim" | "Nao" | "Indefinido" | null;
  phone_number: string | null;
  phone_formatted: string | null;
  whatsapp_ready: "Sim" | "Nao" | null;
  website: string | null;
  email: string | null;
  address: string | null;
  bairro: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  cep_lat: number | null;
  cep_lng: number | null;
  reviews_count: number | null;
  reviews_average: number | null;
  opens_at: string | null;
  place_id: string | null;
  maps_url: string | null;
  cnpj: string | null;
  razao_social: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null;
  capital_social: number | null;
  porte: "ME" | "EPP" | "Demais" | null;
  cnae_descricao: string | null;
  inep_code: string | null;
  total_matriculas: number | null;
  ideb_af: number | null;
  ai_score: number | null;
  icp_match: ICPMatch | null;
  pain_points: string[] | null;
  abordagem_sugerida: string | null;
  prioridade: Prioridade | null;
  justificativa_score: string | null;
  pipeline_stage: PipelineStage;
  owner: string | null;
  notes: string | null;
  next_action: string | null;
  source: string;
  data_quality: number | null;
  scraped_at: string | null;
  created_at: string;
  updated_at: string;
}
