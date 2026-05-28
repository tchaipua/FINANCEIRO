'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { getJson } from '@/app/lib/api';
import {
  formatCurrency,
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type BatchItem = {
  id: string;
  companyName?: string | null;
  sourceSystem: string;
  sourceTenantId: string;
  sourceBatchType: string;
  sourceBatchId: string;
  status: string;
  itemCount: number;
  processedCount: number;
  duplicateCount: number;
  errorCount: number;
  referenceDate?: string | null;
  createdAt: string;
  metadata?: {
    targetLabel?: string | null;
    firstDueDate?: string | null;
    schoolYear?: {
      year: number;
    } | null;
  } | null;
  receivableTitles?: Array<{
    totalAmount?: number | null;
  }>;
  bankSlipSummary?: {
    status: 'WAITING_PREPARATION' | 'READY_TO_SEND' | 'SENT_TO_BANK' | 'PARTIAL_OR_ERROR';
    totalCount: number;
    waitingCount: number;
    preparedCount: number;
    issuedCount: number;
    errorCount: number;
  };
};

type BankSlipSummaryStatus =
  | 'ALL'
  | 'WAITING_PREPARATION'
  | 'READY_TO_SEND'
  | 'SENT_TO_BANK'
  | 'PARTIAL_OR_ERROR';

type InstallmentItem = {
  id: string;
  sourceEntityName: string;
  payerNameSnapshot: string;
  installmentNumber: number;
  installmentCount: number;
  bankSlipStatus?: string | null;
  bankSlipOurNumber?: string | null;
  hasBankSlipPdf?: boolean;
};

type InstallmentBankSlipPdfPayload = {
  contentType: string;
  fileName: string;
  base64: string;
};

type EmissionBankSlipPdfItem = {
  installmentId: string;
  fileName: string;
  blobUrl: string;
  sourceEntityName: string;
  payerNameSnapshot: string;
  installmentNumber: number;
  installmentCount: number;
};

const SCREEN_ID = 'FINANCEIRO_RECEBIVEIS_LOTES_LISTAGEM';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_LOTES';
const EMIT_BATCH_BANK_SLIPS_POPUP_SCREEN_ID =
  'FINANCEIRO_RECEBIVEIS_LOTES_IMPRIMIR_BOLETOS_LOTE';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const selectClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-700 outline-none transition focus:border-blue-500';
const lotCellClass =
  'border-y border-slate-200 bg-white px-4 py-4 align-middle shadow-sm transition-colors group-hover:bg-slate-50';
const firstLotCellClass = `${lotCellClass} rounded-l-2xl border-l`;
const lastLotCellClass = `${lotCellClass} rounded-r-2xl border-r`;

function getBatchTotalAmount(batch: BatchItem) {
  return (batch.receivableTitles || []).reduce(
    (accumulator, current) => accumulator + Number(current.totalAmount || 0),
    0,
  );
}

function canPrintFullBatchBankSlips(batch: BatchItem) {
  return (
    getBankSlipSummaryStatus(batch) === 'SENT_TO_BANK' &&
    Number(batch.bankSlipSummary?.totalCount || 0) > 0
  );
}

function canEmitBankSlipPdf(installment: InstallmentItem) {
  return (
    String(installment.bankSlipStatus || '').trim().toUpperCase() === 'ISSUED' &&
    Boolean(installment.hasBankSlipPdf)
  );
}

function buildBankSlipPdfBlobUrl(payload: InstallmentBankSlipPdfPayload) {
  const binary = window.atob(payload.base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], {
    type: payload.contentType || 'application/pdf',
  });

  return URL.createObjectURL(blob);
}

