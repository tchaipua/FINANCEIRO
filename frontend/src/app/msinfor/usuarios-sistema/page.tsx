"use client";

import { useEffect, useMemo, useState } from "react";
import GridColumnFilterHeader from "@/app/components/grid-column-filter-header";
import GridExportModal from "@/app/components/grid-export-modal";
import GridStandardFooter, {
  type GridStatusFilterValue,
} from "@/app/components/grid-standard-footer";
import ScreenNameCopy from "@/app/components/screen-name-copy";
import { getJson, requestJson } from "@/app/lib/api";
import {
  buildDefaultExportColumns,
  exportGridRows,
  type GridColumnDefinition,
  type GridExportFormat,
} from "@/app/lib/grid-export-utils";
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from "@/app/lib/runtime-context";
import { withFinanceBasePath } from "@/app/lib/public-path";
import { postMessageToTrustedParent } from "@/app/lib/trusted-messaging";

type FinanceAssignment = {
  id: string;
  profileCode: string;
  permissionCodes: string[];
  active: boolean;
  updatedAt: string;
};
type SystemUser = {
  id: string;
  sourceUserId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  sourceActive: boolean;
  financeProfileCode: string;
  updatedAt: string;
  assignment: FinanceAssignment | null;
};
type FinanceProfile = {
  code: string;
  name: string;
  description: string;
  permissionCodes: string[];
};
type SourceProfile = { code: string; role: string; name: string };
type NewSystemUserForm = {
  document: string;
  name: string;
  email: string;
  login: string;
  password: string;
  phone: string;
  whatsapp: string;
  sourceProfileCode: string;
  sourceRole: string;
  financeProfileCode: string;
  financePermissionCodes: string[];
};
type CashClosingMode = "MANUAL" | "DAILY_REQUIRED" | "DAILY_AUTOMATIC";
type CashOperatorPolicy = {
  id: string | null;
  cashierUserId: string;
  cashierDisplayName: string;
  closingMode: CashClosingMode;
  branchCode: number;
  updatedAt: string | null;
};
type SelectedUserTab = "ACCESS" | "CASH";
type GridKey = "name" | "email" | "role" | "status";
type Sort = { key: GridKey | null; direction: "ASC" | "DESC" };
type Filters = Record<GridKey, string>;

const SCREEN_ID = "PRINCIPAL_FINANCEIRO_MSINFOR_USUARIOS_SISTEMA";
const POPUP_SCREEN_ID =
  "POPUP_FINANCEIRO_MSINFOR_USUARIOS_SISTEMA_CONFIGURACOES_USUARIO";
const NEW_USER_POPUP_SCREEN_ID =
  "POPUP_FINANCEIRO_MSINFOR_USUARIOS_SISTEMA_NOVO_USUARIO";
const cardClass = "rounded-3xl border border-slate-200 bg-white shadow-sm";
const GRID_STORAGE_KEY = "financeiro:msinfor:usuarios-sistema:grid-columns";
const CENTRAL_API_BASE_URL = String(
  process.env.NEXT_PUBLIC_MSINFOR_CENTRAL_API_URL ||
    "http://localhost:3201/api/v1",
).replace(/\/+$/, "");
const GRID_COLUMNS: GridColumnDefinition<SystemUser, GridKey>[] = [
  {
    key: "name",
    label: "USUÁRIO",
    getValue: (row) => normalizedText(row.name),
  },
  { key: "email", label: "E-MAIL", getValue: (row) => row.email },
  {
    key: "role",
    label: "PERFIL FINANCEIRO",
    getValue: (row) => normalizedText(row.financeProfileCode || "SEM ACESSO"),
  },
  {
    key: "status",
    label: "SITUAÇÃO",
    getValue: (row) => (row.active ? "ATIVO" : "INATIVO"),
  },
];
const EMPTY_FILTERS: Filters = { name: "", email: "", role: "", status: "" };

function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}
function normalizeFinanceLogoUrl(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return withFinanceBasePath("/logo-msinfor.jpg");
  if (/^(?:data:|https?:\/\/|blob:)/i.test(normalized)) return normalized;
  const key = normalized.replace(/^\/+/, "");
  if (/^logos\/filiais\//i.test(key)) {
    return `${CENTRAL_API_BASE_URL}/public/branch-logo?key=${encodeURIComponent(key)}`;
  }
  if (/^logos\/empresas\//i.test(key)) {
    return `${CENTRAL_API_BASE_URL}/public/company-logo?key=${encodeURIComponent(key)}`;
  }
  return withFinanceBasePath(
    normalized.startsWith("/") ? normalized : `/${normalized}`,
  );
}
function financeBrandInitials(value?: string | null) {
  const normalized = normalizedText(value).replace(/[^A-Z0-9]/g, "");
  return normalized.slice(0, 2) || "EM";
}
function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}
function readVisibleColumns() {
  const defaults = GRID_COLUMNS.map((column) => column.key);
  if (typeof window === "undefined") return defaults;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(GRID_STORAGE_KEY) || "null",
    );
    const selected = Array.isArray(value)
      ? defaults.filter((key) => value.includes(key))
      : [];
    return selected.length ? selected : defaults;
  } catch {
    return defaults;
  }
}

