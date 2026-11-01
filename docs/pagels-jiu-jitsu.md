# Pagels Jiu-Jitsu

Primeiro perfil do Gerador de Certificados: `pagels-jiu-jitsu`. Inclui as 23 artes aprovadas da academia, com graduação de faixas e preta do zero ao sétimo grau. É o perfil padrão de instalações existentes.

## Uso

- **Emitir:** informe nome completo, cidade, UF, data da graduação e faixa. A data aparece por extenso, com dois dígitos no dia: `01 de dezembro de 2026`. A prévia usa o próprio PDF; emitir salva o documento.
- **Lote:** configure os dados comuns, importe CSV/XLSX ou cole nomes. Campos vazios herdam os dados comuns. Revise, valide e emita. Baixe o PDF completo ou um ZIP individual. Limites: 500 participantes e arquivo de 5 MB. Nova planilha substitui a lista em edição; colar nomes adiciona registros.
- **Histórico:** filtre por nome, modelo e período. Baixe o original ou reutilize os dados. O documento emitido permanece preservado mesmo se a arte mudar.
- **Modelos:** consulte os 23 modelos e selecione uma arte para emitir.
- **Configurações:** cidade/UF padrão e exportação de backup completo.

Para imprimir, abra o PDF no navegador e use A4 paisagem, escala 100%, conferindo as margens da impressora. A validação digital não substitui o teste na impressora da academia.

Lotes não emitidos são temporários e se perdem ao recarregar a página. Emissões concluídas permanecem no servidor. Nome, faixa e data repetidos geram confirmação; reemissões e homônimos são permitidos. Reenviar a mesma requisição após falha de conexão retorna a emissão existente.

## Planilhas

Colunas: `nome_aluno`, `cidade`, `uf`, `data`, `modelo_id`. São aceitos aliases como `nome`, `aluno`, `faixa`, `estado` e `grau`. Datas: `DD/MM/AAAA`, `AAAA-MM-DD` ou células de data do Excel. Não use fórmulas; cole os valores. CSV aceita UTF-8, UTF-8 com BOM e Windows-1252, com vírgula, ponto e vírgula ou tabulação.

Modelos: `cinza_e_branca`, `cinza`, `cinza_e_preta`, `amarela_e_branca`, `amarela`, `amarela_e_preta`, `laranja_e_branca`, `laranja`, `laranja_e_preta`, `verde_e_branca`, `verde`, `verde_e_preta`, `azul`, `roxa`, `marrom`, `preta`, `preta_1_grau` até `preta_7_grau`. Rótulos como “Faixa Roxa” e “Preta 3º Grau” também funcionam. Para preta, a coluna opcional `grau` aceita 0–7.

## Arquivos

- `profiles/pagels-jiu-jitsu/profile.json`: marca, rótulos e importação.
- `profiles/pagels-jiu-jitsu/assets/`: PDF de 23 páginas, posições/textos e logo.
- `assets/fonts/`: Liberation Sans Bold e licença.
- `data/pagels.sqlite3` e `data/pdfs/`: histórico existente, sem mudança de caminho.
- `profiles/pagels-jiu-jitsu/tools/expand_templates.py`: ferramenta histórica para ampliar artes a partir do conjunto anterior de 17 páginas; não é necessária na execução normal.

Nome usa 32 pt e pode reduzir até 24 pt; local/data usa 19 pt até 16 pt. Se o texto não couber, o sistema exige revisão. O tamanho original das artes é preservado, aproximadamente A4 paisagem. O ZIP de originais local permanece separado do backup operacional e não é versionado.

Operação e atualização: [Docker](docker.md). Criação de outros casos de uso e restauração: [perfis](profiles.md).