function normalizeSearchValue(value?: string | number | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function getBankSlipSummaryStatus(batch: BatchItem) {
  return batch.bankSlipSummary?.status || 'WAITING_PREPARATION';
}

function getBankSlipSummaryStatusLabel(status: string) {
  switch (String(status || '').trim().toUpperCase()) {
    case 'ALL':
      return 'TODOS STATUS';
    case 'READY_TO_SEND':
      return 'AGUARDANDO ENVIO';
    case 'SENT_TO_BANK':
      return 'ENVIADO AO BANCO';
    case 'PARTIAL_OR_ERROR':
      return 'PARCIAL / COM ERRO';
    default:
      return 'AGUARDANDO PREPARAÇÃO';
  }
}

function getBankSlipSummaryStatusTone(status: string) {
  switch (String(status || '').trim().toUpperCase()) {
    case 'READY_TO_SEND':
      return 'border-[#F54627] bg-[#F54627] text-white';
    case 'SENT_TO_BANK':
      return 'border-emerald-300 bg-emerald-100 text-emerald-900';
    case 'PARTIAL_OR_ERROR':
      return 'border-rose-300 bg-rose-100 text-rose-800';
    default:
      return 'border-yellow-300 bg-yellow-100 text-yellow-900';
  }
}

type BatchAuditParams = {
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  search: string;
  statusFilter: BankSlipSummaryStatus;
  displayedRowsCount: number;
  totalInstallments: number;
};

function buildBatchAuditSql(params: BatchAuditParams) {
  const search = params.search.trim().toUpperCase();
  const statusLabel = getBankSlipSummaryStatusLabel(params.statusFilter);

  return `-- PARAMETROS ATUAIS DO GRID
-- :sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
-- :search = ${toSqlLiteral(search)}
-- :statusVisualBoletos = ${toSqlLiteral(statusLabel)}

SELECT DISTINCT RB.*
FROM receivable_batches RB
LEFT JOIN receivable_installments RI
  ON RI.batchId = RB.id
 AND RI.canceledAt IS NULL
WHERE RB.sourceSystem = ${toSqlLiteral(params.sourceSystem || '')}
  AND RB.sourceTenantId = ${toSqlLiteral(params.sourceTenantId || '')}
  AND (
    ${toSqlLiteral(search)} = ''
    OR UPPER(COALESCE(RB.companyName, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RB.sourceBatchId, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RB.sourceBatchType, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
    OR UPPER(COALESCE(RB.sourceTenantId, '')) LIKE '%' || UPPER(${toSqlLiteral(search)}) || '%'
  )
ORDER BY RB.createdAt DESC;

-- STATUS VISUAL DOS BOLETOS:
-- considera RI.status = 'OPEN' e RI.openAmount > 0
-- filtro visual atual: ${statusLabel}
-- AGUARDANDO PREPARAÇÃO, AGUARDANDO ENVIO, ENVIADO AO BANCO ou PARCIAL / COM ERRO`;
}

function buildBatchAuditText(params: BatchAuditParams) {
  const search = params.search.trim().toUpperCase();
  const statusLabel = getBankSlipSummaryStatusLabel(params.statusFilter);

  return `--- LOGICA DA TELA ---
Tela de grid/listagem dos lotes de recebiveis recebidos pelo Financeiro.

TABELAS PRINCIPAIS:
- receivable_batches (RB) - lotes de titulos/parcelas importados
- receivable_installments (RI) - parcelas usadas para resumir a situacao dos boletos

RELACIONAMENTOS:
- cada lote pertence ao sistema/tenant de origem
- RI.batchId = RB.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.sourceTenantId)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.sourceSystem)}
- busca digitada (:search): ${formatAuditValue(search)}
- status visual dos boletos: ${formatAuditValue(statusLabel)}
- lotes exibidos apos os filtros: ${params.displayedRowsCount}
- parcelas processadas nos lotes exibidos: ${params.totalInstallments}
- ordenacao atual: criacao DESC
- situacao visual dos boletos: calculada sobre parcelas abertas com valor em aberto

OBSERVACAO SOBRE O FILTRO DA EMPRESA:
- RB.sourceSystem e RB.sourceTenantId isolam os dados da empresa/sistema de origem
- os demais parametros acima refletem os filtros visiveis aplicados no grid`;
}

const bankSlipStatusOptions: Array<{ value: BankSlipSummaryStatus; label: string }> = [
  { value: 'ALL', label: 'TODOS STATUS' },
  { value: 'WAITING_PREPARATION', label: 'AGUARDANDO PREPARAÇÃO' },
  { value: 'READY_TO_SEND', label: 'AGUARDANDO ENVIO' },
  { value: 'SENT_TO_BANK', label: 'ENVIADO AO BANCO' },
  { value: 'PARTIAL_OR_ERROR', label: 'PARCIAL / COM ERRO' },
];

export default function FinanceiroReceivableBatchesPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const isEmbedded = runtimeContext.embedded;
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BankSlipSummaryStatus>('ALL');
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [printingBatchId, setPrintingBatchId] = useState<string | null>(null);
  const [emissionBankSlipPdfs, setEmissionBankSlipPdfs] = useState<
    EmissionBankSlipPdfItem[]
  >([]);
  const [emissionBatchTitle, setEmissionBatchTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEmbedded) return;

    window.parent.postMessage(
      { type: 'MSINFOR_SCREEN_CONTEXT', screenId: EMBEDDED_SCREEN_ID },
      '*',
    );
  }, [isEmbedded]);

  useEffect(
    () => () => {
      emissionBankSlipPdfs.forEach((item) => URL.revokeObjectURL(item.blobUrl));
    },
    [emissionBankSlipPdfs],
  );

  const loadBatches = useCallback(
    async () => {
      try {
        setIsLoading(true);
        setError(null);

        setBatches(
          await getJson<BatchItem[]>(
            `/receivables/batches${buildFinanceApiQueryString(runtimeContext)}`,
          ),
        );
      } catch (currentError) {
        setBatches([]);
        setError(
          getFriendlyRequestErrorMessage(
            currentError,
            'Não foi possível carregar os lotes do Financeiro.',
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [runtimeContext],
  );

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  async function loadBankSlipPdfPayload(batch: BatchItem, installmentId: string) {
    return getJson<InstallmentBankSlipPdfPayload>(
      `/receivables/installments/${installmentId}/bank-slip-pdf${buildFinanceApiQueryString(runtimeContext, {
        sourceSystem: batch.sourceSystem,
        sourceTenantId: batch.sourceTenantId,
      })}`,
    );
  }

  async function handlePrintBatchBankSlips(batch: BatchItem) {
    if (!canPrintFullBatchBankSlips(batch)) {
      setError('Somente lotes 100% gravados no banco podem imprimir todos os boletos.');
      return;
    }

    try {
      setPrintingBatchId(batch.id);
      setError(null);

      const loadedInstallments = await getJson<InstallmentItem[]>(
        `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
          sourceSystem: batch.sourceSystem,
          sourceTenantId: batch.sourceTenantId,
          batchId: batch.id,
          status: 'ALL',
        })}`,
      );
      const emittableInstallments = loadedInstallments.filter((item) =>
        canEmitBankSlipPdf(item),
      );

      if (!emittableInstallments.length) {
        throw new Error('Nenhum PDF de boleto foi encontrado para este lote.');
      }

      const loadedPdfs: EmissionBankSlipPdfItem[] = [];

      for (const installment of emittableInstallments) {
        const payload = await loadBankSlipPdfPayload(batch, installment.id);
        loadedPdfs.push({
          installmentId: installment.id,
          fileName: payload.fileName,
          blobUrl: buildBankSlipPdfBlobUrl(payload),
          sourceEntityName: installment.sourceEntityName,
          payerNameSnapshot: installment.payerNameSnapshot,
          installmentNumber: installment.installmentNumber,
          installmentCount: installment.installmentCount,
        });
      }

      setEmissionBatchTitle(
        `${batch.sourceBatchType || 'LOTE'} | ${batch.metadata?.targetLabel || batch.sourceBatchId}`,
      );
      setEmissionBankSlipPdfs(loadedPdfs);
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar os boletos do lote para impressão.',
        ),
      );
    } finally {
      setPrintingBatchId(null);
    }
  }

  function handleCloseEmissionBankSlipPdfs() {
    setEmissionBankSlipPdfs([]);
    setEmissionBatchTitle('');
  }

  const filteredBatches = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search);

    return batches.filter((batch) => {
      const bankSlipStatus = getBankSlipSummaryStatus(batch) as BankSlipSummaryStatus;

      if (statusFilter !== 'ALL' && bankSlipStatus !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = normalizeSearchValue(
        [
          batch.companyName,
          batch.sourceBatchType,
          batch.sourceSystem,
          batch.sourceTenantId,
          batch.sourceBatchId,
          batch.metadata?.targetLabel,
          batch.metadata?.schoolYear?.year,
          getBankSlipSummaryStatusLabel(bankSlipStatus),
        ].join(' '),
      );

      return searchableText.includes(normalizedSearch);
    });
  }, [batches, search, statusFilter]);

  const totalInstallments = useMemo(
    () =>
      filteredBatches.reduce(
        (accumulator, current) => accumulator + current.processedCount,
        0,
      ),
    [filteredBatches],
  );
  const batchAuditContext = useMemo(() => {
    const auditParams: BatchAuditParams = {
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      search,
      statusFilter,
      displayedRowsCount: filteredBatches.length,
      totalInstallments,
    };

    return {
      auditText: buildBatchAuditText(auditParams),
      sqlText: buildBatchAuditSql(auditParams),
    };
  }, [
    filteredBatches.length,
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    search,
    statusFilter,
    totalInstallments,
  ]);

  const pageClassName = isEmbedded
    ? 'flex min-h-[calc(100vh-0.75rem)] flex-col gap-3'
    : 'space-y-6';
  const filterSectionClassName = `${cardClass} ${isEmbedded ? 'p-3' : 'p-6'}`;
  const filterGridClassName = isEmbedded
    ? 'grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]'
    : 'grid gap-4 md:grid-cols-[1fr_280px]';
  const compactInputClass = isEmbedded
    ? 'w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white'
    : inputClass;
  const compactSelectClass = isEmbedded
    ? 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-700 outline-none transition focus:border-blue-500'
    : selectClass;
  const resultSectionClassName = `${cardClass} ${
    isEmbedded ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'overflow-hidden'
  }`;
  const resultHeaderClassName = isEmbedded
    ? 'border-b border-slate-100 px-4 py-3'
    : 'border-b border-slate-100 px-6 py-5';
  const resultEyebrowClassName = isEmbedded
    ? 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-500'
    : 'text-[11px] font-black uppercase tracking-[0.22em] text-slate-500';
  const resultTitleClassName = isEmbedded
    ? 'text-base font-black text-slate-900'
    : 'text-xl font-black text-slate-900';
  const resultSummaryClassName = isEmbedded
    ? 'text-[10px] font-black uppercase tracking-[0.14em] text-slate-400'
    : 'text-xs font-black uppercase tracking-[0.18em] text-slate-400';
  const gridWrapperClassName = isEmbedded
    ? 'min-h-0 flex-1 overflow-auto bg-slate-50 px-2 pb-2'
    : 'overflow-x-auto bg-slate-50 px-4 pb-4';
  const tableClassName = isEmbedded
    ? 'min-w-full border-separate border-spacing-y-1.5 text-left text-xs text-slate-600'
    : 'min-w-full border-separate border-spacing-y-3 text-left text-sm text-slate-600';
  const tableHeadClassName = isEmbedded
    ? 'sticky top-0 z-10 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500'
    : 'text-[11px] font-black uppercase tracking-[0.18em] text-slate-500';
  const headCellBaseClassName = isEmbedded
    ? 'bg-slate-100 px-3 py-2'
    : 'bg-slate-100 px-4 py-3';
  const lotGridCellClass = isEmbedded
    ? 'border-y border-slate-200 bg-white px-3 py-2 align-middle shadow-sm transition-colors group-hover:bg-slate-50'
    : lotCellClass;
  const firstLotGridCellClass = isEmbedded
    ? `${lotGridCellClass} rounded-l-xl border-l`
    : firstLotCellClass;
  const lastLotGridCellClass = isEmbedded
    ? `${lotGridCellClass} rounded-r-xl border-r`
    : lastLotCellClass;
  const statusPillClassName = isEmbedded
    ? 'inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]'
    : 'inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]';
  const lotTitleClassName = isEmbedded
    ? 'font-black leading-tight text-slate-900'
    : 'font-black text-slate-900';
  const lotBadgeWrapperClassName = isEmbedded ? 'mt-1 space-y-0.5' : 'mt-2 space-y-1';
  const lotMetaClassName = isEmbedded
    ? 'text-[9px] font-black uppercase tracking-[0.12em] text-slate-400'
    : 'text-[10px] font-black uppercase tracking-[0.18em] text-slate-400';
  const secondaryMetaClassName = isEmbedded
    ? 'mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400'
    : 'mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400';
  const actionLinkClassName = isEmbedded
    ? 'inline-flex rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100'
    : 'inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 transition hover:bg-blue-100';
  const printBatchButtonClassName = isEmbedded
    ? 'inline-flex rounded-lg bg-sky-700 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-70'
    : 'inline-flex rounded-xl bg-sky-700 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-sky-800 disabled:opacity-70';

  return (
    <div className={pageClassName}>
      {!isEmbedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
                Contas a receber
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Lotes recebidos</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium text-blue-100/90">
                Cada lote representa um agrupamento de títulos e parcelas importados para o core financeiro.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <ScreenNameCopy
              screenId={SCREEN_ID}
              className="justify-end"
              auditText={batchAuditContext.auditText}
              sqlText={batchAuditContext.sqlText}
            />
          </div>
        </section>
      ) : null}

      <section className={filterSectionClassName}>
        <div className={filterGridClassName}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={compactInputClass}
            placeholder="PESQUISAR POR EMPRESA, LOTE, SISTEMA, TENANT OU TIPO"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as BankSlipSummaryStatus)}
            className={compactSelectClass}
            aria-label="Filtrar por status dos boletos"
          >
            {bankSlipStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <section
          className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}
        >
          {error}
        </section>
      ) : null}

      <section className={resultSectionClassName}>
        <div className={resultHeaderClassName}>
          <div className={resultEyebrowClassName}>
            Resultado
          </div>
          <div className={`${isEmbedded ? 'mt-1' : 'mt-2'} flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between`}>
            <h2 className={resultTitleClassName}>
              {isLoading ? 'Carregando...' : `${filteredBatches.length} lote(s) encontrado(s)`}
            </h2>
            {!isLoading ? (
              <div className={resultSummaryClassName}>
                {totalInstallments} parcela(s) somadas nos lotes listados
              </div>
            ) : null}
          </div>
        </div>

        <div className={gridWrapperClassName}>
          <table className={tableClassName}>
            <thead className={tableHeadClassName}>
              <tr>
                <th className={`${headCellBaseClassName} ${isEmbedded ? 'rounded-l-xl' : 'rounded-l-2xl'}`}>Lote</th>
                <th className={headCellBaseClassName}>Filtro</th>
                <th className={headCellBaseClassName}>Títulos</th>
                <th className={headCellBaseClassName}>Parcelas</th>
                <th className={headCellBaseClassName}>Total</th>
                <th className={headCellBaseClassName}>Criado em</th>
                <th className={`${headCellBaseClassName} ${isEmbedded ? 'rounded-r-xl' : 'rounded-r-2xl'}`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((item) => {
                const bankSlipStatus = getBankSlipSummaryStatus(item);
                const canPrintBatchBankSlips = canPrintFullBatchBankSlips(item);

                return (
                  <tr key={item.id} className="group">
                    <td className={firstLotGridCellClass}>
                      <div className={lotTitleClassName}>
                        {item.sourceBatchType} | {item.sourceSystem}
                      </div>
                      <div className={lotBadgeWrapperClassName}>
                        <span
                          className={`${statusPillClassName} ${getBankSlipSummaryStatusTone(bankSlipStatus)}`}
                        >
                          {getBankSlipSummaryStatusLabel(bankSlipStatus)}
                        </span>
                        <div className={lotMetaClassName}>
                          BOLETOS
                        </div>
                      </div>
                    </td>
                  <td className={lotGridCellClass}>
                    <div className="font-semibold text-slate-700">
                      {item.metadata?.targetLabel || item.sourceTenantId}
                    </div>
                    <div className={secondaryMetaClassName}>
                      {item.metadata?.schoolYear?.year
                        ? `ANO LETIVO ${item.metadata.schoolYear.year}`
                        : item.sourceBatchId}
                    </div>
                  </td>
                  <td className={`${lotGridCellClass} font-semibold text-slate-700`}>
                    {item.itemCount}
                  </td>
                  <td className={lotGridCellClass}>
                    <div className="font-semibold text-slate-700">{item.processedCount}</div>
                    {(item.duplicateCount > 0 || item.errorCount > 0) && (
                      <div className={isEmbedded ? 'mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-rose-500' : 'mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-500'}>
                        {item.duplicateCount > 0 ? `${item.duplicateCount} duplic.` : ''}
                        {item.duplicateCount > 0 && item.errorCount > 0 ? ' | ' : ''}
                        {item.errorCount > 0 ? `${item.errorCount} erro(s)` : ''}
                      </div>
                    )}
                  </td>
                  <td className={`${lotGridCellClass} font-black text-slate-900`}>
                    {formatCurrency(getBatchTotalAmount(item))}
                  </td>
                  <td className={`${lotGridCellClass} font-semibold text-slate-700`}>
                    {formatDateLabel(item.createdAt)}
                  </td>
                  <td className={lastLotGridCellClass}>
                    <div className={isEmbedded ? 'flex flex-col gap-1.5' : 'flex flex-wrap gap-2'}>
                      <Link
                        href={`/recebiveis/lotes/${item.id}${preservedQueryString}`}
                        className={actionLinkClassName}
                      >
                        Ver parcelas
                      </Link>

                      {canPrintBatchBankSlips ? (
                        <button
                          type="button"
                          onClick={() => void handlePrintBatchBankSlips(item)}
                          disabled={printingBatchId === item.id}
                          className={printBatchButtonClassName}
                        >
                          {printingBatchId === item.id ? 'Carregando...' : 'Imprimir boletos'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                );
              })}

              {!isLoading && !filteredBatches.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum lote financeiro foi encontrado para o filtro informado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {emissionBankSlipPdfs.length ? (
        <style>
          {`
            @media print {
              body * {
                visibility: hidden !important;
              }

              .batch-bank-slip-print-area,
              .batch-bank-slip-print-area * {
                visibility: visible !important;
              }

              .batch-bank-slip-print-area {
                position: fixed !important;
                inset: 0 !important;
                z-index: 99999 !important;
                overflow: visible !important;
                background: #ffffff !important;
              }

              .batch-bank-slip-print-header {
                display: none !important;
              }

              .batch-bank-slip-print-card {
                margin: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                break-after: page;
                page-break-after: always;
              }

              .batch-bank-slip-print-card:last-child {
                break-after: auto;
                page-break-after: auto;
              }

              .batch-bank-slip-pdf-object,
              .batch-bank-slip-pdf-object iframe {
                height: 100vh !important;
              }
            }
          `}
        </style>
      ) : null}

      <AuditedPopupShell
        isOpen={emissionBankSlipPdfs.length > 0}
        screenId={EMIT_BATCH_BANK_SLIPS_POPUP_SCREEN_ID}
        title="Imprimir boletos do lote"
        eyebrow="Boletos gravados"
        description="Confira os boletos do lote e use a impressão quando estiver tudo certo."
        brandingName={runtimeContext.companyName || 'Financeiro'}
        logoUrl={runtimeContext.logoUrl}
        onClose={handleCloseEmissionBankSlipPdfs}
        panelClassName="max-w-6xl"
        bodyClassName="max-h-[76vh] overflow-auto"
        screenCopyWrapperClassName="hidden"
        footerActions={
          <>
            <button
              type="button"
              onClick={handleCloseEmissionBankSlipPdfs}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-sky-700 px-5 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-sky-700/25 transition hover:bg-sky-800"
            >
              Imprimir boletos
            </button>
          </>
        }
      >
        <div className="batch-bank-slip-print-area space-y-4">
          <div className="batch-bank-slip-print-header rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Lote selecionado
            </div>
            <div className="mt-1 text-sm font-black uppercase text-slate-900">
              {emissionBatchTitle || 'LOTE FINANCEIRO'}
            </div>
            <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {emissionBankSlipPdfs.length} boleto(s)
            </div>
          </div>

          {emissionBankSlipPdfs.map((item, index) => (
            <section
              key={item.installmentId}
              className="batch-bank-slip-print-card overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="batch-bank-slip-print-header flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-black uppercase text-slate-900">
                    {item.sourceEntityName}
                  </div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    PARCELA {item.installmentNumber}/{item.installmentCount} | {item.payerNameSnapshot}
                  </div>
                </div>
                <a
                  href={item.blobUrl}
                  download={item.fileName}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700 transition hover:bg-blue-100"
                >
                  Baixar PDF
                </a>
              </div>
              <object
                data={item.blobUrl}
                type="application/pdf"
                className="batch-bank-slip-pdf-object block h-[68vh] w-full border-0"
              >
                <iframe
                  src={item.blobUrl}
                  title={`Boleto ${index + 1}`}
                  className="h-[68vh] w-full border-0"
                />
              </object>
            </section>
          ))}
        </div>
      </AuditedPopupShell>
    </div>
  );
}
