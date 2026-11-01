import { useEffect, useState } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import type { Model } from "../lib/types";

import { ErrorBox, Modal } from "../components/ui";
import { ModelBadge } from "../components/CertificateFields";
import { PdfCanvas } from "../components/PdfPreview";
import { Award, Eye, ChevronRight, LoaderCircle } from "lucide-react";
export function Models({
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
        <span>Modelos de certificado</span>
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
              <ModelBadge model={m} />
              <h2>{m.label}</h2>
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
