# Deploy seguro do Financeiro com PostgreSQL e Docker

O desenvolvimento local continua usando SQLite. Produção usa o schema
PostgreSQL paralelo em `backend/prisma/postgresql/schema.prisma`, gerado a
partir do modelo canônico. O runtime e o migrador são imagens e identidades
separadas.

## Fronteira de credenciais

| Processo | Papel PostgreSQL | Permissões |
| --- | --- | --- |
| `financeiro-migrator` | `financeiro_owner` | ownership do banco/schema e DDL |
| `financeiro-backend` | `financeiro_runtime` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` e uso de sequences |
| `financeiro-frontend` | nenhum | não acessa PostgreSQL |

O backend recusa a inicialização quando recebe
`MIGRATION_DATABASE_URL(_FILE)`, quando a URL não usa
`financeiro_runtime`, ou quando o papel conectado possui ownership, DDL,
superuser, criação de roles/bancos, replication, `BYPASSRLS` ou herda um papel
privilegiado.

## 1. Bootstrap único do cluster

Execute `backend/prisma/postgresql/bootstrap-roles.sql` como administrador do
cluster antes da primeira migration. Passe as senhas pelo ambiente do `psql`,
nunca como argumentos da linha de comando:

```powershell
$env:FINANCEIRO_DB_OWNER_PASSWORD = "<segredo-owner>"
$env:FINANCEIRO_DB_RUNTIME_PASSWORD = "<segredo-runtime>"
psql --host "<host-administrativo>" --username "<admin>" --database postgres --file backend/prisma/postgresql/bootstrap-roles.sql
Remove-Item Env:FINANCEIRO_DB_OWNER_PASSWORD
Remove-Item Env:FINANCEIRO_DB_RUNTIME_PASSWORD
```

O script cria o banco `financeiro`, revoga privilégios de `PUBLIC`, fixa o
`search_path` e configura privilégios padrão para tabelas futuras. Use TLS e
um canal administrativo restrito.

## 2. Schema e migrations

```powershell
cd backend
npm run postgresql:schema:check
```

A baseline `20260724000000_postgresql_baseline` representa o estado inicial do
PostgreSQL. Ela é imutável depois de aplicada. Mudanças futuras seguem este
fluxo:

1. alterar `prisma/schema.prisma`;
2. executar `npm run postgresql:schema:sync`;
3. criar uma nova migration em `prisma/postgresql/migrations`;
4. revisar o SQL e testar restauração/rollback operacional;
5. executar o migrador one-shot antes de atualizar o backend.

Nunca use `prisma db push` em produção. O migrador executa apenas
`prisma migrate deploy`.

## 3. Imagens

Os contextos são os diretórios de cada serviço:

```powershell
docker build --file backend/Dockerfile --tag msinfor/financeiro-backend:<versao> backend
docker build --file backend/Dockerfile.migrator --tag msinfor/financeiro-migrator:<versao> backend
docker build --file frontend/Dockerfile --tag msinfor/financeiro-frontend:<versao> frontend
```

As imagens finais executam com UID fixo não-root. O backend usa armazenamento
fiscal `database`, portanto não grava XML/PDF na raiz do contêiner. O frontend
usa o output `standalone` do Next.js.

`NEXT_PUBLIC_*` é incorporado no build do frontend. Quando necessário, passe
somente valores públicos:

```powershell
docker build --file frontend/Dockerfile `
  --build-arg NEXT_PUBLIC_FINANCEIRO_BASE_PATH=/financeiro-app `
  --build-arg NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL=/api/financeiro `
  --tag msinfor/financeiro-frontend:<versao> frontend
```

## 4. Execução

Execute primeiro o migrador, com uma rede que alcance apenas o PostgreSQL:

```text
financeiro-migrator
  read_only: true
  tmpfs: /tmp
  restart: "no"
  secret: MIGRATION_DATABASE_URL_FILE
```

Depois inicie o backend:

```text
financeiro-backend
  user: 10001:10001
  read_only: true
  tmpfs: /tmp (nosuid,nodev,noexec)
  cap_drop: ALL
  no-new-privileges: true
  secret: DATABASE_URL_FILE
  rede: somente proxy interno + PostgreSQL + destinos externos necessários
  sem porta publicada no host público
```

E o frontend:

```text
financeiro-frontend
  user: 10001:10001
  read_only: true
  tmpfs: /tmp (nosuid,nodev,noexec)
  cap_drop: ALL
  no-new-privileges: true
  acesso somente pelo proxy same-origin de Escola/Projeto
```

Use os modelos `backend/.env.runtime.postgresql.example` e
`backend/.env.migrator.postgresql.example`. Prefira secrets montados em
`/run/secrets` e as variáveis `*_FILE`; não inclua `.env`, certificados,
senhas ou chaves HMAC nas imagens.

Em produção, `DATABASE_URL` exige `sslmode=require` e `connection_limit`
explícito. Dimensione o limite por réplica de forma que a soma dos pools fique
abaixo do limite do PostgreSQL, preservando conexões para migrations,
monitoramento e manutenção.

## Limitações operacionais conhecidas

As rotinas bancárias Sicoob existentes chamam scripts PowerShell. A imagem
Linux não instala PowerShell para evitar ampliar a superfície de ataque. Antes
de habilitar DDA, extrato, boleto ou PIX Sicoob nesse contêiner, essas rotinas
devem ser substituídas por clientes Node.js nativos com mTLS e timeout, ou
executadas em um worker interno dedicado e isolado.

Antes de criar duas réplicas da API, mova o cache de nonce HMAC para Redis (ou
outro armazenamento atômico compartilhado). Sem isso, mantenha uma réplica.
