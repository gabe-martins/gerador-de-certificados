# Pagels Certificados para Windows

Esta edição reaproveita a aplicação da branch `pagels-jiu-jitsu`, a marca, as
fontes e os 23 modelos originais. A base desta implementação é o commit
`403887bb34273fd6e9848f51272554f788f3d912`, em uma branch própria:
`codex/pagels-windows-portable`.

## Entrega portátil

O build gera `outputs/windows/Pagels-Certificados-1.0.1-windows-x64-portable.zip`.
A branch guarda o código e a documentação. O ZIP é um arquivo gerado localmente
e fica fora do Git. Para as telas e os passos de emissão, consulte o
[manual de uso ilustrado](Manual-de-Uso-Pagels-Certificados.pdf), que também se
aplica à versão 1.0.1.

Extraia a pasta inteira e abra **Pagels Certificados.exe** no Windows 10/11 x64.
Não há instalador, pedido de administrador ou download de dependências na
primeira execução. Python, Chromium, fontes, fuso horário e bibliotecas já estão
no pacote. O aplicativo funciona sem internet.

É um aplicativo portátil distribuído em uma pasta. O EXE precisa dos arquivos
que o acompanham; copiar apenas o EXE não funciona. Esse formato evita extrair
centenas de megabytes em uma pasta temporária a cada abertura e deixa os dados
visíveis para cópia. Não existe instalador ou versão de arquivo único nesta
entrega.

O pacote inclui `LEIA-ME.txt`, `BUILD.json`, licenças dos componentes e
`SHA256SUMS.json`. O hash do ZIP fica no arquivo `.zip.sha256` ao lado dele.
O executável recebe o ícone e a identificação Pagels e não possui assinatura
digital comercial. Restrições de execução da organização e SmartScreen podem
exigir avaliação do arquivo; nenhum certificado de assinatura foi fornecido.

A versão 1.0.1 corrige os filetes pretos entre a ponteira vermelha e suas bordas
brancas nos oito modelos de faixa preta. Os graus, bordas e demais modelos são
preservados. A correção vale para novas prévias e emissões; PDFs já guardados no
histórico mantêm a arte usada quando foram emitidos.

## Recursos preservados

- Layout, cores e logotipo da versão web Pagels.
- 23 modelos, prévia PDF e emissão individual.
- Emissão em lote de até 500 alunos e importação CSV/XLSX.
- Validações, confirmação de duplicados e repetição segura de requisições.
- Histórico, busca, filtros e reutilização dos dados de emissão.
- Downloads de PDFs, lote completo, ZIP individual e backup completo.
- Visualizador PDF próprio para impressão e preferências de local.

A interface informa **Aplicativo local**, **Uso offline** e **Aplicativo
portátil**. O conteúdo sobre compartilhamento pela rede é substituído apenas
quando a interface está dentro do aplicativo; o modo web mantém seu fluxo.

## Dados e operação

```text
Pagels Certificados/
  Pagels Certificados.exe
  resources/               componentes e modelos do aplicativo
  data/
    pagels.sqlite3         histórico e preferências
    pdfs/                  PDFs originais emitidos
    runtime/               cache e configuração da janela
    logs/backend.log       diagnóstico da última execução
  exports/                 destino sugerido para downloads
  LEIA-ME.txt
```

Os diretórios são relativos ao executável, mesmo quando ele é aberto por atalho
ou a partir de outro diretório. Se a pasta não permitir gravação, uma mensagem
orienta a extração para um local gravável. Não há cópia automática dos dados do
servidor web. Nenhum dado real ou backup local é incluído na distribuição.

Para transportar, feche o aplicativo e copie a pasta inteira. Faça backups em
outro dispositivo. Para atualizar, faça backup, feche a aplicação, extraia a
nova edição em outra pasta e copie `data/`; confira o histórico antes de remover
a edição antiga. As instruções de restauração estão em `desktop/LEIA-ME.txt`.

O menu **Arquivo** também permite criar backup e abrir as pastas de dados e
arquivos exportados. O botão **Imprimir** abre o PDF original no visualizador
embarcado; a impressão física depende do driver e das configurações da
impressora. O pacote não inclui drivers de impressão.

