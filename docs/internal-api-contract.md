# Contrato da API interna do Financeiro

O backend Financeiro não é uma API para navegadores. Somente os backends
`ESCOLA` e `PROJETO_INICIAL` podem chamá-lo. Cada sistema possui uma credencial
HMAC diferente, armazenada exclusivamente no servidor.

O único endpoint público é:

```text
GET /api/v1/health
```

## Cabeçalhos obrigatórios

```text
x-msinfor-signature-version: v1
x-msinfor-system-id: ESCOLA | PROJETO_INICIAL
x-msinfor-tenant-id: identificador do tenant
x-msinfor-branch-code: código numérico da filial
x-msinfor-user-id: usuário autenticado no sistema de origem
x-msinfor-scopes: escopos autorizados pelo backend, separados por vírgula
x-msinfor-timestamp: Unix epoch em milissegundos
x-msinfor-nonce: 24 bytes aleatórios em base64url
x-msinfor-content-sha256: SHA-256 hexadecimal do corpo exato
x-msinfor-signature: HMAC-SHA-256 hexadecimal
```

Nenhuma credencial, assinatura ou segredo pode ser enviado na URL.

## Texto canônico assinado

Os campos são unidos por `\n`, nesta ordem:

```text
v1
SYSTEM_ID
MÉTODO_HTTP
/caminho?query=canônica
TIMESTAMP
NONCE
SHA256_DO_CORPO_EXATO
TENANT_ID
BRANCH_CODE
USER_ID
ESCOPOS_ORDENADOS
```

A query canônica ordena pares percent-encoded por chave e valor usando
comparação ordinal de bytes ASCII (não `localeCompare`), preserva valores
repetidos e usa percent-encoding RFC 3986. O corpo deve ser serializado uma
única vez; os mesmos bytes usados no hash devem ser enviados.

O servidor aceita uma janela máxima curta, usa comparação timing-safe e
consome cada nonce uma única vez. Um nonce inválido não é inserido no cache.

## Contexto e isolamento

Após validar a assinatura, o Financeiro resolve obrigatoriamente:

```text
systemId + tenantId -> companies.id ativo
companies.id + branchCode -> company_branches.id ativo
```

O request recebe propriedades imutáveis:

```text
request.sourceSystem
request.sourceTenantId
request.sourceBranchCode
request.sourceUserId
request.companyId
request.branchId
```

Campos equivalentes no body, query, parâmetros ou cabeçalhos devem coincidir
com o contexto assinado. `companyId` e `branchId` arbitrários são recusados.
`userRole` e `permissions` enviados pelo cliente são recusados. Operações
administrativas usam apenas escopos assinados pelo backend de origem, como
`FINANCE_ADMIN` e `MANAGE_FINANCIAL`.

Escopos internos definidos:

```text
SOURCE_SETTINGS_SYNC      sincroniza configurações após o provisionamento
FINANCE_ACCESS            acesso operacional comum ao Financeiro
FINANCE_ADMIN             operações administrativas do Financeiro
MANAGE_FINANCIAL          operações financeiras e fiscais autorizadas
SOURCE_PARAMETERS_WRITE   callback do Financeiro para o sistema de origem
```

Leituras operacionais exigem ao menos `FINANCE_ACCESS`, `MANAGE_FINANCIAL` ou
`FINANCE_ADMIN`. Métodos que podem alterar estado exigem `MANAGE_FINANCIAL` ou
`FINANCE_ADMIN`; `FINANCE_ACCESS` sozinho é somente leitura. O endpoint de
sincronização exige `SOURCE_SETTINGS_SYNC` e não aceita esse escopo como
autorização para as demais rotas. Operações sensíveis continuam exigindo seus
escopos mais fortes no próprio serviço.

## Provisionamento inicial do vínculo

Um tenant desconhecido nunca pode criar o próprio vínculo por uma chamada
HTTP. Antes da primeira integração, um operador do plano de controle executa,
no host do Financeiro e com acesso administrativo ao banco:

