# Deploy no servidor pessoal

Destino: `192.168.15.9`. Novo endereço da aplicação: `http://192.168.15.9:8090`.

O Dockerfile compila a interface com a imagem oficial Node 22 e executa o backend em Python 3.12 oficial. O contêiner usa um processo servidor, um diretório persistente `data/` e a porta interna 8090. Apenas a porta TCP configurada é publicada no IP LAN do servidor. O modo de rede é o padrão do Compose; não usa `network_mode: host` nem monta o socket Docker.

## Instalar no servidor

Requisitos: acesso SSH e Docker Engine com o plugin Compose. O usuário que executar o script precisa ter acesso autorizado ao Docker. Os scripts não instalam Docker, não alteram grupos de usuários e não modificam os demais serviços.

Copie o projeto para uma pasta dedicada, por exemplo `~/apps/pagels-certificados`. Não envie `.venv`, `node_modules`, credenciais SSH, logs, nem o ZIP original dos certificados.

Na pasta do projeto no servidor:

```bash
bash implantar.sh
bash verificar_docker.sh
```

`implantar.sh` cria `.env` na primeira execução com o UID/GID do usuário atual, o IP `192.168.15.9` e a porta 8090. Também cria `data/` com esse usuário. Assim o processo do contêiner consegue gravar os dados sem precisar executar como root. Em instalações posteriores, o script preserva `.env` e `data/`.

O build precisa de acesso aos registros oficiais Docker Hub, npm e PyPI. A aplicação em execução usa apenas arquivos e bibliotecas locais, sem dependências de serviços externos.

## Operação

```bash
docker compose ps
docker compose logs --tail=100 certificados
docker compose restart certificados
docker compose stop certificados
docker compose up -d --wait certificados
```

A política `unless-stopped` permite reinício quando o daemon Docker reiniciar. O healthcheck consulta `/api/health`. Para alterar a porta publicada, ajuste `PAGELS_PORT` em `.env` e execute `docker compose up -d --wait`. A porta interna continua 8090.

## Preservação de dados e migração

Os dados ficam no diretório `data/` do servidor, montado em `/data`. Recriar o contêiner ou trocar a imagem preserva o banco e os PDFs. Não remova essa pasta para atualizar a aplicação.

Antes da migração final, pare a instância antiga para impedir novas emissões durante a cópia. Faça um snapshot consistente do SQLite e copie todos os PDFs. Mantenha uma cópia de segurança antes de restaurar qualquer conteúdo no servidor. Só libere o novo endereço após comparar a quantidade de emissões, os hashes dos PDFs e as configurações.

Uma checagem de prévia não cria emissão no histórico. `verificar_docker.sh` valida o PDF com acentos, os 23 modelos, a integridade do banco e a presença dos arquivos já emitidos. O deploy também deve ser conferido pelo endereço LAN e pelo navegador.

O backup original `backup_certificados_pagels_2026-10-29.zip` permanece no projeto local. O botão de backup operacional da aplicação continua disponível e inclui histórico, configurações, PDFs e modelos.

## Voltar à instância local

Se ainda não houve emissão no servidor novo, pare o contêiner e inicie a instância local com `PAGELS_PORT=8090 bash iniciar.sh`. Se já houve novas emissões no servidor, exporte e restaure o backup completo antes de voltar, para não perder esses registros. Um backup substitui o estado anterior; não mescla dois históricos.
