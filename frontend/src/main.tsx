import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Award,
  FileBadge,
  Layers,
  History,
  Settings,
  Download,
  Eye,
  Upload,
  Search,
  X,
  Trash2,
  Copy,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Plus,
  ArrowLeft,
  Wifi,
  MoreHorizontal,
  ExternalLink,
  Printer,
} from "lucide-react";
import "./style.css";

GlobalWorkerOptions.workerSrc = pdfWorker;
type Model = { id: string; label: string; page: number; degree: number | null };
type Row = {
  nome_aluno: string;
  cidade: string;
  uf: string;
  data: string;
  modelo_id: string;
};
type Review = {
  index: number;
  row: Row;
  errors: Record<string, string>;
  warnings: string[];
  font_sizes: Record<string, number>;
};
type Validation = {
  items: Review[];
  valid: number;
  total: number;
  warnings: number;
};
type Issued = {
  id: string;
  count: number;
  created_at: string;
  pdf_url: string;
  zip_url: string;
};
type Past = Row & {
  job_id: string;
  position: number;
  created_at: string;
  job_count: number;
};
type Screen = "emitir" | "lote" | "historico" | "modelos" | "configuracoes";
type Defaults = Pick<Row, "cidade" | "uf">;
class ApiError extends Error {
  constructor(
    public detail: any,
    public status: number,
  ) {
    super(typeof detail === "string" ? detail : "Revise os dados informados.");
  }
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const result = await fetch(url, init);
  if (!result.ok) {
    let d;
    try {
      d = (await result.json()).detail;
    } catch {
      d = "Não foi possível concluir. Verifique a conexão e tente novamente.";
    }
    throw new ApiError(d, result.status);
  }
  return result.json();
}
const json = (value: any): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );
const shortDate = (value: string) =>
  value ? value.split("-").reverse().join("/") : "—";
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const emptyRow = (defaults: Defaults, today: string): Row => ({
  nome_aluno: "",
  ...defaults,
  data: today,
  modelo_id: "azul",
});
const nav = [
  {
    id: "emitir",
    label: "Emitir",
    full: "Emitir certificado",
    icon: FileBadge,
  },
  { id: "lote", label: "Lote", full: "Emissão em lote", icon: Layers },
  { id: "historico", label: "Histórico", full: "Histórico", icon: History },
  { id: "modelos", label: "Modelos", full: "Modelos de faixa", icon: Award },
  { id: "configuracoes", label: "Mais", full: "Configurações", icon: Settings },
] as const;

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.close();
    };
  }, []);
  return (
    <dialog ref={dialog} className={wide ? "modal wide" : "modal"}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Fechar" onClick={close}>
          <X size={21} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

function PdfCanvas({
  bytes,
  page = 1,
  document: supplied,
  thumbnail = false,
}: {
  bytes?: Uint8Array;
  page?: number;
  document?: PDFDocumentProxy;
  thumbnail?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let stopped = false,
      task: any,
      loading: any,
      own: PDFDocumentProxy | undefined,
      observer: ResizeObserver;
    setLoaded(false);
    setError("");
    const run = async () => {
      try {
        const doc =
          supplied ||
          (await (loading = getDocument({
            data: bytes!.slice(),
            isEvalSupported: false,
          })).promise);
        if (!supplied) own = doc;
        if (stopped) {
          own?.destroy();
          return;
        }
        const pdfPage = await doc.getPage(page);
        const render = async () => {
          if (stopped || !canvas.current || !container.current) return;
          if (task) {
            task.cancel();
            try {
              await task.promise;
            } catch {
              /* previous resize */
            }
          }
          if (stopped) return;
          const width = Math.max(100, container.current.clientWidth);
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const viewport = pdfPage.getViewport({
            scale: width / pdfPage.getViewport({ scale: 1 }).width,
          });
          const c = canvas.current;
          c.width = Math.floor(viewport.width * pixelRatio);
          c.height = Math.floor(viewport.height * pixelRatio);
          c.style.width = `${viewport.width}px`;
          c.style.height = `${viewport.height}px`;
          task = pdfPage.render({
            canvas: c,
            viewport,
            transform:
              pixelRatio === 1
                ? undefined
                : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          });
          try {
            await task.promise;
            if (!stopped) setLoaded(true);
          } catch (e: any) {
            if (e.name !== "RenderingCancelledException") throw e;
          }
        };
        observer = new ResizeObserver(() => {
          void render().catch(() => {
            if (!stopped) setError("Não foi possível exibir a prévia.");
          });
        });
        observer.observe(container.current!);
      } catch (e: any) {
        if (!stopped && e.name !== "RenderingCancelledException")
          setError("Não foi possível exibir a prévia.");
      }
    };
    if (supplied || bytes) void run();
    return () => {
      stopped = true;
      observer?.disconnect();
      task?.cancel();
      if (own) void own.destroy();
      else if (!supplied) void loading?.destroy();
    };
  }, [bytes, page, supplied]);
  return (
    <div
      ref={container}
      className={`pdf-canvas ${thumbnail ? "thumbnail" : ""}`}
      aria-label="Visualização do certificado"
    >
      <canvas ref={canvas} />
      {!loaded && !error && (
        <div className="canvas-loading">
          <LoaderCircle size={thumbnail ? 18 : 24} className="spin" />
          <span>{thumbnail ? "" : "Preparando prévia…"}</span>
        </div>
      )}
      {error && <div className="canvas-loading">{error}</div>}
    </div>
  );
}

