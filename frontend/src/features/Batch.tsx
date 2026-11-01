import { useEffect, useRef, useState } from "react";

import type { Row, Model, Defaults, Validation, Issued } from "../lib/types";
import { useProfile } from "../lib/profile";
import { api, json } from "../lib/api";
import { emptyRow, localToday, uuid } from "../lib/forms";
import { ErrorBox, Result, Pagination } from "../components/ui";
import { ModelFields, EventFields } from "../components/CertificateFields";
import { Preview } from "../components/PdfPreview";
import {
  Layers,
  Upload,
  Plus,
  CheckCircle2,
  LoaderCircle,
  Eye,
  Trash2,
  AlertCircle,
  Download,
} from "lucide-react";
export function Batch({
  models,
  ufs,
  defaults,
  issueRows,
  busy,
}: {
  models: Model[];
  ufs: string[];
  defaults: Defaults;
  issueRows: (
    rows: Row[],
    id: string,
    callback: (r: Issued) => void,
    allow?: boolean,
  ) => Promise<void>;
  busy: boolean;
}) {
  const profile = useProfile();
  const [event, setEvent] = useState<Row>(
      emptyRow(defaults, localToday(profile.timezone), profile.default_model),
    ),
    [rows, setRows] = useState<Row[]>([]),
    [names, setNames] = useState(""),
    [review, setReview] = useState<Validation>(),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false),
    [result, setResult] = useState<Issued>(),
    [preview, setPreview] = useState<Row>(),
    [page, setPage] = useState(1);
  const requestId = useRef(uuid()),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (rows.length === 0) setEvent((r) => ({ ...r, ...defaults }));
  }, [defaults]);
  function update(newRows: Row[]) {
    setRows(newRows);
    setReview(undefined);
    setResult(undefined);
    setError("");
    requestId.current = uuid();
  }
  async function importFile(f?: File) {
    if (!f) return;
    setWorking(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("defaults", JSON.stringify(event));
      const value = await api<Validation>("/api/lotes/importar", {
        method: "POST",
        body: form,
      });
      setRows(value.items.map((i) => i.row));
      setReview(value);
      setResult(undefined);
      requestId.current = uuid();
      setPage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWorking(false);
      if (file.current) file.current.value = "";
    }
  }
  async function validateList() {
    setWorking(true);
    setError("");
    try {
      const r = await api<Validation>("/api/lotes/validar", json({ rows }));
      setReview(r);
      return r;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function emitList() {
    const r = await validateList();
    if (!r || r.valid !== r.total) return;
    try {
      await issueRows(
        r.items.map((i) => i.row),
        requestId.current,
        setResult,
      );
    } catch (e: any) {
      setError(e.message);
    }
  }
  const slice = rows.slice((page - 1) * 25, page * 25);
  return (
    <div className="batch-layout">
      <section className="card batch-event">
        <div className="section-title">
          <span>01</span>
          <h2>Dados do evento</h2>
        </div>
        <p className="muted small">
          Aplicados aos novos participantes e aos campos vazios da planilha.
        </p>
        <EventFields
          row={event}
          change={(p) => setEvent((r) => ({ ...r, ...p }))}
          ufs={ufs}
        />
        <ModelFields
          row={event}
          change={(p) => setEvent((r) => ({ ...r, ...p }))}
          models={models}
        />
        <div className="tip">
          <AlertCircle size={17} />
          <span>
            Você pode ajustar a modelo, o local e a data de cada participante na
            lista.
          </span>
        </div>
      </section>
      <section className="card batch-import">
        <div className="section-title">
          <span>02</span>
          <h2>Adicionar participantes</h2>
        </div>
        <div
          className="upload-box"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!working) void importFile(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={28} />
          <strong>Importe sua lista de participantes</strong>
          <span>CSV ou XLSX · até 500 participantes · 5 MB</span>
          <button
            className="secondary"
            disabled={working}
            onClick={() => file.current?.click()}
          >
            {working ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Upload size={17} />
            )}
            Escolher arquivo
          </button>
          <input
            type="file"
            ref={file}
            className="visually-hidden"
            accept=".csv,.xlsx"
            aria-label="Importar planilha de participantes"
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
        </div>
        <div className="template-links">
          Baixar planilha modelo{" "}
          <a href="/api/lotes/modelo.xlsx" download>
            XLSX <Download size={14} />
          </a>
          <a href="/api/lotes/modelo.csv" download>
            CSV <Download size={14} />
          </a>
        </div>
        <div className="or">
          <span>ou cole os nomes, um por linha</span>
        </div>
        <label className="visually-hidden" htmlFor="names">
          Nomes dos participantes, um por linha
        </label>
        <textarea
          id="names"
          rows={3}
          value={names}
          placeholder={
            "Nome completo do primeiro participante\nNome completo do segundo participante"
          }
          onChange={(e) => setNames(e.target.value)}
        />
        <button
          className="text-button"
          disabled={!names.trim() || working}
          onClick={() => {
            const added = names
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (rows.length + added.length > 500) {
              setError("Use até 500 participantes por lote.");
              return;
            }
            update([
              ...rows,
              ...added.map((nome_aluno) => ({ ...event, nome_aluno })),
            ]);
            setNames("");
          }}
        >
          <Plus size={17} />
          Adicionar à lista
        </button>
      </section>
      {error && (
        <div className="batch-full">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {rows.length > 0 && (
        <section className="card batch-full list-card">
          <div className="list-heading">
            <div>
              <h2>
                Conferir participantes{" "}
                <span className="count-badge">{rows.length}</span>
              </h2>
              <p className="muted small">
                Edite qualquer campo antes de emitir.
              </p>
            </div>
            <button
              className="secondary"
              disabled={working || busy}
              onClick={() => void validateList()}
            >
              {working ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <CheckCircle2 size={17} />
              )}
              Validar lista
            </button>
          </div>
          {review && (
            <div
              className={`validation-bar ${review.valid === review.total ? "valid" : ""}`}
              role="status"
            >
              <CheckCircle2 size={18} />
              <span>
                {review.valid} de {review.total} prontos para emitir
                {review.warnings > 0
                  ? ` · ${review.warnings} ${review.warnings === 1 ? "possível duplicado" : "possíveis duplicados"}`
                  : ""}
              </span>
            </div>
          )}
          <div className="table-scroll">
            <table className="batch-table">
              <thead>
                <tr>
                  <th>Participante</th>
                  <th>Cidade / UF</th>
                  <th>Data</th>
                  <th>Modelo</th>
                  <th>
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r, ix) => {
                  const index = (page - 1) * 25 + ix,
                    item = review?.items[index];
                  const patch = (p: Partial<Row>) =>
                    update(
                      rows.map((row, i) =>
                        i === index ? { ...row, ...p } : row,
                      ),
                    );
                  return (
                    <tr
                      key={index}
                      className={
                        item && Object.keys(item.errors).length
                          ? "invalid-row"
                          : ""
                      }
                    >
                      <td data-label="Participante">
                        <input
                          aria-label={`Nome do participante ${index + 1}`}
                          value={r.nome_aluno}
                          onChange={(e) =>
                            patch({ nome_aluno: e.target.value })
                          }
                        />
                        {item?.errors.nome_aluno && (
                          <small className="field-error">
                            {item.errors.nome_aluno}
                          </small>
                        )}
                        {!!item?.warnings.length && (
                          <small className="field-warning">
                            Possível duplicado
                          </small>
                        )}
                      </td>
                      <td data-label="Cidade / UF">
                        <div className="row-city">
                          <input
                            aria-label={`Cidade do participante ${index + 1}`}
                            value={r.cidade}
                            onChange={(e) => patch({ cidade: e.target.value })}
                          />
                          <select
                            aria-label={`UF do participante ${index + 1}`}
                            value={r.uf}
                            onChange={(e) => patch({ uf: e.target.value })}
                          >
                            <option value="">UF</option>
                            {ufs.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                        </div>
                        {(item?.errors.cidade || item?.errors.uf) && (
                          <small className="field-error">
                            {item.errors.cidade || item.errors.uf}
                          </small>
                        )}
                      </td>
                      <td data-label="Data">
                        <input
                          type="date"
                          aria-label={`Data do participante ${index + 1}`}
                          value={r.data}
                          onChange={(e) => patch({ data: e.target.value })}
                        />
                        {item?.errors.data && (
                          <small className="field-error">
                            {item.errors.data}
                          </small>
                        )}
                      </td>
                      <td data-label="Graduação">
                        <select
                          aria-label={`Graduação do participante ${index + 1}`}
                          value={r.modelo_id}
                          onChange={(e) => patch({ modelo_id: e.target.value })}
                        >
                          {!models.some((m) => m.id === r.modelo_id) && (
                            <option value={r.modelo_id}>
                              {r.modelo_id || "Selecione"}
                            </option>
                          )}
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        {item?.errors.modelo_id && (
                          <small className="field-error">
                            {item.errors.modelo_id}
                          </small>
                        )}
                      </td>
                      <td className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Visualizar certificado de ${r.nome_aluno || `participante ${index + 1}`}`}
                          onClick={() => setPreview(r)}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Remover participante ${index + 1}`}
                          onClick={() => {
                            update(rows.filter((_, i) => i !== index));
                            setPage((p) =>
                              Math.max(
                                1,
                                Math.min(p, Math.ceil((rows.length - 1) / 25)),
                              ),
                            );
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > 25 && (
            <Pagination
              page={page}
              total={rows.length}
              size={25}
              change={setPage}
            />
          )}
          <div className="batch-bottom">
            <p>
              <strong>{rows.length} certificados</strong>
              <span>PDF completo e arquivos individuais em ZIP.</span>
            </p>
            <button
              className="primary"
              disabled={busy || working || !!result}
              onClick={() => void emitList()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <Layers size={18} />
              )}
              {busy
                ? "Gerando lote…"
                : result
                  ? "Lote emitido"
                  : `Emitir ${rows.length} certificados`}
            </button>
          </div>
          {result && (
            <div className="result-wrap">
              <Result result={result} />
              <button
                className="text-button"
                onClick={() => {
                  update([]);
                  setPage(1);
                }}
              >
                Iniciar outro lote <Plus size={16} />
              </button>
            </div>
          )}
        </section>
      )}
      {preview && (
        <Preview row={preview} mobile onClose={() => setPreview(undefined)} />
      )}
    </div>
  );
}
