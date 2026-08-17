export type Uso = "distribucion" | "insumo_cartera" | "insumo_cierre";
export type ScopeKey = "date" | "period" | "month" | "perfil";
export type Formato = "html" | "json" | "pdf" | "mp3";

export interface ReportTypeDef {
  id: string;
  label: string;
  scopeKey: ScopeKey;
  defaultUsos: Uso[];
  formatos: Formato[];
}

export interface ReportRow {
  id: string;
  type: string;
  title: string | null;
  report_date: string;
  period: string | null;
  perfil: string | null;
  content_html: string | null;
  payload: unknown | null;
  pdf_url: string | null;
  audio_url: string | null;
  usos: Uso[] | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}
