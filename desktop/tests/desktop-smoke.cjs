"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const root = path.resolve(__dirname, "../..");
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), "Pagels portátil "));
const output = path.join(root, "outputs/windows/validation");
fs.mkdirSync(output, { recursive: true });
let application;
const errors = [];

async function launch() {
  const launched = await electron.launch({
    executablePath: require("electron"),
    args: [path.join(root, "desktop"), "--no-sandbox", "--disable-gpu"],
    env: { ...process.env, PAGELS_DESKTOP_HOME: testHome },
    timeout: 45000,
  });
  const page = await launched.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("heading", { name: "Emitir certificado", exact: true }).waitFor();
  return { launched, page };
}

async function download(page, link, filename) {
  const destination = path.join(output, filename);
  await application.evaluate(({ session }, destination) => {
    globalThis.pagelsDownload = new Promise((resolve) => {
      session.defaultSession.once("will-download", (_event, item) => {
        item.setSavePath(destination);
        item.once("done", (_event, state) => resolve(state));
      });
    });
  }, destination);
  await link.click();
  assert.equal(await application.evaluate(() => globalThis.pagelsDownload), "completed");
  assert.ok(fs.statSync(destination).size > 100);
  return destination;
}

(async () => {
  try {
    let { launched, page } = await launch();
    application = launched;
    const firstOrigin = new URL(page.url()).origin;
    assert.equal((await fetch(`${firstOrigin}/api/backup`)).status, 403);
    assert.equal((await fetch(`${firstOrigin}/api/perfil`)).status, 403);
    assert.equal(await page.evaluate(() => typeof window.require), "undefined");
    assert.equal(await page.evaluate(() => window.pagelsDesktop.portable), true);
    assert.equal(await page.evaluate(() => fetch("https://example.com").then(() => "allowed").catch(() => "blocked")), "blocked");
    const health = await page.evaluate(() => fetch("/api/health").then((response) => response.json()));
    assert.equal(health.models, 23);
    assert.equal(health.profile, "pagels-jiu-jitsu");
    await page.getByLabel("Nome do aluno", { exact: true }).fill("João Antônio da Silva");
    await page.getByLabel("Cidade", { exact: true }).filter({ visible: true }).fill("São José");
    await page.getByLabel("UF").filter({ visible: true }).selectOption("SC");
    await page.getByLabel("Data da graduação", { exact: true }).filter({ visible: true }).fill("2026-11-03");
    await page.locator(".preview-surface canvas").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".preview-surface canvas");
      return canvas && canvas.width > 200 && !document.querySelector(".preview-surface .canvas-loading");
    });
    await page.screenshot({ path: path.join(output, "pagels-desktop.png"), fullPage: true });
    await page.getByRole("main").getByRole("button", { name: "Emitir certificado", exact: true }).click();
    await page.getByRole("link", { name: "Baixar PDF", exact: true }).waitFor();
    await download(page, page.getByRole("link", { name: "Baixar PDF", exact: true }), "certificado-desktop.pdf");
    const popupPromise = application.waitForEvent("window"), pdfFailures = [];
    application.once("window", (pdf) => {
      pdf.on("pageerror", (error) => pdfFailures.push(error.message));
      pdf.on("requestfailed", (request) => pdfFailures.push(`${request.url()}: ${request.failure()?.errorText}`));
    });
    await page.getByRole("link", { name: "Imprimir", exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("load");
    assert.ok(popup.url().includes("inline=true"));
    const pdfFrame = popup.frame({ url: /chrome-extension:\/\/mhjfbmdgcfjbbpaeojofohoefgiehjai/ })
      || await popup.waitForEvent("framenavigated", { predicate: (frame) => frame.url().startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/") });
    await pdfFrame.locator("viewer-toolbar").waitFor({ state: "visible" });
    await popup.waitForTimeout(800);
    assert.equal(pdfFailures.length, 0, pdfFailures.join("\n"));
    await popup.screenshot({ path: path.join(output, "print-viewer.png") });
    await popup.close();
    await page.getByRole("button", { name: "Configurações", exact: true }).click();
    await page.getByRole("heading", { name: "Aplicativo portátil" }).waitFor();
    await page.getByLabel("Cidade", { exact: true }).filter({ visible: true }).fill("Florianópolis");
    await page.getByLabel("UF").filter({ visible: true }).selectOption("SC");
    await page.getByRole("button", { name: "Salvar preferências" }).click();
    await download(page, page.getByRole("button", { name: "Baixar backup completo" }), "backup-desktop.zip");
    await page.getByRole("button", { name: "Emissão em lote", exact: true }).click();
    await page.getByLabel("Importar planilha de participantes").setInputFiles({
      name: "turma.csv", mimeType: "text/csv", buffer: Buffer.from("nome;cidade;uf;data;faixa\nAna Paula;São José;SC;2026-11-03;azul\nBruno Lima;Curitiba;PR;2026-11-03;azul\n"),
    });
    await page.getByRole("button", { name: /Emitir .*certificados/ }).click();
    await page.getByRole("link", { name: "PDF completo", exact: true }).waitFor();
    await download(page, page.getByRole("link", { name: "ZIP individual", exact: true }), "lote-desktop.zip");
    await application.close();
    application = undefined;
    await assert.rejects(fetch(`${firstOrigin}/api/health`));
    ({ launched, page } = await launch());
    application = launched;
    assert.equal(await page.getByLabel("Cidade", { exact: true }).filter({ visible: true }).inputValue(), "Florianópolis");
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await page.getByRole("cell", { name: /^João Antônio da Silva/ }).waitFor();
    await page.getByRole("cell", { name: /^Ana Paula/ }).waitFor();
    await page.getByRole("cell", { name: /^Bruno Lima/ }).waitFor();
    await download(page, page.getByRole("link", { name: "PDF", exact: true }).last(), "certificado-reaberto.pdf");
    assert.equal(errors.length, 0, errors.join("\n"));
    const report = { status: "passed", models: 23, desktop: "Electron Linux with the production desktop code",
      checks: ["private API", "blocked external requests", "sandboxed renderer", "PDF preview", "single issuance", "PDF download", "print popup", "preferences", "backup download", "CSV batch import", "ZIP download", "graceful shutdown", "restart persistence"],
      data: testHome, rendererErrors: errors };
    fs.writeFileSync(path.join(output, "desktop-smoke.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (application) {
      const windows = application.windows();
      if (windows[0]) await windows[0].screenshot({ path: path.join(output, "desktop-failure.png"), fullPage: true }).catch(() => {});
    }
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (application) await application.close();
  }
})();
