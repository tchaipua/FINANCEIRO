'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import GridStandardFooter, { type GridStatusFilterValue } from '@/app/components/grid-standard-footer';
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
  type FinanceRuntimeContext,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';
import { formatAuditValue, formatTenantAuditValue, toSqlLiteral } from '@/app/lib/screen-audit-context';

type BankItem = {
  id: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  status: string;
};

type ReceivableInstallmentItem = {
  id: string;
  businessKey: string;
  description: string;
  payerNameSnapshot: string;
  dueDate: string;
  amount: number;
  openAmount: number;
  paidAmount: number;
  status: string;
  settlementMethod?: string | null;
  settledAt?: string | null;
  installmentNumber: number;
  installmentCount: number;
  bankAccountId?: string | null;
  bankAccountLabel?: string | null;
  bankMovementGroupId?: string | null;
  bankMovementStatus?: string | null;
  bankMovementCreatedAt?: string | null;
};

type OpenBankMovementInstallment = {
  id: string;
  businessKey: string;
  description: string;
  payerNameSnapshot: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
};

type OpenBankMovement = {
  id: string;
  movementType: string;
  occurredAt?: string | null;
  description: string;
  personName: string;
  bankAccountId?: string | null;
  bankAccountLabel?: string | null;
  amount: number;
  paymentMethod?: string | null;
  sourceLabel: string;
  installmentCount: number;
  installments: OpenBankMovementInstallment[];
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS';
const DETAIL_MODAL_SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS_DETALHES';
const DETAIL_MODAL_ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho fisico: C:/Sistemas/IA/Financeiro/frontend/src/app/bancos/movimentos-abertos/page.tsx';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';

type DetailModalAuditParams = {
  movement: OpenBankMovement;
  runtimeContext: FinanceRuntimeContext;
  selectedBankLabel?: string | null;
  search: string;
};

function buildBankLabel(bank: BankItem) {
  const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ''}`;
  const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`;
  return `${bank.bankName} - AG ${agency} - CC ${account}`;
}

function normalizeMethodLabel(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.replace(/_/g, ' ') : '---';
}

function roundMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function mapInstallmentsToOpenMovements(
  installments: ReceivableInstallmentItem[],
): OpenBankMovement[] {
  const groups = new Map<string, OpenBankMovement>();

  installments.forEach((installment) => {
    const bankMovementStatus = String(installment.bankMovementStatus || '').trim().toUpperCase();

    if (bankMovementStatus !== 'OPEN' || !installment.bankAccountId) {
      return;
    }

    const groupId = String(installment.bankMovementGroupId || installment.id).trim();
    const detail: OpenBankMovementInstallment = {
      id: installment.id,
      businessKey: installment.businessKey || 'PARCELA',
      description: installment.description || installment.businessKey || 'PARCELA RECEBIDA',
      payerNameSnapshot: installment.payerNameSnapshot || 'PAGADOR',
      installmentNumber: installment.installmentNumber,
      installmentCount: installment.installmentCount,
      dueDate: installment.dueDate,
      amount: installment.amount,
      paidAmount: installment.paidAmount || installment.amount || 0,
    };

    const existingGroup = groups.get(groupId);

    if (existingGroup) {
      existingGroup.amount = roundMoney(existingGroup.amount + detail.paidAmount);
      existingGroup.installmentCount += 1;
      existingGroup.installments.push(detail);
      return;
    }

    groups.set(groupId, {
      id: groupId,
      movementType: 'RECEBIMENTO',
      occurredAt: installment.bankMovementCreatedAt || installment.settledAt,
      description: detail.description,
      personName: installment.payerNameSnapshot || 'PAGADOR',
      bankAccountId: installment.bankAccountId || null,
      bankAccountLabel: installment.bankAccountLabel || null,
      amount: roundMoney(detail.paidAmount),
      paymentMethod: installment.settlementMethod || null,
      sourceLabel: detail.businessKey,
      installmentCount: 1,
      installments: [detail],
    });
  });

  return Array.from(groups.values()).map((movement) => {
    movement.installments.sort((left, right) => {
      const leftDate = new Date(left.dueDate).getTime();
      const rightDate = new Date(right.dueDate).getTime();
      return leftDate - rightDate || left.installmentNumber - right.installmentNumber;
    });

    if (movement.installmentCount > 1) {
      movement.description = `${normalizeMethodLabel(movement.paymentMethod)} - ${movement.installmentCount} PARCELAS`;
      movement.sourceLabel = `${movement.installmentCount} PARCELAS LIQUIDADAS`;
    }

    return movement;
  });
}

