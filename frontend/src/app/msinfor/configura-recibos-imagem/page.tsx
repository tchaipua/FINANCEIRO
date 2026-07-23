'use client';

import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import { printingScope } from '@/app/lib/local-print-agent';
import { useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type PrintTemplate = {
  id: string;
  code: string;
  name: string;
  documentType: string;
  mediaType: string;
  status: string;
  currentVersion: number;
};

type PortablePackage = {
  format: string;
  schemaVersion: number;
  packageId: string;
  exportedAt: string;
  report: {
    code: string;
    name: string;
    description?: string | null;
    documentType: string;
    mediaType: string;
    variables?: string[];
  };
  integrity: {
    algorithm: string;
    contentHash: string;
  };
};

type PackageValidation = {
  valid: boolean;
  package: PortablePackage;
  preview: {
    format: string;
    mediaType: string;
    serializedContent: string;
  };
  warnings: string[];
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR_CONFIGURA_RECIBOS_IMAGEM';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/configura-recibos-imagem/page.tsx';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const buttonClass =
  'rounded-xl bg-[#1d4f91] px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#153a6a] disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50';

function safeFileName(value: string) {
  return String(value || 'MODELO')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_');
}

export default function ReceiptByImagePage() {
  const runtime = useFinanceRuntimeContext();
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [referenceImageName, setReferenceImageName] = useState('');
  const [packageText, setPackageText] = useState('');
  const [packageFileName, setPackageFileName] = useState('');
  const [validation, setValidation] = useState<PackageValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const scope = useMemo(() => printingScope(runtime), [runtime]);

  const loadTemplates = useCallback(async () => {
    if (
      runtime.userRole !== 'ADMIN' ||
      !runtime.sourceSystem ||
      !runtime.sourceTenantId
    ) {
      setLoading(false);
      return;
    }
    try {
      const query = new URLSearchParams(
        Object.entries(scope).reduce<Record<string, string>>((result, [key, value]) => {
          if (value !== null && value !== undefined) result[key] = String(value);
          return result;
        }, {}),
      );
      setTemplates(
        await requestJson<PrintTemplate[]>(`/printing/templates?${query.toString()}`),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'NÃO FOI POSSÍVEL CARREGAR OS MODELOS.',
      );
    } finally {
      setLoading(false);
    }
  }, [runtime.sourceSystem, runtime.sourceTenantId, runtime.userRole, scope]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!runtime.embedded || window.parent === window) return;
    window.parent.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID },
      '*',
    );
  }, [runtime.embedded]);

  useEffect(
    () => () => {
      if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl);
    },
    [referenceImageUrl],
  );

  const showReferenceImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('SELECIONE UMA IMAGEM PNG, JPG OU WEBP.');
      return;
    }
    if (referenceImageUrl) URL.revokeObjectURL(referenceImageUrl);
    setReferenceImageUrl(URL.createObjectURL(file));
    setReferenceImageName(file.name || 'IMAGEM COLADA');
    setError('');
  };

  const readPackageFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError('O PACOTE NÃO PODE ULTRAPASSAR 2 MB.');
      return;
    }
    try {
      setPackageText(await file.text());
      setPackageFileName(file.name);
      setValidation(null);
      setMessage('');
      setError('');
    } catch {
      setError('NÃO FOI POSSÍVEL LER O ARQUIVO DO PACOTE.');
    }
  };

  const handleImagePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith('image/'))
      ?.getAsFile();
    if (file) {
      event.preventDefault();
      showReferenceImage(file);
    }
  };

  const handleImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith('image/'),
    );
    if (file) showReferenceImage(file);
  };

  const parsePackage = () => {
    try {
      const parsed = JSON.parse(packageText) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error();
      }
      return parsed;
    } catch {
      throw new Error('O ARQUIVO NÃO CONTÉM UM PACOTE JSON VÁLIDO.');
    }
  };

  const validatePackage = async () => {
    setWorking(true);
    setMessage('');
    setError('');
    try {
      const result = await requestJson<PackageValidation>('/printing/packages/validate', {
        method: 'POST',
        body: JSON.stringify({ ...scope, package: parsePackage() }),
      });
      setValidation(result);
      setMessage('PACOTE VALIDADO. CONFIRA A IMAGEM E A PRÉVIA ANTES DE IMPORTAR.');
    } catch (validationError) {
      setValidation(null);
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'NÃO FOI POSSÍVEL VALIDAR O PACOTE.',
      );
    } finally {
      setWorking(false);
    }
  };

  const importPackage = async (publish: boolean) => {
    setWorking(true);
    setMessage('');
    setError('');
    try {
      const result = await requestJson<{
        published: boolean;
        template: PrintTemplate;
        importedVersion: { version: number };
        preview: PackageValidation['preview'];
      }>('/printing/packages/import', {
        method: 'POST',
        body: JSON.stringify({ ...scope, package: parsePackage(), publish }),
      });
      setMessage(
        `${result.template.name} IMPORTADO COMO VERSÃO ${result.importedVersion.version}${result.published ? ' E PUBLICADO' : ' EM RASCUNHO'}.`,
      );
      await loadTemplates();
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : 'NÃO FOI POSSÍVEL IMPORTAR O PACOTE.',
      );
    } finally {
      setWorking(false);
    }
  };

  const exportPackage = async (template: PrintTemplate) => {
    setWorking(true);
    setMessage('');
    setError('');
    try {
      const pkg = await requestJson<PortablePackage>(
        `/printing/templates/${template.id}/export-package`,
        {
          method: 'POST',
          body: JSON.stringify(scope),
        },
      );
      const blobUrl = URL.createObjectURL(
        new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${safeFileName(template.code)}.msreport.json`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
      setMessage(`${template.name} EXPORTADO SEM IDENTIFICADORES DO CLIENTE.`);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : 'NÃO FOI POSSÍVEL EXPORTAR O MODELO.',
      );
    } finally {
      setWorking(false);
    }
  };

  if (runtime.userRole !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <section className={`${cardClass} border-amber-200 p-8 text-center`}>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-600">
            Acesso restrito
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">
            Configura recibos por imagem
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta área está disponível somente para usuários com perfil ADMIN.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-5 py-5 text-white">
          <div className="flex items-center gap-4">
            <img
              src="/logo-msinfor.jpg"
              alt="Logo MSINFOR"
              className="h-14 w-14 rounded-2xl border border-white/20 bg-white object-contain shadow-lg"
            />
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                Central MSINFOR
              </div>
              <h1 className="text-2xl font-black">Configura recibos por imagem</h1>
              <p className="mt-1 text-xs font-semibold text-blue-100">
                Compare a referência com o pacote preparado no Codex e instale uma versão exclusiva neste cliente.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['1', 'ENVIE A IMAGEM NO CODEX', 'O layout é montado e refinado sem IA dentro do sistema.'],
            ['2', 'RECEBA O .MSREPORT.JSON', 'O pacote contém layout, variáveis, exemplo anônimo, versão e hash.'],
            ['3', 'VALIDE E IMPORTE', 'A empresa e a filial atuais são aplicadas somente nesta etapa.'],
          ].map(([number, title, description]) => (
            <div key={number} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d4f91] text-xs font-black text-white">
                {number}
              </div>
              <div className="mt-3 text-xs font-black text-slate-800">{title}</div>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                {description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          A imagem fica somente na memória deste navegador para comparação e não é enviada nem gravada no banco.
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className={`${cardClass} p-5`}>
          <h2 className="text-sm font-black text-slate-800">1. IMAGEM DE REFERÊNCIA</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Cole com Ctrl+V, arraste ou selecione a foto usada na criação do layout.
          </p>
          <div
            tabIndex={0}
            onPaste={handleImagePaste}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleImageDrop}
            className="mt-4 flex min-h-80 cursor-text items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            {referenceImageUrl ? (
              <img
                src={referenceImageUrl}
                alt="Recibo de referência"
                className="max-h-[560px] max-w-full object-contain"
              />
            ) : (
              <div className="max-w-sm text-center">
                <div className="text-5xl">🧾</div>
                <div className="mt-3 text-sm font-black text-slate-700">
                  CLIQUE AQUI E COLE A IMAGEM
                </div>
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  A imagem serve somente para conferência visual.
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-500">
              {referenceImageName || 'NENHUMA IMAGEM SELECIONADA'}
            </div>
            <label className={secondaryButtonClass}>
              SELECIONAR IMAGEM
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0];
                  if (file) showReferenceImage(file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </section>

        <section className={`${cardClass} p-5`}>
          <h2 className="text-sm font-black text-slate-800">2. PACOTE DO RELATÓRIO</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Selecione o arquivo .msreport.json entregue pelo Codex ou cole seu conteúdo.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className={secondaryButtonClass}>
              ABRIR PACOTE
              <input
                type="file"
                accept=".json,.msreport.json,application/json"
                className="hidden"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0];
                  if (file) void readPackageFile(file);
                  event.target.value = '';
                }}
              />
            </label>
            <span className="text-xs font-bold text-slate-500">
              {packageFileName || 'NENHUM PACOTE SELECIONADO'}
            </span>
          </div>
          <textarea
            value={packageText}
            onChange={(event) => {
              setPackageText(event.target.value);
              setValidation(null);
            }}
            placeholder='{ "format": "MSINFOR_REPORT_PACKAGE", ... }'
            className="mt-4 min-h-56 w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-emerald-300 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={validatePackage}
            disabled={!packageText.trim() || working}
            className={`${buttonClass} mt-3 w-full`}
          >
            {working ? 'PROCESSANDO...' : 'VALIDAR INTEGRIDADE E GERAR PRÉVIA'}
          </button>

          {validation ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-black text-emerald-800">
                  PACOTE ÍNTEGRO · {validation.package.report.name}
                </div>
                <div className="mt-2 grid gap-1 text-[11px] font-bold text-emerald-700 sm:grid-cols-2">
                  <span>CÓDIGO: {validation.package.report.code}</span>
                  <span>MÍDIA: {validation.package.report.mediaType}</span>
                  <span>SCHEMA: {validation.package.schemaVersion}</span>
                  <span title={validation.package.integrity.contentHash}>
                    HASH: {validation.package.integrity.contentHash.slice(0, 16)}…
                  </span>
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black text-slate-700">
                  PRÉVIA RENDERIZADA
                </div>
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 font-mono text-xs leading-5 text-emerald-300">
                  {validation.preview.serializedContent}
                </pre>
              </div>
              {validation.warnings?.map((warning) => (
                <div
                  key={warning}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800"
                >
                  {warning}
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void importPackage(false)}
                  disabled={working}
                  className={secondaryButtonClass}
                >
                  IMPORTAR COMO RASCUNHO
                </button>
                <button
                  type="button"
                  onClick={() => void importPackage(true)}
                  disabled={working}
                  className={buttonClass}
                >
                  IMPORTAR E PUBLICAR
                </button>
              </div>
              <p className="text-[11px] font-semibold leading-5 text-slate-500">
                Se o código já existir neste cliente, será criada uma nova versão. A versão publicada anterior fica arquivada, nunca apagada.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-black text-slate-900">
            Modelos deste cliente
          </h2>
          <p className="text-xs font-semibold text-slate-500">
            Exporte qualquer modelo para refiná-lo no Codex ou instalá-lo em outro cliente.
          </p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm font-black text-slate-500">
            CARREGANDO MODELOS...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">MODELO</th>
                  <th className="px-4 py-3">TIPO</th>
                  <th className="px-4 py-3">VERSÃO</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-800">{template.name}</div>
                      <div className="mt-1 text-[10px] font-bold text-slate-400">
                        {template.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-600">
                      {template.mediaType === 'LABEL' ? 'ETIQUETA' : 'RECIBO'}
                    </td>
                    <td className="px-4 py-3 font-black text-slate-700">
                      {template.currentVersion}
                    </td>
                    <td className="px-4 py-3 font-black text-slate-600">
                      {template.status}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void exportPackage(template)}
                        disabled={working}
                        className={secondaryButtonClass}
                      >
                        EXPORTAR .MSREPORT
                      </button>
                    </td>
                  </tr>
                ))}
                {!templates.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center font-bold text-slate-500">
                      NENHUM MODELO CADASTRADO NESTE CLIENTE.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!runtime.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={SCREEN_ID}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={`Importação isolada por empresa e filial. Tenant: ${runtime.sourceTenantId || 'NÃO INFORMADO'}. Filial: ${runtime.sourceBranchCode}. Usuário: ${runtime.cashierDisplayName || runtime.cashierUserId || 'NÃO INFORMADO'}. Importações, publicações e exportações são auditadas.`}
            sqlText="-- PACOTES NÃO CARREGAM COMPANYID, TENANTID, BRANCHCODE OU CREDENCIAIS."
          />
        </section>
      ) : null}
    </div>
  );
}