function Preview({
  row,
  mobile = false,
  onClose,
}: {
  row: Row;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array>(),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const serialized = JSON.stringify(row);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/preview", {
          ...json(JSON.parse(serialized)),
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Revise os campos para atualizar a prévia.");
        const data = new Uint8Array(await response.arrayBuffer());
        if (!controller.signal.aborted) {
          setBytes(data);
          setError("");
          setBusy(false);
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setError(e.message);
          setBusy(false);
        }
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serialized]);
  const content = (
    <>
      <div className="preview-title">
        <span className="eyebrow">PRÉVIA DO CERTIFICADO</span>
        <span className="paper-size">A4 · Paisagem</span>
      </div>
      <div className="preview-surface">
        {bytes ? (
          <PdfCanvas bytes={bytes} />
        ) : (
          <div className="blank-preview">
            <LoaderCircle className="spin" size={25} />
            Carregando modelo…
          </div>
        )}
      </div>
      <div className="preview-foot">
        <span className={error ? "text-red" : ""}>
          {error ||
            (busy
              ? "Atualizando prévia…"
              : "O PDF será gerado com este mesmo layout.")}
        </span>
        <span className={`status-dot ${busy || error ? "pending" : ""}`} />
      </div>
      <div className="preview-note">
        <FileBadge size={18} />
        <p>
          Design original Pagels
          <br />
          <span>Nome, local e data ajustados automaticamente.</span>
        </p>
      </div>
    </>
  );
  return mobile ? (
    <Modal title="Prévia do certificado" close={onClose!} wide>
      {content}
    </Modal>
  ) : (
    <section
      className="preview-panel desktop-preview"
      aria-label="Prévia do certificado"
    >
      {content}
    </section>
  );
}

function BeltFields({
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
  const black = row.modelo_id.startsWith("preta");
  const base = black ? "preta" : row.modelo_id;
  return (
    <div className={compact ? "belt-fields compact" : "belt-fields"}>
      <label>
        Faixa
        <select
          value={base}
          onChange={(e) => change({ modelo_id: e.target.value })}
          aria-invalid={!!errors.modelo_id}
        >
          {models
            .filter((m) => !m.degree)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.label.replace("Faixa ", "")}
              </option>
            ))}
        </select>
        {errors.modelo_id && (
          <small className="field-error">{errors.modelo_id}</small>
        )}
      </label>
      {black && (
        <label>
          Grau
          <select
            value={row.modelo_id}
            onChange={(e) => change({ modelo_id: e.target.value })}
          >
            {models
              .filter((m) => m.degree !== null)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.degree ? `${m.degree}º grau` : "Sem grau"}
                </option>
              ))}
          </select>
        </label>
      )}
    </div>
  );
}

