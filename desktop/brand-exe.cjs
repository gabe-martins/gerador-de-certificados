"use strict";

const fs = require("node:fs");
const PE = require("pe-library");
const { Data, Resource } = require("resedit");
const [input, output, iconPath, version] = process.argv.slice(2);
const exe = PE.NtExecutable.from(fs.readFileSync(input), { ignoreCert: true });
const resources = PE.NtExecutableResource.from(exe);
const icon = Data.IconFile.from(fs.readFileSync(iconPath));
for (const group of Resource.IconGroupEntry.fromEntries(resources.entries)) {
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icon.icons.map((item) => item.data));
}
const info = Resource.VersionInfo.fromEntries(resources.entries)[0] || Resource.VersionInfo.createEmpty();
info.setFileVersion(version);
info.setProductVersion(version);
info.setStringValues({ lang: 1033, codepage: 1200 }, {
  CompanyName: "Pagels Jiu-Jitsu",
  FileDescription: "Pagels Certificados",
  ProductName: "Pagels Certificados",
  InternalName: "Pagels Certificados",
  OriginalFilename: "Pagels Certificados.exe",
  LegalCopyright: "Pagels Jiu-Jitsu",
});
info.outputToResourceEntries(resources.entries);
resources.outputResource(exe);
fs.writeFileSync(output, Buffer.from(exe.generate()));
// Reparse the result before it can become a deliverable.
const verified = PE.NtExecutableResource.from(PE.NtExecutable.from(fs.readFileSync(output)));
if (!Resource.IconGroupEntry.fromEntries(verified.entries).length) throw new Error("Ícone ausente no executável.");
console.log("Ícone e identificação Pagels aplicados ao executável Windows.");
