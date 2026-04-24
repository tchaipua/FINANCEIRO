'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import GridExportModal from '@/app/components/grid-export-modal';
import { API_BASE_URL, getJson } from '@/app/lib/api';
import {
  formatDateLabel,
  getFriendlyRequestErrorMessage,
} from '@/app/lib/formatters';
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from '@/app/lib/grid-export-utils';
import {
  buildFinanceApiQueryString,
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

type BankItem = {
  id: string;
  companyId: string;
  companyName?: string | null;
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  status: string;
  bankCode: string;
  bankName: string;
  branchNumber: string;
  branchDigit?: string | null;
  accountNumber: string;
  accountDigit?: string | null;
  walletCode?: string | null;
  agreementCode?: string | null;
  pixKey?: string | null;
  beneficiaryName?: string | null;
  beneficiaryDocument?: string | null;
  billingProvider?: string | null;
  billingEnvironment?: string | null;
  billingApiClientId?: string | null;
  billingApiClientSecret?: string | null;
  billingCertificateBase64?: string | null;
  billingCertificatePassword?: string | null;
  billingBeneficiaryCode?: string | null;
  billingWalletVariation?: string | null;
  billingContractNumber?: string | null;
  billingModalityCode?: string | null;
  billingDocumentSpeciesCode?: string | null;
  billingAcceptanceCode?: string | null;
  billingIssueTypeCode?: string | null;
  billingDistributionTypeCode?: string | null;
  billingNextBoletoNumber?: number | null;
  billingRegisterPixCode?: number | null;
  billingInstructionLine1?: string | null;
  billingInstructionLine2?: string | null;
  billingDefaultFinePercent?: number | null;
  billingDefaultInterestPercent?: number | null;
  billingDefaultDiscountPercent?: number | null;
  billingProtestDays?: number | null;
  billingNegativeDays?: number | null;
  hasBillingApiCredentials?: boolean;
  hasBillingCertificate?: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  canceledAt?: string | null;
};

type ScopeState = {
  sourceSystem: string;
  sourceTenantId: string;
  companyName: string;
};

type BankFormState = {
  id: string | null;
  bankCode: string;
  bankName: string;
  branchNumber: string;
  branchDigit: string;
  accountNumber: string;
  accountDigit: string;
  walletCode: string;
  agreementCode: string;
  pixKey: string;
  beneficiaryName: string;
  beneficiaryDocument: string;
  billingProvider: string;
  billingEnvironment: string;
  billingApiClientId: string;
  billingApiClientSecret: string;
  billingCertificateBase64: string;
  billingCertificatePassword: string;
  billingBeneficiaryCode: string;
  billingWalletVariation: string;
  billingContractNumber: string;
  billingModalityCode: string;
  billingDocumentSpeciesCode: string;
  billingAcceptanceCode: string;
  billingIssueTypeCode: string;
  billingDistributionTypeCode: string;
  billingNextBoletoNumber: string;
  billingRegisterPixCode: string;
  billingInstructionLine1: string;
  billingInstructionLine2: string;
  billingDefaultFinePercent: string;
  billingDefaultInterestPercent: string;
  billingDefaultDiscountPercent: string;
  billingProtestDays: string;
  billingNegativeDays: string;
  notes: string;
};

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass =
  'w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white';
const textareaClass = `${inputClass} min-h-28 resize-y`;

type BankGridColumnKey =
  | 'bankName'
  | 'bankCode'
  | 'account'
  | 'wallet'
  | 'beneficiary'
  | 'status'
  | 'updatedAt';

type BankExportColumnKey =
  | BankGridColumnKey
  | 'companyName'
  | 'beneficiaryDocument'
  | 'pixKey'
  | 'createdAt'
  | 'notes';

type BankGridColumnDefinition = {
  key: BankGridColumnKey;
  label: string;
  visibleByDefault?: boolean;
  getValue: (bank: BankItem) => string;
};

type BankGridConfig = {
  order: BankGridColumnKey[];
  hidden: BankGridColumnKey[];
};

const BANK_GRID_COLUMNS: BankGridColumnDefinition[] = [
  {
    key: 'bankName',
    label: 'Banco',
    visibleByDefault: true,
    getValue: (bank) => bank.bankName || '---',
  },
  {
    key: 'bankCode',
    label: 'Código',
    visibleByDefault: true,
    getValue: (bank) => bank.bankCode || '---',
  },
  {
    key: 'account',
    label: 'Agência / Conta',
    visibleByDefault: true,
    getValue: (bank) =>
      `${bank.branchNumber || '---'}${bank.branchDigit ? `-${bank.branchDigit}` : ''} / ${bank.accountNumber || '---'}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`,
  },
  {
    key: 'wallet',
    label: 'Carteira / Convênio',
    visibleByDefault: false,
    getValue: (bank) => bank.walletCode || bank.agreementCode || '---',
  },
  {
    key: 'beneficiary',
    label: 'Beneficiário',
    visibleByDefault: true,
    getValue: (bank) => bank.beneficiaryName || bank.companyName || '---',
  },
  {
    key: 'status',
    label: 'Situação',
    visibleByDefault: true,
    getValue: (bank) => (bank.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'),
  },
  {
    key: 'updatedAt',
    label: 'Atualizado em',
    visibleByDefault: false,
    getValue: (bank) => formatDateLabel(bank.updatedAt),
  },
];

const DEFAULT_VISIBLE_BANK_COLUMNS = BANK_GRID_COLUMNS.filter(
  (column) => column.visibleByDefault,
).map((column) => column.key);

const BANK_EXPORT_COLUMNS: GridColumnDefinition<BankItem, BankExportColumnKey>[] = [
  {
    key: 'companyName',
    label: 'Empresa',
    getValue: (bank) => bank.companyName || '---',
  },
  {
    key: 'bankName',
    label: 'Banco',
    getValue: (bank) => bank.bankName || '---',
  },
  {
    key: 'bankCode',
    label: 'Código',
    getValue: (bank) => bank.bankCode || '---',
  },
  {
    key: 'account',
    label: 'Agência / Conta',
    getValue: (bank) =>
      `${bank.branchNumber || '---'}${bank.branchDigit ? `-${bank.branchDigit}` : ''} / ${bank.accountNumber || '---'}${bank.accountDigit ? `-${bank.accountDigit}` : ''}`,
  },
  {
    key: 'wallet',
    label: 'Carteira / Convênio',
    getValue: (bank) => bank.walletCode || bank.agreementCode || '---',
  },
  {
    key: 'beneficiary',
    label: 'Beneficiário',
    getValue: (bank) => bank.beneficiaryName || bank.companyName || '---',
  },
  {
    key: 'beneficiaryDocument',
    label: 'Documento do beneficiário',
    getValue: (bank) => bank.beneficiaryDocument || '---',
  },
  {
    key: 'pixKey',
    label: 'Chave PIX',
    getValue: (bank) => bank.pixKey || '---',
  },
  {
    key: 'status',
    label: 'Situação',
    getValue: (bank) => (bank.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO'),
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    getValue: (bank) => formatDateLabel(bank.createdAt),
  },
  {
    key: 'updatedAt',
    label: 'Atualizado em',
    getValue: (bank) => formatDateLabel(bank.updatedAt),
  },
  {
    key: 'notes',
    label: 'Observações',
    getValue: (bank) => bank.notes || '---',
  },
];

const DEFAULT_BANK_GRID_CONFIG: BankGridConfig = {
  order: BANK_GRID_COLUMNS.map((column) => column.key),
  hidden: BANK_GRID_COLUMNS.filter((column) => column.visibleByDefault === false).map(
    (column) => column.key,
  ),
};

const BANK_GRID_STORAGE_PREFIX = 'financeiro:bancos:grid-columns:';
const BANK_EXPORT_STORAGE_PREFIX = 'financeiro:bancos:export-config:';

function resolveSchoolBaseUrl() {
  if (typeof document === 'undefined' || !document.referrer) {
    return null;
  }

  try {
    const referrerUrl = new URL(document.referrer);
    return referrerUrl.origin;
  } catch {
    return null;
  }
}

function buildDefaultScope(
  runtimeContext: ReturnType<typeof useFinanceRuntimeContext>,
): ScopeState {
  return {
    sourceSystem: runtimeContext.sourceSystem || 'ESCOLA',
    sourceTenantId: runtimeContext.sourceTenantId || '',
    companyName: runtimeContext.companyName || '',
  };
}

function buildBankFormPath(queryString: string, bankId?: string | null) {
  const params = new URLSearchParams(
    queryString.startsWith('?') ? queryString.slice(1) : queryString,
  );

  if (String(bankId || '').trim()) {
    params.set('edit', String(bankId).trim());
  } else {
    params.delete('edit');
  }

  const query = params.toString();
  return `/bancos/novo${query ? `?${query}` : ''}`;
}

function formatOptionalNumericField(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return String(value);
}

function buildEmptyBankForm(companyName = ''): BankFormState {
  return {
    id: null,
    bankCode: '',
    bankName: '',
    branchNumber: '',
    branchDigit: '',
    accountNumber: '',
    accountDigit: '',
    walletCode: '',
    agreementCode: '',
    pixKey: '',
    beneficiaryName: companyName,
    beneficiaryDocument: '',
    billingProvider: '',
    billingEnvironment: '',
    billingApiClientId: '',
    billingApiClientSecret: '',
    billingCertificateBase64: '',
    billingCertificatePassword: '',
    billingBeneficiaryCode: '',
    billingWalletVariation: '',
    billingContractNumber: '',
    billingModalityCode: '',
    billingDocumentSpeciesCode: '',
    billingAcceptanceCode: '',
    billingIssueTypeCode: '',
    billingDistributionTypeCode: '',
    billingNextBoletoNumber: '',
    billingRegisterPixCode: '',
    billingInstructionLine1: '',
    billingInstructionLine2: '',
    billingDefaultFinePercent: '',
    billingDefaultInterestPercent: '',
    billingDefaultDiscountPercent: '',
    billingProtestDays: '',
    billingNegativeDays: '',
    notes: '',
  };
}

function buildFormFromBank(bank: BankItem): BankFormState {
  return {
    id: bank.id,
    bankCode: bank.bankCode,
    bankName: bank.bankName,
    branchNumber: bank.branchNumber,
    branchDigit: bank.branchDigit || '',
    accountNumber: bank.accountNumber,
    accountDigit: bank.accountDigit || '',
    walletCode: bank.walletCode || '',
    agreementCode: bank.agreementCode || '',
    pixKey: bank.pixKey || '',
    beneficiaryName: bank.beneficiaryName || '',
    beneficiaryDocument: bank.beneficiaryDocument || '',
    billingProvider: bank.billingProvider || '',
    billingEnvironment: bank.billingEnvironment || '',
    billingApiClientId: bank.billingApiClientId || '',
    billingApiClientSecret: bank.billingApiClientSecret || '',
    billingCertificateBase64: bank.billingCertificateBase64 || '',
    billingCertificatePassword: bank.billingCertificatePassword || '',
    billingBeneficiaryCode: bank.billingBeneficiaryCode || '',
    billingWalletVariation: bank.billingWalletVariation || '',
    billingContractNumber: bank.billingContractNumber || '',
    billingModalityCode: bank.billingModalityCode || '',
    billingDocumentSpeciesCode: bank.billingDocumentSpeciesCode || '',
    billingAcceptanceCode: bank.billingAcceptanceCode || '',
    billingIssueTypeCode: bank.billingIssueTypeCode || '',
    billingDistributionTypeCode: bank.billingDistributionTypeCode || '',
    billingNextBoletoNumber: formatOptionalNumericField(
      bank.billingNextBoletoNumber,
    ),
    billingRegisterPixCode: formatOptionalNumericField(
      bank.billingRegisterPixCode,
    ),
    billingInstructionLine1: bank.billingInstructionLine1 || '',
    billingInstructionLine2: bank.billingInstructionLine2 || '',
    billingDefaultFinePercent: formatOptionalNumericField(
      bank.billingDefaultFinePercent,
    ),
    billingDefaultInterestPercent: formatOptionalNumericField(
      bank.billingDefaultInterestPercent,
    ),
    billingDefaultDiscountPercent: formatOptionalNumericField(
      bank.billingDefaultDiscountPercent,
    ),
    billingProtestDays: formatOptionalNumericField(bank.billingProtestDays),
    billingNegativeDays: formatOptionalNumericField(bank.billingNegativeDays),
    notes: bank.notes || '',
  };
}

function normalizeUppercase(value: string) {
  return value.trim().toUpperCase();
}

function normalizeOptionalDecimal(value: string, label: string) {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) {
    return {
      value: undefined as number | undefined,
    };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      error: `Informe ${label} válida.`,
    };
  }

  return {
    value: Number(parsed.toFixed(2)),
  };
}

function normalizeOptionalInteger(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    return {
      value: undefined as number | undefined,
    };
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      error: `Informe ${label} válido.`,
    };
  }

  return {
    value: parsed,
  };
}