## Implementação

Electron fornece a janela e o Chromium embarcado. O processo principal inicia
o Python embarcado e aguarda o servidor FastAPI ficar pronto. A porta é escolhida
pelo sistema operacional, restrita a `127.0.0.1`, sem conflito com a porta 8090
do servidor web. A configuração de dados e perfil é explícita e não herda as
variáveis de implantação `PAGELS_*` ou `CERTIFICATES_*`.

Cada execução usa uma credencial aleatória, entregue ao Python por stdin e
acrescentada apenas às requisições para sua origem local. Acesso à API sem essa
credencial é recusado. O renderer usa sandbox, isolamento de contexto e não tem
Node. Permissões adicionais, navegação externa e requisições de rede externa
são bloqueadas. Somente os recursos internos do visualizador PDF são liberados
além da origem local, blobs da aplicação e URLs de dados.

Uma trava por pasta impede duas instâncias concorrentes. Ao fechar, stdin pede
o encerramento do backend; EOF também encerra o processo se a janela principal
falhar. O launcher desktop não importa o `fcntl` do launcher Unix existente.

O backup fecha explicitamente as duas conexões SQLite temporárias antes de
remover o snapshot. Esse fechamento é necessário no Windows, que impede a
remoção de arquivos ainda abertos.

## Compilar novamente

Em um checkout que contenha o perfil Pagels, instale Python 3.11+ e Node 22.12+
para desenvolvimento. As dependências de execução para o usuário já serão
incluídas no ZIP. Use o ambiente virtual do projeto:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix frontend run build
npm --prefix desktop run build:windows
```

No Windows, use `py -m venv .venv` e `.venv\Scripts\python.exe` nas duas primeiras
etapas. O comando de build Node seleciona esse interpretador automaticamente;
`PAGELS_BUILD_PYTHON` permite escolher outro ambiente.

O build pode rodar no Linux: utiliza os binários oficiais para Windows de
Electron 45.2.1 e Python 3.13.17, verifica hashes fixados, instala somente wheels
Windows/Python 3.13 e valida dependências condicionais para o sistema de destino.
Aplica ícone e metadados PE em JavaScript. Não precisa de Wine para compilar.
O pacote é montado por uma lista explícita de arquivos, sem incluir `.env`,
banco, PDFs emitidos, `.git` ou dependências de desenvolvimento.

Para testar a janela em desenvolvimento:

```bash
npm --prefix desktop start
```

Esse modo usa `outputs/desktop-dev/data`, isolado dos dados da instalação web.
`PAGELS_DESKTOP_HOME` e `PAGELS_DESKTOP_PYTHON` são opções apenas desse modo de
desenvolvimento; o pacote final sempre usa a pasta do executável e seu Python.

## Verificação

```bash
.venv/bin/python -m pytest -q
npm --prefix desktop test
npm --prefix desktop run test:desktop
```

O teste da janela usa Playwright/Electron, uma pasta temporária e, no Linux,
precisa de um display disponível. O parâmetro `--no-sandbox` é usado somente
pelo processo de teste, não pelo aplicativo distribuído.

O teste do runtime Windows usa o `python.exe` do próprio pacote:

```powershell
& '.\outputs\windows\Pagels Certificados\resources\backend\python\python.exe' `
  '.\desktop\tests\windows-runtime.py' `
  '.\outputs\windows\Pagels Certificados' `
  '.\outputs\windows\validation\windows-runtime.json'
```

Ele verifica extensões Windows, fuso horário, servidor, prévia, todos os modelos,
isolamento dos nomes por página, ZIP, hashes do backup, preferências,
encerramento por EOF e reabertura dos dados. Pode ser executado pelo Wine no
Linux. Isso não substitui aceite em um Windows físico e na impressora final.

Antes de distribuir em um novo ambiente, confira no Windows de destino a abertura
por duplo clique, a emissão e a abertura do PDF, a impressão, a criação de backup
e a reabertura do histórico após fechar o aplicativo. Para uma atualização, teste
com uma cópia da pasta `data/` e confira a reabertura de um certificado anterior.
