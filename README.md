# Gerador de Certificados

Aplicação web para emitir certificados individuais e em lote a partir de modelos PDF. O núcleo é compartilhado; cada caso de uso tem um **perfil** com marca, textos, modelos e regras de importação. O primeiro perfil é **Pagels Jiu-Jitsu**, selecionado por padrão, com seus 23 modelos de graduação.

A aplicação funciona na rede local, sem login e sem serviços externos durante o uso. Quem tiver acesso ao endereço poderá emitir, consultar e baixar documentos e backups. Use um único processo servidor.

## Branches

Repositório: [gabe-martins/gerador-de-certificados](https://github.com/gabe-martins/gerador-de-certificados).

- `main`: versão estável do gerador generalista, com modelo neutro de participação.
- `dev`: desenvolvimento do gerador generalista; atualizada com a versão publicada em `main`.
- `pagels-jiu-jitsu`: aplicação da academia, com seu perfil, 23 modelos e compatibilidade com a instalação existente.

Este pacote mantém a configuração da Pagels. Para continuar a aplicação da academia, use a branch `pagels-jiu-jitsu`. Para o núcleo generalista, use `dev` ou `main`. O fluxo de atualização está em [docs/branches.md](docs/branches.md).

## Estrutura

```text
server/                         API, validação, PDF, importação e persistência
  asgi.py                       entrada do servidor
  main.py                       fábrica da aplicação e rotas
  profiles.py                   carregamento e validação de perfis
  pdf_engine.py                 motor PDF compartilhado
  storage.py                    banco e vínculo dos dados com o perfil
frontend/src/
  App.tsx                       navegação e emissão individual
  components/                   formulários, prévia PDF e componentes comuns
  features/                     lote, histórico, modelos e preferências
  lib/                          contratos, API, formulários e contexto do perfil
profiles/
  pagels-jiu-jitsu/
    profile.json                identidade, rótulos, padrão e aliases
    assets/                     logo, PDF e posições/textos variáveis
    tools/                      manutenção específica das artes Pagels
assets/fonts/                   fontes compartilhadas e licença
tools/create_profile.py         criação de novos perfis independentes
tests/                          regressões da Pagels e isolamento de perfis
docs/                           arquitetura, adaptação, uso e operação
```

Os diretórios locais `data/`, `backups/` e `outputs/`, o ZIP original, logs e dependências não são versionados. Os dados existentes não precisam ser movidos para atualizar o código.

## Desenvolvimento local

Requisitos: Python 3.11+, suporte a venv e Node 20.19+ ou 22.12+.

```bash
bash instalar.sh
npm --prefix frontend ci
npm --prefix frontend run build
bash iniciar.sh
```

Abra [localhost:8090](http://localhost:8090). O backend serve a interface compilada. Para encerrar: Ctrl+C ou `bash parar.sh`. Em desenvolvimento, `npm --prefix frontend run dev` serve a interface na porta 5173 e encaminha `/api` para 8090.

O perfil padrão usa `data/pagels.sqlite3` e `data/pdfs/`, preservando histórico e PDFs existentes. As variáveis antigas `PAGELS_HOST`, `PAGELS_PORT`, `PAGELS_DATA_DIR` e `PAGELS_PYTHON` continuam aceitas; `CERTIFICATES_*` tem precedência.

```bash
CERTIFICATES_PROFILE=pagels-jiu-jitsu \
CERTIFICATES_HOST=127.0.0.1 CERTIFICATES_PORT=8090 bash iniciar.sh
```

## Adaptar para outro uso

Crie um perfil inicial com arte de participação independente:

```bash
.venv/bin/python -m tools.create_profile curso-fotografia --name "Curso de Fotografia"
CERTIFICATES_PROFILE=curso-fotografia CERTIFICATES_PORT=8091 bash iniciar.sh
```

Edite `profiles/curso-fotografia/profile.json`, substitua o PDF base e ajuste as posições em `assets/modelos.json` do perfil. A mesma interface usa os novos rótulos, logotipo, cor, modelos e padrão sem recompilação. Fora do Docker, esse exemplo usa automaticamente `data/curso-fotografia/`.

Cada instalação atende **um perfil por processo**. Para usar dois ao mesmo tempo, configure portas e diretórios diferentes. O banco é vinculado ao identificador do perfil; a aplicação recusa reutilizar dados de outro perfil.

O contrato atual contém nome, cidade, UF brasileira, data e modelo. Ele cobre graduação, participação e eventos com esses dados básicos; campos adicionais e outros idiomas exigem extensão do contrato. Veja [como criar e configurar perfis](docs/profiles.md).

## Operação e validação

- [Docker e atualização de instalações existentes](docs/docker.md)
- [Uso da Pagels Jiu-Jitsu](docs/pagels-jiu-jitsu.md)
- [Arquitetura e perfis](docs/profiles.md)

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
npm --prefix frontend run build
```

Os testes cobrem os 23 modelos Pagels, acentos, limites de texto, datas, lotes, repetição de modelos, importação, duplicados, reenvio concorrente, persistência e integridade de backup. Também exercitam outro caso de uso, restauração e separação dos dados entre perfis. Testes locais não substituem a verificação no servidor Docker e na impressora.