function EventFields({
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
  return (
    <>
      <div className="city-grid">
        <label>
          Cidade
          <input
            value={row.cidade}
            onChange={(e) => change({ cidade: e.target.value })}
            placeholder="Cidade da graduação"
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
        Data da graduação
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

function Result({ result }: { result: Issued }) {
  return (
    <div className="result" role="status">
      <CheckCircle2 size={21} />
      <div>
        <strong>
          {result.count === 1
            ? "Certificado emitido"
            : `${result.count} certificados emitidos`}
        </strong>
        <p>Salvo no histórico. Pronto para baixar.</p>
        <div className="result-actions">
          <a href={result.pdf_url} download>
            <Download size={16} />
            {result.count === 1 ? "Baixar PDF" : "PDF completo"}
          </a>
          <a
            href={`${result.pdf_url}?inline=true`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Printer size={16} />
            Imprimir
          </a>
          {result.count > 1 && (
            <a href={result.zip_url} download>
              <Download size={16} />
              ZIP individual
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState<Screen>("emitir"),
    [models, setModels] = useState<Model[]>([]),
    [templateVersion, setTemplateVersion] = useState(""),
    [ufs, setUfs] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<Defaults>({ cidade: "", uf: "" }),
    [row, setRow] = useState<Row>(
      emptyRow({ cidade: "", uf: "" }, localToday()),
    );
  const [bootError, setBootError] = useState(""),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [emitError, setEmitError] = useState(""),
    [result, setResult] = useState<Issued>();
  const [mobilePreview, setMobilePreview] = useState(false),
    [confirm, setConfirm] = useState<{ count: number; proceed: () => void }>();
  const requestId = useRef(uuid());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void Promise.all([
      api<{ models: Model[]; ufs: string[]; version: string }>("/api/modelos"),
      api<Defaults>("/api/configuracoes"),
      api<{ today: string }>("/api/health"),
    ])
      .then(([m, d, h]) => {
        setModels(m.models);
        setTemplateVersion(m.version);
        setUfs(m.ufs);
        setDefaults(d);
        setRow(emptyRow(d, h.today));
        setReady(true);
      })
      .catch(() =>
        setBootError(
          "Não foi possível conectar à aplicação. Verifique se o servidor está ligado e recarregue esta página.",
        ),
      );
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function change(patch: Partial<Row>) {
    setRow((r) => ({ ...r, ...patch }));
    setResult(undefined);
    setErrors({});
    setEmitError("");
    requestId.current = uuid();
  }
  function navigate(value: Screen) {
    setScreen(value);
    window.scrollTo({ top: 0 });
  }
  async function issueRows(
    rows: Row[],
    id: string,
    onResult: (result: Issued) => void,
    allow = false,
  ): Promise<void> {
    setBusy(true);
    try {
      const value = await api<Issued>(
        "/api/emissoes",
        json({ rows, request_id: id, allow_duplicates: allow }),
      );
      onResult(value);
      setRevision((x) => x + 1);
      setToast(
        `${value.count === 1 ? "Certificado salvo" : "Lote salvo"} no histórico.`,
      );
    } catch (e: any) {
      if (e.detail?.code === "duplicates") {
        setConfirm({
          count: e.detail.validation.warnings,
          proceed: () => {
            setConfirm(undefined);
            void issueRows(rows, id, onResult, true).catch((err) => {
              setEmitError(err.message);
              setToast(`Falha na emissão: ${err.message}`);
            });
          },
        });
      } else throw e;
    } finally {
      setBusy(false);
    }
  }
  async function emit() {
    setEmitError("");
    const missing: Record<string, string> = {};
    for (const [key, label] of [
      ["nome_aluno", "Nome"],
      ["cidade", "Cidade"],
      ["uf", "UF"],
      ["data", "Data"],
    ] as const)
      if (!row[key].trim()) missing[key] = `${label} é obrigatório.`;
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    try {
      await issueRows([row], requestId.current, setResult);
    } catch (e: any) {
      if (e.detail?.items) setErrors(e.detail.items[0].errors);
      else setEmitError(e.message);
    }
  }
  const current = nav.find((n) => n.id === screen)!;
  if (bootError)
    return (
      <div className="boot">
        <img src="/logo.jpg" alt="Pagels" />
        <ErrorBox>{bootError}</ErrorBox>
        <button className="primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  if (!ready)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        <p>Preparando o espaço da academia…</p>
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("emitir");
          }}
        >
          <img src="/logo.jpg" alt="Logo Pagels" />
          <div>
            <strong>
              PAGELS<span className="brand-dot">.</span>
            </strong>
            <span>CERTIFICADOS</span>
          </div>
        </a>
        <div className="sidebar-label">ÁREA DA ACADEMIA</div>
        <nav aria-label="Navegação principal">
          {nav.map((n) => (
            <button
              key={n.id}
              className={screen === n.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(n.id)}
              aria-current={screen === n.id ? "page" : undefined}
            >
              <n.icon size={20} />
              <span>{n.full}</span>
              {screen === n.id && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          <div>
            Rede local<span>Histórico compartilhado</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Academia Pagels <ChevronRight size={14} />
            <strong>{current.full}</strong>
          </span>
          <span className="network">
            <Wifi size={15} />
            Rede da academia
          </span>
          <img className="mobile-logo" src="/logo.jpg" alt="Pagels" />
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">PAGELS JIU-JITSU</span>
              <h1>{current.full}</h1>
              <p>
                {screen === "emitir"
                  ? "Uma conquista que merece ser registrada."
                  : screen === "lote"
                    ? "Uma turma inteira, com o mesmo cuidado em cada certificado."
                    : screen === "historico"
                      ? "Consulte, baixe novamente ou use os dados em uma nova emissão."
                      : screen === "modelos"
                        ? "O design da academia, em todas as graduações."
                        : "Preferências da academia e cópia dos seus dados."}
              </p>
            </div>
            {screen === "emitir" && (
              <span className="heading-tag">
                <FileBadge size={15} />
                Emissão individual
              </span>
            )}
          </div>
          {screen === "emitir" && (
            <div className="editor-layout">
              <section className="card form-card">
                <div className="section-title">
                  <span>01</span>
                  <h2>Dados do certificado</h2>
                </div>
                <label>
                  Nome do aluno
                  <input
                    value={row.nome_aluno}
                    placeholder="Nome completo do aluno"
                    autoComplete="off"
                    maxLength={200}
                    onChange={(e) => change({ nome_aluno: e.target.value })}
                    aria-invalid={!!errors.nome_aluno}
                  />
                  {errors.nome_aluno && (
                    <small className="field-error">{errors.nome_aluno}</small>
                  )}
                </label>
                <EventFields
                  row={row}
                  change={change}
                  ufs={ufs}
                  errors={errors}
                />
                <div className="form-divider" />
                <div className="section-title">
                  <span>02</span>
                  <h2>Graduação conquistada</h2>
                </div>
                <BeltFields
                  row={row}
                  change={change}
                  models={models}
                  errors={errors}
                />
                <div className="selected-belt">
                  <Belt id={row.modelo_id} />
                  <span>
                    {models.find((m) => m.id === row.modelo_id)?.label}
                  </span>
                </div>
                <button
                  className="secondary mobile-preview-button"
                  onClick={() => setMobilePreview(true)}
                >
                  <Eye size={18} />
                  Visualizar certificado
                </button>
                {emitError && <ErrorBox>{emitError}</ErrorBox>}
                <button
                  className="primary full"
                  disabled={busy || !!result}
                  onClick={() => void emit()}
                >
                  {busy ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <FileBadge size={19} />
                  )}
                  {busy
                    ? "Gerando certificado…"
                    : result
                      ? "Certificado emitido"
                      : "Emitir certificado"}
                </button>
                <p className="form-hint">
                  O PDF e os dados ficam salvos no histórico.
                </p>
                {result && (
                  <>
                    <Result result={result} />
                    <button
                      className="text-button full"
                      onClick={() => {
                        setRow(emptyRow(defaults, row.data));
                        setResult(undefined);
                        requestId.current = uuid();
                      }}
                    >
                      Emitir para outro aluno <Plus size={16} />
                    </button>
                  </>
                )}
              </section>
              <Preview row={row} />
            </div>
          )}
          <div hidden={screen !== "lote"}>
            <Batch
              models={models}
              ufs={ufs}
              defaults={defaults}
              issueRows={issueRows}
              busy={busy}
            />
          </div>
          {screen === "historico" && (
            <HistoryView
              models={models}
              revision={revision}
              reuse={(r) => {
                setRow({
                  nome_aluno: r.nome_aluno,
                  cidade: r.cidade,
                  uf: r.uf,
                  data: r.data,
                  modelo_id: r.modelo_id,
                });
                setErrors({});
                setResult(undefined);
                setEmitError("");
                requestId.current = uuid();
                navigate("emitir");
                setToast(
                  "Dados copiados. Revise antes de emitir um novo certificado.",
                );
              }}
            />
          )}
          {screen === "modelos" && (
            <Models
              models={models}
              version={templateVersion}
              choose={(id) => {
                change({ modelo_id: id });
                navigate("emitir");
              }}
            />
          )}
          {screen === "configuracoes" && (
            <Preferences
              defaults={defaults}
              ufs={ufs}
              save={(d) => {
                setDefaults(d);
                setRow((r) =>
                  !r.nome_aluno &&
                  r.cidade === defaults.cidade &&
                  r.uf === defaults.uf
                    ? { ...r, ...d }
                    : r,
                );
                setToast(
                  "Preferências salvas. Serão usadas nas próximas emissões.",
                );
              }}
            />
          )}
        </main>
        <footer>
          Pagels Jiu-Jitsu <span>Feito para celebrar a evolução.</span>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Navegação no celular">
        {nav.map((n) => (
          <button
            key={n.id}
            className={screen === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
            aria-current={screen === n.id ? "page" : undefined}
          >
            {n.id === "configuracoes" ? (
              <MoreHorizontal size={21} />
            ) : (
              <n.icon size={21} />
            )}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {mobilePreview && (
        <Preview row={row} mobile onClose={() => setMobilePreview(false)} />
      )}
      {confirm && (
        <Modal
          title="Conferir possíveis duplicados"
          close={() => setConfirm(undefined)}
        >
          <div className="duplicate-symbol">
            <Copy size={25} />
          </div>
          <p>
            Há {confirm.count}{" "}
            {confirm.count === 1
              ? "registro com o mesmo nome, faixa e data"
              : "registros com o mesmo nome, faixa e data"}{" "}
            no lote ou no histórico.
          </p>
          <p className="muted">
            Se for uma reemissão ou pessoas com o mesmo nome, você pode
            continuar.
          </p>
          {emitError && <ErrorBox>{emitError}</ErrorBox>}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setConfirm(undefined)}>
              Voltar e revisar
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={confirm.proceed}
            >
              Emitir mesmo assim
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setToast("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function Belt({ id }: { id: string }) {
  const color = id.startsWith("preta") ? "preta" : id.split("_")[0];
  const stripe = id.includes("_e_branca")
    ? "branca"
    : id.includes("_e_preta")
      ? "preta"
      : "";
  const degree = Number(id.match(/preta_(\d)/)?.[1] || 0);
  return (
    <span className={`belt belt-${color}`} aria-hidden="true">
      {stripe && <i className={`belt-stripe ${stripe}`} />}
      <b className={color === "preta" ? "red-tip" : ""}>
        {Array.from({ length: degree }, (_, i) => (
          <em key={i} />
        ))}
      </b>
    </span>
  );
}

function Batch({
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
  const [event, setEvent] = useState<Row>(emptyRow(defaults, localToday())),
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
    if (rows.length === 0) setEvent(r => ({ ...r, ...defaults }));
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
          Aplicados aos novos alunos e aos campos vazios da planilha.
        </p>
        <EventFields
          row={event}
          change={(p) => setEvent((r) => ({ ...r, ...p }))}
          ufs={ufs}
        />
        <BeltFields
          row={event}
          change={(p) => setEvent((r) => ({ ...r, ...p }))}
          models={models}
        />
        <div className="tip">
          <AlertCircle size={17} />
          <span>
            Você pode ajustar a faixa, o local e a data de cada aluno na lista.
          </span>
        </div>
      </section>
      <section className="card batch-import">
        <div className="section-title">
          <span>02</span>
          <h2>Adicionar alunos</h2>
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
          <strong>Importe sua lista de alunos</strong>
          <span>CSV ou XLSX · até 500 alunos · 5 MB</span>
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
            aria-label="Importar planilha de alunos"
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
          Nomes dos alunos, um por linha
        </label>
        <textarea
          id="names"
          rows={3}
          value={names}
          placeholder={
            "Nome completo do primeiro aluno\nNome completo do segundo aluno"
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
              setError("Use até 500 alunos por lote.");
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
                Conferir alunos{" "}
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
                  <th>Aluno</th>
                  <th>Cidade / UF</th>
                  <th>Data</th>
                  <th>Graduação</th>
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
                      <td data-label="Aluno">
                        <input
                          aria-label={`Nome do aluno ${index + 1}`}
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
                            aria-label={`Cidade do aluno ${index + 1}`}
                            value={r.cidade}
                            onChange={(e) => patch({ cidade: e.target.value })}
                          />
                          <select
                            aria-label={`UF do aluno ${index + 1}`}
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
                          aria-label={`Data do aluno ${index + 1}`}
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
                          aria-label={`Graduação do aluno ${index + 1}`}
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
                              {m.label.replace("Faixa ", "")}
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
                          aria-label={`Visualizar certificado de ${r.nome_aluno || `aluno ${index + 1}`}`}
                          onClick={() => setPreview(r)}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Remover aluno ${index + 1}`}
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

function Pagination({
  page,
  total,
  size,
  change,
}: {
  page: number;
  total: number;
  size: number;
  change: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {(page - 1) * size + 1}–{Math.min(page * size, total)} de {total}
      </span>
      <div>
        <button
          className="secondary"
          disabled={page <= 1}
          onClick={() => change(page - 1)}
        >
          Anterior
        </button>
        <button
          className="secondary"
          disabled={page * size >= total}
          onClick={() => change(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

function HistoryView({
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
          <span>Buscar aluno</span>
          <div>
            <Search size={18} />
            <input
              placeholder="Nome do aluno"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </label>
        <label>
          Faixa
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as faixas</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label.replace("Faixa ", "")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Graduação de
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
                  <th>Aluno / Local</th>
                  <th>Graduação</th>
                  <th>Data da graduação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={`${r.job_id}-${r.position}`}>
                    <td data-label="Aluno">
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
                        <Belt id={r.modelo_id} />
                        <span>
                          {models
                            .find((m) => m.id === r.modelo_id)
                            ?.label.replace("Faixa ", "")}
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

function Models({
  models,
  version,
  choose,
}: {
  models: Model[];
  version: string;
  choose: (id: string) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy>(),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Model>();
  useEffect(() => {
    const loading = getDocument({
      url: `/api/modelos/base.pdf?v=${encodeURIComponent(version)}`,
      isEvalSupported: false,
    });
    let active = true;
    void loading.promise
      .then((d) => {
        if (active) setDocument(d);
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar os modelos.");
      });
    return () => {
      active = false;
      void loading.destroy();
    };
  }, [version]);
  return (
    <>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="model-intro">
        <span>
          <Award size={18} />
          {models.length} modelos disponíveis
        </span>
        <span>Design original · A4 em paisagem</span>
      </div>
      <div className="model-grid">
        {models.map((m) => (
          <article className="card model-card" key={m.id}>
            <button
              className="model-preview"
              aria-label={`Visualizar ${m.label}`}
              onClick={() => setSelected(m)}
            >
              {document ? (
                <PdfCanvas document={document} page={m.page} thumbnail />
              ) : (
                <div className="model-loading">
                  <LoaderCircle className="spin" size={19} />
                </div>
              )}
              <span className="model-eye">
                <Eye size={18} />
              </span>
            </button>
            <div className="model-caption">
              <Belt id={m.id} />
              <h2>{m.label.replace("Faixa ", "")}</h2>
              <button
                className="icon-button"
                aria-label={`Usar ${m.label}`}
                onClick={() => choose(m.id)}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <Modal title={selected.label} close={() => setSelected(undefined)} wide>
          {document && <PdfCanvas document={document} page={selected.page} />}
          <div className="modal-actions">
            <button className="primary" onClick={() => choose(selected.id)}>
              Usar este modelo <ChevronRight size={17} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Preferences({
  defaults,
  ufs,
  save,
}: {
  defaults: Defaults;
  ufs: string[];
  save: (d: Defaults) => void;
}) {
  const [city, setCity] = useState(defaults.cidade),
    [uf, setUf] = useState(defaults.uf),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [backupBusy, setBackupBusy] = useState(false);
  async function persist() {
    setBusy(true);
    setError("");
    try {
      const d = await api<Defaults>("/api/configuracoes", {
        ...json({ cidade: city, uf }),
        method: "PUT",
      });
      save(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    setBackupBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backup");
      if (!response.ok)
        throw new Error("Não foi possível criar o backup. Tente novamente.");
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `backup_pagels_${localToday()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBackupBusy(false);
    }
  }
  return (
    <div className="preferences-grid">
      <section className="card">
        <div className="card-title">
          <Settings size={21} />
          <h2>Local padrão</h2>
        </div>
        <p className="muted">
          Preencha uma vez para usar nas próximas emissões. Você poderá alterar
          em cada certificado.
        </p>
        <div className="city-grid">
          <label>
            Cidade
            <input
              value={city}
              maxLength={100}
              placeholder="Cidade da academia"
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <label>
            UF
            <select value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">UF</option>
              {ufs.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void persist()}
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <CheckCircle2 size={17} />
          )}
          Salvar preferências
        </button>
      </section>
      <section className="card">
        <div className="card-title">
          <Download size={21} />
          <h2>Backup dos dados</h2>
        </div>
        <p className="muted">
          Baixe uma cópia com o histórico, PDFs emitidos, configurações e
          modelos. Guarde em outro dispositivo.
        </p>
        <button
          className="secondary"
          disabled={backupBusy}
          onClick={() => void backup()}
        >
          {backupBusy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Download size={17} />
          )}
          {backupBusy ? "Preparando backup…" : "Baixar backup completo"}
        </button>
        <p className="small muted">
          O ZIP original dos certificados continua preservado na pasta do
          projeto.
        </p>
      </section>
      {error && (
        <div className="batch-full">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <section className="card connection-card">
        <div className="card-title">
          <Wifi size={21} />
          <h2>Acesso na academia</h2>
        </div>
        <p className="muted">
          Abra o endereço do servidor no navegador do celular ou computador
          conectado à mesma rede. O computador que executa a aplicação precisa
          estar ligado.
        </p>
        <div className="connection-facts">
          <span>
            <i className="online-dot" />
            Rede local · sem login
          </span>
          <span>Dados compartilhados no servidor</span>
          <span>Versão 1.1.0</span>
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
