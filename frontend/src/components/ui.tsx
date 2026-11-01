import React, { useEffect, useRef } from "react";
import { AlertCircle, X, CheckCircle2, Download, Printer } from "lucide-react";
import type { Issued } from "../lib/types";
export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Modal({
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
export function Result({ result }: { result: Issued }) {
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
export function Pagination({
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
