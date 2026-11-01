# Gerador de Certificados

Aplicação web para emitir certificados individuais e em lote a partir de modelos PDF. O núcleo é compartilhado; cada caso de uso tem um **perfil** com marca, textos, modelos e regras de importação. A edição generalista inclui um perfil neutro de **participação**, pronto para cursos e eventos com os dados básicos de emissão.

A aplicação funciona na rede local, sem login e sem serviços externos durante o uso. Quem tiver acesso ao endereço poderá emitir, consultar e baixar documentos e backups. Use um único processo servidor.

## Branches

Repositório: [gabe-martins/gerador-de-certificados](https://github.com/gabe-martins/gerador-de-certificados).

- `main`: versão estável do gerador generalista, com modelo neutro de participação.
- `dev`: desenvolvimento do gerador generalista; atualizada com a versão publicada em `main`.
- `pagels-jiu-jitsu`: aplicação da academia, com seu perfil, 23 modelos e compatibilidade com a instalação existente.

Esta branch contém somente a edição generalista. O pacote completo da Pagels está na branch `pagels-jiu-jitsu`. O fluxo de atualização está em [docs/branches.md](docs/branches.md).

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
  default.json                  perfil padrão desta edição
  participacao/
    profile.json                identidade, rótulos, padrão e aliases
    assets/                     PDF neutro e posições/textos variáveis
assets/fonts/                   fontes compartilhadas e licença
tools/create_profile.py         criação de novos perfis independentes
tests/                          emissão, persistência, backup e isolamento de perfis
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

O perfil padrão usa `data/participacao/certificates.sqlite3` e `data/participacao/pdfs/`. Outros perfis usam `data/<id>/`. Os arquivos locais da antiga instalação da academia permanecem separados e não são movidos ao trocar de branch.

```bash
CERTIFICATES_PROFILE=participacao \
CERTIFICATES_HOST=127.0.0.1 CERTIFICATES_PORT=8090 bash iniciar.sh
```

Para a aplicação da Pagels, use a branch `pagels-jiu-jitsu`, com sua própria configuração de implantação. Não use um arquivo `.env` de outra aplicação na edição generalista.

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
- [Branches e fluxo de atualização](docs/branches.md)
- [Arquitetura e perfis](docs/profiles.md)

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
npm --prefix frontend run build
```

Os testes cobrem o catálogo de modelos, acentos, limites de texto, datas, lotes, repetição de modelos, importação, duplicados, reenvio concorrente, persistência e integridade de backup. Também exercitam outro caso de uso, restauração e separação dos dados entre perfis. Testes locais não substituem a verificação no servidor Docker e na impressora.