function getBankGridStorageKey(tenantId: string | null) {
  return `${BANK_GRID_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getBankExportStorageKey(tenantId: string | null) {
  return `${BANK_EXPORT_STORAGE_PREFIX}${tenantId || 'default'}`;
}

function normalizeBankGridConfig(config: Partial<BankGridConfig> | string[] | null | undefined): BankGridConfig {
  if (Array.isArray(config)) {
    const validVisibleKeys = config.filter((item): item is BankGridColumnKey =>
      BANK_GRID_COLUMNS.some((column) => column.key === item),
    );
    const missingKeys = BANK_GRID_COLUMNS.map((column) => column.key).filter(
      (key) => !validVisibleKeys.includes(key),
    );

    return {
      order: [...validVisibleKeys, ...missingKeys],
      hidden: missingKeys.filter((key) =>
        BANK_GRID_COLUMNS.some((column) => column.key === key),
      ),
    };
  }

  const validOrder = (config?.order || []).filter((item): item is BankGridColumnKey =>
    BANK_GRID_COLUMNS.some((column) => column.key === item),
  );
  const allKeys = BANK_GRID_COLUMNS.map((column) => column.key);
  const normalizedOrder = [...validOrder, ...allKeys.filter((key) => !validOrder.includes(key))];
  const validHidden = (config?.hidden || []).filter((item): item is BankGridColumnKey =>
    BANK_GRID_COLUMNS.some((column) => column.key === item),
  );

  return {
    order: normalizedOrder,
    hidden: Array.from(new Set(validHidden)),
  };
}

function readStoredBankGridConfig(tenantId: string | null) {
  if (typeof window === 'undefined') {
    return DEFAULT_BANK_GRID_CONFIG;
  }

  try {
    const rawValue = window.localStorage.getItem(getBankGridStorageKey(tenantId));
    if (!rawValue) {
      return DEFAULT_BANK_GRID_CONFIG;
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeBankGridConfig(parsed as string[]);
    }

    if (parsed && typeof parsed === 'object') {
      return normalizeBankGridConfig(parsed as Partial<BankGridConfig>);
    }

    return DEFAULT_BANK_GRID_CONFIG;
  } catch {
    return DEFAULT_BANK_GRID_CONFIG;
  }
}

function getVisibleBankColumns(order: BankGridColumnKey[], hidden: BankGridColumnKey[]) {
  const hiddenSet = new Set(hidden);
  return order.filter((columnKey) => !hiddenSet.has(columnKey));
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return items;
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  if (item === undefined) {
    return items;
  }

  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

type BankGridConfigModalProps = {
  isOpen: boolean;
  title: string;
  description: string;
  columns: BankGridColumnDefinition[];
  order: BankGridColumnKey[];
  hidden: BankGridColumnKey[];
  onSave: (order: BankGridColumnKey[], hidden: BankGridColumnKey[]) => void;
  onClose: () => void;
};

function BankGridConfigModal({
  isOpen,
  title,
  description,
  columns,
  order,
  hidden,
  onSave,
  onClose,
}: BankGridConfigModalProps) {
  const [draftOrder, setDraftOrder] = useState<BankGridColumnKey[]>(order);
  const [draftHidden, setDraftHidden] = useState<BankGridColumnKey[]>(hidden);
  const [draggedColumnKey, setDraggedColumnKey] = useState<BankGridColumnKey | null>(null);
  const [activeColumnKey, setActiveColumnKey] = useState<BankGridColumnKey | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraggedColumnKey(null);
      setActiveColumnKey(null);
      return;
    }

    setDraftOrder(order);
    setDraftHidden(hidden);
  }, [hidden, isOpen, order]);

  if (!isOpen) {
    return null;
  }

  const visibleCount = draftOrder.filter((columnKey) => !draftHidden.includes(columnKey)).length;

  const moveColumnToIndex = (columnKey: BankGridColumnKey, targetIndex: number) => {
    const currentIndex = draftOrder.indexOf(columnKey);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return;
    }

    setDraftOrder((current) => moveArrayItem(current, currentIndex, targetIndex));
    setActiveColumnKey(columnKey);
  };

  const toggleColumnVisibility = (columnKey: BankGridColumnKey) => {
    setDraftHidden((current) =>
      current.includes(columnKey)
        ? current.filter((item) => item !== columnKey)
        : [...current, columnKey],
    );
    setActiveColumnKey(columnKey);
  };

  const handleSave = () => {
    onSave(draftOrder, draftHidden);
    onClose();
  };

  const handleReset = () => {
    setDraftOrder(DEFAULT_BANK_GRID_CONFIG.order);
    setDraftHidden(DEFAULT_BANK_GRID_CONFIG.hidden);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-blue-600">
              Configuração da tela
            </div>
            <h2 className="mt-1 truncate text-2xl font-black text-slate-900">{title}</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-700">
                  Colunas visíveis: {visibleCount}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  Reordene, oculte ou inclua colunas do grid nesta tela.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Restaurar padrão
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-2xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
                >
                  Salvar / Fechar Configuração
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-3">
              {draftOrder.map((columnKey, index) => {
                const column = columns.find((item) => item.key === columnKey);
                if (!column) {
                  return null;
                }

                const isHidden = draftHidden.includes(columnKey);
                const isDragging = draggedColumnKey === columnKey;
                const isActive = activeColumnKey === columnKey || isDragging;

                return (
                  <div
                    key={column.key}
                    draggable
                    onClick={() => setActiveColumnKey(column.key)}
                    onDragStart={() => {
                      setActiveColumnKey(column.key);
                      setDraggedColumnKey(column.key);
                    }}
                    onDragEnd={() => setDraggedColumnKey(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedColumnKey) {
                        return;
                      }

                      moveColumnToIndex(draggedColumnKey, index);
                      setDraggedColumnKey(null);
                    }}
                    className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 transition ${
                      isActive
                        ? 'border-emerald-300 bg-emerald-100/90 ring-2 ring-emerald-300'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleColumnVisibility(column.key);
                        }}
                        aria-pressed={!isHidden}
                        title={!isHidden ? 'Esta coluna esta sendo usada no grid' : 'Esta coluna nao esta sendo usada no grid'}
                        className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-sm transition-transform hover:scale-105 ${
                          isHidden
                            ? 'border-rose-200 bg-rose-500 text-white shadow-rose-200/80'
                            : 'border-emerald-200 bg-emerald-500 text-white shadow-emerald-200/80'
                        }`}
                      >
                        {isHidden ? (
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        ) : (
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <div>
                        <div className="text-sm font-black text-slate-800">{column.label}</div>
                        <div className="text-xs font-medium text-slate-500">
                          {column.visibleByDefault === false ? 'Coluna extra' : 'Coluna padrão'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveColumnToIndex(column.key, Math.max(index - 1, 0));
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                        title="Mover para cima"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          moveColumnToIndex(column.key, Math.min(index + 1, draftOrder.length - 1));
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
                        title="Mover para baixo"
                      >
                        ↓
                      </button>
                      <span
                        className="inline-flex h-10 w-10 cursor-grab items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:cursor-grabbing"
                        title="Clique e segure para arrastar esta coluna"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
                        </svg>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinanceiroBanksPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const router = useRouter();
  const pathname = usePathname();
  const isCreateRoute = pathname.startsWith('/bancos/novo');
  const preservedQueryString = useMemo(
    () => buildFinanceNavigationQueryString(runtimeContext),
    [runtimeContext],
  );
  const defaultScope = useMemo(
    () => buildDefaultScope(runtimeContext),
    [runtimeContext],
  );

  const [scope, setScope] = useState<ScopeState>(defaultScope);
  const [filters, setFilters] = useState({
    search: '',
    status: 'ACTIVE',
  });
  const [query, setQuery] = useState({
    search: '',
    status: 'ACTIVE',
  });
  const [columnOrder, setColumnOrder] = useState<BankGridColumnKey[]>(
    DEFAULT_BANK_GRID_CONFIG.order,
  );
  const [hiddenColumns, setHiddenColumns] = useState<BankGridColumnKey[]>(
    DEFAULT_BANK_GRID_CONFIG.hidden,
  );
  const [isColumnConfigOpen, setIsColumnConfigOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>('excel');
  const [exportColumns, setExportColumns] = useState<Record<BankExportColumnKey, boolean>>(
    buildDefaultExportColumns(BANK_EXPORT_COLUMNS),
  );
  const [form, setForm] = useState<BankFormState>(
    buildEmptyBankForm(defaultScope.companyName),
  );
  const [banks, setBanks] = useState<BankItem[]>([]);
  const [schoolBaseUrl, setSchoolBaseUrl] = useState<string | null>(null);
  const [editBankId, setEditBankId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingForm, setIsLoadingForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionBankId, setActionBankId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeBankColumns = useMemo(
    () =>
      getVisibleBankColumns(columnOrder, hiddenColumns)
        .map((columnKey) => BANK_GRID_COLUMNS.find((column) => column.key === columnKey))
        .filter((column): column is BankGridColumnDefinition => Boolean(column)),
    [columnOrder, hiddenColumns],
  );
  const shouldReturnToSchoolMenu = Boolean(runtimeContext.embedded && schoolBaseUrl);
  const backToMenuHref = shouldReturnToSchoolMenu
    ? `${schoolBaseUrl}/principal/financeiro`
    : `/${preservedQueryString}`;
  const companyDisplayName =
    scope.companyName.trim() ||
    runtimeContext.companyName ||
    'EMPRESA ATUAL';
  const bankFormHref = useMemo(
    () => buildBankFormPath(preservedQueryString),
    [preservedQueryString],
  );
  const hasBillingCredentials = Boolean(
    form.billingApiClientId.trim() && form.billingApiClientSecret.trim(),
  );
  const hasBillingCertificate = Boolean(
    form.billingCertificateBase64.trim() && form.billingCertificatePassword.trim(),
  );

  const scopeReady = Boolean(
    scope.sourceSystem.trim() && scope.sourceTenantId.trim(),
  );

  useEffect(() => {
    setSchoolBaseUrl(resolveSchoolBaseUrl());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncEditBankId = () =>
      setEditBankId(
        String(new URLSearchParams(window.location.search).get('edit') || '').trim(),
      );

    syncEditBankId();
    window.addEventListener('popstate', syncEditBankId);
    window.addEventListener('hashchange', syncEditBankId);

    return () => {
      window.removeEventListener('popstate', syncEditBankId);
      window.removeEventListener('hashchange', syncEditBankId);
    };
  }, [pathname]);

  useEffect(() => {
    setScope(defaultScope);
    setForm((current) =>
      current.id ? current : buildEmptyBankForm(defaultScope.companyName),
    );
  }, [defaultScope]);

  useEffect(() => {
    if (!isCreateRoute) {
      setIsLoadingForm(false);
      return;
    }

    if (!editBankId) {
      setIsLoadingForm(false);
      setForm(buildEmptyBankForm(scope.companyName || defaultScope.companyName));
      return;
    }

    if (!scopeReady) {
      return;
    }

    let isActive = true;

    const loadBankDetail = async () => {
      try {
        setIsLoadingForm(true);
        setError(null);
        setStatusMessage(null);

        const bank = await getJson<BankItem>(
          `/banks/${editBankId}${buildFinanceApiQueryString(runtimeContext, {
            sourceSystem: normalizeUppercase(scope.sourceSystem),
            sourceTenantId: normalizeUppercase(scope.sourceTenantId),
          })}`,
        );

        if (!isActive) {
          return;
        }

        setForm(buildFormFromBank(bank));
      } catch (currentError) {
        if (!isActive) {
          return;
        }

        setError(
          getFriendlyRequestErrorMessage(
            currentError,
            'Não foi possível carregar o banco para edição.',
          ),
        );
      } finally {
        if (isActive) {
          setIsLoadingForm(false);
        }
      }
    };

    void loadBankDetail();

    return () => {
      isActive = false;
    };
  }, [
    defaultScope.companyName,
    editBankId,
    isCreateRoute,
    runtimeContext,
    scope.companyName,
    scope.sourceSystem,
    scope.sourceTenantId,
    scopeReady,
  ]);

  useEffect(() => {
    const storedConfig = readStoredBankGridConfig(runtimeContext.sourceTenantId);
    setColumnOrder(storedConfig.order);
    setHiddenColumns(storedConfig.hidden);
    setIsColumnConfigOpen(false);
  }, [runtimeContext.sourceTenantId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getBankGridStorageKey(runtimeContext.sourceTenantId),
      JSON.stringify({
        order: columnOrder,
        hidden: hiddenColumns,
      }),
    );
  }, [runtimeContext.sourceTenantId, columnOrder, hiddenColumns]);

  const loadBanks = useCallback(
    async (currentQuery = query) => {
      if (!scopeReady) {
        setBanks([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        setBanks(
          await getJson<BankItem[]>(
            `/banks${buildFinanceApiQueryString(runtimeContext, {
              sourceSystem: normalizeUppercase(scope.sourceSystem),
              sourceTenantId: normalizeUppercase(scope.sourceTenantId),
              search: currentQuery.search.trim()
                ? normalizeUppercase(currentQuery.search)
                : undefined,
              status:
                currentQuery.status && currentQuery.status !== 'ALL'
                  ? currentQuery.status
                  : undefined,
            })}`,
          ),
        );
      } catch (currentError) {
        setBanks([]);
        setError(
          getFriendlyRequestErrorMessage(
            currentError,
            'Não foi possível carregar os bancos financeiros.',
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [query, runtimeContext, scope.sourceSystem, scope.sourceTenantId, scopeReady],
  );

  useEffect(() => {
    void loadBanks();
  }, [loadBanks]);

  const showClearQueryButton =
    Boolean(filters.search.trim()) || filters.status !== 'ACTIVE';

  function resetForm() {
    setError(null);
    setStatusMessage(null);

    if (isCreateRoute && editBankId) {
      setEditBankId('');
      router.replace(bankFormHref);
      return;
    }

    setForm(buildEmptyBankForm(scope.companyName));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = {
      search: filters.search,
      status: filters.status,
    };

    setQuery(nextQuery);
    void loadBanks(nextQuery);
  }

  function handleStatusFilter(nextStatus: 'ALL' | 'ACTIVE' | 'INACTIVE') {
    const nextQuery = {
      search: filters.search,
      status: nextStatus,
    };

    setFilters((current) => ({
      ...current,
      status: nextStatus,
    }));
    setQuery(nextQuery);
    void loadBanks(nextQuery);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!scopeReady) {
      setError('Informe o sistema e o tenant da empresa antes de salvar o banco.');
      return;
    }

    const finePercent = normalizeOptionalDecimal(
      form.billingDefaultFinePercent,
      'a multa padrão',
    );
    if (finePercent.error) {
      setError(finePercent.error);
      return;
    }

    const interestPercent = normalizeOptionalDecimal(
      form.billingDefaultInterestPercent,
      'o juro padrão',
    );
    if (interestPercent.error) {
      setError(interestPercent.error);
      return;
    }

    const discountPercent = normalizeOptionalDecimal(
      form.billingDefaultDiscountPercent,
      'o desconto padrão',
    );
    if (discountPercent.error) {
      setError(discountPercent.error);
      return;
    }

    const protestDays = normalizeOptionalInteger(
      form.billingProtestDays,
      'os dias de protesto',
    );
    if (protestDays.error) {
      setError(protestDays.error);
      return;
    }

    const negativeDays = normalizeOptionalInteger(
      form.billingNegativeDays,
      'os dias de negativação',
    );
    if (negativeDays.error) {
      setError(negativeDays.error);
      return;
    }

    const nextBoletoNumber = normalizeOptionalInteger(
      form.billingNextBoletoNumber,
      'o próximo boleto',
    );
    if (nextBoletoNumber.error) {
      setError(nextBoletoNumber.error);
      return;
    }

    const registerPixCode = normalizeOptionalInteger(
      form.billingRegisterPixCode,
      'o código de PIX',
    );
    if (registerPixCode.error) {
      setError(registerPixCode.error);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/banks${form.id ? `/${form.id}` : ''}`,
        {
          method: form.id ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: normalizeUppercase(scope.sourceSystem),
            sourceTenantId: normalizeUppercase(scope.sourceTenantId),
            companyName: scope.companyName.trim()
              ? normalizeUppercase(scope.companyName)
              : undefined,
            bankCode: form.bankCode,
            bankName: form.bankName,
            branchNumber: form.branchNumber,
            branchDigit: form.branchDigit || undefined,
            accountNumber: form.accountNumber,
            accountDigit: form.accountDigit || undefined,
            walletCode: form.walletCode || undefined,
            agreementCode: form.agreementCode || undefined,
            pixKey: form.pixKey || undefined,
            beneficiaryName: form.beneficiaryName || undefined,
            beneficiaryDocument: form.beneficiaryDocument || undefined,
            billingProvider: form.billingProvider || undefined,
            billingEnvironment: form.billingEnvironment || undefined,
            billingApiClientId: form.billingApiClientId || undefined,
            billingApiClientSecret: form.billingApiClientSecret || undefined,
            billingCertificateBase64:
              form.billingCertificateBase64 || undefined,
            billingCertificatePassword:
              form.billingCertificatePassword || undefined,
            billingBeneficiaryCode:
              form.billingBeneficiaryCode || undefined,
            billingWalletVariation:
              form.billingWalletVariation || undefined,
            billingContractNumber:
              form.billingContractNumber || undefined,
            billingModalityCode:
              form.billingModalityCode || undefined,
            billingDocumentSpeciesCode:
              form.billingDocumentSpeciesCode || undefined,
            billingAcceptanceCode:
              form.billingAcceptanceCode || undefined,
            billingIssueTypeCode:
              form.billingIssueTypeCode || undefined,
            billingDistributionTypeCode:
              form.billingDistributionTypeCode || undefined,
            billingNextBoletoNumber: nextBoletoNumber.value,
            billingRegisterPixCode: registerPixCode.value,
            billingInstructionLine1:
              form.billingInstructionLine1 || undefined,
            billingInstructionLine2:
              form.billingInstructionLine2 || undefined,
            billingDefaultFinePercent: finePercent.value,
            billingDefaultInterestPercent: interestPercent.value,
            billingDefaultDiscountPercent: discountPercent.value,
            billingProtestDays: protestDays.value,
            billingNegativeDays: negativeDays.value,
            notes: form.notes || undefined,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | BankItem
        | {
            message?: string;
          }
        | null;
      const errorMessage =
        payload && 'message' in payload ? payload.message : undefined;
      if (!response.ok) {
        throw new Error(errorMessage || 'Não foi possível salvar o banco.');
      }

      setStatusMessage(
        form.id
          ? 'Banco atualizado com sucesso no core financeiro.'
          : 'Banco cadastrado com sucesso no core financeiro.',
      );

      if (form.id && payload && 'id' in payload) {
        setForm(buildFormFromBank(payload));
      } else {
        setForm(buildEmptyBankForm(scope.companyName));
      }

      await loadBanks();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível salvar o banco.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangeStatus(bank: BankItem, nextStatus: 'ACTIVE' | 'INACTIVE') {
    if (!scopeReady) {
      setError('Informe o sistema e o tenant da empresa antes de alterar o status do banco.');
      return;
    }

    try {
      setActionBankId(bank.id);
      setError(null);
      setStatusMessage(null);

      const response = await fetch(
        `${API_BASE_URL}/banks/${bank.id}/${nextStatus === 'ACTIVE' ? 'activate' : 'inactivate'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sourceSystem: normalizeUppercase(scope.sourceSystem),
            sourceTenantId: normalizeUppercase(scope.sourceTenantId),
          }),
        },
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || 'Não foi possível alterar o status do banco.',
        );
      }

      setStatusMessage(
        nextStatus === 'ACTIVE'
          ? 'Banco reativado com sucesso.'
          : 'Banco inativado com sucesso.',
      );
      await loadBanks();
    } catch (currentError) {
      setError(
        getFriendlyRequestErrorMessage(
          currentError,
          'Não foi possível alterar o status do banco.',
        ),
      );
    } finally {
      setActionBankId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Controle de Bancos</h1>
            </div>

            {shouldReturnToSchoolMenu ? (
              <a
                href={backToMenuHref}
                target="_top"
                rel="noreferrer"
                className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar ao Menu
              </a>
            ) : (
              <Link
                href={backToMenuHref}
                className="inline-flex items-center self-start rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/20"
              >
                Voltar ao Menu
              </Link>
            )}
          </div>
        </div>
      </section>

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} p-6`}>
          <div className="grid gap-4 md:grid-cols-3">
            <input
              value={scope.sourceSystem}
              onChange={(event) =>
                setScope((current) => ({
                  ...current,
                  sourceSystem: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="SISTEMA ORIGEM"
            />
            <input
              value={scope.sourceTenantId}
              onChange={(event) =>
                setScope((current) => ({
                  ...current,
                  sourceTenantId: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="TENANT DE ORIGEM"
            />
            <input
              value={scope.companyName}
              onChange={(event) =>
                setScope((current) => ({
                  ...current,
                  companyName: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="NOME DA EMPRESA"
            />
          </div>
        </section>
      ) : null}

      {!isCreateRoute ? null : (
        <section className={`${cardClass} p-6`}>
          <Link
            href={`/bancos${preservedQueryString}`}
            className="inline-flex rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
          >
            Voltar para a listagem
          </Link>
        </section>
      )}

      {statusMessage ? (
        <section
          className={`${cardClass} border-emerald-200 bg-emerald-50 px-6 py-5 text-sm font-semibold text-emerald-700`}
        >
          {statusMessage}
        </section>
      ) : null}

      {error ? (
        <section
          className={`${cardClass} border-rose-200 bg-rose-50 px-6 py-5 text-sm font-semibold text-rose-700`}
        >
          {error}
        </section>
      ) : null}

      {!isCreateRoute ? (
        <section className={`${cardClass} p-6`}>
          <form
            onSubmit={handleSearch}
            className="grid gap-4 xl:grid-cols-[auto_1fr_auto_auto]"
          >
            <Link
              href={bankFormHref}
              title="INCLUIR NOVO BANCO"
              aria-label="INCLUIR NOVO BANCO"
              className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </Link>
            <input
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="PESQUISAR POR BANCO, CÓDIGO, AGÊNCIA, CONTA OU BENEFICIÁRIO"
            />
            <button
              type="submit"
              title="PESQUISAR"
              aria-label="PESQUISAR"
              className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
            {showClearQueryButton ? (
              <button
                type="button"
                title="LIMPAR CONSULTA"
                aria-label="LIMPAR CONSULTA"
                onClick={() => {
                  const resetQuery = {
                    search: '',
                    status: 'ACTIVE',
                  };

                  setFilters(resetQuery);
                  setQuery(resetQuery);
                  void loadBanks(resetQuery);
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-rose-500 px-6 py-3 text-white shadow-lg shadow-rose-500/25 transition hover:bg-rose-600"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path d="M9 9l6 6" />
                  <path d="M15 9l-6 6" />
                </svg>
              </button>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="grid gap-6">
        {isCreateRoute ? (
          <form onSubmit={handleSubmit} className={`${cardClass} p-6`}>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
            {editBankId ? 'Editar banco' : 'Novo banco'}
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-900">
            {editBankId ? 'Atualizar cadastro bancário' : 'Cadastrar banco e conta'}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isLoadingForm ? (
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
                Carregando cadastro
              </span>
            ) : null}
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                hasBillingCredentials
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              {hasBillingCredentials ? 'Credenciais preenchidas' : 'Sem credenciais'}
            </span>
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                hasBillingCertificate
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              {hasBillingCertificate ? 'Certificado preenchido' : 'Sem certificado'}
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                required
                value={form.bankCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bankCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CÓDIGO DO BANCO"
              />
              <input
                required
                value={form.bankName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bankName: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="NOME DO BANCO"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                required
                value={form.branchNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    branchNumber: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="AGÊNCIA"
              />
              <input
                value={form.branchDigit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    branchDigit: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="DÍGITO DA AGÊNCIA"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                required
                value={form.accountNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    accountNumber: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CONTA"
              />
              <input
                value={form.accountDigit}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    accountDigit: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="DÍGITO DA CONTA"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.walletCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    walletCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CARTEIRA"
              />
              <input
                value={form.agreementCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    agreementCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CONVÊNIO"
              />
            </div>

            <input
              value={form.pixKey}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pixKey: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="CHAVE PIX"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.beneficiaryName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    beneficiaryName: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="NOME DO BENEFICIÁRIO"
              />
              <input
                value={form.beneficiaryDocument}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    beneficiaryDocument: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CPF/CNPJ DO BENEFICIÁRIO"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Configuração de boleto
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">
                Preencha os dados bancários e as credenciais do provedor que emitirá os boletos.
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <select
                value={form.billingProvider}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingProvider: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">PROVEDOR DE BOLETO</option>
                <option value="SICOOB">SICOOB</option>
                <option value="SICREDI">SICREDI</option>
                <option value="BANCO DO BRASIL">BANCO DO BRASIL</option>
                <option value="CAIXA">CAIXA</option>
                <option value="BRADESCO">BRADESCO</option>
                <option value="ITAU">ITAU</option>
                <option value="SANTANDER">SANTANDER</option>
                <option value="OUTRO">OUTRO</option>
              </select>
              <select
                value={form.billingEnvironment}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingEnvironment: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">AMBIENTE DE EMISSÃO</option>
                <option value="HOMOLOGACAO">HOMOLOGAÇÃO</option>
                <option value="PRODUCAO">PRODUÇÃO</option>
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.billingBeneficiaryCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingBeneficiaryCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CÓDIGO DO BENEFICIÁRIO NO BANCO"
              />
              <input
                value={form.billingWalletVariation}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingWalletVariation: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="VARIAÇÃO DA CARTEIRA"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.billingContractNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingContractNumber: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="NÚMERO DO CONTRATO"
              />
              <input
                value={form.billingModalityCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingModalityCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="MODALIDADE"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.billingDocumentSpeciesCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingDocumentSpeciesCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="ESPÉCIE DO DOCUMENTO"
              />
              <input
                value={form.billingAcceptanceCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingAcceptanceCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="ACEITE (S/N)"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.billingIssueTypeCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingIssueTypeCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="IDENTIFICAÇÃO DE EMISSÃO"
              />
              <input
                value={form.billingDistributionTypeCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingDistributionTypeCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="IDENTIFICAÇÃO DE DISTRIBUIÇÃO"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.billingApiClientId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingApiClientId: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CLIENT ID / APP KEY"
              />
              <input
                type="password"
                value={form.billingApiClientSecret}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingApiClientSecret: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CLIENT SECRET"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="number"
                min="0"
                step="1"
                value={form.billingNextBoletoNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingNextBoletoNumber: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="PRÓXIMO NÚMERO DO BOLETO"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={form.billingRegisterPixCode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingRegisterPixCode: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="CÓDIGO PARA CADASTRAR PIX"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <textarea
                value={form.billingCertificateBase64}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingCertificateBase64: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="CERTIFICADO EM BASE64"
              />
              <input
                type="password"
                value={form.billingCertificatePassword}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingCertificatePassword: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="SENHA DO CERTIFICADO"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={form.billingInstructionLine1}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingInstructionLine1: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="INSTRUÇÃO DE BOLETO 1"
              />
              <input
                value={form.billingInstructionLine2}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingInstructionLine2: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="INSTRUÇÃO DE BOLETO 2"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.billingDefaultFinePercent}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingDefaultFinePercent: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="MULTA %"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.billingDefaultInterestPercent}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingDefaultInterestPercent: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="JUROS %"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.billingDefaultDiscountPercent}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingDefaultDiscountPercent: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="DESCONTO %"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="number"
                min="0"
                step="1"
                value={form.billingProtestDays}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingProtestDays: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="DIAS PARA PROTESTO"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={form.billingNegativeDays}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    billingNegativeDays: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="DIAS PARA NEGATIVAÇÃO"
              />
            </div>

            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              className={textareaClass}
              placeholder="OBSERVAÇÕES DO CADASTRO BANCÁRIO"
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSubmitting || isLoadingForm || !scopeReady}
                className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-70"
              >
                {isSubmitting
                  ? form.id
                    ? 'Atualizando...'
                    : 'Salvando...'
                  : form.id
                    ? 'Atualizar banco'
                    : 'Cadastrar banco'}
              </button>

              {editBankId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </div>
          </form>
        ) : null}

      {!isCreateRoute ? (
        <>
        <section className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              Consulta bancária
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">
              {isLoading ? 'Carregando...' : `${banks.length} banco(s) encontrado(s)`}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  {activeBankColumns.map((column) => (
                    <th key={column.key} className="px-4 py-3">
                      {column.label}
                    </th>
                  ))}
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {banks.map((bank) => (
                  <tr key={bank.id} className="border-t border-slate-100">
                    {activeBankColumns.map((column) => {
                      if (column.key === 'status') {
                        return (
                          <td key={column.key} className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                                bank.status === 'ACTIVE'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {column.getValue(bank)}
                            </span>
                          </td>
                        );
                      }

                      if (column.key === 'bankName') {
                        return (
                          <td key={column.key} className="px-4 py-4">
                            <div className="font-black text-slate-900">
                              {bank.bankName}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              CÓDIGO {bank.bankCode}
                            </div>
                          </td>
                        );
                      }

                      if (column.key === 'bankCode') {
                        return (
                          <td key={column.key} className="px-4 py-4 font-semibold text-slate-700">
                            {bank.bankCode}
                          </td>
                        );
                      }

                      if (column.key === 'account') {
                        return (
                          <td key={column.key} className="px-4 py-4">
                            <div className="font-semibold text-slate-700">
                              AG {bank.branchNumber}
                              {bank.branchDigit ? `-${bank.branchDigit}` : ''}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              CC {bank.accountNumber}
                              {bank.accountDigit ? `-${bank.accountDigit}` : ''}
                            </div>
                          </td>
                        );
                      }

                      if (column.key === 'wallet') {
                        return (
                          <td key={column.key} className="px-4 py-4">
                            <div className="font-semibold text-slate-700">
                              {bank.walletCode || bank.agreementCode || '---'}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              PIX {bank.pixKey || '---'}
                            </div>
                          </td>
                        );
                      }

                      if (column.key === 'beneficiary') {
                        return (
                          <td key={column.key} className="px-4 py-4">
                            <div className="font-semibold text-slate-700">
                              {bank.beneficiaryName || bank.companyName || '---'}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {bank.beneficiaryDocument || '---'}
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={column.key} className="px-4 py-4">
                          {column.getValue(bank)}
                        </td>
                      );
                    })}
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={buildBankFormPath(preservedQueryString, bank.id)}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-600 transition hover:bg-slate-50"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          disabled={actionBankId === bank.id}
                          onClick={() =>
                            void handleChangeStatus(
                              bank,
                              bank.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                            )
                          }
                          className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition disabled:opacity-70 ${
                            bank.status === 'ACTIVE'
                              ? 'bg-rose-600 hover:bg-rose-700'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                          }`}
                        >
                          {actionBankId === bank.id
                            ? 'Processando...'
                            : bank.status === 'ACTIVE'
                              ? 'Inativar'
                              : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!isLoading && !banks.length ? (
                  <tr>
                    <td
                      colSpan={activeBankColumns.length + 1}
                      className="px-4 py-10 text-center text-sm font-semibold text-slate-500"
                    >
                      Nenhum banco foi localizado para a empresa e o filtro informados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsColumnConfigOpen(true)}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                ☰ Colunas
              </button>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                aria-label="Imprimir"
                title="Imprimir"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-blue-600"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9V4h12v5" />
                  <path d="M6 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" />
                  <path d="M6 14h12v6H6z" />
                  <path d="M17 12h.01" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-center gap-2">
              {[
                {
                  value: 'ACTIVE',
                  label: 'Ativos',
                  tone: 'bg-emerald-500',
                  activeTone: 'bg-emerald-700',
                  dot: 'bg-white',
                },
                {
                  value: 'ALL',
                  label: 'Todos',
                  tone: 'bg-amber-200',
                  activeTone: 'bg-amber-400',
                  dot: 'bg-white',
                },
                {
                  value: 'INACTIVE',
                  label: 'Inativos',
                  tone: 'bg-rose-200',
                  activeTone: 'bg-rose-400',
                  dot: 'bg-white',
                },
              ].map((item) => {
                const isActive = filters.status === item.value;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleStatusFilter(item.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                    aria-label={item.label}
                    title={item.label}
                    aria-pressed={isActive}
                    className={`relative h-6 w-14 rounded-full border transition duration-200 ${
                      isActive
                        ? `${item.activeTone} border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.22)] ring-4 ring-slate-400 ring-offset-2 ring-offset-slate-100 scale-105`
                        : `${item.tone} border-transparent opacity-55 hover:opacity-85`
                    }`}
                  >
                    <span
                      className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm ${item.dot} ${
                        isActive ? 'right-1' : 'left-1'
                      }`}
                    />
                    <span className="sr-only">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-right text-sm font-black uppercase tracking-[0.14em] text-slate-700">
              Registros exibidos ({banks.length})
            </div>
          </div>
        </section>
        <BankGridConfigModal
          isOpen={isColumnConfigOpen}
          title="Configurar colunas do grid"
          description="Reordene, oculte ou inclua colunas do cadastro de bancos nesta tela."
          columns={BANK_GRID_COLUMNS}
          order={columnOrder}
          hidden={hiddenColumns}
          onSave={(order, hidden) => {
            setColumnOrder(order);
            setHiddenColumns(hidden);
          }}
          onClose={() => setIsColumnConfigOpen(false)}
        />
        <GridExportModal
          isOpen={isExportModalOpen}
          title="Exportar bancos"
          description={`A exportação respeita a busca atual e inclui ${banks.length} registro(s).`}
          format={exportFormat}
          onFormatChange={setExportFormat}
          columns={BANK_EXPORT_COLUMNS.map((column) => ({
            key: column.key,
            label: column.label,
          }))}
          selectedColumns={exportColumns}
          storageKey={getBankExportStorageKey(runtimeContext.sourceTenantId)}
          brandingName={companyDisplayName}
          onClose={() => setIsExportModalOpen(false)}
          onExport={async (config) => {
            try {
              await exportGridRows({
                rows: banks,
                columns: (config.orderedColumns || []).length
                  ? config.orderedColumns
                      .map((key) =>
                        BANK_EXPORT_COLUMNS.find((column) => column.key === key),
                      )
                      .filter(
                        (column): column is GridColumnDefinition<BankItem, BankExportColumnKey> =>
                          Boolean(column),
                      )
                  : BANK_EXPORT_COLUMNS,
                selectedColumns: config.selectedColumns,
                format: exportFormat,
                pdfOptions: config.pdfOptions,
                fileBaseName: 'bancos',
                branding: {
                  title: 'Bancos',
                  subtitle: 'Exportação com os filtros atualmente aplicados.',
                  schoolName: companyDisplayName,
                },
              });
              setExportColumns(config.selectedColumns);
              setError(null);
              setIsExportModalOpen(false);
            } catch (currentError) {
              setError(
                currentError instanceof Error
                  ? currentError.message
                  : 'Não foi possível exportar os bancos.',
              );
            }
          }}
        />
        </>
      ) : null}
      </section>
    </div>
  );
}
