"use strict";

const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { portablePaths, prepareDirectories, isLocalURL, allowRequest, isCertificatePDF } = require("./runtime.cjs");

app.setName("Pagels Certificados");
app.commandLine.appendSwitch("lang", "pt-BR");
const root = app.isPackaged ? path.dirname(process.execPath)
  : (process.env.PAGELS_DESKTOP_HOME || path.resolve(__dirname, "../outputs/desktop-dev"));
const paths = portablePaths(root);
const appRoot = app.isPackaged ? path.join(process.resourcesPath, "backend", "app") : path.resolve(__dirname, "..");
const token = crypto.randomBytes(32).toString("hex");
let mainWindow, child, origin, stopping = false, stopped = false, directoryError;
try {
  prepareDirectories(paths);
  app.setPath("userData", paths.runtime);
  app.setPath("sessionData", paths.runtime);
  app.setPath("crashDumps", path.join(paths.runtime, "crashes"));
} catch (error) {
  directoryError = error;
}

// A separate lock for each portable folder; never attach to the web server.
const ownsLock = !directoryError && app.requestSingleInstanceLock();
if (!directoryError && !ownsLock) app.quit();
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function startBackend() {
  const python = app.isPackaged ? path.join(process.resourcesPath, "backend", "python", "python.exe")
    : (process.env.PAGELS_DESKTOP_PYTHON || path.join(appRoot, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python"));
  const environment = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" };
  // Desktop settings are explicit. Deployment variables must not redirect data.
  for (const key of Object.keys(environment)) {
    if (/^(CERTIFICATES_|PAGELS_)/.test(key)) delete environment[key];
  }
  const log = fs.createWriteStream(path.join(paths.logs, "backend.log"), { flags: "w" });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("O motor de certificados demorou para iniciar.")), 45000);
    let ready = false;
    child = spawn(python, ["-u", path.join(appRoot, "desktop", "backend.py")], {
      cwd: appRoot, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    child.stderr.pipe(log);
    child.stdin.on("error", () => {});
    child.stdin.write(JSON.stringify({ data_dir: paths.data, token }) + "\n");
    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        if (message.event === "ready" && Number.isInteger(message.port) && message.port > 0 && message.port <= 65535) {
          ready = true;
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${message.port}`);
        }
      } catch { /* Python diagnostics go to stderr. */ }
    });
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => {
      stopped = true;
      clearTimeout(timeout);
      if (!ready) reject(new Error(`O motor de certificados encerrou durante a abertura (código ${code}).`));
      else if (!stopping) {
        dialog.showErrorBox("Pagels Certificados", "O motor de certificados foi encerrado. Abra o aplicativo novamente. Seus certificados salvos permanecem na pasta data.");
        app.quit();
      }
    });
  });
}

function secureWindow(window) {
  window.webContents.on("will-navigate", (event, url) => {
    if (!isLocalURL(url, origin)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => isCertificatePDF(url, origin)
    ? { action: "allow", overrideBrowserWindowOptions: {
      width: 1100, height: 820, autoHideMenuBar: true,
      icon: path.join(appRoot, "profiles/pagels-jiu-jitsu/assets/logo.jpg"),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, plugins: true },
    } }
    : { action: "deny" });
  window.webContents.on("did-create-window", (popup) => secureWindow(popup));
}

function configureSession() {
  const localSession = session.defaultSession;
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.setPermissionCheckHandler(() => false);
  localSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !allowRequest(details.url, origin) });
  });
  localSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (isLocalURL(details.url, origin)) details.requestHeaders["X-Pagels-Desktop"] = token;
    callback({ requestHeaders: details.requestHeaders });
  });
  localSession.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      title: "Salvar arquivo · Pagels Certificados",
      defaultPath: path.join(paths.exports, path.basename(item.getFilename())),
    });
    item.once("done", (_event, state) => {
      if (state === "interrupted") dialog.showErrorBox("Não foi possível salvar", "Confira a pasta de destino e tente baixar o arquivo novamente pelo histórico.");
    });
  });
}

function createMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Arquivo", submenu: [
      { label: "Criar backup completo…", click: () => mainWindow.webContents.downloadURL(`${origin}/api/backup`) },
      { label: "Abrir pasta de arquivos exportados", click: () => shell.openPath(paths.exports) },
      { label: "Abrir pasta de dados", click: () => shell.openPath(paths.data) },
      { type: "separator" }, { label: "Sair", role: "quit", accelerator: "Alt+F4" },
    ] },
    { label: "Editar", submenu: [
      { role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" },
      { type: "separator" }, { role: "cut", label: "Recortar" },
      { role: "copy", label: "Copiar" }, { role: "paste", label: "Colar" },
      { role: "selectAll", label: "Selecionar tudo" },
    ] },
    { label: "Exibir", submenu: [
      { role: "resetZoom", label: "Tamanho original" },
      { role: "zoomIn", label: "Aumentar" }, { role: "zoomOut", label: "Diminuir" },
      { role: "togglefullscreen", label: "Tela cheia" },
    ] },
    { label: "Ajuda", submenu: [
      { label: "Como usar a versão portátil", click: () => dialog.showMessageBox(mainWindow, {
        type: "info", title: "Pagels Certificados · Portátil", message: "Seus certificados, neste computador.",
        detail: "Use Emitir para um aluno ou Lote para uma turma. A prévia e os 23 modelos funcionam sem internet.\n\nAo baixar, escolha onde salvar o arquivo. Para imprimir, abra Imprimir e use o botão de impressão do visualizador PDF.\n\nPara levar o aplicativo a outro computador, feche-o e copie a pasta inteira, incluindo data. Faça backups regularmente e nunca execute diretamente de dentro do ZIP.",
      }) },
      { label: "Sobre", click: () => dialog.showMessageBox(mainWindow, {
        type: "info", title: "Pagels Certificados", message: `Pagels Certificados ${app.getVersion()}`,
        detail: "Pagels Jiu-Jitsu · Aplicativo local portátil\n23 modelos de graduação · Uso offline",
      }) },
    ] },
  ]));
}

async function boot() {
  if (directoryError) {
    dialog.showErrorBox("Pasta sem permissão de gravação", "Extraia o ZIP para uma pasta em que você possa salvar arquivos, como Documentos. Mantenha todos os arquivos juntos.\n\n" + directoryError.message);
    app.quit();
    return;
  }
  if (!ownsLock) return;
  origin = await startBackend();
  if (stopping) return;
  configureSession();
  ipcMain.handle("pagels:open-data", (event) => {
    if (isLocalURL(event.senderFrame.url, origin)) return shell.openPath(paths.data);
    throw new Error("Janela não autorizada.");
  });
  mainWindow = new BrowserWindow({
    title: "Pagels Jiu-Jitsu · Certificados", width: 1440, height: 940,
    minWidth: 900, minHeight: 660, backgroundColor: "#f5f5f4", show: false,
    icon: path.join(appRoot, "profiles/pagels-jiu-jitsu/assets/logo.jpg"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, plugins: true },
  });
  secureWindow(mainWindow);
  createMenu();
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; app.quit(); });
  await mainWindow.loadURL(origin);
}

app.whenReady().then(boot).catch((error) => {
  dialog.showErrorBox("Não foi possível abrir Pagels Certificados", `${error.message}\n\nVerifique data/logs/backend.log. Extraia novamente o pacote mantendo todos os arquivos juntos.`);
  app.quit();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (!child || stopped) return;
  event.preventDefault();
  if (stopping) return;
  stopping = true;
  child.once("exit", () => app.quit());
  // Closing stdin also stops Python after a desktop crash or abnormal exit.
  child.stdin.end("shutdown\n");
  setTimeout(() => { if (!stopped) child.kill(); }, 17000).unref();
});