```powershell
npm run tenant:provision -- --system=PROJETO_INICIAL --tenant=TENANT-001 --branch=1 --company-name="Empresa Exemplo" --branch-name="Matriz" --company-document=12345678000190
```

O comando aceita somente `ESCOLA` ou `PROJETO_INICIAL`, não recebe
`companyId`, não altera silenciosamente um vínculo existente e não reativa
registros cancelados. Ele cria a relação explícita:

```text
sourceSystem + sourceTenantId -> companyId
companyId + branchCode -> branchId
```

Depois desse provisionamento, o backend de origem já pode chamar, com HMAC e o
escopo `SOURCE_SETTINGS_SYNC`,
`POST /api/v1/companies/sync-source-integration-settings`. Esse endpoint apenas
atualiza a empresa e a filial já vinculadas; não executa `upsert`, não cria
tenant ou filial e não modifica outras filiais.

O middleware Prisma acrescenta `companyId`, filial atual e, somente para
leitura, o escopo compartilhado de filial `0`. Modelos filhos são filtrados
pela relação com o registro pai.

## Fluxo do navegador

```text
Navegador -> backend ESCOLA/PROJETO_INICIAL
          -> requisição HMAC interna
          -> backend Financeiro
```

O navegador nunca recebe a credencial HMAC e nunca chama o backend Financeiro.
Em produção, a API Financeiro não emite cabeçalhos CORS para origens web.

O frontend usa `NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL`, normalmente uma rota
relativa como `/api/financeiro`, implementada pelo backend do sistema de
origem.

Em produção, o frontend é publicado pela mesma origem da Escola ou do Projeto
em `NEXT_PUBLIC_FINANCEIRO_BASE_PATH=/financeiro-app`. Portanto, não existe
DNS nem porta pública próprios do Financeiro:

```text
https://escola.msinfor.com.br/financeiro-app/...
https://projeto.msinfor.com.br/financeiro-app/...
```

O sistema de origem pode incorporá-lo em iframe same-origin. As respostas do
frontend usam `Content-Security-Policy: frame-ancestors 'self'` e
`X-Frame-Options: SAMEORIGIN`; framing por outra origem é recusado. A API
Financeiro continua acessível somente na rede interna.

O BFF deve responder `GET /api/financeiro/context` a partir da sessão
autenticada em cookie `HttpOnly`, `Secure` e `SameSite` apropriado. Tenant,
filial, usuário, papel e permissões não são lidos da URL. A URL pode conservar
somente estado de apresentação, como `embedded` e tema. O BFF também deve
remover qualquer campo de contexto enviado pelo navegador e reconstruí-lo a
partir da sessão antes de assinar uma chamada ao Financeiro.

Em métodos que alteram estado, o BFF deve validar `Origin`/Fetch Metadata e um
token CSRF vinculado à sessão antes de assinar a requisição. Autorização é
avaliada no backend de origem; esconder botões no frontend não substitui essa
validação.

O frontend lê o token CSRF não-`HttpOnly` nesta prioridade:

```text
1. __Host-msinfor_financeiro_csrf
2. msinfor_financeiro_csrf
```

O segundo nome é fallback para desenvolvimento local. Apenas
`POST`, `PUT`, `PATCH` e `DELETE` enviam
`x-msinfor-csrf: <token>`. Se o cookie não existir ou não tiver um valor
header-safe de 20 a 512 caracteres, a chamada falha antes do `fetch`. O helper
força `same-origin`, `credentials: include`, `cache: no-store` e não segue
redirecionamentos.

Em produção, o primeiro cookie deve usar `Secure`, `Path=/`, `SameSite`
apropriado, nenhum atributo `Domain` e pelo menos 128 bits aleatórios. Ele não
é a credencial de autenticação: o cookie de sessão permanece separado e
`HttpOnly`. O BFF deve vincular o token CSRF à sessão, compará-lo de modo
seguro e validar `Origin`/Fetch Metadata antes de fazer qualquer chamada HMAC.

Downloads fiscais protegidos preservam somente estes cabeçalhos de resposta:

