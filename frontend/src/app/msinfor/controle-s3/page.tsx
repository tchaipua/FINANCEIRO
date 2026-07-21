'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuditedPopupShell from '@/app/components/audited-popup-shell';
import GridStandardFooter from '@/app/components/grid-standard-footer';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { showErrorMessage } from '@/app/components/system-message-provider';
import { API_BASE_URL, requestJson } from '@/app/lib/api';
import { FINANCE_GRID_PAGE_LAYOUT } from '@/app/lib/grid-page-standards';
import { buildFinanceApiQueryString, useFinanceRuntimeContext } from '@/app/lib/runtime-context';

const FINANCE_SCREEN_ID = 'FINANCEIRO_MSINFOR_CONTROLE_S3';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR_CONTROLE_S3';
const DELETE_POPUP_ID = 'POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_EXCLUSAO';
const CREATE_FOLDER_POPUP_ID = 'POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_CRIAR_PASTA';
const DELETE_FOLDER_POPUP_ID = 'POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_EXCLUIR_PASTA';
const UPLOAD_POPUP_ID = 'POPUP_FINANCEIRO_MSINFOR_CONTROLE_S3_ENVIAR_ARQUIVO';
const ORIGIN = 'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/controle-s3/page.tsx';

type Configuration = { configured: boolean; active?: boolean; endpoint?: string; region?: string; bucket?: string; basePrefix?: string; accessKeyConfigured?: boolean; secretKeyConfigured?: boolean; forcePathStyle?: boolean; capacityGb?: number | null; imagesFolder?: string; sourceScope?: string };
type Listing = { currentPrefix: string; folders: Array<{ name: string; prefix: string }>; files: Array<{ name: string; key: string; size: number; lastModified: string | null }>; nextContinuationToken: string | null; usage: { objectCount: number; totalBytes: number; complete: boolean } };
type SearchResult = { files: Listing['files']; matchedObjectCount: number; scannedObjectCount: number; complete: boolean; resultsTruncated: boolean };
type Row = { id: string; type: 'FOLDER' | 'ROOT' | 'FILE'; name: string; key: string; size?: number; lastModified?: string | null };
function formatSize(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB']; let index = 0; let current = value;
  while (current >= 1024 && index < units.length - 1) { current /= 1024; index += 1; }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`;
}

function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function parentPrefix(prefix: string) { const items = prefix.split('/').filter(Boolean); items.pop(); return items.join('/'); }

export default function ControleS3Page() {
  const runtimeContext = useFinanceRuntimeContext();
  const [mounted, setMounted] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [prefix, setPrefix] = useState('');
  const [showRootFiles, setShowRootFiles] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [search, setSearch] = useState('');
  const [extension, setExtension] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [checkingFolderId, setCheckingFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderParentPrefix, setFolderParentPrefix] = useState('');
  const [uploadTargetPrefix, setUploadTargetPrefix] = useState('');
  const [uploadTarget, setUploadTarget] = useState<Row | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenId = runtimeContext.embedded ? EMBEDDED_SCREEN_ID : FINANCE_SCREEN_ID;
  const contextPayload = useMemo(() => ({ sourceSystem: runtimeContext.sourceSystem, sourceTenantId: runtimeContext.sourceTenantId, sourceBranchCode: runtimeContext.sourceBranchCode, userRole: runtimeContext.userRole, requestedBy: runtimeContext.cashierDisplayName || 'ADMIN_FINANCEIRO' }), [runtimeContext]);
  const apiQuery = useMemo(() => buildFinanceApiQueryString(runtimeContext, { sourceBranchCode: runtimeContext.sourceBranchCode, userRole: runtimeContext.userRole }), [runtimeContext]);

  const loadConfiguration = useCallback(async () => {
    try {
      const loaded = await requestJson<Configuration>(`/s3-control/configuration${apiQuery}`);
      setMessage(null);
      setConfiguration(loaded);
      return loaded;
    } catch (error: any) { setMessage(error?.message || 'Não foi possível carregar a configuração S3.'); return null; }
  }, [apiQuery]);

  const loadListing = useCallback(async (nextPrefix = '', continuationToken?: string, keepRootFilesView = false) => {
    if (!configuration?.configured) return;
    setIsLoading(true); setMessage(null);
    try {
      const query = new URLSearchParams(apiQuery.replace(/^\?/, '')); query.set('prefix', nextPrefix); if (continuationToken) query.set('continuationToken', continuationToken);
      const loaded = await requestJson<Listing>(`/s3-control/objects?${query.toString()}`);
      setPrefix(nextPrefix); if (!continuationToken) { setShowRootFiles(keepRootFilesView); setIsSearchMode(false); } setListing((previous) => continuationToken && previous ? { ...loaded, folders: [...previous.folders, ...loaded.folders], files: [...previous.files, ...loaded.files] } : loaded);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível consultar o S3.'); } finally { setIsLoading(false); }
  }, [apiQuery, configuration?.configured]);

  const searchObjects = useCallback(async () => {
    const term = search.trim();
    const normalizedExtension = extension.trim().replace(/^\.+/, '');
    if (!term && !normalizedExtension) {
      setMessage('Informe o nome ou a extensão do arquivo para pesquisar.');
      return;
    }
    if (!configuration?.configured) return;
    setIsLoading(true); setMessage(null);
    try {
      const query = new URLSearchParams(apiQuery.replace(/^\?/, '')); if (term) query.set('term', term); if (normalizedExtension) query.set('extension', normalizedExtension);
      const loaded = await requestJson<SearchResult>(`/s3-control/search?${query.toString()}`);
      setPrefix(''); setShowRootFiles(false); setIsSearchMode(true); setCurrentPage(1);
      setListing((previous) => ({ currentPrefix: '', folders: [], files: loaded.files, nextContinuationToken: null, usage: previous?.usage || { objectCount: 0, totalBytes: 0, complete: true } }));
      setMessage(`${loaded.matchedObjectCount} arquivo(s) localizado(s) em ${loaded.scannedObjectCount.toLocaleString('pt-BR')} objeto(s) analisado(s).${loaded.resultsTruncated ? ' A lista foi limitada a 2.000 resultados.' : ''}${!loaded.complete ? ' A busca foi limitada aos primeiros 10.000 objetos.' : ''}`);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível pesquisar os arquivos no S3.'); } finally { setIsLoading(false); }
  }, [apiQuery, configuration?.configured, extension, search]);

  useEffect(() => { setMounted(true); void loadConfiguration(); }, [loadConfiguration]);
  useEffect(() => { if (runtimeContext.embedded && window.parent !== window) window.parent.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: EMBEDDED_SCREEN_ID }, '*'); }, [runtimeContext.embedded]);
  useEffect(() => { if (configuration?.configured && configuration.active) void loadListing(''); }, [configuration?.configured, configuration?.active]);

  const rows = useMemo<Row[]>(() => {
    const folders = (listing?.folders || []).map((item) => ({ id: `F-${item.prefix}`, type: 'FOLDER' as const, name: item.name, key: item.prefix }));
    const files = (listing?.files || []).map((item) => ({ id: `A-${item.key}`, type: 'FILE' as const, ...item }));
    const all = isSearchMode
      ? files
      : prefix === '' && !showRootFiles
      ? [...folders, { id: 'F-ROOT', type: 'ROOT' as const, name: 'RAIZ', key: '' }]
      : [...folders, ...files];
    return all;
  }, [isSearchMode, listing, prefix, showRootFiles]);
  const loadedTotalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const navigationTotalPages = loadedTotalPages + (listing?.nextContinuationToken ? 1 : 0);
  const normalizedCurrentPage = Math.min(currentPage, loadedTotalPages);
  const paginatedRows = useMemo(
    () => rows.slice((normalizedCurrentPage - 1) * pageSize, normalizedCurrentPage * pageSize),
    [normalizedCurrentPage, pageSize, rows],
  );

  useEffect(() => { setCurrentPage(1); }, [prefix]);

  const changePage = (nextPage: number) => {
    if (nextPage <= loadedTotalPages) {
      setCurrentPage(nextPage);
      return;
    }
    if (listing?.nextContinuationToken && !isLoading) {
      void loadListing(prefix, listing.nextContinuationToken).then(() => setCurrentPage(nextPage));
    }
  };

  const deleteFile = async () => {
    if (!deleteTarget) return; setIsDeleting(true); setMessage(null);
    try { await requestJson<{ success: boolean }>('/s3-control/object', { method: 'DELETE', body: JSON.stringify({ ...contextPayload, key: deleteTarget.key }) }); setDeleteTarget(null); setMessage('Arquivo excluído e operação registrada na auditoria do Financeiro.'); await loadListing(prefix, undefined, showRootFiles); }
    catch (error: any) { setMessage(error?.message || 'Não foi possível excluir o arquivo.'); } finally { setIsDeleting(false); }
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) { setMessage('Informe o nome da nova pasta.'); return; }
    setIsCreatingFolder(true); setMessage(null);
    try {
      await requestJson<{ success: boolean }>('/s3-control/folder', { method: 'POST', body: JSON.stringify({ ...contextPayload, prefix: folderParentPrefix, name }) });
      setFolderModalOpen(false); setFolderName(''); setMessage('Pasta criada e operação registrada na auditoria do Financeiro.'); await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível criar a pasta no S3.'); } finally { setIsCreatingFolder(false); }
  };

  const openCreateFolder = (parentPrefix: string) => { setFolderParentPrefix(parentPrefix); setFolderName(''); setFolderModalOpen(true); };
  const requestFolderDeletion = async (target: Row) => {
    setCheckingFolderId(target.id);
    try {
      const query = new URLSearchParams(apiQuery.replace(/^\?/, ''));
      query.set('prefix', target.key);
      const status = await requestJson<{ empty: boolean }>(`/s3-control/folder-status?${query.toString()}`);
      if (!status.empty) {
        showErrorMessage('Não é possível excluir uma pasta que possua arquivos ou subpastas.', runtimeContext.logoUrl);
        return;
      }
      setFolderDeleteTarget(target);
    } catch (error: any) {
      showErrorMessage(error?.message || 'Não foi possível verificar o conteúdo da pasta.', runtimeContext.logoUrl);
    } finally {
      setCheckingFolderId(null);
    }
  };
  const deleteFolder = async () => {
    if (!folderDeleteTarget) return; setIsDeleting(true); setMessage(null);
    try { await requestJson<{ success: boolean }>('/s3-control/folder', { method: 'DELETE', body: JSON.stringify({ ...contextPayload, prefix: folderDeleteTarget.key }) }); setFolderDeleteTarget(null); setMessage('Pasta vazia excluída e operação registrada na auditoria do Financeiro.'); await loadListing(prefix, undefined, showRootFiles); }
    catch (error: any) { setMessage(error?.message || 'Não foi possível excluir a pasta no S3.'); } finally { setIsDeleting(false); }
  };

  const uploadFiles = async (files?: FileList | File[]) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    const showBatchProgress = selectedFiles.length > 1;
    setIsUploading(true); setMessage(null);
    setUploadProgress(showBatchProgress ? { completed: 0, total: selectedFiles.length } : null);
    try {
      await Promise.all(selectedFiles.map(async (file) => {
        const formData = new FormData();
        Object.entries({ ...contextPayload, prefix: uploadTargetPrefix }).forEach(([key, value]) => { if (value !== undefined && value !== null) formData.append(key, String(value)); });
        formData.append('file', file);
        const response = await fetch(`${API_BASE_URL}/s3-control/upload`, { method: 'POST', body: formData });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || 'Não foi possível enviar um dos arquivos ao S3.');
        if (showBatchProgress) setUploadProgress((current) => current ? { ...current, completed: current.completed + 1 } : current);
      }));
      setMessage(`${selectedFiles.length} arquivo(s) enviado(s) e operação registrada na auditoria do Financeiro.`);
      await loadListing(prefix, undefined, showRootFiles);
    } catch (error: any) { setMessage(error?.message || 'Não foi possível enviar os arquivos ao S3.'); } finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; if (showBatchProgress) window.setTimeout(() => setUploadProgress(null), 3000); }
  };
  const confirmUpload = () => {
    if (!uploadTarget) return;
    setUploadTargetPrefix(uploadTarget.key);
    setUploadTarget(null);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  if (!mounted) return <div className="flex min-h-[45vh] items-center justify-center text-sm font-bold text-slate-500">CARREGANDO CONTROLE S3...</div>;
  if (runtimeContext.userRole !== 'ADMIN') return <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center text-sm font-bold text-amber-700">ACESSO RESTRITO AO PERFIL ADMIN.</div>;

  const breadcrumbs = prefix.split('/').filter(Boolean);
  const configuredCapacityGb = Number(configuration?.capacityGb ?? 0);
  const capacityBytes = Number.isFinite(configuredCapacityGb) && configuredCapacityGb > 0 ? configuredCapacityGb * 1024 * 1024 * 1024 : 0;
  const usageBytes = listing?.usage.totalBytes || 0;
  const usagePercent = capacityBytes > 0 ? (usageBytes / capacityBytes) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, usagePercent));
  const uploadProgressPercent = uploadProgress ? Math.round((uploadProgress.completed / uploadProgress.total) * 100) : 0;
  return <div className="space-y-5">
    <section className={`${FINANCE_GRID_PAGE_LAYOUT.card} flex min-h-0 flex-1 flex-col overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4">
        <div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">MSINFOR · FINANCEIRO</div><h1 className="mt-1 text-xl font-black text-slate-900">Controle S3</h1><p className="mt-1 text-xs font-medium text-slate-500">Credenciais herdadas da {configuration?.sourceScope === 'BRANCH' ? 'filial' : configuration?.sourceScope === 'SOFTHOUSE' ? 'softhouse' : 'empresa'} do sistema de origem.</p></div>
      </div>
      <div className="px-5 py-4"><div className="flex items-center justify-between text-xs font-black text-slate-700"><span>USO DO S3</span><span>{formatSize(usageBytes)}{capacityBytes > 0 ? ` DE ${formatSize(capacityBytes)} · ${usagePercent.toFixed(1)}%` : ''} · {listing?.usage.objectCount || 0} OBJETOS</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full transition-all ${usagePercent > 100 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }} /></div><div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{capacityBytes > 0 ? 'Percentual calculado sobre a capacidade informada no cadastro de origem' : 'Informe a capacidade no cadastro S3 da empresa, filial ou softhouse de origem'}</div>{configuration?.imagesFolder ? <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Pasta de imagens informativa: {configuration.imagesFolder}</div> : null}</div>
    </section>
    {message ? <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">{message}</div> : null}
    {uploadProgress ? <section className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3"><div className="flex items-center justify-between gap-3 text-xs font-black text-violet-900"><span>ENVIANDO ARQUIVOS: {uploadProgress.completed} DE {uploadProgress.total}</span><span>{uploadProgressPercent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600 transition-all duration-300" style={{ width: `${uploadProgressPercent}%` }} /></div></section> : null}
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3"><div className="text-xs font-black text-slate-700"><button onClick={() => void loadListing('')} className="text-blue-700">RAIZ</button>{isSearchMode ? <span><span className="mx-1 text-slate-300">/</span><span className="text-slate-600">RESULTADO DA PESQUISA</span></span> : <>{breadcrumbs.map((item, index) => <span key={`${item}-${index}`}><span className="mx-1 text-slate-300">/</span><button onClick={() => void loadListing(breadcrumbs.slice(0, index + 1).join('/'))} className="text-blue-700">{item}</button></span>)}{showRootFiles ? <span><span className="mx-1 text-slate-300">/</span><span className="text-slate-600">ARQUIVOS DA RAIZ</span></span> : null}</>}</div><div className="flex flex-wrap gap-2">{!isSearchMode && (prefix || showRootFiles) ? <button onClick={() => showRootFiles ? setShowRootFiles(false) : void loadListing(parentPrefix(prefix))} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-600">Pasta anterior</button> : null}<button onClick={() => isSearchMode ? void searchObjects() : void loadListing(prefix, undefined, showRootFiles)} className="rounded-xl bg-blue-700 px-3 py-2 text-[10px] font-black uppercase text-white">Atualizar</button></div></div>
      <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 md:grid-cols-[1fr_220px_auto]"><input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => void uploadFiles(event.target.files || undefined)} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchObjects(); }} placeholder="NOME DO ARQUIVO" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase outline-none focus:border-blue-300" /><input value={extension} onChange={(event) => setExtension(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void searchObjects(); }} placeholder="EXTENSÃO (OPCIONAL)" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold uppercase outline-none focus:border-blue-300" /><button type="button" onClick={() => void searchObjects()} disabled={isLoading} className="h-10 rounded-xl bg-blue-700 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white disabled:opacity-50">{isLoading ? 'Pesquisando...' : 'Pesquisar'}</button></div>
      {!configuration?.configured ? <div className="px-5 py-14 text-center text-sm font-bold text-slate-500">Configure o S3 no cadastro da empresa, filial ou softhouse de origem para iniciar a consulta.</div> : isLoading && !listing ? <div className="px-5 py-14 text-center text-sm font-bold text-slate-500">CONSULTANDO S3...</div> : <><div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[820px] border-collapse text-left"><thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(226,232,240,1)] text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3 text-left">Tipo</th><th className="px-4 py-3 text-left">Nome</th><th className="px-4 py-3 text-left">Tamanho</th><th className="px-4 py-3 text-left">Alterado em</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100">{paginatedRows.map((row, index) => <tr key={row.id} className={`transition hover:bg-blue-50 ${index % 2 ? 'bg-slate-200/70' : 'bg-white'}`}><td className="px-4 py-3 align-middle"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${row.type === 'FILE' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>{row.type === 'FILE' ? 'ARQUIVO' : row.type === 'ROOT' ? 'PASTA RAIZ' : row.key.includes('/') ? 'SUBPASTA' : 'PASTA'}</span></td><td className="px-4 py-3 align-middle text-sm font-bold text-slate-800">{row.name}</td><td className="px-4 py-3 align-middle text-sm font-semibold text-slate-600">{row.type === 'FILE' ? formatSize(row.size || 0) : '—'}</td><td className="px-4 py-3 align-middle text-sm font-semibold text-slate-600">{row.type === 'FILE' ? formatDate(row.lastModified) : '—'}</td><td className="px-4 py-3 align-middle text-right"><div className="flex justify-end gap-2">{row.type === 'FILE' ? <button onClick={() => setDeleteTarget(row)} className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-50 px-3 text-[10px] font-black uppercase text-rose-600">Excluir</button> : <><button onClick={() => row.type === 'ROOT' ? openCreateFolder('') : openCreateFolder(row.key)} className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-50 px-3 text-[10px] font-black uppercase text-emerald-700">Nova pasta</button><button onClick={() => row.type === 'ROOT' ? (setShowRootFiles(true), setCurrentPage(1)) : void loadListing(row.key)} className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-50 px-3 text-[10px] font-black uppercase text-blue-600">Abrir</button>{row.type === 'FOLDER' ? <><button type="button" disabled={isUploading} onClick={() => setUploadTarget(row)} className="inline-flex h-9 items-center justify-center rounded-lg bg-violet-50 px-3 text-[10px] font-black uppercase text-violet-700 disabled:opacity-50">Enviar arquivo</button><button type="button" disabled={checkingFolderId === row.id} onClick={() => void requestFolderDeletion(row)} className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-50 px-3 text-[10px] font-black uppercase text-rose-600 disabled:opacity-50">{checkingFolderId === row.id ? 'Verificando...' : 'Excluir'}</button></> : null}</>}</div></td></tr>)}</tbody></table></div>{!rows.length ? <div className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Nenhum registro encontrado.</div> : null}<GridStandardFooter statusFilter="ALL" totalRecords={rows.length} pageSize={pageSize} currentPage={normalizedCurrentPage} totalPages={navigationTotalPages} showStatusFilter={false} showExport={false} showColumnSettings={false} onStatusFilterChange={() => undefined} onPageSizeChange={(value) => { setPageSize(value); setCurrentPage(1); }} onPageChange={changePage} aggregateSummaries={[{ label: 'USO S3', value: formatSize(usageBytes) }, ...(capacityBytes > 0 ? [{ label: 'CAPACIDADE', value: formatSize(capacityBytes) }] : [])]} /></>}
    </section>
    {!runtimeContext.embedded ? <section className="rounded-3xl border border-slate-200 bg-white px-5 py-3 shadow-sm"><ScreenNameCopy screenId={screenId} className="justify-end" originText={ORIGIN} auditText="Credenciais de S3 são mantidas pela empresa ou filial do sistema de origem. No Financeiro, apenas a consulta e a auditoria de exclusões são permitidas." sqlText="SELECT * FROM s3_configurations WHERE companyId = :companyId AND branchCode = :branchCode;\nSELECT * FROM s3_audit_events WHERE companyId = :companyId ORDER BY occurredAt DESC;" /></section> : null}
    <AuditedPopupShell isOpen={Boolean(deleteTarget)} screenId={DELETE_POPUP_ID} title="Excluir arquivo do S3" eyebrow="Confirmação obrigatória" description="A exclusão é definitiva e ficará registrada na auditoria do Financeiro." onClose={() => !isDeleting && setDeleteTarget(null)} originText={ORIGIN} auditText={`Solicitação de exclusão: ${deleteTarget?.name || 'NÃO IDENTIFICADO'}. Eventos DELETE_REQUESTED, DELETE_COMPLETED ou DELETE_FAILED são mantidos no Financeiro.`} sqlText="INSERT s3_audit_events (DELETE_REQUESTED); DELETE EXTERNO S3; INSERT s3_audit_events (RESULTADO)." footerActions={<><button onClick={() => setDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button disabled={isDeleting} onClick={() => void deleteFile()} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">{isDeleting ? 'Excluindo...' : 'Excluir definitivamente'}</button></>}><div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">Arquivo: <span className="break-all font-black">{deleteTarget?.name}</span></div></AuditedPopupShell>
    <AuditedPopupShell isOpen={folderModalOpen} screenId={CREATE_FOLDER_POPUP_ID} title={folderParentPrefix ? "Criar subpasta no S3" : "Criar pasta na raiz do S3"} eyebrow="Confirmação de criação" description={folderParentPrefix ? `A nova subpasta será criada dentro de: ${folderParentPrefix}.` : "A nova pasta será criada diretamente na raiz do S3."} brandingName={runtimeContext.companyName} logoUrl={runtimeContext.logoUrl} onClose={() => !isCreatingFolder && setFolderModalOpen(false)} originText={ORIGIN} auditText={`Nova pasta em: ${folderParentPrefix || 'RAIZ'}.`} sqlText="PUT OBJECT <prefix>/<nome-da-pasta>/; INSERT s3_audit_events." footerActions={<><button type="button" onClick={() => setFolderModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="button" disabled={isCreatingFolder} onClick={() => void createFolder()} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60">{isCreatingFolder ? 'Criando...' : 'Criar pasta'}</button></>}><label><span className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Nome da pasta</span><input autoFocus value={folderName} placeholder={folderParentPrefix ? `A PASTA SERÁ CRIADA DENTRO DE: ${folderParentPrefix}` : 'A PASTA SERÁ CRIADA NA RAIZ DO S3'} onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createFolder(); }} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold uppercase outline-none placeholder:text-slate-400 placeholder:normal-case focus:border-blue-400" /></label></AuditedPopupShell>
    <AuditedPopupShell isOpen={Boolean(uploadTarget)} screenId={UPLOAD_POPUP_ID} title="Enviar arquivos ao S3" eyebrow="Confirmação de destino" description={`Deseja selecionar um ou mais arquivos para enviar para ${uploadTarget?.key.includes('/') ? 'a subpasta' : 'a pasta'}: ${uploadTarget?.name || ''}?`} brandingName={runtimeContext.companyName} logoUrl={runtimeContext.logoUrl} onClose={() => !isUploading && setUploadTarget(null)} originText={ORIGIN} auditText={`Seleção de arquivos para: ${uploadTarget?.key || 'NÃO IDENTIFICADO'}.`} sqlText="PUT OBJECT <pasta-ou-subpasta>/<arquivo>; INSERT s3_audit_events." footerActions={<><button type="button" onClick={() => setUploadTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="button" disabled={isUploading} onClick={confirmUpload} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-black text-white disabled:opacity-60">Selecionar arquivos</button></>}><div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm font-bold text-violet-900">Destino: <span className="break-all font-black">{uploadTarget?.key}</span></div></AuditedPopupShell>
    <AuditedPopupShell isOpen={Boolean(folderDeleteTarget)} screenId={DELETE_FOLDER_POPUP_ID} title="Excluir pasta vazia" eyebrow="Confirmação obrigatória" description="Esta pasta está vazia. Confirme a exclusão definitiva." brandingName={runtimeContext.companyName} logoUrl={runtimeContext.logoUrl} onClose={() => !isDeleting && setFolderDeleteTarget(null)} originText={ORIGIN} auditText={`Solicitação de exclusão da pasta: ${folderDeleteTarget?.name || 'NÃO IDENTIFICADA'}.`} sqlText="LIST OBJECTS <pasta>; DELETE OBJECT <pasta/>; INSERT s3_audit_events." footerActions={<><button type="button" onClick={() => setFolderDeleteTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="button" disabled={isDeleting} onClick={() => void deleteFolder()} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-60">{isDeleting ? 'Excluindo...' : 'Excluir pasta'}</button></>}><div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">Pasta: <span className="break-all font-black">{folderDeleteTarget?.name}</span></div></AuditedPopupShell>
  </div>;
}
