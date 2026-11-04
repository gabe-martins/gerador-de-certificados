"use strict";

const path = require("node:path");
const fs = require("node:fs");

function portablePaths(root) {
  return {
    root,
    data: path.join(root, "data"),
    runtime: path.join(root, "data", "runtime"),
    logs: path.join(root, "data", "logs"),
    exports: path.join(root, "exports"),
  };
}

function prepareDirectories(paths) {
  for (const key of ["data", "runtime", "logs", "exports"]) {
    fs.mkdirSync(paths[key], { recursive: true });
  }
  const probe = path.join(paths.data, `.write-test-${process.pid}`);
  fs.writeFileSync(probe, "", { flag: "wx" });
  fs.unlinkSync(probe);
}

function isLocalURL(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}

function allowRequest(value, origin) {
  // Chromium's bundled PDF viewer is an internal extension. It performs no
  // network access, but its resources must load for the print window to work.
  return isLocalURL(value, origin) || value.startsWith(`blob:${origin}/`) || value.startsWith("data:")
    || value.startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/")
    || value.startsWith("chrome://resources/");
}

function isCertificatePDF(value, origin) {
  if (!isLocalURL(value, origin)) return false;
  return /^\/api\/emissoes\/[a-f0-9-]+\/(?:certificados\/\d+\/)?pdf$/.test(new URL(value).pathname);
}

module.exports = { portablePaths, prepareDirectories, isLocalURL, allowRequest, isCertificatePDF };