```text
Content-Type: application/pdf | application/xml; charset=utf-8
Content-Disposition: attachment; filename="..."
Content-Length: ...
Cache-Control: private, no-store, max-age=0
```

As rotas binárias são:

```text
GET /api/v1/fiscal-documents/nfe/documents/:documentId/danfe
GET /api/v1/fiscal-documents/nfe/documents/:documentId/xml
GET /api/v1/fiscal-documents/nfse/documents/:documentId/danfse
GET /api/v1/fiscal-documents/nfse/documents/:documentId/xml
```

O multipart de `POST /api/v1/s3-control/upload` possui uma allowlist fechada:

```text
prefix  campo textual opcional
file    exatamente um arquivo
```

Qualquer outro campo — inclusive `contextPayload`, tenant, empresa, filial,
usuário, papel, permissões, escopos ou ator de auditoria — é recusado. Empresa,
filial e usuário da auditoria são derivados exclusivamente do contexto HMAC
validado; o navegador não os declara.

## Cliente TypeScript

O módulo reutilizável está em:

```text
packages/financeiro-internal-client
```

Ele recebe a credencial por configuração do backend. Nenhum valor de chave
está incluído no código. `FormData` de navegador não deve ser repassado:
multipart deve ser codificado pelo backend e enviado como bytes exatos com o
mesmo `Content-Type` usado na assinatura.

Exemplo de configuração:

```ts
const financeiro = createFinanceiroInternalClient({
  baseUrl: "http://financeiro:3002/api/v1",
  systemId: "PROJETO_INICIAL",
  secret: process.env.FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET!,
});

await financeiro.request({
  method: "GET",
  path: "/companies",
  context: {
    tenantId: session.tenantId,
    branchCode: session.branchCode,
    userId: session.userId,
    scopes: session.financeiroScopes,
  },
});
```

`baseUrl` representa a raiz da API e `path` começa com `/`. O cliente recusa
escape da raiz configurada, não segue redirecionamentos e aplica timeout.
Downloads fiscais usam `requestBytes`, que aceita somente
`application/pdf`/`application/xml` e limita o corpo a 10 MiB por padrão
(máximo configurável de 50 MiB).

Antes de múltiplas réplicas do Financeiro, o cache de nonce em memória deve ser
substituído por armazenamento atômico compartilhado, como Redis. Até essa
troca, mantenha uma única instância da API para não permitir replay entre
réplicas.

## Callback do Financeiro para o sistema de origem

Alterações de parâmetros que retornam à Escola ou ao Projeto usam o mesmo
protocolo canônico v1, mas com:

```text
x-msinfor-system-id: FINANCEIRO
x-msinfor-scopes: SOURCE_PARAMETERS_WRITE
```

O tenant, a filial e o usuário vêm exclusivamente do contexto HMAC autenticado
que entrou no Financeiro. O corpo é reconstruído com esse contexto antes da
assinatura. Cada destino usa uma chave direcional própria:

```text
SOURCE_SYSTEM_ESCOLA_HMAC_SECRET
SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET
```

Essas chaves não podem ser iguais entre si nem às chaves usadas na direção
Escola/Projeto -> Financeiro. O cliente bloqueia redirecionamentos HTTP para
impedir que uma assinatura seja encaminhada a outro host.

## Chamadas técnicas à MSINFOR Central

O Financeiro ainda não possui call site HTTP para a Central. Quando uma
integração for adicionada, ela deve seguir o contrato HMAC v1 da Central e
nunca enviar o antigo cabeçalho bearer `x-msinfor-system-key`.

O texto canônico da Central é diferente do contrato de entrada do Financeiro:

```text
v1
FINANCEIRO
MÉTODO_HTTP
/api/v1/caminho?query=canônica
TIMESTAMP
NONCE
SHA256_DO_CORPO_EXATO
```

Cada tentativa gera nonce/timestamp novos, usa o corpo serializado uma única
vez e define redirect manual/erro. A chave fica exclusivamente no backend,
preferencialmente montada por secret file. Testes de contenção impedem que o
cabeçalho bearer legado seja reintroduzido no código-fonte.
