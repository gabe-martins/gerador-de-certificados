"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pagelsDesktop", Object.freeze({
  portable: true,
  version: "1.0.1",
  openDataFolder: () => ipcRenderer.invoke("pagels:open-data"),
}));
