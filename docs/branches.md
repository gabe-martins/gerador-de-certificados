# Organização das branches

O repositório é `gabe-martins/gerador-de-certificados`.

| Branch | Conteúdo | Uso |
| --- | --- | --- |
| `main` | Núcleo generalista com perfil neutro de participação | Versão estável |
| `dev` | Núcleo generalista e desenvolvimento compartilhado | Novas funcionalidades e correções |
| `pagels-jiu-jitsu` | Aplicação especializada da Pagels, perfil e artes de graduação | Instalação da academia |

## Desenvolvimento e publicação

1. Comece a mudança em `dev` ou em uma branch de trabalho criada a partir dela.
2. Execute os testes Python e o build do frontend, usando dados descartáveis.
3. Integre a mudança em `dev` e promova a versão validada para `main` por pull request ou fast-forward.
4. Após uma atualização feita diretamente em `main`, integre `main` em `dev` para manter a base atualizada. Não substitua commits de desenvolvimento com force push.
5. Leve correções compartilhadas de `main`/`dev` para `pagels-jiu-jitsu` por merge revisado ou cherry-pick. Preserve o perfil padrão, as artes e as configurações de implantação da academia.

`main` e `dev` não devem receber o pacote `profiles/pagels-jiu-jitsu/`. O perfil padrão é definido em `profiles/default.json`, separado do motor compartilhado. O banco histórico da aplicação especializada é definido no `database_name` do perfil; isso evita nomes de organização no núcleo.

## Clonar a aplicação correta

```bash
git clone --branch dev https://github.com/gabe-martins/gerador-de-certificados.git gerador-de-certificados
```

Para a academia:

```bash
git clone --branch pagels-jiu-jitsu https://github.com/gabe-martins/gerador-de-certificados.git certificados-pagels
```

Trocar de branch não isola os dados locais. Cada aplicação deve usar seu próprio diretório de dados, porta e nome de projeto Compose. Não inicie o gerador generalista sobre o diretório da instalação da academia. Não remova bancos ou PDFs ao atualizar o código.
