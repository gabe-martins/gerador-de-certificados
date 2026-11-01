import { useEffect, useRef, useState } from "react";
import {
  Award,
  FileBadge,
  Layers,
  History,
  Settings,
  Eye,
  Copy,
  LoaderCircle,
  CheckCircle2,
  ChevronRight,
  Plus,
  Wifi,
  MoreHorizontal,
  X,
} from "lucide-react";
import type {
  Screen,
  Model,
  Profile,
  Row,
  Defaults,
  Issued,
} from "./lib/types";
import { ProfileContext, BrandLogo } from "./lib/profile";
import { api, json } from "./lib/api";
import { emptyRow, localToday, uuid } from "./lib/forms";
import { ErrorBox, Modal, Result } from "./components/ui";
import {
  ModelFields,
  EventFields,
  ModelBadge,
} from "./components/CertificateFields";
import { Preview } from "./components/PdfPreview";
import { Batch } from "./features/Batch";
import { HistoryView } from "./features/HistoryView";
import { Models } from "./features/Models";
import { Preferences } from "./features/Preferences";
const nav = [
  {
    id: "emitir",
    label: "Emitir",
    full: "Emitir certificado",
    icon: FileBadge,
  },
  { id: "lote", label: "Lote", full: "Emissão em lote", icon: Layers },
  { id: "historico", label: "Histórico", full: "Histórico", icon: History },
  {
    id: "modelos",
    label: "Modelos",
    full: "Modelos de certificado",
    icon: Award,
  },
  { id: "configuracoes", label: "Mais", full: "Configurações", icon: Settings },
] as const;
export function App() {
  const [screen, setScreen] = useState<Screen>("emitir"),
    [profile, setProfile] = useState<Profile | null>(null),
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
      api<Profile>("/api/perfil"),
    ])
      .then(([m, d, h, p]) => {
        setProfile(p);
        document.title = `${p.name} · Certificados`;
        document.documentElement.style.setProperty("--red", p.accent_color);
        document.documentElement.style.setProperty(
          "--certificate-aspect-ratio",
          `${p.paper.width_mm} / ${p.paper.height_mm}`,
        );
        document.documentElement.style.setProperty(
          "--red-dark",
          `color-mix(in srgb, ${p.accent_color} 80%, black)`,
        );
        document.documentElement.style.setProperty(
          "--focus",
          `${p.accent_color}50`,
        );
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", p.accent_color);
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute("content", `Emissão de certificados · ${p.name}`);
        if (p.logo_url) {
          const icon = document.createElement("link");
          icon.rel = "icon";
          icon.href = p.logo_url;
          document.head.appendChild(icon);
        }
        setModels(m.models);
        setTemplateVersion(m.version);
        setUfs(m.ufs);
        setDefaults(d);
        setRow(emptyRow(d, h.today, p.default_model));
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
        <FileBadge size={38} />
        <ErrorBox>{bootError}</ErrorBox>
        <button className="primary" onClick={() => location.reload()}>
          Tentar novamente
        </button>
      </div>
    );
  if (!ready || !profile)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        <p>Preparando o gerador de certificados…</p>
      </div>
    );
  return (
    <ProfileContext.Provider value={profile}>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            data-long-name={profile.short_name.length > 10}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("emitir");
            }}
          >
            <BrandLogo />
            <div>
              <strong>
                {profile.short_name}
                <span className="brand-dot">.</span>
              </strong>
              <span>CERTIFICADOS</span>
            </div>
          </a>
          <div className="sidebar-label">GERADOR DE CERTIFICADOS</div>
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
              {profile.name} <ChevronRight size={14} />
              <strong>{current.full}</strong>
            </span>
            <span className="network">
              <Wifi size={15} />
              Rede local
            </span>
            <BrandLogo className="mobile-logo" />
          </header>
          <main>
            <div className="page-heading">
              <div>
                <span className="eyebrow">{profile.name.toUpperCase()}</span>
                <h1>{current.full}</h1>
                <p>
                  {screen === "emitir"
                    ? "Uma conquista que merece ser registrada."
                    : screen === "lote"
                      ? "Uma turma inteira, com o mesmo cuidado em cada certificado."
                      : screen === "historico"
                        ? "Consulte, baixe novamente ou use os dados em uma nova emissão."
                        : screen === "modelos"
                          ? "Os modelos disponíveis para cada tipo de certificado."
                          : "Preferências de emissão e cópia dos seus dados."}
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
                    {profile.labels.recipient}
                    <input
                      value={row.nome_aluno}
                      placeholder="Nome completo"
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
                    <h2>{profile.labels.selection}</h2>
                  </div>
                  <ModelFields
                    row={row}
                    change={change}
                    models={models}
                    errors={errors}
                  />
                  <div className="selected-belt">
                    <ModelBadge
                      model={models.find((m) => m.id === row.modelo_id)}
                    />
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
                          setRow(
                            emptyRow(defaults, row.data, profile.default_model),
                          );
                          setResult(undefined);
                          requestId.current = uuid();
                        }}
                      >
                        Emitir para outro participante <Plus size={16} />
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
            {profile.name} <span>{profile.tagline}</span>
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
                ? "registro com o mesmo nome, modelo e data"
                : "registros com o mesmo nome, modelo e data"}{" "}
              no lote ou no histórico.
            </p>
            <p className="muted">
              Se for uma reemissão ou pessoas com o mesmo nome, você pode
              continuar.
            </p>
            {emitError && <ErrorBox>{emitError}</ErrorBox>}
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setConfirm(undefined)}
              >
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
    </ProfileContext.Provider>
  );
}
