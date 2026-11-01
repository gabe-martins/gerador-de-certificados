import { Award } from "lucide-react";
import type { Row, Model } from "../lib/types";
import { useProfile } from "../lib/profile";
export function ModelFields({
  row,
  change,
  models,
  errors = {},
  compact = false,
}: {
  row: Row;
  change: (patch: Partial<Row>) => void;
  models: Model[];
  errors?: Record<string, string>;
  compact?: boolean;
}) {
  const profile = useProfile();
  const selected = models.find((m) => m.id === row.modelo_id);
  const variants = selected?.group
    ? models.filter((m) => m.group === selected.group)
    : [];
  const base = variants[0]?.id ?? row.modelo_id;
  const choices = models.filter(
    (m) =>
      !m.group || models.find((other) => other.group === m.group)?.id === m.id,
  );
  return (
    <div className={compact ? "belt-fields compact" : "belt-fields"}>
      <label>
        {profile.labels.template}
        <select
          value={base}
          onChange={(e) => change({ modelo_id: e.target.value })}
          aria-invalid={!!errors.modelo_id}
        >
          {choices.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {errors.modelo_id && (
          <small className="field-error">{errors.modelo_id}</small>
        )}
      </label>
      {variants.length > 1 && (
        <label>
          Variação
          <select
            value={row.modelo_id}
            onChange={(e) => change({ modelo_id: e.target.value })}
          >
            {variants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function EventFields({
  row,
  change,
  ufs,
  errors = {},
}: {
  row: Row;
  change: (patch: Partial<Row>) => void;
  ufs: string[];
  errors?: Record<string, string>;
}) {
  const profile = useProfile();
  return (
    <>
      <div className="city-grid">
        <label>
          Cidade
          <input
            value={row.cidade}
            onChange={(e) => change({ cidade: e.target.value })}
            placeholder="Cidade do evento"
            maxLength={200}
            aria-invalid={!!errors.cidade}
          />
          {errors.cidade && (
            <small className="field-error">{errors.cidade}</small>
          )}
        </label>
        <label>
          UF
          <select
            value={row.uf}
            onChange={(e) => change({ uf: e.target.value })}
            aria-invalid={!!errors.uf}
          >
            <option value="">UF</option>
            {ufs.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
          {errors.uf && <small className="field-error">{errors.uf}</small>}
        </label>
      </div>
      <label>
        {profile.labels.date}
        <input
          type="date"
          value={row.data}
          onChange={(e) => change({ data: e.target.value })}
          aria-invalid={!!errors.data}
        />
        {errors.data && <small className="field-error">{errors.data}</small>}
      </label>
    </>
  );
}
export function ModelBadge({ model }: { model?: Model }) {
  const visual = model?.visual;
  if (!visual || visual.kind !== "belt")
    return <Award size={20} aria-hidden="true" />;
  return (
    <span className={`belt belt-${visual.color}`} aria-hidden="true">
      {visual.stripe && <i className={`belt-stripe ${visual.stripe}`} />}
      <b className={visual.color === "preta" ? "red-tip" : ""}>
        {Array.from({ length: visual.degree }, (_, i) => (
          <em key={i} />
        ))}
      </b>
    </span>
  );
}