function buildDetailModalAuditSql(params: DetailModalAuditParams) {
  const movementGroupId = String(params.movement.id || '').trim();
  const bankAccountId = String(params.movement.bankAccountId || '').trim();
  const search = params.search.trim().toUpperCase();

  return `-- PARAMETROS ATUAIS DO POPUP
-- :sourceSystem = ${toSqlLiteral(params.runtimeContext.sourceSystem || '')}
-- :sourceTenantId = ${toSqlLiteral(params.runtimeContext.sourceTenantId || '')}
-- :bankAccountId = ${toSqlLiteral(bankAccountId)}
-- :bankMovementGroupId = ${toSqlLiteral(movementGroupId)}
-- :searchGridOrigem = ${toSqlLiteral(search)}

SELECT
  RI.id,
  RI.dueDate,
  RI.installmentNumber,
  RI.installmentCount,
  RI.descriptionSnapshot,
  RI.payerNameSnapshot,
  RI.paidAmount,
  RI.settlementMethod,
  RI.settledAt,
  RI.bankAccountId,
  RI.bankAccountLabel,
  RI.bankMovementGroupId,
  RI.bankMovementStatus,
  RI.bankMovementCreatedAt,
  RT.businessKey,
  BA.bankName,
  BA.branchNumber,
  BA.accountNumber,
  ISS.id AS settlementId,
  ISS.receivedAmount
FROM receivable_installments RI
INNER JOIN companies CO
  ON CO.id = RI.companyId
 AND CO.canceledAt IS NULL
LEFT JOIN receivable_titles RT
  ON RT.id = RI.titleId
 AND RT.companyId = RI.companyId
 AND RT.canceledAt IS NULL
LEFT JOIN bank_accounts BA
  ON BA.id = RI.bankAccountId
 AND BA.companyId = RI.companyId
 AND BA.canceledAt IS NULL
LEFT JOIN installment_settlements ISS
  ON ISS.installmentId = RI.id
 AND ISS.companyId = RI.companyId
 AND ISS.canceledAt IS NULL
WHERE RI.canceledAt IS NULL
  AND RI.status = 'PAID'
  AND RI.bankMovementStatus = 'OPEN'
  AND RI.bankMovementGroupId = ${toSqlLiteral(movementGroupId)}
  AND RI.bankAccountId = ${toSqlLiteral(bankAccountId)}
  AND CO.sourceSystem = ${toSqlLiteral(params.runtimeContext.sourceSystem || '')}
  AND CO.sourceTenantId = ${toSqlLiteral(params.runtimeContext.sourceTenantId || '')}
ORDER BY RI.dueDate ASC, RI.installmentNumber ASC;`;
}

function buildDetailModalAuditText(params: DetailModalAuditParams) {
  const movementGroupId = String(params.movement.id || '').trim();
  const bankAccountId = String(params.movement.bankAccountId || '').trim();
  const bankLabel = params.selectedBankLabel || params.movement.bankAccountLabel || 'BANCO DO MOVIMENTO';
  const search = params.search.trim().toUpperCase();

  return `--- LOGICA DA TELA ---
Popup de detalhes do movimento bancario em aberto.

O QUE A TELA FAZ:
- Mostra as parcelas que formaram um unico lancamento bancario em aberto.
- Quando uma baixa manual liquida varias parcelas no mesmo PIX, o grid mostra 1 movimento e este popup lista cada parcela paga.
- O banco vem travado do movimento selecionado na tela PRINCIPAL_FINANCEIRO_BANCOS_MOVIMENTOS_ABERTOS.

TABELAS PRINCIPAIS:
- companies (CO) - empresa financeira resolvida pelo contexto da Escola
- bank_accounts (BA) - banco/conta onde o PIX ou recebimento caiu
- receivable_installments (RI) - parcelas pagas que ainda estao abertas para conversao bancaria
- receivable_titles (RT) - titulo financeiro da parcela
- installment_settlements (ISS) - baixa registrada no caixa

RELACIONAMENTOS:
- receivable_installments.companyId = companies.id
- receivable_installments.bankAccountId = bank_accounts.id
- receivable_installments.titleId = receivable_titles.id
- installment_settlements.installmentId = receivable_installments.id

FILTROS APLICADOS AGORA:
- empresa/tenant atual (:sourceTenantId): ${formatTenantAuditValue(params.runtimeContext.sourceTenantId, params.runtimeContext.companyName)}
- sistema origem (:sourceSystem): ${formatAuditValue(params.runtimeContext.sourceSystem)}
- banco do movimento (:bankAccountId): ${formatAuditValue(bankAccountId)}
- banco exibido: ${formatAuditValue(bankLabel)}
- agrupamento do movimento (:bankMovementGroupId): ${formatAuditValue(movementGroupId)}
- busca digitada no grid de origem (:searchGridOrigem): ${formatAuditValue(search)}
- pagador exibido: ${formatAuditValue(params.movement.personName)}
- forma exibida: ${formatAuditValue(normalizeMethodLabel(params.movement.paymentMethod))}
- parcelas exibidas no popup: ${params.movement.installments.length}
- total do movimento: ${formatCurrency(params.movement.amount)}
- status bancario exigido: OPEN
- ordenacao atual: vencimento ASC, numero da parcela ASC

OBSERVACAO SOBRE ISOLAMENTO:
- CO.sourceSystem e CO.sourceTenantId garantem que o popup mostre somente dados da empresa/escola atual.
- RI.bankMovementGroupId garante que parcelas pagas no mesmo PIX aparecam detalhadas dentro do mesmo lancamento.`;
}

export default function FinanceiroOpenBankMovementsPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [movements, setMovements] = useState<OpenBankMovement[]>([]);
  const [detailMovement, setDetailMovement] = useState<OpenBankMovement | null>(null);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [lockedBankId, setLockedBankId] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [movementPageSize, setMovementPageSize] = useState(10);
  const [movementPage, setMovementPage] = useState(1);
  const [movementStatusFilter, setMovementStatusFilter] =
    useState<GridStatusFilterValue>('ACTIVE');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.parent?.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: SCREEN_ID,
      },
      '*',
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncSelectedBankId = () => {
      const bankId = String(new URLSearchParams(window.location.search).get('bankId') || '').trim();
      setSelectedBankId(bankId);
      setLockedBankId(bankId);
    };

    syncSelectedBankId();
    window.addEventListener('popstate', syncSelectedBankId);
    window.addEventListener('hashchange', syncSelectedBankId);

    return () => {
      window.removeEventListener('popstate', syncSelectedBankId);
      window.removeEventListener('hashchange', syncSelectedBankId);
    };
  }, []);

  const selectedBank = useMemo(
    () => banks.find((item) => item.id === selectedBankId) || null,
    [banks, selectedBankId],
  );
  const movementTotalPages = Math.max(1, Math.ceil(movements.length / movementPageSize));
  const currentMovementPage = Math.min(movementPage, movementTotalPages);
  const paginatedMovements = useMemo(() => {
    const startIndex = (currentMovementPage - 1) * movementPageSize;
    return movements.slice(startIndex, startIndex + movementPageSize);
  }, [currentMovementPage, movements, movementPageSize]);
  const totalMovementAmount = useMemo(
    () => movements.reduce((total, movement) => roundMoney(total + movement.amount), 0),
    [movements],
  );
  const detailModalAudit = useMemo(() => {
    if (!detailMovement) {
      return null;
    }

    const selectedBankLabel =
      detailMovement.bankAccountLabel || (selectedBank ? buildBankLabel(selectedBank) : null);
    const params = {
      movement: detailMovement,
      runtimeContext,
      selectedBankLabel,
      search,
    };

    return {
      auditText: buildDetailModalAuditText(params),
      sqlText: buildDetailModalAuditSql(params),
    };
  }, [detailMovement, runtimeContext, search, selectedBank]);

  const loadPageData = useCallback(async () => {
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setBanks([]);
      setMovements([]);
      setDetailMovement(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const [loadedBanks, paidInstallments] = await Promise.all([
        getJson<BankItem[]>(
          `/banks${buildFinanceApiQueryString(runtimeContext, { status: 'ACTIVE' })}`,
        ),
        getJson<ReceivableInstallmentItem[]>(
          `/receivables/installments${buildFinanceApiQueryString(runtimeContext, {
            status: 'PAID',
            search: appliedSearch || undefined,
          })}`,
        ),
      ]);

      const activeBanks = loadedBanks.filter(
        (item) => String(item.status || '').trim().toUpperCase() === 'ACTIVE',
      );
      const openMovements = mapInstallmentsToOpenMovements(paidInstallments)
        .filter((movement) =>
          selectedBankId ? movement.bankAccountId === selectedBankId : Boolean(movement.bankAccountId),
        );

      setBanks(activeBanks);
      setMovements(openMovements);
      setDetailMovement((current) =>
        current ? openMovements.find((movement) => movement.id === current.id) || null : null,
      );
    } catch (currentError) {
      setBanks([]);
      setMovements([]);
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível carregar os movimentos em aberto.',
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [appliedSearch, runtimeContext, selectedBankId]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    setMovementPage(1);
  }, [movements.length, movementPageSize]);

  return (
    <div className="space-y-6">
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Bancos
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">
                  Movimentos em aberto
                </h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  Confira recebimentos vinculados ao banco antes da conciliação bancária.
                </p>
              </div>

              <Link
                href={`/bancos${preservedQueryString}`}
                className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar aos bancos
              </Link>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
            <ScreenNameCopy screenId={SCREEN_ID} className="justify-end" />
          </div>
        </section>
      ) : null}

      {error ? (
        <section className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}>
          {error}
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Banco
            </span>
            {lockedBankId ? (
              <div className="min-h-[46px] rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-black uppercase text-slate-700">
                {selectedBank ? buildBankLabel(selectedBank) : 'BANCO SELECIONADO'}
              </div>
            ) : (
              <select
                value={selectedBankId}
                onChange={(event) => setSelectedBankId(event.target.value)}
                className={inputClass}
              >
                <option value="">TODOS OS BANCOS</option>
                {banks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {buildBankLabel(item)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              Busca
            </span>
            <input
              value={search}
              onChange={(event) => {
                const nextSearch = event.target.value;
                setSearch(nextSearch);
                setAppliedSearch(nextSearch.trim());
              }}
              className={inputClass}
              placeholder="PAGADOR, HISTÓRICO OU PARCELA"
            />
          </label>
        </div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Histórico</th>
                <th className="px-4 py-3">Pessoa</th>
                <th className="px-4 py-3">Forma</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Parcelas</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {paginatedMovements.map((movement) => (
                <tr key={movement.id} className="border-t border-slate-100">
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {formatDateLabel(movement.occurredAt)}
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
                      {movement.movementType}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-black text-slate-900">{movement.description}</div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {movement.sourceLabel}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {movement.personName}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {normalizeMethodLabel(movement.paymentMethod)}
                  </td>
                  <td className="px-4 py-4 font-black text-slate-900">
                    {formatCurrency(movement.amount)}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-700">
                    {movement.installmentCount}
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                      Aberto
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setDetailMovement(movement)}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 transition hover:bg-blue-100"
                    >
                      Detalhar
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && !movements.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                    Nenhum movimento em aberto foi localizado para o banco selecionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <GridStandardFooter
          statusFilter={movementStatusFilter}
          totalRecords={movements.length}
          pageSize={movementPageSize}
          currentPage={currentMovementPage}
          totalPages={movementTotalPages}
          aggregateSummaries={[
            {
              label: 'Saldo total',
              value: formatCurrency(totalMovementAmount),
            },
          ]}
          recordSummaryVariant="pill"
          recordSummaryLabel="Registros"
          typographyVariant="school"
          onColumnSettings={() => undefined}
          onExport={() => {
            if (typeof window !== 'undefined') {
              window.print();
            }
          }}
          onStatusFilterChange={setMovementStatusFilter}
          onPageSizeChange={setMovementPageSize}
          onPageChange={setMovementPage}
        />
      </section>

      {detailMovement ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <section className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {runtimeContext.logoUrl ? (
                    <img
                      src={runtimeContext.logoUrl}
                      alt={`Logo de ${runtimeContext.companyName || 'EMPRESA'}`}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <span className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
                      {String(runtimeContext.companyName || 'FIN').slice(0, 3).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-600">
                    Parcelas do movimento
                  </div>
                  <h3 className="mt-1 text-xl font-black text-slate-900">
                    {detailMovement.personName}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {detailMovement.bankAccountLabel || 'BANCO NÃO INFORMADO'} - {normalizeMethodLabel(detailMovement.paymentMethod)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailMovement(null)}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.22em] text-slate-600 transition hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>

            <div className="max-h-[58vh] overflow-auto">
              <table className="min-w-full text-left text-sm text-slate-600">
                <thead className="sticky top-0 bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Parcela</th>
                    <th className="px-4 py-3">Histórico</th>
                    <th className="px-4 py-3">Pagador</th>
                    <th className="px-4 py-3">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {detailMovement.installments.map((installment) => (
                    <tr key={installment.id} className="border-t border-slate-100">
                      <td className="px-4 py-4 font-semibold text-slate-700">
                        {formatDateLabel(installment.dueDate)}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-700">
                        {installment.installmentNumber}/{installment.installmentCount}
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-black text-slate-900">{installment.description}</div>
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {installment.businessKey}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-700">
                        {installment.payerNameSnapshot}
                      </td>
                      <td className="px-4 py-4 font-black text-slate-900">
                        {formatCurrency(installment.paidAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <ScreenNameCopy
                    screenId={DETAIL_MODAL_SCREEN_ID}
                    label="Popup"
                    className="justify-start tracking-[0.22em]"
                    originText={DETAIL_MODAL_ORIGIN_TEXT}
                    auditText={detailModalAudit?.auditText}
                    sqlText={detailModalAudit?.sqlText}
                  />
                </div>
                <div className="text-right text-sm font-black uppercase tracking-[0.16em] text-slate-700">
                  Total do movimento: {formatCurrency(detailMovement.amount)}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
