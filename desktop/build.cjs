"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const environmentPython = path.resolve(__dirname, "../.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.PAGELS_BUILD_PYTHON || (fs.existsSync(environmentPython) ? environmentPython : process.platform === "win32" ? "python" : "python3");
const result = spawnSync(python, [path.join(__dirname, "build_windows.py")], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
