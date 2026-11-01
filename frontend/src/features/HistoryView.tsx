import { useEffect, useState } from "react";

import type { Row, Model, Past } from "../lib/types";

import { api } from "../lib/api";
import { shortDate } from "../lib/forms";
import { ErrorBox, Pagination } from "../components/ui";
import { ModelBadge } from "../components/CertificateFields";

import {
  Search,
  LoaderCircle,
  Printer,
  Copy,
  History,
  Download,
} from "lucide-react";
export function HistoryView({
  models,
  revision,
  reuse,
}: {
  models: Model[];
  revision: number;
  reuse: (r: Row) => void;
}) {
  const [q, setQ] = useState(""),
    [model, setModel] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<{ items: Past[]; total: number }>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      void api<{ items: Past[]; total: number }>(
        `/api/emissoes?${new URLSearchParams({ q, modelo_id: model, data_inicio: from, data_fim: to, page: String(page) })}`,
        { signal: abort.signal },
      )
        .then((d) => {
          setData(d);
          setError("");
          setLoading(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e.message);
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q, model, from, to, page, revision]);
  return (
    <section className="card history-card">
      <div className="filters">
        <label className="search-field">
          <span>Buscar participante</span>
          <div>
            <Search size={18} />
            <input
              placeholder="Nome do participante"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </label>
        <label>
          Modelo
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os modelos</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data de
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && (
        <div className="loading-line">
          <LoaderCircle size={17} className="spin" />
          Consultando histórico…
        </div>
      )}
      {data && data.items.length > 0 ? (
        <>
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Participante / Local</th>
                  <th>Modelo</th>
                  <th>Data do evento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={`${r.job_id}-${r.position}`}>
                    <td data-label="Participante">
                      <strong>{r.nome_aluno}</strong>
                      <span className="subline">
                        {r.cidade}/{r.uf}
                      </span>
                      <span className="subline small">
                        Emitido em {shortDate(r.created_at.slice(0, 10))}
                      </span>
                    </td>
                    <td data-label="Graduação">
                      <div className="history-belt">
                        <ModelBadge
                          model={models.find((m) => m.id === r.modelo_id)}
                        />
                        <span>
                          {models.find((m) => m.id === r.modelo_id)?.label}
                        </span>
                      </div>
                    </td>
                    <td data-label="Data">{shortDate(r.data)}</td>
                    <td className="history-actions">
                      <a
                        className="secondary"
                        href={`/api/emissoes/${r.job_id}/certificados/${r.position}/pdf`}
                        download
                      >
                        <Download size={16} />
                        PDF
                      </a>
                      <a
                        className="icon-button"
                        aria-label={`Imprimir certificado de ${r.nome_aluno}`}
                        href={`/api/emissoes/${r.job_id}/certificados/${r.position}/pdf?inline=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Printer size={18} />
                      </a>
                      <button
                        className="icon-button"
                        aria-label={`Usar dados de ${r.nome_aluno}`}
                        title="Usar em nova emissão"
                        onClick={() => reuse(r)}
                      >
                        <Copy size={18} />
                      </button>
                      {r.job_count > 1 && (
                        <a
                          className="text-button small"
                          href={`/api/emissoes/${r.job_id}/pdf`}
                          download
                        >
                          Lote completo
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={data.total}
            size={50}
            change={setPage}
          />
        </>
      ) : (
        !loading &&
        !error && (
          <div className="empty-state">
            <History size={34} />
            <h2>
              {q || model || from || to
                ? "Nenhum certificado encontrado"
                : "O histórico começa na primeira conquista"}
            </h2>
            <p>
              {q || model || from || to
                ? "Ajuste a busca ou os filtros para consultar outros registros."
                : "Os certificados emitidos individualmente e em lote aparecerão aqui."}
            </p>
          </div>
        )
      )}
    </section>
  );
}
