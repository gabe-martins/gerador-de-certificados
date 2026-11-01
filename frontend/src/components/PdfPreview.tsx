import { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LoaderCircle, FileBadge } from "lucide-react";
import type { Row } from "../lib/types";
import { useProfile } from "../lib/profile";
import { json } from "../lib/api";
import { Modal } from "./ui";
GlobalWorkerOptions.workerSrc = pdfWorker;
export function PdfCanvas({
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

export function Preview({
  row,
  mobile = false,
  onClose,
}: {
  row: Row;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const profile = useProfile();
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
        <span className="paper-size">
          {profile.paper.width_mm.toFixed(0)} ×{" "}
          {profile.paper.height_mm.toFixed(0)} mm ·{" "}
          {profile.paper.orientation === "landscape" ? "Paisagem" : "Retrato"}
        </span>
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
          Design {profile.name}
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
