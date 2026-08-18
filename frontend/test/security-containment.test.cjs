const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const appRoot = path.resolve(__dirname, '..', 'src', 'app');
const trustedMessagingPath = path.join(appRoot, 'lib', 'trusted-messaging.ts');
const runtimeContextPath = path.join(appRoot, 'lib', 'runtime-context.ts');
const rootShellPath = path.join(appRoot, 'components', 'root-shell.tsx');
const apiPath = path.join(appRoot, 'lib', 'api.ts');
const nextConfigPath = path.resolve(__dirname, '..', 'next.config.ts');
const dockerfilePath = path.resolve(__dirname, '..', 'Dockerfile');
const s3ControlPagePath = path.join(
  appRoot,
  'msinfor',
  'controle-s3',
  'page.tsx',
);

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

for (const filePath of listSourceFiles(appRoot)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source).endsWith('postMessage')) {
      const targetOrigin = node.arguments[1]?.getText(source);
      assert.notEqual(
        targetOrigin,
        "'*'",
        `postMessage com origem curinga em ${filePath}.`,
      );
      assert.notEqual(
        targetOrigin,
        '"*"',
        `postMessage com origem curinga em ${filePath}.`,
      );
    }

    if (
      filePath !== trustedMessagingPath &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      const eventParameter = node.parameters.find(
        (parameter) => parameter.type?.getText(source) === 'MessageEvent',
      );
      if (eventParameter) {
        const parameterName = eventParameter.name.getText(source);
        assert.equal(
          node.body
            .getText(source)
            .includes(`isTrustedMessageEvent(${parameterName}`),
          true,
          `Listener sem validação de origem em ${filePath}.`,
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
}

const runtimeContextSource = fs.readFileSync(runtimeContextPath, 'utf8');
for (const protectedQueryKey of [
  'sourceSystem',
  'sourceTenantId',
  'sourceBranchCode',
  'cashierUserId',
  'cashierDisplayName',
  'userRole',
  'permissions',
  'companyName',
  'logoUrl',
]) {
  assert.equal(
    runtimeContextSource.includes(`searchParams.get('${protectedQueryKey}')`),
    false,
    `O contexto autenticado não pode ler ${protectedQueryKey} da URL.`,
  );
}
assert.match(runtimeContextSource, /financeApiFetch\('\/context'/);

const rootShellSource = fs.readFileSync(rootShellPath, 'utf8');
assert.equal(
  rootShellSource.includes("headers.set('x-source-branch-code'"),
  false,
  'O navegador não pode injetar x-source-branch-code.',
);
assert.equal(
  rootShellSource.includes('window.fetch ='),
  false,
  'O shell não pode interceptar globalmente o fetch.',
);

const apiSource = fs.readFileSync(apiPath, 'utf8');
assert.match(apiSource, /NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL/);
assert.match(apiSource, /["']\/api\/financeiro["']/);
assert.equal(
  /localhost:3002|127\.0\.0\.1:3002/.test(apiSource),
  false,
  'O frontend não pode apontar diretamente para a API Financeiro.',
);
for (const csrfCookieName of [
  '__Host-msinfor_escola_csrf',
  'msinfor_escola_csrf',
  '__Host-msinfor_projeto_csrf',
  'msinfor_projeto_csrf',
  '__Host-msinfor_financeiro_csrf',
  'msinfor_financeiro_csrf',
]) {
  assert.equal(
    apiSource.includes(`"${csrfCookieName}"`),
    true,
    `Contrato CSRF ausente no helper: ${csrfCookieName}.`,
  );
}
assert.equal(
  /searchParams|document\.location|window\.location/.test(apiSource),
  false,
  'O contrato CSRF não pode ser escolhido por URL ou origem informada.',
);
assert.match(apiSource, /headers\.set\("x-msinfor-csrf", csrfToken\)/);
assert.match(apiSource, /mode:\s*"same-origin"/);
assert.match(apiSource, /credentials:\s*"include"/);

const s3ControlPageSource = fs.readFileSync(s3ControlPagePath, 'utf8');
const uploadMultipartSource =
  s3ControlPageSource.match(
    /const formData = new FormData\(\);([\s\S]*?)financeApiFetch\(["']\/s3-control\/upload["']/,
  )?.[1] || '';
assert.match(uploadMultipartSource, /formData\.append\(["']prefix["']/);
assert.match(uploadMultipartSource, /formData\.append\(["']file["'], file\)/);
for (const forbiddenUploadField of [
  'contextPayload',
  'sourceSystem',
  'sourceTenantId',
  'sourceBranchCode',
  'requestedBy',
  'userRole',
  'permissions',
]) {
  assert.equal(
    uploadMultipartSource.includes(forbiddenUploadField),
    false,
    `O multipart S3 ainda envia autoridade do navegador: ${forbiddenUploadField}.`,
  );
}

const companiesPageSource = fs.readFileSync(
  path.join(appRoot, 'empresas', 'page.tsx'),
  'utf8',
);
const msinforPageSource = fs.readFileSync(
  path.join(appRoot, 'msinfor', 'page.tsx'),
  'utf8',
);
assert.doesNotMatch(
  msinforPageSource,
  /window\.open\s*\(/,
  'O card EMPRESA não pode abrir pop-up.',
);
assert.match(
  companiesPageSource,
  /<iframe[\s\S]*src=\{centralUrl\}/,
  'A tela da Central deve abrir dentro da própria área financeira.',
);
assert.match(
  companiesPageSource,
  /isTrustedMessageEvent\(event,[\s\S]*source:/,
  'Mensagens da Central devem validar origem e janela exata do iframe.',
);
assert.match(
  companiesPageSource,
  /CENTRAL_SAVED_MESSAGE[\s\S]*refreshFinanceMirror\(editorScope\)/,
  'Salvar na Central deve atualizar imediatamente o espelho do Financeiro.',
);
assert.match(
  companiesPageSource,
  /central-configuration-refresh[\s\S]*setSyncError/,
  'Falhas ao atualizar o espelho financeiro devem ser exibidas ao usuário.',
);

for (const filePath of listSourceFiles(appRoot)) {
  if (filePath === apiPath) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  assert.equal(
    /fetch\s*\(\s*`\$\{API_BASE_URL\}/.test(content),
    false,
    `Chamada ao BFF fora do helper CSRF em ${filePath}.`,
  );
}

const nextConfigSource = fs.readFileSync(nextConfigPath, 'utf8');
assert.match(nextConfigSource, /\/financeiro-app/);
assert.match(nextConfigSource, /frame-ancestors 'self'/);
assert.match(nextConfigSource, /X-Frame-Options/);
assert.match(nextConfigSource, /SAMEORIGIN/);
assert.equal(
  /X-Frame-Options["']?\s*[:,]\s*["']DENY/.test(nextConfigSource),
  false,
  'O Financeiro deve aceitar somente iframe same-origin, não DENY.',
);
assert.match(nextConfigSource, /output:\s*"standalone"/);

const dockerfileSource = fs.readFileSync(dockerfilePath, 'utf8');
assert.match(dockerfileSource, /USER 10001:10001/);
assert.match(dockerfileSource, /ENTRYPOINT \["\/usr\/bin\/tini"/);
assert.doesNotMatch(dockerfileSource, /COPY\s+\.env/i);

function loadApiModule(cookie, configuredBaseUrl = '/api/financeiro') {
  const transpiled = ts.transpileModule(apiSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleRecord = { exports: {} };
  const calls = [];
  const evaluate = new Function(
    'exports',
    'module',
    'require',
    'process',
    'document',
    'fetch',
    'Headers',
    transpiled,
  );
  evaluate(
    moduleRecord.exports,
    moduleRecord,
    require,
    {
      env: {
        NEXT_PUBLIC_FINANCEIRO_ORIGIN_API_URL: configuredBaseUrl,
      },
    },
    { cookie },
    async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    },
    Headers,
  );
  return { api: moduleRecord.exports, calls };
}

async function testCsrfContract() {
  const escola = loadApiModule(
    'msinfor_escola_csrf=escola-dev-token-1234567890; __Host-msinfor_escola_csrf=escola-production-token-1234567890; __Host-msinfor_projeto_csrf=projeto-token-1234567890; __Host-msinfor_financeiro_csrf=legacy-token-1234567890',
  );
  escola.api.setFinanceSourceSystem('ESCOLA');
  await escola.api.financeApiFetch('/resource', { method: 'POST' });
  assert.equal(escola.calls.length, 1);
  assert.equal(escola.calls[0].url, '/api/financeiro/resource');
  assert.equal(
    escola.calls[0].init.headers.get('x-msinfor-csrf'),
    'escola-production-token-1234567890',
  );
  assert.equal(escola.calls[0].init.credentials, 'include');
  assert.equal(escola.calls[0].init.mode, 'same-origin');
  assert.equal(escola.calls[0].init.redirect, 'error');

  const projeto = loadApiModule(
    'msinfor_projeto_csrf=projeto-dev-token-1234567890; __Host-msinfor_projeto_csrf=projeto-production-token-1234567890; __Host-msinfor_financeiro_csrf=legacy-token-1234567890',
  );
  projeto.api.setFinanceSourceSystem('PROJETO_INICIAL');
  await projeto.api.financeApiFetch('/resource', { method: 'PATCH' });
  assert.equal(
    projeto.calls[0].init.headers.get('x-msinfor-csrf'),
    'projeto-production-token-1234567890',
  );

  const escolaDevelopment = loadApiModule(
    'msinfor_escola_csrf=escola-dev-token-1234567890',
  );
  escolaDevelopment.api.setFinanceSourceSystem('ESCOLA');
  await escolaDevelopment.api.financeApiFetch('/resource', {
    method: 'PUT',
  });
  assert.equal(
    escolaDevelopment.calls[0].init.headers.get('x-msinfor-csrf'),
    'escola-dev-token-1234567890',
  );

  const projetoDevelopment = loadApiModule(
    'msinfor_projeto_csrf=projeto-dev-token-1234567890',
  );
  projetoDevelopment.api.setFinanceSourceSystem('PROJETO_INICIAL');
  await projetoDevelopment.api.financeApiFetch('/resource', {
    method: 'DELETE',
  });
  assert.equal(
    projetoDevelopment.calls[0].init.headers.get('x-msinfor-csrf'),
    'projeto-dev-token-1234567890',
  );

  const legacy = loadApiModule(
    'msinfor_financeiro_csrf=legacy-dev-token-1234567890; __Host-msinfor_financeiro_csrf=legacy-production-token-1234567890',
  );
  legacy.api.setFinanceSourceSystem(null);
  await legacy.api.financeApiFetch('/resource', { method: 'PATCH' });
  assert.equal(
    legacy.calls[0].init.headers.get('x-msinfor-csrf'),
    'legacy-production-token-1234567890',
  );

  const readOnly = loadApiModule(
    '__Host-msinfor_escola_csrf=escola-production-token-1234567890',
  );
  await readOnly.api.financeApiFetch('/resource', { method: 'GET' });
  assert.equal(
    readOnly.calls[0].init.headers.has('x-msinfor-csrf'),
    false,
  );

  const missing = loadApiModule('');
  await assert.rejects(
    () => missing.api.financeApiFetch('/resource', { method: 'DELETE' }),
    /sessão segura/i,
  );
  assert.equal(missing.calls.length, 0);

  assert.throws(
    () => loadApiModule('', 'https://financeiro.example/api'),
    /same-origin/,
  );
}

testCsrfContract()
  .then(() => {
    process.stdout.write(
      'Testes de origem, contexto e CSRF do frontend concluídos.\n',
    );
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
