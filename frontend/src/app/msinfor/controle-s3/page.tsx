"use client";

import { postMessageToTrustedParent } from "@/app/lib/trusted-messaging";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuditedPopupShell from "@/app/components/audited-popup-shell";
import GridColumnFilterHeader from "@/app/components/grid-column-filter-header";
import GridStandardFooter from "@/app/components/grid-standard-footer";
import ScreenNameCopy from "@/app/components/screen-name-copy";
import {
  showErrorMessage,
  showSuccessMessage,
} from "@/app/components/system-message-provider";
import { API_BASE_URL, financeApiFetch, requestJson } from "@/app/lib/api";
import { FINANCE_GRID_PAGE_LAYOUT } from "@/app/lib/grid-page-standards";
import { withFinanceBasePath } from "@/app/lib/public-path";
import {
  buildFinanceApiQueryString,
  useFinanceRuntimeContext,
} from "@/app/lib/runtime-context";

const FINANCE_SCREEN_ID = "FINANCEIRO_MSINFOR_CONTROLE_S3";
const EMBEDDED_SCREEN_ID = "PRINCIPAL_FINANCEIRO_MSINFOR_CONTROLE_S3";
const DELETE_POPUP_ID = "POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_EXCLUSAO";
const BATCH_DELETE_POPUP_ID =
  "POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_EXCLUSAO_LOTE";
const CREATE_FOLDER_POPUP_ID =
  "POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_CRIAR_PASTA";
const DELETE_FOLDER_POPUP_ID =
  "POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_EXCLUIR_PASTA";
const UPLOAD_POPUP_ID = "POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_ENVIAR_ARQUIVO";
const RECENT_MOVEMENTS_POPUP_ID =
  "POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_ULTIMOS_MOVIMENTOS";
const ORIGIN =
  "Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/controle-s3/page.tsx";
const UPLOAD_CONCURRENCY = 1;
const MAX_UPLOAD_FILES = 50;

