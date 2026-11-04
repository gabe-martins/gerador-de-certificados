"""Build a self-contained Windows x64 folder/ZIP from Linux or Windows.

No Wine, cross compiler, installed Windows Python, or installer is required.
Electron and Python are upstream Windows binaries verified by pinned SHA-256.
Only Windows wheels are accepted; production data are never copied.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from importlib.metadata import distributions
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "desktop"
META = json.loads((DESKTOP / "package.json").read_text())
VERSION = META["version"]
ELECTRON = META["devDependencies"]["electron"]
PYTHON = "3.13.17"
PYTHON_SHA256 = "9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38"
ELECTRON_SHA256 = "7c342aee45d5b4ccafe5dfe9037028796b082735a576e21e2b4e2d8422ebb727"
OUTPUT = ROOT / "outputs" / "windows"
CACHE = DESKTOP / ".cache"
STAGE = OUTPUT / "Pagels Certificados"


def run(*args, **kwargs):
    print("+", " ".join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), check=True, cwd=ROOT, **kwargs)


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url, expected):
    CACHE.mkdir(parents=True, exist_ok=True)
    destination = CACHE / url.rsplit("/", 1)[1]
    if not destination.exists() or sha256(destination) != expected:
        print("Baixando", url, flush=True)
        temporary = destination.with_suffix(".partial")
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        if sha256(temporary) != expected:
            temporary.unlink()
            raise ValueError(f"SHA-256 inesperado: {destination.name}")
        temporary.replace(destination)
    return destination


def main():
    from PIL import Image
    if not (ROOT / "profiles/pagels-jiu-jitsu/profile.json").is_file():
        raise SystemExit("Execute na branch da Pagels, que contém os 23 modelos e a marca.")
    if not (ROOT / "frontend/dist/index.html").is_file():
        raise SystemExit("Compile a interface: npm --prefix frontend run build")
    electron = download(f"https://github.com/electron/electron/releases/download/v{ELECTRON}/electron-v{ELECTRON}-win32-x64.zip", ELECTRON_SHA256)
    python = download(f"https://www.python.org/ftp/python/{PYTHON}/python-{PYTHON}-embed-amd64.zip", PYTHON_SHA256)
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    with ZipFile(electron) as archive:
        archive.extractall(STAGE)
    (STAGE / "resources/default_app.asar").unlink(missing_ok=True)
    backend = STAGE / "resources/backend"
    python_dir = backend / "python"
    with ZipFile(python) as archive:
        archive.extractall(python_dir)
    (python_dir / "python313._pth").write_text("python313.zip\n.\nLib/site-packages\nimport site\n", encoding="utf-8")
    run(sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--only-binary=:all:",
        "--platform", "win_amd64", "--python-version", "3.13", "--implementation", "cp", "--abi", "cp313",
        "--ignore-installed", "--no-compile", "--target", python_dir / "Lib/site-packages",
        "-r", DESKTOP / "requirements-windows.txt")
    # pip's cross-platform flags choose wheels, but marker evaluation can still
    # use the host OS. Check the dependency closure with Windows/Python markers.
    from pip._vendor.packaging.markers import default_environment
    from pip._vendor.packaging.requirements import Requirement
    from pip._vendor.packaging.utils import canonicalize_name
    installed = {canonicalize_name(dist.metadata["Name"]): dist
                 for dist in distributions(path=[str(python_dir / "Lib/site-packages")])}
    target_environment = default_environment() | {"os_name": "nt", "sys_platform": "win32",
        "platform_system": "Windows", "platform_machine": "AMD64", "python_version": "3.13",
        "python_full_version": PYTHON, "implementation_version": PYTHON, "extra": ""}
    for dist in installed.values():
        for requirement in dist.requires or []:
            dependency = Requirement(requirement)
            if dependency.marker and not dependency.marker.evaluate(target_environment):
                continue
            candidate = installed.get(canonicalize_name(dependency.name))
            if candidate is None or candidate.version not in dependency.specifier:
                raise ValueError(f"Dependência Windows incompleta: {dist.metadata['Name']} requer {requirement}")
    app = backend / "app"
    # Explicit allowlist prevents accidentally distributing history, credentials,
    # .git, personal backups, source dependencies, or the build's own output.
    for directory in ["server", "assets/fonts", "profiles/pagels-jiu-jitsu/assets", "frontend/dist"]:
        shutil.copytree(ROOT / directory, app / directory,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for file in ["profiles/default.json", "profiles/pagels-jiu-jitsu/profile.json", "desktop/backend.py"]:
        (app / file).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / file, app / file)
    electron_app = STAGE / "resources/app"
    electron_app.mkdir()
    for file in ["package.json", "main.cjs", "runtime.cjs", "preload.cjs"]:
        shutil.copy2(DESKTOP / file, electron_app / file)
    # Do not ship build/test dependencies as runtime requirements.
    (electron_app / "package.json").write_text(json.dumps({key: value for key, value in META.items()
        if key not in ("scripts", "devDependencies")}, indent=2), encoding="utf-8")
    icon_path = OUTPUT / "pagels.ico"
    Image.open(app / "profiles/pagels-jiu-jitsu/assets/logo.jpg").convert("RGBA").save(
        icon_path, format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    run("node", DESKTOP / "brand-exe.cjs", STAGE / "electron.exe", STAGE / "Pagels Certificados.exe", icon_path, VERSION)
    (STAGE / "electron.exe").unlink()
    (STAGE / "data").mkdir()
    (STAGE / "exports").mkdir()
    shutil.copy2(DESKTOP / "LEIA-ME.txt", STAGE / "LEIA-ME.txt")
    try:
        base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        base = "unknown"
    build = {"application": "Pagels Certificados", "version": VERSION, "platform": "windows-x64",
             "portable": True, "profile": "pagels-jiu-jitsu", "models": 23, "base_commit": base,
             "python": PYTHON, "electron": ELECTRON,
             "upstream_sha256": {python.name: PYTHON_SHA256, electron.name: ELECTRON_SHA256}}
    (STAGE / "BUILD.json").write_text(json.dumps(build, indent=2), encoding="utf-8")
    manifest = {str(file.relative_to(STAGE)).replace(os.sep, "/"): sha256(file)
                for file in sorted(STAGE.rglob("*")) if file.is_file()}
    (STAGE / "SHA256SUMS.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    destination = OUTPUT / f"Pagels-Certificados-{VERSION}-windows-x64-portable.zip"
    print("Compactando pacote portátil…", flush=True)
    temporary_zip = destination.with_suffix(".zip.partial")
    with ZipFile(temporary_zip, "w", ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(STAGE.rglob("*")):
            archive.write(file, str(file.relative_to(OUTPUT)))
    temporary_zip.replace(destination)
    checksum = sha256(destination)
    destination.with_suffix(".zip.sha256").write_text(f"{checksum}  {destination.name}\n", encoding="ascii")
    print(json.dumps({"zip": str(destination), "size_mb": round(destination.stat().st_size / 1024**2, 1), "sha256": checksum}, indent=2))


if __name__ == "__main__":
    main()
