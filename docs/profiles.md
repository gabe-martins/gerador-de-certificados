# Perfis e arquitetura

O gerador mantém quatro responsabilidades separadas:

1. `server/profiles.py` lê e valida o pacote do caso de uso.
2. `server/pdf_engine.py` valida valores, ajusta fontes e sobrepõe textos ao PDF do perfil.
3. `server/storage.py` preserva histórico e PDFs em um diretório vinculado ao perfil.
4. O frontend consulta `/api/perfil` e `/api/modelos` para montar a identidade visual e os formulários.

Não há marca nem identificadores de faixa fixos no motor PDF ou na interface. Faixas e graus são descritos pelos modelos da Pagels; modelos sem esse metadado usam seleção simples e ícone genérico.

O perfil padrão é selecionado por `profiles/default.json`. O campo opcional `legacy_env_prefix` nesse arquivo permite que uma aplicação especializada continue aceitando as variáveis de sua implantação antiga. O campo opcional `database_name` em `profile.json` preserva o nome do banco de uma instalação existente; o padrão é `certificates.sqlite3`.

## Criar um perfil

Na raiz do repositório, após instalar as dependências Python:

```bash
.venv/bin/python -m tools.create_profile meu-evento --name "Meu Evento"
```

O comando não sobrescreve diretórios existentes. Ele gera um PDF de participação com arte neutra e os arquivos de configuração correspondentes. Nenhuma arte da Pagels é copiada.

```text
profiles/meu-evento/
  profile.json
  assets/
    modelos.pdf
    modelos.json
    logo.jpg          opcional; nome definido em profile.json
```

Também é possível selecionar um pacote externo usando um caminho absoluto em `CERTIFICATES_PROFILE`. No Docker, monte o pacote como somente leitura ou inclua-o em `profiles/` e reconstrua a imagem.

## Configuração

`profile.json` usa `schema_version: 1` e contém:

| Campo | Uso |
| --- | --- |
| `id` | Identificador estável em minúsculas com hífens; identifica o banco e os backups |
| `name`, `short_name`, `tagline` | Marca exibida na interface |
| `accent_color` | Cor principal no formato `#RRGGBB` |
| `logo` | Nome de arquivo opcional em `assets/`; sem ele, a interface usa um ícone |
| `timezone` | Fuso IANA usado na data inicial e nas emissões |
| `font_file` | Fonte TTF em `assets/fonts/`; mantenha a licença junto ao arquivo |
| `default_model` | Identificador de um modelo existente |
| `labels` | `recipient`, `template`, `date` e `selection` |
| `imports.aliases` | Cabeçalhos alternativos normalizados para os campos do contrato |
| `imports.label_prefixes` | Prefixos opcionais dos rótulos aceitos na importação |
| `imports.model_aliases` | Nomes alternativos de modelo para seu identificador canônico |

Reinicie o servidor após alterar o pacote. A versão dos modelos é um hash dos arquivos de configuração, PDF, fonte e logo. O navegador recebe o perfil ativo no carregamento; não é necessário compilar uma interface para cada organização.

## PDF e campos variáveis

`assets/modelos.json` define a página (`width_pt`, `height_pt`, `width_mm`, `height_mm`, `orientation`), os modelos e os campos sobrepostos. Cada modelo contém `id`, `label` e `page` (começando em 1). Todos os modelos de um perfil devem ter as dimensões configuradas. A arte do PDF deve deixar livres as áreas de nome e local/data.

Cada campo contém `name`, `input_keys`, `format`, `placeholder`, `box_mm.width`, `font_size_pt`, `min_font_size_pt` e `reference_baseline_pdf_pt`. A linha é centralizada horizontalmente; a posição vertical usa pontos PDF a partir da base. O texto reduz até o tamanho mínimo e, se ainda não couber, a emissão é recusada para revisão.

Use `{nome_aluno}` para o nome e, por exemplo, `{cidade}/{uf}, {data_por_extenso}.` para a segunda linha. A data por extenso usa português com dois dígitos no dia. Os nomes técnicos `nome_aluno`, `cidade`, `uf`, `data`, `modelo_id` são mantidos para compatibilidade com os bancos e as planilhas da primeira versão; `nome_aluno` representa o destinatário em qualquer perfil. O gerador inicial usa duas linhas (`nome_aluno` e `local_data`).

O contrato atual exige todos esses dados, valida UFs brasileiras e usa armazenamento ISO para a data. Não oferece edição arbitrária de formulários, carga horária, assinatura digital, idiomas adicionais ou troca de perfil pela interface. Para novos campos, estenda conjuntamente os contratos, persistência, importação, validação e frontend.

Para variantes, os modelos podem compartilhar `group`; o seletor oferece as opções do mesmo grupo. Na Pagels, `group: "preta"` reúne graus 0–7, e o alias de importação `grau` aponta para `degree`. O metadado opcional `visual` descreve a faixa (`kind: "belt"`, `color`, `stripe`, `degree`) e serve apenas à interface.

## Dados e compatibilidade

- Sem variáveis, a Pagels continua em `data/pagels.sqlite3` e `data/pdfs/`.
- Outros perfis usam `data/<id>/certificates.sqlite3` e `data/<id>/pdfs/` no modo local.
- `CERTIFICATES_DATA_DIR` substitui o diretório no backend. No Compose, configure **`CERTIFICATES_DATA_PATH`** para o diretório do host; o contêiner grava sempre em `/data`.
- `instance_profile` registra o identificador do perfil no banco. A abertura com outro identificador é recusada. Não altere o `id` de um perfil já em uso.
- Ao abrir o banco antigo da Pagels, apenas o vínculo do perfil é adicionado. Os certificados e PDFs anteriores continuam sendo lidos dos mesmos locais.
- PDFs emitidos são imutáveis. Atualizar a arte não regenera documentos do histórico.
- `server.main.create_app(...)` é uma fábrica sem inicialização global; o processo é iniciado por `server.asgi:app`.

## Backup e restauração

O backup novo (manifesto versão 2) inclui `data/`, `profiles/<id>/`, `assets/fonts/` e os hashes SHA-256. Ele leva somente o pacote do perfil ativo e as fontes compartilhadas.

1. Pare a instalação e preserve uma cópia do diretório de dados atual.
2. Confira o `profile` e o `database` em `manifesto.json`.
3. Extraia o conteúdo de `data/` do ZIP para o diretório configurado para aquele perfil. No modo local de um perfil novo, por exemplo, é `data/meu-evento/`.
4. Restaure `profiles/` e `assets/` na raiz do projeto. Se o perfil estiver fora do repositório, restaure o pacote no caminho selecionado.
5. Inicie com o perfil correspondente e confira histórico, PDFs e configurações.

Backups antigos da Pagels (manifesto versão 1) continuam recuperáveis: restaure `data/` no local original; coloque `modelos.pdf` e `modelos.json` em `profiles/pagels-jiu-jitsu/assets/`, e a fonte/licença em `assets/fonts/`. Preserve o novo `profile.json`, altere `schema` para `certificates.shared-pdf-templates/1.0` e acrescente `"format": "{nome_aluno}"` ao campo `nome_aluno` do JSON antigo. Os metadados `visual` e `group` podem ser recuperados do JSON atual por `id` para manter o seletor de graus e os ícones. Essa restauração exige a mesma versão de arte compatível com o histórico; o código não modifica backups antigos automaticamente.

Uma restauração substitui o estado; não mescla históricos. No Docker, arquivos do perfil fazem parte da imagem: depois de restaurá-los no projeto, reconstrua a imagem antes de iniciar.