function ColumnSettingsModal({
  isOpen,
  visible,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  visible: GridKey[];
  onSave: (value: GridKey[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GridKey[]>(visible);
  useEffect(() => {
    if (isOpen) setDraft(visible);
  }, [isOpen, visible]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50 px-6 py-5">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[.28em] text-blue-600">
              CONFIGURAÇÃO DA TELA
            </div>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              ALTERAR COLUNAS GRID
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              SELECIONE AS COLUNAS QUE DEVEM FICAR VISÍVEIS NESTE NAVEGADOR.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-500"
          >
            ✕
          </button>
        </header>
        <div className="space-y-3 p-6">
          {GRID_COLUMNS.map((column) => (
            <label
              key={column.key}
              className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4"
            >
              <span className="text-sm font-black text-slate-700">
                {column.label}
              </span>
              <input
                type="checkbox"
                checked={draft.includes(column.key)}
                onChange={() =>
                  setDraft((current) =>
                    current.includes(column.key)
                      ? current.filter((key) => key !== column.key)
                      : [...current, column.key],
                  )
                }
                className="h-5 w-5 accent-blue-600"
              />
            </label>
          ))}
        </div>
        <footer className="flex justify-between gap-3 border-t border-slate-100 px-6 py-5">
          <button
            type="button"
            onClick={() => setDraft(GRID_COLUMNS.map((column) => column.key))}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
          >
            RESTAURAR PADRÃO
          </button>
          <button
            type="button"
            onClick={() => {
              if (draft.length) {
                onSave(draft);
                onClose();
              }
            }}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white"
          >
            SALVAR
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function FinanceSystemUsersPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [profiles, setProfiles] = useState<FinanceProfile[]>([]);
  const [sourceProfiles, setSourceProfiles] = useState<SourceProfile[]>([]);
  const [policies, setPolicies] = useState<CashOperatorPolicy[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [selectedUserTab, setSelectedUserTab] = useState<SelectedUserTab>(
    "ACCESS",
  );
  const [selectedProfileCode, setSelectedProfileCode] = useState("CONSULTA");
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState<
    string[]
  >(["VIEW_FINANCIAL"]);
  const [accessActive, setAccessActive] = useState(true);
  const [closingMode, setClosingMode] = useState<CashClosingMode>("MANUAL");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyFeedback, setPolicyFeedback] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<GridStatusFilterValue>("ACTIVE");
  const [columnFilters, setColumnFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterDrafts, setFilterDrafts] = useState<Filters>(EMPTY_FILTERS);
  const [activeFilter, setActiveFilter] = useState<GridKey | null>(null);
  const [sort, setSort] = useState<Sort>({ key: null, direction: "ASC" });
  const [visibleKeys, setVisibleKeys] = useState<GridKey[]>(() =>
    readVisibleColumns(),
  );
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<GridExportFormat>("excel");
  const [exportColumns, setExportColumns] = useState(() =>
    buildDefaultExportColumns(GRID_COLUMNS),
  );
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserFeedback, setNewUserFeedback] = useState("");
  const [resolvingDocument, setResolvingDocument] = useState(false);
  const [savingNewUser, setSavingNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<NewSystemUserForm>({
    document: "",
    name: "",
    email: "",
    login: "",
    password: "",
    phone: "",
    whatsapp: "",
    sourceProfileCode: "ADMIN_TOTAL",
    sourceRole: "ADMIN",
    financeProfileCode: "GERENTE_FINANCEIRO",
    financePermissionCodes: [],
  });
  const visibleColumns = useMemo(
    () =>
      GRID_COLUMNS.filter((column) =>
        (visibleKeys.length
          ? visibleKeys
          : GRID_COLUMNS.map((item) => item.key)
        ).includes(column.key),
      ),
    [visibleKeys],
  );
  const selectedFinanceProfile = profiles.find(
    (profile) => profile.code === selectedProfileCode,
  );
  const cashierPermissionAvailable = Boolean(
    selectedFinanceProfile?.permissionCodes.includes("OPERATE_CASHIER"),
  );
  const isCashierOperator = selectedPermissionCodes.includes("OPERATE_CASHIER");

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    postMessageToTrustedParent({
      type: "MSINFOR_SCREEN_CONTEXT",
      screenId: SCREEN_ID,
    });
  }, [runtimeContext.embedded]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setLoading(false);
      return () => controller.abort();
    }

    void requestJson("/finance-access/source-sync", {
      method: "POST",
      body: JSON.stringify({}),
      fallbackMessage: "Não foi possível sincronizar os usuários da origem.",
    })
      .then(() =>
        Promise.all([
          getJson<any[]>("/finance-access/subjects"),
          getJson<FinanceProfile[]>("/finance-access/profiles"),
          getJson<SourceProfile[]>("/finance-access/source-profiles"),
        ]),
      )
      .then(([payload, profilePayload, sourceProfilePayload]) => {
        if (!controller.signal.aborted) {
          setProfiles(Array.isArray(profilePayload) ? profilePayload : []);
          setSourceProfiles(
            Array.isArray(sourceProfilePayload) ? sourceProfilePayload : [],
          );
          setUsers(
            (Array.isArray(payload) ? payload : [])
              .map((user) => ({
                id: String(user?.id || ""),
                sourceUserId: String(user?.sourceUserId || ""),
                name: String(user?.displayName || ""),
                email: String(user?.email || ""),
                role: String(user?.sourceRole || ""),
                sourceActive: Boolean(user?.sourceActive),
                active: Boolean(user?.sourceActive && user?.assignment?.active),
                financeProfileCode: String(user?.assignment?.profileCode || ""),
                updatedAt: String(
                  user?.assignment?.updatedAt || user?.updatedAt || "",
                ),
                assignment: user?.assignment
                  ? {
                      ...user.assignment,
                      permissionCodes: Array.isArray(
                        user.assignment.permissionCodes,
                      )
                        ? user.assignment.permissionCodes
                        : [],
                    }
                  : null,
              }))
              .filter((user) => user.id),
          );
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setUsers([]);
          setError(
            requestError instanceof Error
              ? requestError.message.toUpperCase()
              : "NÃO FOI POSSÍVEL CARREGAR OS USUÁRIOS DO SISTEMA.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    runtimeContext.sourceSystem,
    runtimeContext.sourceTenantId,
    runtimeContext.sourceBranchCode,
    runtimeContext.userRole,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
      setPolicies([]);
      return () => controller.abort();
    }

    void getJson<CashOperatorPolicy[]>(
      `/cash-sessions/operator-policies${buildFinanceApiQueryString(runtimeContext)}`,
    )
      .then((payload) => {
        if (!controller.signal.aborted)
          setPolicies(Array.isArray(payload) ? payload : []);
      })
      .catch((requestError: unknown) => {
        if (
          !controller.signal.aborted &&
          runtimeContext.sourceSystem !== "ESCOLA"
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message.toUpperCase()
              : "NÃO FOI POSSÍVEL CARREGAR AS CONFIGURAÇÕES DO CAIXA.",
          );
        }
      });

    return () => controller.abort();
  }, [runtimeContext]);

  useEffect(() => {
    if (!selectedUser) return;
    const initialProfile = selectedUser.assignment?.profileCode || "CONSULTA";
    const profile = profiles.find((item) => item.code === initialProfile);
    setSelectedProfileCode(initialProfile);
    setSelectedPermissionCodes(
      selectedUser.assignment?.permissionCodes?.length
        ? selectedUser.assignment.permissionCodes
        : [...(profile?.permissionCodes || ["VIEW_FINANCIAL"])],
    );
    setAccessActive(
      selectedUser.assignment?.active ?? selectedUser.sourceActive,
    );
    setClosingMode(
      policies.find(
        (policy) => policy.cashierUserId === selectedUser.sourceUserId,
      )?.closingMode || "MANUAL",
    );
    setPolicyFeedback("");
  }, [policies, profiles, selectedUser]);

  async function saveCashOperatorPolicy() {
    if (
      !selectedUser ||
      !runtimeContext.sourceSystem ||
      !runtimeContext.sourceTenantId
    )
      return;
    try {
      setSavingPolicy(true);
      setPolicyFeedback("");
      const savedAssignment = await requestJson<FinanceAssignment>(
        `/finance-access/subjects/${selectedUser.id}/assignment`,
        {
          method: "PATCH",
          body: JSON.stringify({
            profileCode: selectedProfileCode,
            permissionCodes: selectedPermissionCodes,
            active: accessActive,
          }),
          fallbackMessage: "Não foi possível salvar o acesso financeiro.",
        },
      );
      setUsers((current) =>
        current.map((user) =>
          user.id === selectedUser.id
            ? {
                ...user,
                assignment: savedAssignment,
                active: user.sourceActive && savedAssignment.active,
                financeProfileCode: savedAssignment.profileCode,
                updatedAt: savedAssignment.updatedAt,
              }
            : user,
        ),
      );
      if (selectedPermissionCodes.includes("OPERATE_CASHIER")) {
        const saved = await requestJson<CashOperatorPolicy>(
          "/cash-sessions/operator-policy",
          {
            method: "PATCH",
            body: JSON.stringify({
              sourceSystem: runtimeContext.sourceSystem,
              sourceTenantId: runtimeContext.sourceTenantId,
              targetCashierUserId: selectedUser.sourceUserId,
              targetCashierDisplayName: selectedUser.name,
              closingMode,
            }),
            fallbackMessage:
              "Não foi possível salvar a configuração do fechamento do caixa.",
          },
        );
        setPolicies((current) => [
          ...current.filter(
            (policy) => policy.cashierUserId !== saved.cashierUserId,
          ),
          saved,
        ]);
      }
      setPolicyFeedback("CONFIGURAÇÃO SALVA COM SUCESSO.");
    } catch (requestError: unknown) {
      setPolicyFeedback(
        requestError instanceof Error
          ? requestError.message.toUpperCase()
          : "NÃO FOI POSSÍVEL SALVAR A CONFIGURAÇÃO.",
      );
    } finally {
      setSavingPolicy(false);
    }
  }

  function openNewSystemUser() {
    const financeProfile =
      profiles.find((profile) => profile.code === "GERENTE_FINANCEIRO") ||
      profiles[0];
    const sourceProfile =
      sourceProfiles.find((profile) => profile.code === "ADMIN_TOTAL") ||
      sourceProfiles[0];
    setNewUserForm({
      document: "",
      name: "",
      email: "",
      login: "",
      password: "",
      phone: "",
      whatsapp: "",
      sourceProfileCode: sourceProfile?.code || "ADMIN_TOTAL",
      sourceRole: sourceProfile?.role || "ADMIN",
      financeProfileCode: financeProfile?.code || "GERENTE_FINANCEIRO",
      financePermissionCodes: [...(financeProfile?.permissionCodes || [])],
    });
    setNewUserFeedback("");
    setNewUserOpen(true);
  }

  async function resolveNewUserDocument() {
    const document = newUserForm.document.replace(/\D/g, "");
    if (document.length !== 11) {
      setNewUserFeedback("INFORME UM CPF COM 11 DÍGITOS.");
      return;
    }
    try {
      setResolvingDocument(true);
      setNewUserFeedback("");
      const person = await requestJson<any>(
        "/finance-access/system-users/resolve-person",
        {
          method: "POST",
          body: JSON.stringify({ document }),
          fallbackMessage: "Não foi possível consultar o CPF.",
        },
      );
      if (!person?.found) {
        setNewUserFeedback("CPF NÃO LOCALIZADO. PREENCHA OS DADOS DO NOVO USUÁRIO.");
        return;
      }
      setNewUserForm((current) => ({
        ...current,
        document,
        name: String(person.name || current.name),
        email: String(person.email || current.email),
        login: String(person.login || current.login || person.email || ""),
        phone: String(person.phone || current.phone),
        whatsapp: String(person.whatsapp || current.whatsapp),
      }));
      setNewUserFeedback(
        `PESSOA LOCALIZADA${Array.isArray(person.roles) && person.roles.length ? `: ${person.roles.join(", ")}` : ""}.`,
      );
    } catch (requestError: unknown) {
      setNewUserFeedback(
        requestError instanceof Error
          ? requestError.message.toUpperCase()
          : "NÃO FOI POSSÍVEL CONSULTAR O CPF.",
      );
    } finally {
      setResolvingDocument(false);
    }
  }

  async function createNewSystemUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSavingNewUser(true);
      setNewUserFeedback("");
      const created = await requestJson<any>("/finance-access/system-users", {
        method: "POST",
        body: JSON.stringify({
          document: newUserForm.document.replace(/\D/g, "") || undefined,
          name: newUserForm.name,
          email: newUserForm.email,
          login: newUserForm.login,
          password: newUserForm.password,
          phone: newUserForm.phone || undefined,
          whatsapp: newUserForm.whatsapp || undefined,
          sourceRole: newUserForm.sourceRole,
          sourceAccessProfile: newUserForm.sourceProfileCode,
          financeProfileCode: newUserForm.financeProfileCode,
          financePermissionCodes: newUserForm.financePermissionCodes,
        }),
        fallbackMessage: "Não foi possível cadastrar o usuário do sistema.",
      });
      const mapped: SystemUser = {
        id: String(created.id || ""),
        sourceUserId: String(created.sourceUserId || ""),
        name: String(created.displayName || newUserForm.name),
        email: String(created.email || newUserForm.email),
        role: String(created.sourceRole || newUserForm.sourceRole),
        sourceActive: Boolean(created.sourceActive ?? true),
        active: Boolean(created.assignment?.active ?? true),
        financeProfileCode: String(
          created.assignment?.profileCode || newUserForm.financeProfileCode,
        ),
        updatedAt: String(created.assignment?.updatedAt || created.updatedAt || new Date().toISOString()),
        assignment: created.assignment || null,
      };
      setUsers((current) => [mapped, ...current.filter((user) => user.id !== mapped.id)]);
      setNewUserOpen(false);
    } catch (requestError: unknown) {
      setNewUserFeedback(
        requestError instanceof Error
          ? requestError.message.toUpperCase()
          : "NÃO FOI POSSÍVEL CADASTRAR O USUÁRIO.",
      );
    } finally {
      setSavingNewUser(false);
    }
  }
  useEffect(() => {
    window.localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(visibleKeys));
  }, [visibleKeys]);
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, columnFilters, sort, pageSize]);

  const availableUsers = users;
  const displayedUsers = useMemo(
    () =>
      availableUsers
        .filter((user) => {
          if (statusFilter === "ACTIVE" && !user.active) return false;
          if (statusFilter === "INACTIVE" && user.active) return false;
          if (
            search &&
            !normalizedText(
              `${user.name} ${user.email} ${user.financeProfileCode} ${user.role}`,
            ).includes(normalizedText(search))
          )
            return false;
          return GRID_COLUMNS.every(
            (column) =>
              !columnFilters[column.key] ||
              normalizedText(column.getValue(user)).includes(
                normalizedText(columnFilters[column.key]),
              ),
          );
        })
        .sort((a, b) =>
          !sort.key
            ? 0
            : normalizedText(
                GRID_COLUMNS.find(
                  (column) => column.key === sort.key,
                )?.getValue(a),
              ).localeCompare(
                normalizedText(
                  GRID_COLUMNS.find(
                    (column) => column.key === sort.key,
                  )?.getValue(b),
                ),
                "pt-BR",
              ) * (sort.direction === "ASC" ? 1 : -1),
        ),
    [availableUsers, statusFilter, search, columnFilters, sort],
  );
  const totalPages = Math.max(1, Math.ceil(displayedUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = displayedUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const applyFilter = (key: GridKey) => {
    setColumnFilters((current) => ({ ...current, [key]: filterDrafts[key] }));
    setActiveFilter(null);
  };
  const clearFilters = () => {
    setSearch("");
    setColumnFilters(EMPTY_FILTERS);
    setFilterDrafts(EMPTY_FILTERS);
    setActiveFilter(null);
    setSort({ key: null, direction: "ASC" });
  };

  return (
    <div className="space-y-5">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="relative block w-full max-w-md">
              <span className="sr-only">PESQUISAR USUÁRIO</span>
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value.toUpperCase())
                }
                placeholder="PESQUISAR POR NOME, E-MAIL OU PERFIL..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-10 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
              />
              <span className="pointer-events-none absolute right-3 top-2.5 text-lg text-slate-400">
                ⌕
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openNewSystemUser}
                className="rounded-xl bg-[#153a6a] px-4 py-2.5 text-[10px] font-black text-white"
              >
                NOVO USUÁRIO DO SISTEMA
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-600"
              >
                LIMPAR FILTROS
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <div className="min-w-[820px]">
              <div
                className="grid border-b border-slate-200 bg-slate-100 px-4 py-3 text-[10px] font-black tracking-wide text-slate-600"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(visibleColumns.length, 1)}, minmax(150px, 1fr)) 145px`,
                }}
              >
                {visibleColumns.map((column) => (
                  <GridColumnFilterHeader
                    key={column.key}
                    label={column.label}
                    isOpen={activeFilter === column.key}
                    isActive={Boolean(columnFilters[column.key])}
                    filterValue={filterDrafts[column.key]}
                    align={column.key === "status" ? "right" : "left"}
                    sortDirection={
                      sort.key === column.key ? sort.direction : null
                    }
                    onToggle={() =>
                      setActiveFilter((current) =>
                        current === column.key ? null : column.key,
                      )
                    }
                    onSort={(direction) => {
                      setSort({ key: column.key, direction });
                      setActiveFilter(null);
                    }}
                    onFilterValueChange={(value) =>
                      setFilterDrafts((current) => ({
                        ...current,
                        [column.key]: value.toUpperCase(),
                      }))
                    }
                    onApply={() => applyFilter(column.key)}
                    onClear={() => {
                      setFilterDrafts((current) => ({
                        ...current,
                        [column.key]: "",
                      }));
                      setColumnFilters((current) => ({
                        ...current,
                        [column.key]: "",
                      }));
                      setActiveFilter(null);
                    }}
                  />
                ))}
                <span className="text-right">AÇÃO</span>
              </div>
              {loading ? (
                <div className="px-4 py-10 text-center text-xs font-black text-slate-500">
                  CARREGANDO USUÁRIOS...
                </div>
              ) : null}
              {!loading && error ? (
                <div className="px-4 py-10 text-center text-xs font-black text-red-600">
                  {error}
                </div>
              ) : null}
              {!loading &&
                !error &&
                pagedUsers.map((user, index) => (
                  <div
                    key={user.id}
                    className={`grid items-center border-b border-slate-100 px-4 py-3 text-xs last:border-b-0 ${index % 2 ? "bg-slate-50/80" : "bg-white"}`}
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(visibleColumns.length, 1)}, minmax(150px, 1fr)) 145px`,
                    }}
                  >
                    {visibleColumns.map((column) => (
                      <div key={column.key} className="min-w-0 pr-3">
                        {column.key === "name" ? (
                          <>
                            <div className="truncate font-black text-slate-800">
                              {column.getValue(user)}
                            </div>
                            <div className="mt-1 text-[10px] font-semibold text-slate-400">
                              ATUALIZADO EM {displayDate(user.updatedAt)}
                            </div>
                          </>
                        ) : column.key === "status" ? (
                          <span
                            className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black ${user.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                          >
                            {column.getValue(user)}
                          </span>
                        ) : (
                          <span className="truncate font-semibold text-slate-600">
                            {column.getValue(user)}
                          </span>
                        )}
                      </div>
                    ))}
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setSelectedUserTab("ACCESS");
                        }}
                        className="rounded-lg bg-[#153a6a] px-3 py-2 text-[10px] font-black text-white"
                      >
                        CONFIGURAÇÕES
                      </button>
                    </div>
                  </div>
                ))}
              {!loading && !error && !pagedUsers.length ? (
                <div className="px-4 py-10 text-center text-xs font-black text-slate-500">
                  NENHUM USUÁRIO LOCALIZADO.
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <GridStandardFooter
          statusFilter={statusFilter}
          totalRecords={displayedUsers.length}
          pageSize={pageSize}
          currentPage={currentPage}
          totalPages={totalPages}
          onColumnSettings={() => setColumnSettingsOpen(true)}
          onExport={() => setExportOpen(true)}
          onStatusFilterChange={setStatusFilter}
          onPageSizeChange={setPageSize}
          onPageChange={setPage}
          recordSummaryLabel="TOTAL REGISTROS"
        />
      </section>
      <ColumnSettingsModal
        isOpen={columnSettingsOpen}
        visible={visibleKeys}
        onSave={setVisibleKeys}
        onClose={() => setColumnSettingsOpen(false)}
      />
      <GridExportModal
        isOpen={exportOpen}
        title="EXPORTAR USUÁRIOS DO SISTEMA"
        description={`A EXPORTAÇÃO RESPEITA OS FILTROS E INCLUI ${displayedUsers.length} REGISTRO(S).`}
        format={exportFormat}
        onFormatChange={setExportFormat}
        columns={GRID_COLUMNS.map(({ key, label }) => ({ key, label }))}
        selectedColumns={exportColumns}
        storageKey="financeiro:msinfor:usuarios-sistema:export"
        brandingName={runtimeContext.companyName || "FINANCEIRO"}
        brandingLogoUrl={runtimeContext.logoUrl}
        screenId={SCREEN_ID}
        blueHeader
        onClose={() => setExportOpen(false)}
        onExport={async (config) => {
          await exportGridRows({
            rows: displayedUsers,
            columns: config.orderedColumns
              .map((key) => GRID_COLUMNS.find((column) => column.key === key))
              .filter(
                (column): column is GridColumnDefinition<SystemUser, GridKey> =>
                  Boolean(column),
              ),
            selectedColumns: config.selectedColumns,
            format: exportFormat,
            pdfOptions: config.pdfOptions,
            fileBaseName: "usuarios-do-sistema",
            branding: {
              title: "USUÁRIOS DO SISTEMA",
              subtitle: "EXPORTAÇÃO COM OS FILTROS ATUALMENTE APLICADOS.",
              schoolName: runtimeContext.companyName || "FINANCEIRO",
              logoUrl: runtimeContext.logoUrl,
            },
          });
          setExportColumns(config.selectedColumns);
          setExportOpen(false);
        }}
      />
      {newUserOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={() => !savingNewUser && setNewUserOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="NOVO USUÁRIO DO SISTEMA"
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-4 border-b border-blue-900 bg-[#153a6a] px-5 py-4 text-white">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                <img
                  src={normalizeFinanceLogoUrl(runtimeContext.logoUrl)}
                  alt="LOGOTIPO INSTITUCIONAL"
                  className="h-full w-full object-contain"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = withFinanceBasePath(
                      "/logo-msinfor.jpg",
                    );
                  }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black tracking-[.2em] text-blue-100">
                  CADASTRO ÚNICO DE ACESSO
                </div>
                <h2 className="text-lg font-black">NOVO USUÁRIO DO SISTEMA</h2>
              </div>
              <button
                type="button"
                onClick={() => setNewUserOpen(false)}
                disabled={savingNewUser}
                aria-label="FECHAR"
                className="rounded-lg px-2 py-1 text-2xl leading-none disabled:opacity-50"
              >
                ×
              </button>
            </header>
            <form
              id="finance-system-user-form"
              onSubmit={createNewSystemUser}
              className="space-y-5 overflow-y-auto p-6"
            >
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                <div className="text-[10px] font-black tracking-[.16em] text-blue-700">
                  LOCALIZAR PESSOA EXISTENTE
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={newUserForm.document}
                    onChange={(event) =>
                      setNewUserForm((current) => ({
                        ...current,
                        document: event.target.value.replace(/\D/g, "").slice(0, 11),
                      }))
                    }
                    placeholder="CPF"
                    inputMode="numeric"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => void resolveNewUserDocument()}
                    disabled={resolvingDocument}
                    className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-black text-white disabled:opacity-60"
                  >
                    {resolvingDocument ? "CONSULTANDO..." : "BUSCAR CPF"}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["name", "NOME COMPLETO", "text"],
                  ["email", "E-MAIL", "email"],
                  ["login", "LOGIN", "text"],
                  ["password", "SENHA INICIAL", "password"],
                  ["phone", "TELEFONE", "text"],
                  ["whatsapp", "WHATSAPP", "text"],
                ].map(([key, label, type]) => (
                  <label key={key} className="block">
                    <span className="text-[10px] font-black text-slate-500">{label}</span>
                    <input
                      type={type}
                      required={["name", "email", "login", "password"].includes(key)}
                      value={newUserForm[key as keyof NewSystemUserForm] as string}
                      onChange={(event) =>
                        setNewUserForm((current) => ({
                          ...current,
                          [key]: key === "password" ? event.target.value : event.target.value.toUpperCase(),
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500">PERFIL NO SISTEMA</span>
                  <select
                    value={newUserForm.sourceProfileCode}
                    onChange={(event) => {
                      const sourceProfile = sourceProfiles.find((profile) => profile.code === event.target.value);
                      setNewUserForm((current) => ({
                        ...current,
                        sourceProfileCode: event.target.value,
                        sourceRole: sourceProfile?.role || current.sourceRole,
                      }));
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold"
                  >
                    {sourceProfiles.map((profile) => (
                      <option key={profile.code} value={profile.code}>{profile.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-black text-slate-500">PERFIL FINANCEIRO</span>
                  <select
                    value={newUserForm.financeProfileCode}
                    onChange={(event) => {
                      const financeProfile = profiles.find((profile) => profile.code === event.target.value);
                      setNewUserForm((current) => ({
                        ...current,
                        financeProfileCode: event.target.value,
                        financePermissionCodes: [...(financeProfile?.permissionCodes || [])],
                      }));
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold"
                  >
                    {profiles.map((profile) => (
                      <option key={profile.code} value={profile.code}>{profile.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {newUserFeedback ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black text-blue-800">
                  {newUserFeedback}
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold leading-5 text-slate-600">
                O CPF É CONSULTADO SOMENTE NA EMPRESA AUTENTICADA. AO SALVAR, O FINANCEIRO GRAVA OS PERFIS E SINCRONIZA A IDENTIDADE E A PROJEÇÃO TÉCNICA NO SISTEMA DE ORIGEM.
              </div>
            </form>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
              <div>
                <div className="text-[9px] font-black tracking-wide text-slate-400">AUDITORIA VISUAL · TENANT E FILIAL AUTENTICADOS</div>
                <ScreenNameCopy
                  screenId={NEW_USER_POPUP_SCREEN_ID}
                  compact
                  originText="Sistema Financeiro - cadastro central de usuário do sistema."
                  auditText="CPF, identidade Central, projeção de origem, perfis e filiais auditados."
                />
              </div>
              <button
                type="submit"
                form="finance-system-user-form"
                disabled={savingNewUser}
                className="rounded-xl bg-blue-700 px-5 py-3 text-xs font-black text-white disabled:opacity-60"
              >
                {savingNewUser ? "SALVANDO..." : "SALVAR USUÁRIO"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {selectedUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={() => setSelectedUser(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="CONFIGURAÇÕES DO USUÁRIO"
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#153a6a] px-5 py-4 text-white">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                {runtimeContext.logoUrl ? (
                  <>
                    <img
                      src={normalizeFinanceLogoUrl(runtimeContext.logoUrl)}
                      alt={`LOGOTIPO DE ${runtimeContext.companyName || "EMPRESA/FILIAL"}`}
                      className="h-full w-full object-contain"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                        event.currentTarget.nextElementSibling?.removeAttribute(
                          "hidden",
                        );
                      }}
                    />
                    <span
                      className="text-sm font-black tracking-tight text-blue-800"
                      aria-hidden="true"
                      hidden
                    >
                      {financeBrandInitials(runtimeContext.companyName)}
                    </span>
                  </>
                ) : (
                  <span
                    className="text-sm font-black tracking-tight text-blue-800"
                    aria-label="Empresa/filial logada"
                  >
                    {financeBrandInitials(runtimeContext.companyName)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[9px] font-black tracking-[.16em] text-blue-100">
                  CONFIGURAÇÃO POR OPERADOR · FILIAL {runtimeContext.sourceBranchCode}
                </div>
                <h2 className="truncate text-lg font-black">
                  {normalizedText(selectedUser.name)}
                </h2>
                <div
                  className="truncate text-[10px] font-bold text-blue-100"
                  title={runtimeContext.companyName || "EMPRESA/FILIAL LOGADA"}
                >
                  {runtimeContext.companyName || "EMPRESA/FILIAL LOGADA"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                aria-label="FECHAR"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 px-2 py-1 text-2xl font-black leading-none text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                ×
              </button>
              </div>
            </header>
            <div
              role="tablist"
              aria-label="SEÇÕES DAS CONFIGURAÇÕES DO USUÁRIO"
              className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 px-5"
            >
              {[
                ["ACCESS", "ACESSO AO FINANCEIRO"],
                ["CASH", "FECHAMENTO DO CAIXA"],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selectedUserTab === tab}
                  onClick={() => setSelectedUserTab(tab as SelectedUserTab)}
                  className={`border-b-2 px-3 py-3 text-[10px] font-black tracking-[.12em] transition ${selectedUserTab === tab ? "border-blue-700 text-blue-700" : "border-transparent text-slate-400 hover:border-slate-300 hover:text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 overflow-y-auto p-6">
              {selectedUserTab === "ACCESS" ? (
                <div className="space-y-5">
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] font-black text-slate-400">
                        E-MAIL
                      </div>
                      <div className="mt-1 truncate text-xs font-bold text-slate-700" title={selectedUser.email || "---"}>
                        {selectedUser.email || "---"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400">
                        PERFIL NA ORIGEM
                      </div>
                      <div className="mt-1 truncate text-xs font-black text-slate-700" title={normalizedText(selectedUser.role)}>
                        {normalizedText(selectedUser.role)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="text-[10px] font-black tracking-[.16em] text-blue-700">
                      ACESSO AO FINANCEIRO
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <label className="block">
                        <span className="text-[10px] font-black text-slate-500">
                          PERFIL FINANCEIRO
                        </span>
                        <select
                          value={selectedProfileCode}
                          onChange={(event) => {
                            const profileCode = event.target.value;
                            const profile = profiles.find(
                              (item) => item.code === profileCode,
                            );
                            setSelectedProfileCode(profileCode);
                            setSelectedPermissionCodes([
                              ...(profile?.permissionCodes || ["VIEW_FINANCIAL"]),
                            ]);
                          }}
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                        >
                          {profiles.map((profile) => (
                            <option key={profile.code} value={profile.code}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={accessActive}
                          disabled={!selectedUser.sourceActive}
                          onChange={(event) =>
                            setAccessActive(event.target.checked)
                          }
                          className="h-5 w-5 accent-blue-700"
                        />
                        <span className="text-xs font-black text-slate-700">
                          ACESSO ATIVO
                        </span>
                      </label>
                    </div>
                    {!selectedUser.sourceActive ? (
                      <p className="mt-3 text-xs font-bold text-amber-700">
                        O USUÁRIO ESTÁ INATIVO NA ORIGEM E NÃO PODE RECEBER ACESSO.
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {(
                        profiles.find(
                          (profile) => profile.code === selectedProfileCode,
                        )?.permissionCodes || []
                      )
                        .filter((permissionCode) => permissionCode !== "OPERATE_CASHIER")
                        .map((permissionCode) => (
                        <label
                          key={permissionCode}
                          className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPermissionCodes.includes(
                              permissionCode,
                            )}
                            disabled={permissionCode === "VIEW_FINANCIAL"}
                            onChange={(event) =>
                              setSelectedPermissionCodes((current) =>
                                event.target.checked
                                  ? [...new Set([...current, permissionCode])]
                                  : current.filter(
                                      (code) => code !== permissionCode,
                                    ),
                              )
                            }
                            className="h-4 w-4 accent-blue-700"
                          />
                          <span className="text-[10px] font-black text-slate-600">
                            {permissionCode.replaceAll("_", " ")}
                          </span>
                        </label>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <button
                      type="button"
                      aria-pressed={isCashierOperator}
                      disabled={!cashierPermissionAvailable || !selectedUser.sourceActive}
                      onClick={() =>
                        setSelectedPermissionCodes((current) =>
                          isCashierOperator
                            ? current.filter((code) => code !== "OPERATE_CASHIER")
                            : [...new Set([...current, "OPERATE_CASHIER"])],
                        )
                      }
                      className={`flex w-full items-center justify-between gap-4 rounded-xl border-2 px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 ${isCashierOperator ? "border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-red-400 bg-red-50 text-red-800 hover:bg-red-100"}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-black tracking-[.1em]">
                          USUÁRIO DE CAIXA
                        </span>
                        <span className="mt-1 block text-[10px] font-bold">
                          {isCashierOperator
                            ? "PODE OPERAR O CAIXA"
                            : "NÃO PODE OPERAR O CAIXA"}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black tracking-[.12em] text-white ${isCashierOperator ? "bg-emerald-600" : "bg-red-600"}`}
                      >
                        {isCashierOperator ? "SIM" : "NÃO"}
                      </span>
                    </button>
                    {!cashierPermissionAvailable ? (
                      <p className="mt-2 text-[10px] font-bold text-slate-500">
                        O perfil selecionado não permite operação de caixa.
                      </p>
                    ) : null}
                  </div>
                  {selectedPermissionCodes.includes("OPERATE_CASHIER") ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5">
                      <div className="text-[10px] font-black tracking-[.16em] text-blue-700">
                        FECHAMENTO DO CAIXA
                      </div>
                      <h3 className="mt-1 text-base font-black text-slate-900">
                        Como este operador deve iniciar o próximo dia?
                      </h3>
                      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                        A configuração vale para a empresa e filial atuais. O padrão
                        é manter o caixa aberto até o operador fechá-lo.
                      </p>
                      <select
                        value={closingMode}
                        onChange={(event) =>
                          setClosingMode(event.target.value as CashClosingMode)
                        }
                        className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                      >
                        <option value="MANUAL">Manual/acumulado (padrão)</option>
                        <option value="DAILY_REQUIRED">
                          Fechamento diário obrigatório
                        </option>
                        <option value="DAILY_AUTOMATIC">
                          Fechamento diário automático silencioso
                        </option>
                      </select>
                      {closingMode === "DAILY_REQUIRED" ? (
                        <p className="mt-3 text-xs font-bold text-amber-700">
                          Se o operador esquecer, o sistema bloqueará o trabalho no
                          dia seguinte até o fechamento.
                        </p>
                      ) : null}
                      {closingMode === "DAILY_AUTOMATIC" ? (
                        <p className="mt-3 text-xs font-bold text-emerald-700">
                          Na virada do dia, o caixa anterior será fechado
                          silenciosamente e o saldo final será levado ao saldo
                          inicial do próximo.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                      <div className="text-[10px] font-black tracking-[.16em] text-amber-700">
                        OPERAÇÃO DE CAIXA NÃO HABILITADA
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
                        Ative a permissão <strong>OPERATE_CASHIER</strong> na aba
                        de acesso para configurar o fechamento deste operador.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {policyFeedback ? (
                <p
                  className={`mt-5 text-xs font-black ${policyFeedback.includes("SUCESSO") ? "text-emerald-700" : "text-red-700"}`}
                >
                  {policyFeedback}
                </p>
              ) : null}
            </div>
            <footer className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                disabled={savingPolicy}
                onClick={() => void saveCashOperatorPolicy()}
                className="flex h-12 min-w-[136px] items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500 bg-white px-5 py-2.5 text-xs font-black uppercase tracking-[.08em] text-emerald-700 shadow-sm transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-wait disabled:opacity-60"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 3h11l3 3v15H5z" />
                  <path d="M8 3v6h8V3" />
                  <path d="M8 21v-7h8v7" />
                </svg>
                {savingPolicy ? "SALVANDO..." : "SALVAR"}
              </button>
              <div className="flex min-w-0 justify-end sm:max-w-[58%]">
                <ScreenNameCopy
                  screenId={POPUP_SCREEN_ID}
                  compact
                  className="min-w-0 justify-end"
                  originText="Sistema Financeiro - configurações individuais de usuário."
                  auditText="Configuração auditada do perfil, permissões e fechamento de caixa."
                />
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
