# Docker

O Dockerfile compila o frontend e executa a API com Python 3.12, um processo e usuário sem privilégios. Os perfis e fontes são incluídos na imagem; o diretório de dados é persistido no host. Só a porta web é publicada.

## Instalar

Requisitos: Docker Engine e Compose. O build baixa dependências; a aplicação em execução usa arquivos locais.

```bash
bash implantar.sh
bash verificar_docker.sh
```

Na primeira execução, `implantar.sh` cria `.env` a partir de `.env.example`, ajusta UID/GID ao usuário atual e prepara o diretório de dados. O padrão publica em `127.0.0.1:8090`. Para acesso LAN, ajuste `CERTIFICATES_BIND_IP` para o IP do servidor antes de implantar.

| Variável | Uso |
| --- | --- |
| `CERTIFICATES_INSTANCE` | Nome do projeto Compose; padrão `gerador-certificados` |
| `CERTIFICATES_PROFILE` | Perfil dentro da imagem; padrão `participacao` |
| `CERTIFICATES_BIND_IP`, `CERTIFICATES_PORT` | Endereço e porta publicados |
| `CERTIFICATES_DATA_PATH` | Diretório persistente do host; padrão `./data/participacao` |
| `CERTIFICATES_UID`, `CERTIFICATES_GID` | Usuário do processo no contêiner |
| `CERTIFICATES_IMAGE_TAG` | Tag da imagem local; versão atual `1.2.0` |

## Atualizar a edição generalista

O script preserva o `.env` existente e o diretório de dados configurado. Use somente variáveis `CERTIFICATES_*`. A aplicação especializada da Pagels e a compatibilidade com sua implantação antiga ficam na branch `pagels-jiu-jitsu`. Crie um arquivo de ambiente próprio para cada aplicação.

Exporte um backup completo antes de atualizar. Atualize o código, reconstrua e verifique:

```bash
bash implantar.sh
bash verificar_docker.sh
```

A entrada do servidor agora é `server.asgi:app`, já configurada no Dockerfile e no iniciador local. Comandos personalizados que usavam `server.main:app` devem ser atualizados.

O verificador consulta o perfil e o catálogo, gera prévia e um lote em memória, confere o banco e os PDFs persistidos. Não cria alunos de teste no histórico. Confira também pelo navegador e pelo endereço LAN.

## Outra instalação

Crie o perfil antes de construir a imagem. Para uma segunda instalação, use um arquivo de ambiente próprio, outro nome Compose, outra porta e **outro diretório de dados**:

```dotenv
CERTIFICATES_INSTANCE=curso-fotografia
CERTIFICATES_PROFILE=curso-fotografia
CERTIFICATES_BIND_IP=127.0.0.1
CERTIFICATES_PORT=8091
CERTIFICATES_DATA_PATH=./data/curso-fotografia
CERTIFICATES_UID=10001
CERTIFICATES_GID=10001
CERTIFICATES_IMAGE_TAG=1.2.0
```

Com o diretório criado e gravável pelo UID/GID escolhido:

```bash
docker compose --env-file .env.curso up -d --build --wait
```

O script `implantar.sh` opera com `.env`; para arquivos alternativos, use os comandos Compose diretamente. Cada instalação deve ter um diretório e uma porta próprios. O backend recusa abrir dados vinculados a outro perfil.

## Operação e recuperação

```bash
docker compose ps
docker compose logs --tail=100 certificados
docker compose restart certificados
docker compose stop certificados
```

A política `unless-stopped` reinicia a aplicação quando o daemon reiniciar. O healthcheck usa `/api/health`. Logs têm rotação. Recriar o contêiner preserva o diretório de dados; não remova essa pasta ao atualizar.

Veja [restauração de backups](profiles.md#backup-e-restauração). Faça a restauração com o serviço parado e mantenha uma cópia do estado anterior. Se for necessário voltar ao código antigo, use também os assets compatíveis e a configuração correspondente; o banco mantém o esquema anterior com uma tabela adicional de identificação do perfil.
