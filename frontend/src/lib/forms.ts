import type { Defaults, Row } from "./types";
export const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );
export const shortDate = (value: string) =>
  value ? value.split("-").reverse().join("/") : "—";
export const localToday = (timeZone = "America/Sao_Paulo") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const emptyRow = (
  defaults: Defaults,
  today: string,
  model = "",
): Row => ({
  nome_aluno: "",
  ...defaults,
  data: today,
  modelo_id: model,
});
