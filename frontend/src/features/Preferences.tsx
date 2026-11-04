import { useState } from "react";

import type { Defaults } from "../lib/types";
import { useProfile } from "../lib/profile";
import { api, json } from "../lib/api";
import { localToday } from "../lib/forms";
import { ErrorBox } from "../components/ui";
import { desktop } from "../lib/desktop";

import {
  Settings,
  CheckCircle2,
  Download,
  LoaderCircle,
  Wifi,
  HardDrive,
  FolderOpen,
} from "lucide-react";
export function Preferences({
  defaults,
  ufs,
  save,
}: {
  defaults: Defaults;
  ufs: string[];
  save: (d: Defaults) => void;
}) {
  const profile = useProfile();
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
      a.download = `backup_${profile.id}_${localToday(profile.timezone)}.zip`;
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
              placeholder="Cidade padrão"
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
          O backup inclui os dados e os arquivos do perfil ativo.
        </p>
      </section>
      {error && (
        <div className="batch-full">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      <section className="card connection-card">
        <div className="card-title">
          {desktop ? <HardDrive size={21} /> : <Wifi size={21} />}
          <h2>{desktop ? "Aplicativo portátil" : "Acesso na academia"}</h2>
        </div>
        <p className="muted">
          {desktop ? "Use sem internet. O histórico, os PDFs e suas preferências ficam na pasta do aplicativo. Para levar a outro computador, feche o aplicativo e copie a pasta inteira, incluindo a pasta data." : <>Abra o endereço do servidor no navegador do celular ou computador
          conectado à mesma rede. O computador que executa a aplicação precisa
          estar ligado.</>}
        </p>
        <div className="connection-facts">
          <span>
            <i className="online-dot" />
            {desktop ? "Neste computador · sem internet" : "Rede local · sem login"}
          </span>
          <span>{desktop ? "Dados salvos na pasta data" : "Dados compartilhados no servidor"}</span>
          <span>{desktop ? `Versão portátil ${desktop.version}` : "Versão 1.2.0"}</span>
        </div>
        {desktop && <button className="secondary" onClick={() => void desktop?.openDataFolder().then((message) => {
          if (message) setError(message);
        }).catch(() => setError("Não foi possível abrir a pasta de dados."))}>
          <FolderOpen size={17} /> Abrir pasta de dados
        </button>}
      </section>
    </div>
  );
}
