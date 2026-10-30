# Pagels Certificados

Instância principal no servidor pessoal: **http://192.168.15.9:8090**. Operação e atualização com Docker: veja [DOCKER.md](DOCKER.md). Os passos de instalação local abaixo são uma alternativa para desenvolvimento ou recuperação; a instância antiga na porta 8080 foi encerrada após a migração.


Aplicação web para emitir certificados com os 23 modelos aprovados da academia. Interface em português, adaptada para computador e celular. Funciona na rede local, sem login e sem serviços externos. O computador servidor precisa permanecer ligado; os dispositivos da mesma rede compartilham o histórico.

## Começar com Docker

Requisitos: Git, Docker Engine e Docker Compose. O Docker compila a interface e instala o backend automaticamente.

```bash
git clone https://github.com/gabe-martins/pagels-certificados.git
cd pagels-certificados
bash implantar.sh
bash verificar_docker.sh
```

O repositório é privado e exige uma conta com acesso para clonar. Na primeira execução, `implantar.sh` configura o IP LAN `192.168.15.9` e a porta `8090` em `.env`. Para outro servidor, ajuste `PAGELS_BIND_IP` nesse arquivo antes de implantar. Veja [DOCKER.md](DOCKER.md) para operação e preservação dos dados.

## Instalação local

Requisitos: Linux, Python 3.11 ou superior com suporte a venv e Node 20.19+ ou 22.12+. A interface compilada não é versionada; compile-a antes de iniciar. A instalação inicial precisa de internet para baixar as dependências.

```bash
cd pagels-certificados
bash instalar.sh   # apenas na instalação ou atualização de dependências
(cd frontend && npm ci && npm run build)
bash iniciar.sh
```

Neste computador: **http://localhost:8090**. Nos celulares e outros computadores: `http://IP_DO_SERVIDOR:8090`, na mesma rede. Para encontrar o IP no Linux, use `hostname -I` e escolha o endereço da interface da academia. Redes de convidados podem impedir a comunicação entre dispositivos. Não é necessário abrir portas no roteador nem publicar na internet.

Para parar, pressione Ctrl+C no terminal ou execute `bash parar.sh` na pasta do projeto. Uma instância iniciada em segundo plano também pode ser parada por esse comando. O aplicativo não configura início automático com o computador. Para mudar o endereço, porta ou local dos dados:

```bash
PAGELS_HOST=0.0.0.0 PAGELS_PORT=8090 PAGELS_DATA_DIR=/caminho/para/dados bash iniciar.sh
```

O padrão `0.0.0.0` aceita conexões das interfaces do computador. Para acesso somente neste computador, use `PAGELS_HOST=127.0.0.1`. Quem alcançar a aplicação poderá emitir, consultar e baixar os certificados e backups, conforme o modo sem login aprovado. Não configure encaminhamento de portas para a internet.

## Uso

- **Emitir:** nome completo, cidade, UF, data da graduação e faixa. A data aparece no certificado por extenso, com dia de dois dígitos: **01 de dezembro de 2026**. Para preta, selecione de zero a sete graus. A prévia mostra o próprio PDF; emitir salva o documento e libera o download.
- **Lote:** configure os dados comuns e importe CSV/XLSX ou cole nomes, um por linha. Campos vazios herdam os dados comuns. Edite os registros, remova linhas, valide e emita. Baixe o PDF completo ou um ZIP com PDFs individuais. Limites: 500 alunos e arquivo de 5 MB. Importar uma nova planilha substitui a lista em edição; colar nomes adiciona à lista.
- **Histórico:** busca por nome, faixa e período da graduação. Baixe o PDF já emitido ou copie os dados para uma nova emissão. O original emitido fica preservado mesmo que os modelos mudem depois. O botão Imprimir abre o PDF no navegador; use papel A4 paisagem e escala 100% (tamanho real), conferindo as margens da impressora.
- **Modelos:** galeria dos 23 certificados originais, com visualização ampliada e atalho para emitir.
- **Configurações:** cidade/UF padrão e exportação de backup completo. Preferências são aplicadas aos novos formulários.

