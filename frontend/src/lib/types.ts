export type Model = {
  id: string;
  label: string;
  page: number;
  degree?: number | null;
  group?: string;
  visual?: { kind: "belt"; color: string; stripe: string; degree: number };
};
export type Profile = {
  id: string;
  name: string;
  short_name: string;
  tagline: string;
  accent_color: string;
  logo_url: string | null;
  default_model: string;
  timezone: string;
  labels: {
    recipient: string;
    template: string;
    date: string;
    selection: string;
  };
  paper: { width_mm: number; height_mm: number; orientation: string };
};
export type Row = {
  nome_aluno: string;
  cidade: string;
  uf: string;
  data: string;
  modelo_id: string;
};
export type Review = {
  index: number;
  row: Row;
  errors: Record<string, string>;
  warnings: string[];
  font_sizes: Record<string, number>;
};
export type Validation = {
  items: Review[];
  valid: number;
  total: number;
  warnings: number;
};
export type Issued = {
  id: string;
  count: number;
  created_at: string;
  pdf_url: string;
  zip_url: string;
};
export type Past = Row & {
  job_id: string;
  position: number;
  created_at: string;
  job_count: number;
};
export type Screen =
  | "emitir"
  | "lote"
  | "historico"
  | "modelos"
  | "configuracoes";
export type Defaults = Pick<Row, "cidade" | "uf">;
