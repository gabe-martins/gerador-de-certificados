"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { portablePaths, prepareDirectories, isLocalURL, allowRequest, isCertificatePDF } = require("../runtime.cjs");

test("portable data and exports stay under the executable folder, including accents and spaces", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Pagels graduação "));
  try {
    const paths = portablePaths(root);
    prepareDirectories(paths);
    for (const key of ["data", "runtime", "logs", "exports"]) assert.ok(fs.statSync(paths[key]).isDirectory());
    assert.deepEqual(fs.readdirSync(paths.data).sort(), ["logs", "runtime"]);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test("only the private origin can receive desktop credentials or navigate", () => {
  const origin = "http://127.0.0.1:8097";
  assert.ok(isLocalURL(`${origin}/api/health`, origin));
  for (const url of ["http://127.0.0.1:8090/api/backup", "https://example.com", "file:///etc/passwd", `${origin}.example.com/`, "javascript:alert(1)"]) {
    assert.equal(isLocalURL(url, origin), false);
    assert.equal(allowRequest(url, origin), false);
  }
  assert.ok(allowRequest(`blob:${origin}/123`, origin));
  assert.ok(allowRequest("data:image/png;base64,AA==", origin));
  assert.ok(allowRequest("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html", origin));
  assert.ok(allowRequest("chrome://resources/js/assert.js", origin));
  assert.equal(allowRequest("chrome-extension://another-extension/index.html", origin), false);
});

test("popups are limited to issued PDFs, including per-student printing", () => {
  const origin = "http://127.0.0.1:8097";
  assert.ok(isCertificatePDF(`${origin}/api/emissoes/ab-123/pdf?inline=true`, origin));
  assert.ok(isCertificatePDF(`${origin}/api/emissoes/ab-123/certificados/2/pdf?inline=true`, origin));
  for (const url of [`${origin}/api/backup`, `${origin}/`, "https://example.com/api/emissoes/ab/pdf"]) assert.equal(isCertificatePDF(url, origin), false);
});