Os dados de lote ainda não emitido são temporários e se perdem ao recarregar ou fechar a página. Você pode navegar entre as telas durante a revisão. As emissões concluídas permanecem no servidor. Nomes, faixa e data repetidos geram uma confirmação; homônimos e reemissões são permitidos. Repetir a mesma requisição após falha de conexão retorna a emissão já realizada.

## Planilhas

Baixe o modelo dentro da tela Lote. Colunas: `nome_aluno`, `cidade`, `uf`, `data`, `modelo_id`. Aliases como `nome`, `aluno`, `faixa`, `estado` e `grau` também são aceitos. Use data `DD/MM/AAAA` ou `AAAA-MM-DD`; células de data do Excel também funcionam. Não use fórmulas: cole os valores. CSV aceita UTF-8, UTF-8 com BOM e Windows-1252; separadores vírgula, ponto e vírgula ou tabulação.

Identificadores de modelos: `cinza_e_branca`, `cinza`, `cinza_e_preta`, `amarela_e_branca`, `amarela`, `amarela_e_preta`, `laranja_e_branca`, `laranja`, `laranja_e_preta`, `verde_e_branca`, `verde`, `verde_e_preta`, `azul`, `roxa`, `marrom`, `preta`, `preta_1_grau` até `preta_7_grau`. Rótulos como “Faixa Roxa” e “Preta 3º Grau” também são aceitos. Para preta, a coluna opcional `grau` pode conter 0 a 7.

## Arquivos e backup

`assets/` contém o PDF compartilhado de 23 páginas, posições JSON e fonte Liberation Sans Bold com licença. A arte fixa continua no PDF. Apenas nome, local e data são sobrepostos. Nome usa 32 pt e pode reduzir até 24 pt; local/data usa 19 pt até 16 pt. Se não couber, o sistema pede revisão e impede cortes. O tamanho exato dos modelos originais é preservado (aproximadamente A4 paisagem).

`data/pagels.sqlite3` armazena histórico e configurações. `data/pdfs/` guarda um PDF imutável por emissão; lotes usam um arquivo de várias páginas. Os PDFs individuais são extraídos desse arquivo, sem regenerar o design. Não mova nem apague arquivos de `data/` com o sistema em uso.

O botão **Baixar backup completo** exporta um snapshot consistente do banco, PDFs, modelos, fonte e manifesto SHA-256. Para restaurar:

1. Pare a aplicação e guarde uma cópia da pasta `data/` atual.
2. Extraia `data/` e `assets/` do backup para a raiz do projeto, substituindo as pastas correspondentes.
3. Inicie e confira o histórico. A restauração substitui o estado atual; não mescla históricos.

O arquivo `backup_certificados_pagels_2026-10-29.zip` de originais continua preservado na raiz do projeto local e é separado do backup operacional. Dados de alunos, PDFs emitidos, backups, `.env`, logs e dependências instaladas não são enviados ao GitHub. Os modelos de execução em `assets/` são versionados.

## Desenvolvimento e validação

Backend: FastAPI + SQLite + ReportLab + pypdf. Frontend: React + TypeScript + Vite + PDF.js, servido pelo backend na mesma origem. Todos os recursos de execução são locais; nenhuma fonte ou biblioteca é carregada por CDN. Use um único processo servidor (`workers=1`).

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q -s
cd frontend
npm ci
npm run build
```

Para compilar a interface, use Node 20.19+ ou 22.12+. `requirements.lock` fixa o ambiente Python validado; `frontend/package-lock.json` fixa o frontend. Após recompilar, reinicie o servidor e recarregue o navegador. Em desenvolvimento, `npm run dev` usa Vite na porta 5173 com proxy de `/api` para 8090; a distribuição final usa apenas a porta 8090.

Os testes automatizados verificam os 23 modelos, acentos, ajuste de nomes, rejeição de transbordamento, lotes de 100 páginas e ZIP, isolamento dos dados de alunos que usam a mesma faixa, imports, duplicados, reenvio concorrente, persistência e integridade do backup. A validação responsiva no navegador não substitui o teste de Wi-Fi e impressão com os dispositivos físicos da academia.