type Configuration = {
  configured: boolean;
  active?: boolean;
  endpoint?: string;
  region?: string;
  bucket?: string;
  basePrefix?: string;
  accessKeyConfigured?: boolean;
  secretKeyConfigured?: boolean;
  forcePathStyle?: boolean;
  capacityGb?: number | null;
  imagesFolder?: string;
  description?: string;
  sourceScope?: string;
};
type Listing = {
  currentPrefix: string;
  folders: Array<{ name: string; prefix: string }>;
  files: Array<{
    name: string;
    key: string;
    size: number;
    lastModified: string | null;
  }>;
  nextContinuationToken: string | null;
  usage: { objectCount: number; totalBytes: number; complete: boolean };
};
type SearchResult = {
  files: Listing["files"];
  matchedObjectCount: number;
  scannedObjectCount: number;
  complete: boolean;
  resultsTruncated: boolean;
};
type RecentS3File = {
  name: string;
  folder: string;
  key: string;
  size: number;
  lastModified: string | null;
};
type RecentS3Response = {
  files: RecentS3File[];
  scannedObjectCount: number;
  complete: boolean;
};
type Row = {
  id: string;
  type: "FOLDER" | "ROOT" | "FILE";
  name: string;
  key: string;
  size?: number;
  lastModified?: string | null;
};
type UsageSummary = { objectCount: number; totalBytes: number };
type UsageResponse = {
  prefix: string;
  summary?: UsageSummary;
  summaries?: Array<{ prefix: string } & UsageSummary>;
};
type GridColumnKey = "type" | "name" | "size" | "files" | "modified";
type GridSort = { key: GridColumnKey | null; direction: "ASC" | "DESC" };
type GridFilters = Record<GridColumnKey, string>;
type DateRange = { from: string; to: string };
type UploadProgress = {
  completed: number;
  total: number;
  skipped: number;
  selected: number;
  phase: "CHECKING" | "UPLOADING";
};
function formatSize(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let current = value;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`;
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
function parentPrefix(prefix: string) {
  const items = prefix.split("/").filter(Boolean);
  items.pop();
  return items.join("/");
}
function configurationOriginLabel(sourceScope?: string) {
  return sourceScope === "BRANCH"
    ? "FILIAL"
    : sourceScope === "SOFTHOUSE"
      ? "SOFTHOUSE"
      : "EMPRESA";
}

function S3DateFilterHeader({
  isOpen,
  isActive,
  sortDirection,
  from,
  to,
  onToggle,
  onSort,
  onFromChange,
  onToChange,
  onApply,
  onClear,
}: {
  isOpen: boolean;
  isActive: boolean;
  sortDirection: "ASC" | "DESC" | null;
  from: string;
  to: string;
  onToggle: () => void;
  onSort: (direction: "ASC" | "DESC") => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div className="relative inline-flex items-center gap-1.5">
      <span>Alterado em</span>
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${isActive ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600"}`}
        title="Filtrar Alterado em"
        aria-label="Filtrar Alterado em"
        aria-expanded={isOpen}
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"
          />
        </svg>
      </button>
      {isOpen ? (
        <div className="absolute right-0 top-8 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-left normal-case tracking-normal text-slate-700 shadow-xl">
          <div className="mb-3 space-y-2 border-b border-slate-100 pb-3">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Ordenar coluna
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSort("ASC")}
                className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] ${sortDirection === "ASC" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                Crescente
              </button>
              <button
                type="button"
                onClick={() => onSort("DESC")}
                className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase tracking-[0.08em] ${sortDirection === "DESC" ? "border-blue-300 bg-blue-100 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                Decrescente
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Filtrar período
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                De
              </span>
              <input
                type="date"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                Até
              </span>
              <input
                type="date"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500"
              />
            </label>
            <button
              type="button"
              onClick={onApply}
              className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700"
            >
              Filtrar
            </button>
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600"
            >
              Limpar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ControleS3Page() {
  const runtimeContext = useFinanceRuntimeContext();
  const [mounted, setMounted] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration | null>(
    null,
  );
  const [listing, setListing] = useState<Listing | null>(null);
  const [usageByPrefix, setUsageByPrefix] = useState<
    Record<string, UsageSummary>
  >({});
  const [prefix, setPrefix] = useState("");
  const [showRootFiles, setShowRootFiles] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [search, setSearch] = useState("");
  const [extension, setExtension] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [calculatingUsagePrefix, setCalculatingUsagePrefix] = useState<
    string | null
  >(null);
  const [activeFilterColumn, setActiveFilterColumn] =
    useState<GridColumnKey | null>(null);
  const [filterDrafts, setFilterDrafts] = useState<GridFilters>({
    type: "",
    name: "",
    size: "",
    files: "",
    modified: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<GridFilters>({
    type: "",
    name: "",
    size: "",
    files: "",
    modified: "",
  });
  const [gridSort, setGridSort] = useState<GridSort>({
    key: null,
    direction: "ASC",
  });
  const [dateFilterDraft, setDateFilterDraft] = useState<DateRange>({
    from: "",
    to: "",
  });
  const [dateFilterApplied, setDateFilterApplied] = useState<DateRange>({
    from: "",
    to: "",
  });
  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [checkingFolderId, setCheckingFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderParentPrefix, setFolderParentPrefix] = useState("");
  const [uploadTargetPrefix, setUploadTargetPrefix] = useState("");
  const [uploadTarget, setUploadTarget] = useState<Row | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<Row | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [recentMovementsOpen, setRecentMovementsOpen] = useState(false);
  const [recentMovementsLoading, setRecentMovementsLoading] = useState(false);
  const [recentMovementsError, setRecentMovementsError] = useState<
    string | null
  >(null);
  const [recentFiles, setRecentFiles] = useState<RecentS3File[]>([]);
  const [recentMovementsPrefix, setRecentMovementsPrefix] = useState("");
  const [recentMovementsFolderName, setRecentMovementsFolderName] =
    useState("");
  const [recentMovementsRootOnly, setRecentMovementsRootOnly] = useState(false);
  const [recentPageSize, setRecentPageSize] = useState(20);
  const [recentCurrentPage, setRecentCurrentPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenId = runtimeContext.embedded
    ? EMBEDDED_SCREEN_ID
    : FINANCE_SCREEN_ID;
  const contextPayload = useMemo(
    () => ({
      sourceSystem: runtimeContext.sourceSystem,
      sourceTenantId: runtimeContext.sourceTenantId,
      sourceBranchCode: runtimeContext.sourceBranchCode,
      requestedBy:
        runtimeContext.cashierDisplayName ||
        runtimeContext.cashierUserId ||
        "ADMIN_FINANCEIRO",
    }),
    [runtimeContext],
  );
  const apiQuery = useMemo(
    () =>
      buildFinanceApiQueryString(runtimeContext, {
        sourceBranchCode: runtimeContext.sourceBranchCode,
      }),
    [runtimeContext],
  );

  const loadConfiguration = useCallback(async () => {
    try {
      const loaded = await requestJson<Configuration>(
        `/s3-control/effective-configuration${apiQuery}`,
      );
      setMessage(null);
      setConfiguration(loaded);
      return loaded;
    } catch (error: any) {
      setMessage(
        error?.message || "Não foi possível carregar a configuração S3.",
      );
      return null;
    }
  }, [apiQuery]);

  const loadListing = useCallback(
    async (
      nextPrefix = "",
      continuationToken?: string,
      keepRootFilesView = false,
    ) => {
      if (!configuration?.configured) return;
      setIsLoading(true);
      setMessage(null);
      try {
        const query = new URLSearchParams(apiQuery.replace(/^\?/, ""));
        query.set("prefix", nextPrefix);
        if (continuationToken)
          query.set("continuationToken", continuationToken);
        const loaded = await requestJson<Listing>(
          `/s3-control/objects?${query.toString()}`,
        );
        setPrefix(nextPrefix);
        if (!continuationToken) {
          setShowRootFiles(keepRootFilesView);
          setIsSearchMode(false);
        }
        setListing((previous) =>
          continuationToken && previous
            ? {
                ...loaded,
                folders: [...previous.folders, ...loaded.folders],
                files: [...previous.files, ...loaded.files],
              }
            : loaded,
        );
      } catch (error: any) {
        setMessage(error?.message || "Não foi possível consultar o S3.");
      } finally {
        setIsLoading(false);
      }
    },
    [apiQuery, configuration?.configured],
  );

  const searchObjects = useCallback(async () => {
    const term = search.trim();
    const normalizedExtension = extension.trim().replace(/^\.+/, "");
    if (!term && !normalizedExtension) {
      setMessage("Informe o nome ou a extensão do arquivo para pesquisar.");
      return;
    }
    if (!configuration?.configured) return;
    setIsLoading(true);
    setMessage(null);
    try {
      const query = new URLSearchParams(apiQuery.replace(/^\?/, ""));
      if (prefix) query.set("prefix", prefix);
      if (term) query.set("term", term);
      if (normalizedExtension) query.set("extension", normalizedExtension);
      const loaded = await requestJson<SearchResult>(
        `/s3-control/search?${query.toString()}`,
      );
      setPrefix("");
      setShowRootFiles(false);
      setIsSearchMode(true);
      setCurrentPage(1);
      setListing((previous) => ({
        currentPrefix: "",
        folders: [],
        files: loaded.files,
        nextContinuationToken: null,
        usage: previous?.usage || {
          objectCount: 0,
          totalBytes: 0,
          complete: true,
        },
      }));
      setMessage(
        `${loaded.matchedObjectCount} arquivo(s) localizado(s) em ${loaded.scannedObjectCount.toLocaleString("pt-BR")} objeto(s) analisado(s).${loaded.resultsTruncated ? " A lista foi limitada a 2.000 resultados." : ""}${!loaded.complete ? " A busca foi limitada aos primeiros 10.000 objetos." : ""}`,
      );
    } catch (error: any) {
      setMessage(
        error?.message || "Não foi possível pesquisar os arquivos no S3.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [apiQuery, configuration?.configured, extension, prefix, search]);

  const calculateUsage = useCallback(
    async (nextPrefix = "", calculateAll = false) => {
      if (!configuration?.configured) return;
      setCalculatingUsagePrefix(calculateAll ? "__ALL__" : nextPrefix);
      setMessage(null);
      try {
        const query = new URLSearchParams(apiQuery.replace(/^\?/, ""));
        if (nextPrefix) query.set("prefix", nextPrefix);
        if (calculateAll) query.set("all", "true");
        const loaded = await requestJson<UsageResponse>(
          `/s3-control/usage?${query.toString()}`,
        );
        if (calculateAll)
          setUsageByPrefix(
            Object.fromEntries(
              (loaded.summaries || []).map((item) => [
                item.prefix,
                { objectCount: item.objectCount, totalBytes: item.totalBytes },
              ]),
            ),
          );
        else if (loaded.summary)
          setUsageByPrefix((current) => ({
            ...current,
            [nextPrefix]: loaded.summary!,
          }));
        setMessage(
          calculateAll
            ? "Tamanho geral calculado por pasta, subpasta e raiz."
            : `Uso calculado: ${loaded.summary?.objectCount || 0} arquivo(s) · ${formatSize(loaded.summary?.totalBytes || 0)}.`,
        );
      } catch (error: any) {
        setMessage(
          error?.message || "Não foi possível calcular o tamanho do S3.",
        );
      } finally {
        setCalculatingUsagePrefix(null);
      }
    },
    [apiQuery, configuration?.configured],
  );

  const loadRecentMovements = useCallback(
    async (folderPrefix = "", rootOnly = false) => {
      if (!configuration?.configured) return;
      setRecentMovementsLoading(true);
      setRecentMovementsError(null);
      try {
        const query = new URLSearchParams(apiQuery.replace(/^\?/, ""));
        query.set("limit", "100");
        if (rootOnly) query.set("rootOnly", "true");
        if (folderPrefix) query.set("prefix", folderPrefix);
        const loaded = await requestJson<RecentS3Response>(
          `/s3-control/recent-objects?${query.toString()}`,
        );
        setRecentFiles(loaded.files || []);
        setRecentCurrentPage(1);
      } catch (error: any) {
        setRecentMovementsError(
          error?.message ||
            "Não foi possível consultar os últimos movimentos do S3.",
        );
      } finally {
        setRecentMovementsLoading(false);
      }
    },
    [apiQuery, configuration?.configured],
  );

  const openRecentMovements = (folder?: Pick<Row, "key" | "name" | "type">) => {
    const selectedPrefix = folder?.key || "";
    const rootOnly = folder?.type === "ROOT";
    setRecentMovementsPrefix(selectedPrefix);
    setRecentMovementsFolderName(folder?.name || (rootOnly ? "RAIZ" : ""));
    setRecentMovementsRootOnly(rootOnly);
    setRecentMovementsOpen(true);
    void loadRecentMovements(selectedPrefix, rootOnly);
  };

  const getS3FileViewUrl = (file: RecentS3File) => {
    const query = new URLSearchParams(apiQuery.replace(/^\?/, ""));
    query.set("key", file.key);
    return `${API_BASE_URL}/s3-control/object/view?${query.toString()}`;
  };

  useEffect(() => {
    setMounted(true);
    void loadConfiguration();
  }, [loadConfiguration]);
  useEffect(() => {
    if (runtimeContext.embedded && window.parent !== window)
      postMessageToTrustedParent({
        type: "MSINFOR_SCREEN_CONTEXT",
        screenId: EMBEDDED_SCREEN_ID,
      });
  }, [runtimeContext.embedded]);
  useEffect(() => {
    if (configuration?.configured && configuration.active) void loadListing("");
  }, [configuration?.configured, configuration?.active]);

  const rows = useMemo<Row[]>(() => {
    const folders = (listing?.folders || []).map((item) => ({
      id: `F-${item.prefix}`,
      type: "FOLDER" as const,
      name: item.name,
      key: item.prefix,
    }));
    const files = (listing?.files || []).map((item) => ({
      id: `A-${item.key}`,
      type: "FILE" as const,
      ...item,
    }));
    const all = isSearchMode
      ? files
      : prefix === ""
        ? [
            ...folders,
            ...files,
            { id: "F-ROOT", type: "ROOT" as const, name: "RAIZ", key: "" },
          ]
        : [...folders, ...files];
    return all;
  }, [isSearchMode, listing, prefix, showRootFiles]);
  const filteredRows = useMemo(() => {
    const normalized = (value: string) => value.trim().toUpperCase();
    const valueFor = (row: Row, key: GridColumnKey) => {
      if (key === "type")
        return row.type === "FILE"
          ? "ARQUIVO"
          : row.type === "ROOT"
            ? "PASTA RAIZ"
            : row.key.includes("/")
              ? "SUBPASTA"
              : "PASTA";
      if (key === "name") return row.name;
      if (key === "size")
        return row.type === "FILE"
          ? formatSize(row.size || 0)
          : usageByPrefix[row.key]
            ? formatSize(usageByPrefix[row.key].totalBytes)
            : "";
      if (key === "files")
        return row.type === "FILE"
          ? ""
          : usageByPrefix[row.key]
            ? String(usageByPrefix[row.key].objectCount)
            : "";
      return row.type === "FILE" ? formatDate(row.lastModified) : "";
    };
    const keys = Object.keys(appliedFilters) as GridColumnKey[];
    const result = rows.filter((row) => {
      if (
        !keys
          .filter((key) => key !== "modified")
          .every(
            (key) =>
              !normalized(appliedFilters[key]) ||
              normalized(valueFor(row, key)).includes(
                normalized(appliedFilters[key]),
              ),
          )
      )
        return false;
      const rowDate = row.lastModified ? row.lastModified.slice(0, 10) : "";
      if (
        dateFilterApplied.from &&
        (!rowDate || rowDate < dateFilterApplied.from)
      )
        return false;
      if (dateFilterApplied.to && (!rowDate || rowDate > dateFilterApplied.to))
        return false;
      return true;
    });
    if (!gridSort.key) return result;
    const key = gridSort.key;
    return [...result].sort((left, right) => {
      const comparison = valueFor(left, key).localeCompare(
        valueFor(right, key),
        "pt-BR",
        { numeric: true, sensitivity: "base" },
      );
      return gridSort.direction === "ASC" ? comparison : -comparison;
    });
  }, [appliedFilters, dateFilterApplied, gridSort, rows, usageByPrefix]);
  const hasActiveGridFilters =
    Object.values(appliedFilters).some(Boolean) ||
    Boolean(dateFilterApplied.from || dateFilterApplied.to) ||
    Boolean(gridSort.key);
  const clearAllGridFilters = () => {
    setFilterDrafts({ type: "", name: "", size: "", files: "", modified: "" });
    setAppliedFilters({
      type: "",
      name: "",
      size: "",
      files: "",
      modified: "",
    });
    setDateFilterDraft({ from: "", to: "" });
    setDateFilterApplied({ from: "", to: "" });
    setGridSort({ key: null, direction: "ASC" });
    setActiveFilterColumn(null);
    setCurrentPage(1);
  };
  const loadedTotalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / pageSize),
  );
  const navigationTotalPages =
    loadedTotalPages + (listing?.nextContinuationToken ? 1 : 0);
  const normalizedCurrentPage = Math.min(currentPage, loadedTotalPages);
  const paginatedRows = useMemo(
    () =>
      filteredRows.slice(
        (normalizedCurrentPage - 1) * pageSize,
        normalizedCurrentPage * pageSize,
      ),
    [filteredRows, normalizedCurrentPage, pageSize],
  );

  const recentTotalPages = Math.max(
    1,
    Math.ceil(recentFiles.length / recentPageSize),
  );
  const normalizedRecentCurrentPage = Math.min(
    recentCurrentPage,
    recentTotalPages,
  );
  const paginatedRecentFiles = useMemo(
    () =>
      recentFiles.slice(
        (normalizedRecentCurrentPage - 1) * recentPageSize,
        normalizedRecentCurrentPage * recentPageSize,
      ),
    [normalizedRecentCurrentPage, recentFiles, recentPageSize],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [prefix]);

  const changePage = (nextPage: number) => {
    if (nextPage <= loadedTotalPages) {
      setCurrentPage(nextPage);
      return;
    }
    if (listing?.nextContinuationToken && !isLoading) {
      void loadListing(prefix, listing.nextContinuationToken).then(() =>
        setCurrentPage(nextPage),
      );
    }
  };

  const selectableRows = filteredRows.filter((row) => row.type === "FILE");
  const allSelectableRowsSelected =
    selectableRows.length > 0 &&
    selectableRows.every((row) => selectedFileKeys.includes(row.key));
  const toggleFileSelection = (key: string) => {
    setSelectedFileKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };
  const toggleAllFileSelection = () => {
    setSelectedFileKeys((current) =>
      allSelectableRowsSelected
        ? current.filter(
            (key) => !selectableRows.some((row) => row.key === key),
          )
        : Array.from(
            new Set([...current, ...selectableRows.map((row) => row.key)]),
          ),
    );
  };

  const deleteFilesBatch = async () => {
    if (!selectedFileKeys.length) return;
    setIsDeleting(true);
    setMessage(null);
    try {
      const result = await requestJson<{
        success: boolean;
        deletedCount: number;
      }>("/s3-control/objects/batch", {
        method: "DELETE",
        body: JSON.stringify({ ...contextPayload, keys: selectedFileKeys }),
      });
      setBatchDeleteOpen(false);
      setSelectedFileKeys([]);
      setMessage(
        `${result.deletedCount} arquivo(s) excluído(s) e operação registrada na auditoria do Financeiro.`,
      );
      await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) {
      setMessage(
        error?.message || "Não foi possível excluir os arquivos selecionados.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteFile = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setMessage(null);
    try {
      await requestJson<{ success: boolean }>("/s3-control/object", {
        method: "DELETE",
        body: JSON.stringify({ ...contextPayload, key: deleteTarget.key }),
      });
      setDeleteTarget(null);
      setMessage(
        "Arquivo excluído e operação registrada na auditoria do Financeiro.",
      );
      await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) {
      setMessage(error?.message || "Não foi possível excluir o arquivo.");
    } finally {
      setIsDeleting(false);
    }
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) {
      setMessage("Informe o nome da nova pasta.");
      return;
    }
    setIsCreatingFolder(true);
    setMessage(null);
    try {
      await requestJson<{ success: boolean }>("/s3-control/folder", {
        method: "POST",
        body: JSON.stringify({
          ...contextPayload,
          prefix: folderParentPrefix,
          name,
        }),
      });
      setFolderModalOpen(false);
      setFolderName("");
      setMessage(
        "Pasta criada e operação registrada na auditoria do Financeiro.",
      );
      await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) {
      setMessage(error?.message || "Não foi possível criar a pasta no S3.");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openCreateFolder = (parentPrefix: string) => {
    setFolderParentPrefix(parentPrefix);
    setFolderName("");
    setFolderModalOpen(true);
  };
  const requestFolderDeletion = async (target: Row) => {
    setCheckingFolderId(target.id);
    try {
      const query = new URLSearchParams(apiQuery.replace(/^\?/, ""));
      query.set("prefix", target.key);
      const status = await requestJson<{ empty: boolean }>(
        `/s3-control/folder-status?${query.toString()}`,
      );
      if (!status.empty) {
        showErrorMessage(
          "Não é possível excluir uma pasta que possua arquivos ou subpastas.",
          runtimeContext.logoUrl,
        );
        return;
      }
      setFolderDeleteTarget(target);
    } catch (error: any) {
      showErrorMessage(
        error?.message || "Não foi possível verificar o conteúdo da pasta.",
        runtimeContext.logoUrl,
      );
    } finally {
      setCheckingFolderId(null);
    }
  };
  const deleteFolder = async () => {
    if (!folderDeleteTarget) return;
    setIsDeleting(true);
    setMessage(null);
    try {
      await requestJson<{ success: boolean }>("/s3-control/folder", {
        method: "DELETE",
        body: JSON.stringify({
          ...contextPayload,
          prefix: folderDeleteTarget.key,
        }),
      });
      setFolderDeleteTarget(null);
      setMessage(
        "Pasta vazia excluída e operação registrada na auditoria do Financeiro.",
      );
      await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) {
      setMessage(error?.message || "Não foi possível excluir a pasta no S3.");
    } finally {
      setIsDeleting(false);
    }
  };

  const uploadFiles = async (files?: FileList | File[]) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    if (selectedFiles.length > MAX_UPLOAD_FILES) {
      const limitMessage = `Selecione no máximo ${MAX_UPLOAD_FILES} arquivos por envio.`;
      setMessage(limitMessage);
      showErrorMessage(limitMessage, runtimeContext.logoUrl);
      return;
    }
    setIsUploading(true);
    setMessage(null);
    setUploadProgress({
      completed: 0,
      total: selectedFiles.length,
      skipped: 0,
      selected: selectedFiles.length,
      phase: "CHECKING",
    });
    let completed = 0;
    try {
      const namesQuery = new URLSearchParams(apiQuery.replace(/^\?/, ""));
      if (uploadTargetPrefix) namesQuery.set("prefix", uploadTargetPrefix);
      const existing = await requestJson<{ names: string[] }>(
        `/s3-control/objects/names?${namesQuery.toString()}`,
      );
      const existingNames = new Set(
        (existing.names || []).map((name) => name.toLocaleLowerCase("pt-BR")),
      );
      const filesToUpload = selectedFiles.filter(
        (file) => !existingNames.has(file.name.toLocaleLowerCase("pt-BR")),
      );
      const skipped = selectedFiles.length - filesToUpload.length;
      setUploadProgress({
        completed: 0,
        total: filesToUpload.length,
        skipped,
        selected: selectedFiles.length,
        phase: "UPLOADING",
      });
      if (!filesToUpload.length) {
        setMessage(
          `${skipped} arquivo(s) já estavam no S3; nenhum reenvio foi necessário.`,
        );
        await loadListing(prefix, undefined, showRootFiles);
        return;
      }
      const uploadFile = async (file: File) => {
        const formData = new FormData();
        if (uploadTargetPrefix) formData.append("prefix", uploadTargetPrefix);
        formData.append("file", file);
        const response = await financeApiFetch("/s3-control/upload", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            payload?.message ||
              "Não foi possível enviar um dos arquivos ao S3.",
          );
        completed += 1;
        setUploadProgress((current) =>
          current ? { ...current, completed } : current,
        );
      };
      for (
        let start = 0;
        start < filesToUpload.length;
        start += UPLOAD_CONCURRENCY
      ) {
        const batch = filesToUpload.slice(start, start + UPLOAD_CONCURRENCY);
        const results = await Promise.allSettled(batch.map(uploadFile));
        const failed = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        if (failed) throw failed.reason;
      }
      const successMessage = `${completed} arquivo(s) enviado(s) com sucesso${skipped ? `; ${skipped} arquivo(s) já existentes foram ignorados` : ""}.`;
      setMessage(successMessage);
      showSuccessMessage(successMessage, runtimeContext.logoUrl);
      await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) {
      const reason =
        error?.message === "Failed to fetch"
          ? "A conexão com o servidor foi interrompida durante o envio."
          : error?.message || "Não foi possível enviar os arquivos ao S3.";
      setMessage(
        `${reason} ${completed ? `${completed} arquivo(s) foram enviados antes da interrupção.` : "Nenhum arquivo foi confirmado como enviado."}`,
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      window.setTimeout(() => setUploadProgress(null), 3000);
    }
  };
  const confirmUpload = () => {
    if (!uploadTarget) return;
    setUploadTargetPrefix(uploadTarget.key);
    setUploadTarget(null);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };
  const handleUploadFileSelection = (files: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length <= MAX_UPLOAD_FILES) {
      setPendingUploadFiles(selectedFiles);
      return;
    }
    const limitMessage = `Foram selecionados ${selectedFiles.length} arquivos. O limite é de ${MAX_UPLOAD_FILES} arquivos por envio.`;
    setPendingUploadFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMessage(limitMessage);
    showErrorMessage(limitMessage, runtimeContext.logoUrl);
  };

  if (!mounted)
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-sm font-bold text-slate-500">
        CARREGANDO CONTROLE S3...
      </div>
    );
  if (runtimeContext.userRole !== "ADMIN")
    return (
      <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center text-sm font-bold text-amber-700">
        ACESSO RESTRITO AO PERFIL ADMIN.
      </div>
    );

  const renderDateGridFilterHeader = () => (
    <S3DateFilterHeader
      isOpen={activeFilterColumn === "modified"}
      isActive={
        Boolean(dateFilterApplied.from || dateFilterApplied.to) ||
        gridSort.key === "modified"
      }
      sortDirection={gridSort.key === "modified" ? gridSort.direction : null}
      from={dateFilterDraft.from}
      to={dateFilterDraft.to}
      onToggle={() => {
        setDateFilterDraft(dateFilterApplied);
        setActiveFilterColumn((current) =>
          current === "modified" ? null : "modified",
        );
      }}
      onSort={(direction) => {
        setGridSort({ key: "modified", direction });
        setActiveFilterColumn(null);
        setCurrentPage(1);
      }}
      onFromChange={(value) =>
        setDateFilterDraft((current) => ({ ...current, from: value }))
      }
      onToChange={(value) =>
        setDateFilterDraft((current) => ({ ...current, to: value }))
      }
      onApply={() => {
        setDateFilterApplied(dateFilterDraft);
        setActiveFilterColumn(null);
        setCurrentPage(1);
      }}
      onClear={() => {
        setDateFilterDraft({ from: "", to: "" });
        setDateFilterApplied({ from: "", to: "" });
        setActiveFilterColumn(null);
        setCurrentPage(1);
      }}
    />
  );
  const renderGridFilterHeader = (
    key: GridColumnKey,
    label: string,
    align: "left" | "right" = "left",
    first = false,
  ) => (
    <div className="flex items-center gap-1.5">
      {first ? (
        <button
          type="button"
          onClick={clearAllGridFilters}
          title="Limpar todos os filtros"
          aria-label="Limpar todos os filtros"
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${hasActiveGridFilters ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-400"}`}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 6l12 12M18 6L6 18"
            />
          </svg>
        </button>
      ) : null}
      <GridColumnFilterHeader
        label={label}
        isOpen={activeFilterColumn === key}
        isActive={Boolean(appliedFilters[key]) || gridSort.key === key}
        filterValue={filterDrafts[key]}
        placeholder={`FILTRAR ${label.toUpperCase()}`}
        align={align}
        sortDirection={gridSort.key === key ? gridSort.direction : null}
        onToggle={() => {
          setFilterDrafts((current) => ({
            ...current,
            [key]: appliedFilters[key],
          }));
          setActiveFilterColumn((current) => (current === key ? null : key));
        }}
        onSort={(direction) => {
          setGridSort({ key, direction });
          setActiveFilterColumn(null);
          setCurrentPage(1);
        }}
        onFilterValueChange={(value) =>
          setFilterDrafts((current) => ({
            ...current,
            [key]: value.toUpperCase(),
          }))
        }
        onApply={() => {
          setAppliedFilters((current) => ({
            ...current,
            [key]: filterDrafts[key],
          }));
          setActiveFilterColumn(null);
          setCurrentPage(1);
        }}
        onClear={() => {
          setFilterDrafts((current) => ({ ...current, [key]: "" }));
          setAppliedFilters((current) => ({ ...current, [key]: "" }));
          setActiveFilterColumn(null);
          setCurrentPage(1);
        }}
      />
    </div>
  );
  const configuredCapacityGb = Number(configuration?.capacityGb ?? 0);
  const capacityBytes =
    Number.isFinite(configuredCapacityGb) && configuredCapacityGb > 0
      ? configuredCapacityGb * 1024 * 1024 * 1024
      : 0;
  const usageBytes = listing?.usage.totalBytes || 0;
  const usagePercent =
    capacityBytes > 0 ? (usageBytes / capacityBytes) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, usagePercent));
  const uploadProgressPercent = uploadProgress?.total
    ? Math.round((uploadProgress.completed / uploadProgress.total) * 100)
    : 0;
  const recentMovementsScoped =
    recentMovementsRootOnly || Boolean(recentMovementsPrefix);
  return (
    <div className="flex h-[calc(100vh-1rem)] min-h-0 flex-col gap-5">
      {isUploading && uploadProgress ? (
        <div
          aria-live="polite"
          aria-busy="true"
          data-system-message-ignore
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
        >
          <section className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/30 bg-white text-center shadow-2xl">
            <div className="bg-gradient-to-r from-violet-800 via-violet-700 to-blue-700 px-6 py-5 text-white">
              <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white shadow-xl">
                <img
                  src={
                    runtimeContext.logoUrl ||
                    withFinanceBasePath("/logo-msinfor.jpg")
                  }
                  alt="MSINFOR"
                  className="h-full w-full object-contain p-1"
                />
              </div>
              <div className="mt-3 text-sm font-black uppercase tracking-[0.16em]">
                {uploadProgress.phase === "CHECKING"
                  ? "Conferindo arquivos no S3"
                  : "Transferindo arquivos"}
              </div>
              <div className="mt-1 text-xs font-semibold text-violet-100">
                {uploadProgress.phase === "CHECKING"
                  ? "Verificando o que já foi enviado para evitar duplicidade."
                  : "Aguarde a conclusão do envio ao S3."}
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-end justify-between gap-3">
                <div className="text-left">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                    Progresso
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-800">
                    {uploadProgress.phase === "CHECKING"
                      ? `Conferindo ${uploadProgress.selected} arquivo(s)`
                      : `${uploadProgress.completed} de ${uploadProgress.total} arquivo(s) enviado(s)`}
                  </div>
                  {uploadProgress.skipped ? (
                    <div className="mt-1 text-xs font-semibold text-violet-700">
                      {uploadProgress.skipped} já existente(s) no S3
                    </div>
                  ) : null}
                </div>
                <div className="text-3xl font-black text-violet-700">
                  {uploadProgress.phase === "CHECKING"
                    ? "..."
                    : `${uploadProgressPercent}%`}
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-violet-100">
                <div
                  className={`h-full rounded-full bg-violet-600 transition-all duration-300 ${uploadProgress.phase === "CHECKING" ? "w-1/3 animate-pulse" : ""}`}
                  style={
                    uploadProgress.phase === "UPLOADING"
                      ? { width: `${uploadProgressPercent}%` }
                      : undefined
                  }
                />
              </div>
            </div>
          </section>
        </div>
      ) : null}
      <section
        className={`${FINANCE_GRID_PAGE_LAYOUT.card} shrink-0 overflow-hidden`}
      >
        <div className="px-5 py-2">
          <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-700">
            <span>USO DO S3</span>
            <div className="flex items-center gap-3">
              <span>
                {formatSize(usageBytes)}
                {capacityBytes > 0
                  ? ` DE ${formatSize(capacityBytes)} · ${usagePercent.toFixed(1)}%`
                  : ""}{" "}
                · {listing?.usage.objectCount || 0} OBJETOS
              </span>
              <button
                type="button"
                onClick={() => openRecentMovements()}
                disabled={!configuration?.configured || recentMovementsLoading}
                className="shrink-0 rounded-xl bg-blue-700 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50"
              >
                {recentMovementsLoading
                  ? "Consultando..."
                  : "Últimos movimentos"}
              </button>
            </div>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${usagePercent > 100 ? "bg-rose-500" : "bg-blue-500"}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              {capacityBytes > 0
                ? "Percentual calculado sobre a capacidade informada no cadastro de origem"
                : "Informe a capacidade no cadastro S3 da empresa, filial ou softhouse de origem"}
            </div>
            <button
              type="button"
              onClick={() => void calculateUsage("", true)}
              disabled={
                calculatingUsagePrefix === "__ALL__" ||
                !configuration?.configured
              }
              className="shrink-0 rounded-xl bg-indigo-700 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50"
            >
              {calculatingUsagePrefix === "__ALL__"
                ? "Calculando..."
                : "Calcular tamanho geral"}
            </button>
          </div>
          {configuration?.imagesFolder ? (
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Pasta de imagens informativa: {configuration.imagesFolder}
            </div>
          ) : null}
        </div>
      </section>
      {message ? (
        <div className="shrink-0 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          {message}
        </div>
      ) : null}
      {uploadProgress ? (
        <section className="shrink-0 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs font-black text-violet-900">
            <span>
              ENVIANDO ARQUIVOS: {uploadProgress.completed} DE{" "}
              {uploadProgress.total}
            </span>
            <span>{uploadProgressPercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-300"
              style={{ width: `${uploadProgressPercent}%` }}
            />
          </div>
        </section>
      ) : null}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            {!isSearchMode && prefix ? (
              <button
                type="button"
                onClick={() => void loadListing(parentPrefix(prefix))}
                title="Pasta anterior"
                aria-label="Pasta anterior"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-red-400 hover:text-red-600"
              >
                <svg
                  viewBox="0 0 64 64"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-7 w-7"
                >
                  <path d="M12 35h18l5 6h17v13H12z" />
                  <path d="M52 27c0-11-9-19-20-19H19m0 0 8-8m-8 8 8 8" />
                </svg>
              </button>
            ) : null}
            <div className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white">
              PASTA ATUAL:{" "}
              {isSearchMode
                ? "RESULTADO DA PESQUISA"
                : prefix
                  ? `RAIZ/${prefix}`
                  : "RAIZ"}
            </div>
          </div>
          <div className="min-w-0 flex-1 px-3 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            <span>
              ORIGEM:{" "}
              <strong className="text-slate-700">
                {configurationOriginLabel(configuration?.sourceScope)}
              </strong>
            </span>
            {configuration?.description ? (
              <span className="ml-3">· {configuration.description}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedFileKeys.length ? (
              <button
                type="button"
                onClick={() => setBatchDeleteOpen(true)}
                className="rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black uppercase text-white"
              >
                Excluir selecionados ({selectedFileKeys.length})
              </button>
            ) : null}
            {!isSearchMode && prefix ? (
              <button
                onClick={() => void loadListing("", undefined, true)}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-emerald-700"
              >
                Voltar para pasta raiz
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 md:grid-cols-[1fr_220px_auto]">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => handleUploadFileSelection(event.target.files)}
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchObjects();
            }}
            placeholder="NOME DO ARQUIVO"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase outline-none focus:border-blue-300"
          />
          <input
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void searchObjects();
            }}
            placeholder="EXTENSÃO (OPCIONAL)"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase outline-none focus:border-blue-300"
          />
          <button
            type="button"
            onClick={() => void searchObjects()}
            disabled={isLoading}
            className="h-10 rounded-xl bg-blue-700 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50"
          >
            {isLoading ? "Pesquisando..." : "Pesquisar"}
          </button>
        </div>
        {!configuration?.configured ? (
          <div className="px-5 py-14 text-center text-sm font-bold text-slate-500">
            Configure o S3 no cadastro da empresa, filial ou softhouse de origem
            para iniciar a consulta.
          </div>
        ) : isLoading && !listing ? (
          <div className="px-5 py-14 text-center text-sm font-bold text-slate-500">
            CONSULTANDO S3...
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(226,232,240,1)] text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={allSelectableRowsSelected}
                            onChange={toggleAllFileSelection}
                            disabled={!selectableRows.length || isDeleting}
                            aria-label="Marcar todos os arquivos"
                            className="h-4 w-4 accent-blue-700"
                          />
                          <span className="sr-only">Marcar todos</span>
                        </label>
                        {renderGridFilterHeader("type", "Tipo", "left", true)}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left">
                      {renderGridFilterHeader("name", "Nome")}
                    </th>
                    <th className="px-4 py-3 text-left">
                      {renderGridFilterHeader("size", "Tamanho")}
                    </th>
                    <th className="px-4 py-3 text-left">
                      {renderGridFilterHeader("files", "Arquivos")}
                    </th>
                    <th className="px-4 py-3 text-left">
                      {renderDateGridFilterHeader()}
                    </th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`transition hover:bg-blue-50 ${index % 2 ? "bg-slate-200/70" : "bg-white"}`}
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          {row.type === "FILE" ? (
                            <input
                              type="checkbox"
                              checked={selectedFileKeys.includes(row.key)}
                              onChange={() => toggleFileSelection(row.key)}
                              disabled={isDeleting}
                              aria-label={`Marcar ${row.name}`}
                              className="h-4 w-4 accent-blue-700"
                            />
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${row.type === "FILE" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}
                          >
                            {row.type === "FILE"
                              ? "ARQUIVO"
                              : row.type === "ROOT"
                                ? "PASTA RAIZ"
                                : row.key.includes("/")
                                  ? "SUBPASTA"
                                  : "PASTA"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-sm font-bold text-slate-800">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 align-middle text-sm font-semibold text-slate-600">
                        {row.type === "FILE"
                          ? formatSize(row.size || 0)
                          : usageByPrefix[row.key]
                            ? formatSize(usageByPrefix[row.key].totalBytes)
                            : "—"}
                      </td>
                      <td className="px-4 py-3 align-middle text-sm font-semibold text-slate-600">
                        {row.type === "FILE"
                          ? "—"
                          : (usageByPrefix[row.key]?.objectCount ?? "—")}
                      </td>
                      <td className="px-4 py-3 align-middle text-sm font-semibold text-slate-600">
                        {row.type === "FILE"
                          ? formatDate(row.lastModified)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="flex justify-end gap-2">
                          {row.type === "FILE" ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              title="Excluir arquivo"
                              aria-label="Excluir arquivo"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-700"
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-4 w-4"
                              >
                                <path d="M4 7h16" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M6 7l1 13h10l1-13" />
                                <path d="M9 7V4h6v3" />
                              </svg>
                              <span className="sr-only">Excluir arquivo</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  row.type === "ROOT"
                                    ? openCreateFolder("")
                                    : openCreateFolder(row.key)
                                }
                                title="Nova pasta"
                                aria-label="Nova pasta"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white transition hover:bg-emerald-700"
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  className="h-5 w-5"
                                >
                                  <path d="M12 5v14M5 12h14" />
                                </svg>
                                <span className="sr-only">Nova pasta</span>
                              </button>
                              {row.type !== "ROOT" ? (
                                <button
                                  type="button"
                                  onClick={() => void loadListing(row.key)}
                                  title="Abrir pasta"
                                  aria-label="Abrir pasta"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                                >
                                  <span
                                    className="far fa-folder-open text-base"
                                    aria-hidden="true"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                    >
                                      <path d="M3 7h6l2 2h10v8.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5V7Z" />
                                      <path d="M3 7V5.5A2.5 2.5 0 0 1 5.5 3H9l2 2h4.5A2.5 2.5 0 0 1 18 7" />
                                    </svg>
                                  </span>
                                  <span className="sr-only">Abrir pasta</span>
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => openRecentMovements(row)}
                                title={
                                  "Últimos 100 movimentos da pasta " + row.name
                                }
                                aria-label={
                                  "Últimos 100 movimentos da pasta " + row.name
                                }
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 transition hover:bg-cyan-100"
                              >
                                <span
                                  className="fas fa-list-ol text-base"
                                  aria-hidden="true"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-4 w-4"
                                  >
                                    <path d="M4 5h2v2H4zM4 11h2v2H4zM4 17h2v2H4zM9 6h11M9 12h11M9 18h11" />
                                  </svg>
                                </span>
                                <span className="sr-only">
                                  {"Últimos 100 movimentos da pasta " +
                                    row.name}
                                </span>
                              </button>
                              <button
                                type="button"
                                disabled={calculatingUsagePrefix === row.key}
                                onClick={() => void calculateUsage(row.key)}
                                title={
                                  calculatingUsagePrefix === row.key
                                    ? "Calculando quantidade de arquivos e o tamanho da pasta"
                                    : "Calcular Quantidade de Arquivos e o Tamanho da Pasta"
                                }
                                aria-label={
                                  calculatingUsagePrefix === row.key
                                    ? "Calculando quantidade de arquivos e o tamanho da pasta"
                                    : "Calcular Quantidade de Arquivos e o Tamanho da Pasta"
                                }
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                              >
                                <span
                                  className="fas fa-calculator text-base"
                                  aria-hidden="true"
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-4 w-4"
                                  >
                                    <rect
                                      x="5"
                                      y="3"
                                      width="14"
                                      height="18"
                                      rx="2"
                                    />
                                    <path d="M8 7h8" />
                                    <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8" />
                                  </svg>
                                </span>
                                <span className="sr-only">
                                  {calculatingUsagePrefix === row.key
                                    ? "Calculando quantidade de arquivos e o tamanho da pasta"
                                    : "Calcular Quantidade de Arquivos e o Tamanho da Pasta"}
                                </span>
                              </button>
                              {row.type === "FOLDER" ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={isUploading}
                                    onClick={() => setUploadTarget(row)}
                                    title="Enviar arquivo"
                                    aria-label="Enviar arquivo"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                                  >
                                    <span
                                      className="fas fa-cloud-arrow-up text-base"
                                      aria-hidden="true"
                                    >
                                      <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="h-4 w-4"
                                      >
                                        <path d="M7.5 18a4.5 4.5 0 1 1 .8-8.93A5.5 5.5 0 0 1 19 11.5h.5a3.5 3.5 0 1 1 0 7H7.5Z" />
                                        <path d="M12 10v7" />
                                        <path d="m9.5 12.5 2.5-2.5 2.5 2.5" />
                                      </svg>
                                    </span>
                                    <span className="sr-only">
                                      Enviar arquivo
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={checkingFolderId === row.id}
                                    onClick={() =>
                                      void requestFolderDeletion(row)
                                    }
                                    title={
                                      checkingFolderId === row.id
                                        ? "Verificando pasta"
                                        : "Excluir pasta"
                                    }
                                    aria-label={
                                      checkingFolderId === row.id
                                        ? "Verificando pasta"
                                        : "Excluir pasta"
                                    }
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                    >
                                      <path d="M4 7h16" />
                                      <path d="M10 11v6M14 11v6" />
                                      <path d="M6 7l1 13h10l1-13" />
                                      <path d="M9 7V4h6v3" />
                                    </svg>
                                    <span className="sr-only">
                                      {checkingFolderId === row.id
                                        ? "Verificando pasta"
                                        : "Excluir pasta"}
                                    </span>
                                  </button>
                                </>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filteredRows.length ? (
              <div className="px-5 py-12 text-center text-sm font-semibold text-slate-500">
                Nenhum registro encontrado.
              </div>
            ) : null}
            <GridStandardFooter
              statusFilter="ALL"
              totalRecords={filteredRows.length}
              pageSize={pageSize}
              currentPage={normalizedCurrentPage}
              totalPages={navigationTotalPages}
              showStatusFilter={false}
              showExport={false}
              showColumnSettings={false}
              showRecordSummary
              typographyVariant="school"
              compact
              onStatusFilterChange={() => undefined}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setCurrentPage(1);
              }}
              onPageChange={changePage}
              aggregateSummaries={[
                { label: "USO S3", value: formatSize(usageBytes) },
                ...(capacityBytes > 0
                  ? [{ label: "CAPACIDADE", value: formatSize(capacityBytes) }]
                  : []),
              ]}
            />
          </>
        )}
      </section>
      {!runtimeContext.embedded ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN}
            auditText="Credenciais de S3 são mantidas pela empresa ou filial do sistema de origem. No Financeiro, apenas a consulta e a auditoria de exclusões são permitidas."
            sqlText="SELECT * FROM s3_configurations WHERE companyId = :companyId AND branchCode = :branchCode;\nSELECT * FROM s3_audit_events WHERE companyId = :companyId ORDER BY occurredAt DESC;"
          />
        </section>
      ) : null}
      <AuditedPopupShell
        isOpen={recentMovementsOpen}
        screenId={RECENT_MOVEMENTS_POPUP_ID}
        title={
          recentMovementsScoped
            ? "Últimos movimentos - " + recentMovementsFolderName
            : "Últimos movimentos"
        }
        eyebrow="Controle S3"
        description={
          recentMovementsScoped
            ? recentMovementsRootOnly
              ? "Arquivos alterados mais recentemente gravados diretamente na raiz do S3."
              : "Arquivos alterados mais recentemente na pasta selecionada."
            : "Arquivos alterados mais recentemente, com nome e pasta de origem."
        }
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        headerTheme="blue"
        footerScreenIdCompact
        onClose={() => !recentMovementsLoading && setRecentMovementsOpen(false)}
        originText={ORIGIN}
        auditText={
          recentMovementsScoped
            ? recentMovementsRootOnly
              ? "Consulta somente de metadados dos 100 arquivos mais recentes gravados diretamente na raiz do S3."
              : "Consulta somente de metadados dos 100 arquivos mais recentes da pasta: " +
                recentMovementsPrefix +
                "."
            : "Consulta somente de metadados dos 100 arquivos mais recentes. Nenhum conteúdo de arquivo foi baixado ou alterado."
        }
        sqlText={
          recentMovementsScoped
            ? recentMovementsRootOnly
              ? "SELECT objectKey, size, lastModified FROM S3_OBJECTS WHERE objectKey NOT LIKE '%/%' ORDER BY lastModified DESC LIMIT 100;"
              : "SELECT objectKey, size, lastModified FROM S3_OBJECTS WHERE objectKey LIKE :folderPrefix ORDER BY lastModified DESC LIMIT 100;"
            : "SELECT objectKey, size, lastModified FROM S3_OBJECTS ORDER BY lastModified DESC LIMIT 100;"
        }
        panelClassName="max-w-6xl"
        bodyClassName="gap-3 overflow-hidden"
      >
        {recentMovementsScoped ? (
          <div className="shrink-0 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-bold text-cyan-800">
            Pasta selecionada:{" "}
            <span className="font-black">
              {recentMovementsFolderName || recentMovementsPrefix || "RAIZ"}
            </span>
          </div>
        ) : null}
        {recentMovementsLoading ? (
          <div className="flex min-h-[280px] flex-1 items-center justify-center text-sm font-black uppercase tracking-[0.14em] text-slate-500">
            Consultando últimos movimentos...
          </div>
        ) : recentMovementsError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm font-bold text-rose-700">
            {recentMovementsError}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-white text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 shadow-[0_1px_0_rgba(226,232,240,1)]">
                  <tr>
                    <th className="px-4 py-3">Nome do arquivo</th>
                    <th className="px-4 py-3">Pasta</th>
                    <th className="px-4 py-3">Última alteração</th>
                    <th className="px-4 py-3 text-right">Tamanho</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecentFiles.map((file, index) => (
                    <tr
                      key={file.key}
                      className={`transition hover:bg-blue-50 ${index % 2 ? "bg-slate-200/70" : "bg-white"}`}
                    >
                      <td className="max-w-[360px] break-all px-4 py-3 text-sm font-bold text-slate-800">
                        {file.name}
                      </td>
                      <td className="max-w-[320px] break-all px-4 py-3 text-sm font-semibold text-slate-600">
                        {file.folder}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-600">
                        {formatDate(file.lastModified)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                        {formatSize(file.size)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={getS3FileViewUrl(file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-50 px-3 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-100"
                        >
                          Visualizar
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!recentFiles.length ? (
              <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
                Nenhum arquivo encontrado.
              </div>
            ) : null}
            <GridStandardFooter
              statusFilter="ALL"
              totalRecords={recentFiles.length}
              pageSize={recentPageSize}
              currentPage={normalizedRecentCurrentPage}
              totalPages={recentTotalPages}
              showStatusFilter={false}
              showExport={false}
              showColumnSettings={false}
              showRecordSummary
              typographyVariant="school"
              compact
              onStatusFilterChange={() => undefined}
              onPageSizeChange={(value) => {
                setRecentPageSize(value);
                setRecentCurrentPage(1);
              }}
              onPageChange={(value) =>
                setRecentCurrentPage(
                  Math.min(Math.max(1, value), recentTotalPages),
                )
              }
            />
          </>
        )}
      </AuditedPopupShell>
      <AuditedPopupShell
        isOpen={batchDeleteOpen}
        screenId={BATCH_DELETE_POPUP_ID}
        title="Excluir arquivos selecionados"
        eyebrow="Confirmação obrigatória"
        description="A exclusão em lote é definitiva e ficará registrada na auditoria do Financeiro."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => !isDeleting && setBatchDeleteOpen(false)}
        originText={ORIGIN}
        auditText={`Solicitação de exclusão em lote de ${selectedFileKeys.length} arquivo(s).`}
        sqlText="DELETE OBJECTS S3 em lote; INSERT s3_audit_events para cada arquivo."
        footerActions={
          <>
            <button
              type="button"
              onClick={() => setBatchDeleteOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void deleteFilesBatch()}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          Serão excluídos{" "}
          <span className="font-black">
            {selectedFileKeys.length} arquivo(s)
          </span>
          .
        </div>
      </AuditedPopupShell>
      <AuditedPopupShell
        isOpen={Boolean(deleteTarget)}
        screenId={DELETE_POPUP_ID}
        title="Excluir arquivo do S3"
        eyebrow="Confirmação obrigatória"
        description="A exclusão é definitiva e ficará registrada na auditoria do Financeiro."
        onClose={() => !isDeleting && setDeleteTarget(null)}
        originText={ORIGIN}
        auditText={`Solicitação de exclusão: ${deleteTarget?.name || "NÃO IDENTIFICADO"}. Eventos DELETE_REQUESTED, DELETE_COMPLETED ou DELETE_FAILED são mantidos no Financeiro.`}
        sqlText="INSERT s3_audit_events (DELETE_REQUESTED); DELETE EXTERNO S3; INSERT s3_audit_events (RESULTADO)."
        footerActions={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              Cancelar
            </button>
            <button
              disabled={isDeleting}
              onClick={() => void deleteFile()}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          Arquivo:{" "}
          <span className="break-all font-black">{deleteTarget?.name}</span>
        </div>
      </AuditedPopupShell>
      <AuditedPopupShell
        isOpen={folderModalOpen}
        screenId={CREATE_FOLDER_POPUP_ID}
        title={
          folderParentPrefix
            ? "Criar subpasta no S3"
            : "Criar pasta na raiz do S3"
        }
        eyebrow="Confirmação de criação"
        description={
          folderParentPrefix
            ? `A nova subpasta será criada dentro de: ${folderParentPrefix}.`
            : "A nova pasta será criada diretamente na raiz do S3."
        }
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => !isCreatingFolder && setFolderModalOpen(false)}
        originText={ORIGIN}
        auditText={`Nova pasta em: ${folderParentPrefix || "RAIZ"}.`}
        sqlText="PUT OBJECT <prefix>/<nome-da-pasta>/; INSERT s3_audit_events."
        footerActions={
          <>
            <button
              type="button"
              onClick={() => setFolderModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isCreatingFolder}
              onClick={() => void createFolder()}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {isCreatingFolder ? "Criando..." : "Criar pasta"}
            </button>
          </>
        }
      >
        <label>
          <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            Nome da pasta
          </span>
          <input
            autoFocus
            value={folderName}
            placeholder={
              folderParentPrefix
                ? `A PASTA SERÁ CRIADA DENTRO DE: ${folderParentPrefix}`
                : "A PASTA SERÁ CRIADA NA RAIZ DO S3"
            }
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createFolder();
            }}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold uppercase outline-none placeholder:text-slate-400 placeholder:normal-case focus:border-blue-400"
          />
        </label>
      </AuditedPopupShell>
      <AuditedPopupShell
        isOpen={Boolean(uploadTarget)}
        screenId={UPLOAD_POPUP_ID}
        title="Enviar arquivos ao S3"
        eyebrow="Confirmação de destino"
        description={`Deseja selecionar um ou mais arquivos para enviar para ${uploadTarget?.key.includes("/") ? "a subpasta" : "a pasta"}: ${uploadTarget?.name || ""}?`}
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => !isUploading && setUploadTarget(null)}
        originText={ORIGIN}
        auditText={`Seleção de arquivos para: ${uploadTarget?.key || "NÃO IDENTIFICADO"}.`}
        sqlText="PUT OBJECT <pasta-ou-subpasta>/<arquivo>; INSERT s3_audit_events."
        footerActions={
          <>
            <button
              type="button"
              onClick={() => setUploadTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={confirmUpload}
              className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              Selecionar arquivos
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-900">
          <div>
            Destino:{" "}
            <span className="break-all font-black">{uploadTarget?.key}</span>
          </div>
          <div className="mt-3 text-base font-black text-red-600">
            Limite por envio: máximo de{" "}
            <span className="text-xl">{MAX_UPLOAD_FILES}</span> arquivos.
          </div>
        </div>
      </AuditedPopupShell>
      <AuditedPopupShell
        isOpen={pendingUploadFiles.length > 0}
        screenId={UPLOAD_POPUP_ID}
        title="Confirmar envio de arquivos"
        eyebrow="Arquivos selecionados"
        description={`Foram selecionados ${pendingUploadFiles.length} arquivo(s) para envio ao S3. O limite é de ${MAX_UPLOAD_FILES} por envio.`}
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => {
          if (!isUploading) {
            setPendingUploadFiles([]);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }
        }}
        originText={ORIGIN}
        auditText={`Confirmação de envio de ${pendingUploadFiles.length} arquivo(s) para: ${uploadTargetPrefix || "RAIZ"}.`}
        sqlText="PUT OBJECT <pasta-ou-subpasta>/<arquivo>; INSERT s3_audit_events."
        footerActions={
          <>
            <button
              type="button"
              onClick={() => {
                setPendingUploadFiles([]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                const files = pendingUploadFiles;
                setPendingUploadFiles([]);
                void uploadFiles(files);
              }}
              className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              Enviar {pendingUploadFiles.length} arquivo(s)
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-center text-sm font-bold text-violet-900">
          <div className="text-3xl font-black">{pendingUploadFiles.length}</div>
          <div className="mt-1 uppercase tracking-[0.12em]">
            arquivo(s) serão enviados
          </div>
          <div className="mt-3 text-xs font-semibold text-violet-700">
            Limite por envio: {MAX_UPLOAD_FILES} arquivos.
          </div>
          <div className="mt-3 text-xs font-semibold text-violet-700">
            O envio será feito em fila: o próximo arquivo começa somente após a
            conclusão do anterior.
          </div>
          <div className="mt-3 text-xs font-semibold text-violet-700">
            Destino:{" "}
            <span className="break-all font-black">
              {uploadTargetPrefix || "RAIZ"}
            </span>
          </div>
        </div>
      </AuditedPopupShell>
      <AuditedPopupShell
        isOpen={Boolean(folderDeleteTarget)}
        screenId={DELETE_FOLDER_POPUP_ID}
        title="Excluir pasta vazia"
        eyebrow="Confirmação obrigatória"
        description="Esta pasta está vazia. Confirme a exclusão definitiva."
        brandingName={runtimeContext.companyName}
        logoUrl={runtimeContext.logoUrl}
        onClose={() => !isDeleting && setFolderDeleteTarget(null)}
        originText={ORIGIN}
        auditText={`Solicitação de exclusão da pasta: ${folderDeleteTarget?.name || "NÃO IDENTIFICADA"}.`}
        sqlText="LIST OBJECTS <pasta>; DELETE OBJECT <pasta/>; INSERT s3_audit_events."
        footerActions={
          <>
            <button
              type="button"
              onClick={() => setFolderDeleteTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void deleteFolder()}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {isDeleting ? "Excluindo..." : "Excluir pasta"}
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
          Pasta:{" "}
          <span className="break-all font-black">
            {folderDeleteTarget?.name}
          </span>
        </div>
      </AuditedPopupShell>
    </div>
  );
}
