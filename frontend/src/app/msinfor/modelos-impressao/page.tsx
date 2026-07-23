'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import { requestJson } from '@/app/lib/api';
import {
  getLocalPrinters,
  printingScope,
  sendJobToLocalAgent,
  type FinancePrintJob,
  type LocalPrinter,
} from '@/app/lib/local-print-agent';
import { useFinanceRuntimeContext } from '@/app/lib/runtime-context';

type LayoutItem = Record<string, any> & { id: string; type: string };
type PrintLayout = {
  schemaVersion?: number;
  media: Record<string, any>;
  blocks?: LayoutItem[];
  elements?: LayoutItem[];
};
type TemplateVersion = {
  id: string;
  version: number;
  status: string;
  layout: PrintLayout;
  sampleData: Record<string, unknown>;
  createdAt: string;
};
type PrintTemplate = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  documentType: string;
  mediaType: 'RECEIPT' | 'LABEL';
  status: string;
  currentVersion: number;
  versions: TemplateVersion[];
};
type PrinterProfile = {
  id: string;
  name: string;
  printerName: string;
  printerType: 'RECEIPT' | 'LABEL';
  connectionType: string;
  language: string;
  paperWidthMm: number;
  paperHeightMm?: number | null;
  columns: number;
  dpi: number;
  copies: number;
  cutterEnabled: boolean;
};
type Binding = {
  id: string;
  eventType: string;
  templateId: string;
  printerProfileId?: string | null;
  autoPrint: boolean;
  copies: number;
  template: PrintTemplate;
  printerProfile?: PrinterProfile | null;
};
type PrintHistory = {
  id: string;
  eventType: string;
  status: string;
  requestedAt: string;
  completedAt?: string | null;
  localPrinterName?: string | null;
  errorMessage?: string | null;
  template: { name: string };
};

const SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR_MODELOS_IMPRESSAO';
const ORIGIN_TEXT = 'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/modelos-impressao/page.tsx';
const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const buttonClass = 'rounded-xl bg-[#1d4f91] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-sm transition hover:bg-[#153a6a] disabled:cursor-not-allowed disabled:opacity-50';

const EVENT_LABELS: Record<string, string> = {
  SALE_CONFIRMED: 'VENDA CONCLUÍDA',
  INSTALLMENTS_SETTLED: 'PARCELAS RECEBIDAS',
  PRODUCT_LABEL_REQUESTED: 'ETIQUETA DE PRODUTO',
};
const TYPE_LABELS: Record<string, string> = {
  TEXT: 'TEXTO', FIELD: 'CAMPO', TOTAL: 'TOTAL', SEPARATOR: 'SEPARADOR', SPACER: 'ESPAÇO', TABLE: 'TABELA', BARCODE: 'CÓDIGO DE BARRAS', QRCODE: 'QR CODE', LINE: 'LINHA',
};

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function currentVersion(template?: PrintTemplate | null) {
  if (!template) return null;
  return template.versions.find((item) => item.version === template.currentVersion)
    || template.versions.find((item) => item.status === 'PUBLISHED')
    || template.versions[0]
    || null;
}

function statusClass(status: string) {
  if (status === 'COMPLETED' || status === 'PUBLISHED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'FAILED') return 'bg-red-100 text-red-700';
  if (status === 'DISPATCHED' || status === 'PENDING') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

export default function PrintModelsPage() {
  const runtime = useFinanceRuntimeContext();
  const [tab, setTab] = useState<'MODELS' | 'PRINTERS' | 'BINDINGS' | 'HISTORY'>('MODELS');
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [printers, setPrinters] = useState<PrinterProfile[]>([]);
  const [localPrinters, setLocalPrinters] = useState<LocalPrinter[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [history, setHistory] = useState<PrintHistory[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [layout, setLayout] = useState<PrintLayout | null>(null);
  const [sampleData, setSampleData] = useState('{}');
  const [preview, setPreview] = useState('');
  const [advancedLayout, setAdvancedLayout] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [printerForm, setPrinterForm] = useState({
    id: '', name: '', printerName: '', printerType: 'RECEIPT', connectionType: 'WINDOWS', language: 'WINDOWS_DRIVER', paperWidthMm: 80, paperHeightMm: 40, columns: 40, dpi: 203, copies: 1, cutterEnabled: false,
  });
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModel, setNewModel] = useState({ code: '', name: '', documentType: 'CUSTOM', mediaType: 'RECEIPT' as 'RECEIPT' | 'LABEL' });

  const scope = useMemo(() => printingScope(runtime), [runtime]);
  const scopeQuery = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(scope).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).trim()) params.set(key, String(value));
    });
    return `?${params.toString()}`;
  }, [scope]);

  const loadAll = useCallback(async () => {
    if (!runtime.sourceSystem || !runtime.sourceTenantId || runtime.userRole !== 'ADMIN') return;
    setLoading(true);
    setError('');
    try {
      let loadedTemplates = await requestJson<PrintTemplate[]>(`/printing/templates${scopeQuery}`);
      if (!loadedTemplates.length) {
        const initialized = await requestJson<{ templates: PrintTemplate[] }>('/printing/bootstrap', {
          method: 'POST', body: JSON.stringify(scope),
        });
        loadedTemplates = initialized.templates;
      }
      const [loadedPrinters, loadedBindings, loadedHistory] = await Promise.all([
        requestJson<PrinterProfile[]>(`/printing/printers${scopeQuery}`),
        requestJson<Binding[]>(`/printing/bindings${scopeQuery}`),
        requestJson<PrintHistory[]>(`/printing/jobs${scopeQuery}&limit=100`),
      ]);
      setTemplates(loadedTemplates);
      setPrinters(loadedPrinters);
      setBindings(loadedBindings);
      setHistory(loadedHistory);
      setSelectedTemplateId((current) => current || loadedTemplates[0]?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'NÃO FOI POSSÍVEL CARREGAR AS CONFIGURAÇÕES.');
    } finally {
      setLoading(false);
    }
  }, [runtime.sourceSystem, runtime.sourceTenantId, runtime.userRole, scope, scopeQuery]);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => {
    if (!runtime.embedded || window.parent === window) return;
    window.parent.postMessage({ type: 'MSINFOR_SCREEN_CONTEXT', screenId: SCREEN_ID }, '*');
  }, [runtime.embedded]);

  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId) || null;
  useEffect(() => {
    const version = currentVersion(selectedTemplate);
    if (!version) return;
    const nextLayout = clone(version.layout);
    setLayout(nextLayout);
    setAdvancedLayout(JSON.stringify(nextLayout, null, 2));
    setSampleData(JSON.stringify(version.sampleData || {}, null, 2));
    setPreview('');
  }, [selectedTemplateId, selectedTemplate]);

  const updateItem = (index: number, changes: Record<string, unknown>) => {
    setLayout((current) => {
      if (!current) return current;
      const key = current.media.type === 'LABEL' ? 'elements' : 'blocks';
      const items = clone(current[key] || []);
      items[index] = { ...items[index], ...changes };
      const next = { ...current, [key]: items };
      setAdvancedLayout(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const moveItem = (index: number, offset: number) => {
    setLayout((current) => {
      if (!current) return current;
      const key = current.media.type === 'LABEL' ? 'elements' : 'blocks';
      const items = clone(current[key] || []);
      const target = index + offset;
      if (target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target], items[index]];
      const next = { ...current, [key]: items };
      setAdvancedLayout(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const removeItem = (index: number) => {
    setLayout((current) => {
      if (!current) return current;
      const key = current.media.type === 'LABEL' ? 'elements' : 'blocks';
      const next = { ...current, [key]: (current[key] || []).filter((_, itemIndex) => itemIndex !== index) };
      setAdvancedLayout(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const addItem = (type: string) => {
    setLayout((current) => {
      if (!current) return current;
      const isLabel = current.media.type === 'LABEL';
      const key = isLabel ? 'elements' : 'blocks';
      const item: LayoutItem = isLabel
        ? { id: newId('element'), type, value: type === 'TEXT' ? 'NOVO TEXTO' : '', path: type === 'BARCODE' ? 'product.barcode' : undefined, xMm: 2, yMm: 2, widthMm: 40, heightMm: 6, fontSize: 9, align: 'LEFT' }
        : { id: newId('block'), type, value: type === 'TEXT' ? 'NOVO TEXTO' : '', label: type === 'FIELD' || type === 'TOTAL' ? 'CAMPO ' : undefined, path: type === 'FIELD' || type === 'TOTAL' ? 'sale.saleNumber' : undefined, character: type === 'SEPARATOR' ? '-' : undefined, lines: type === 'SPACER' ? 1 : undefined, align: 'LEFT' };
      const next = { ...current, [key]: [...(current[key] || []), item] };
      setAdvancedLayout(JSON.stringify(next, null, 2));
      return next;
    });
  };

  const applyAdvanced = () => {
    try {
      const parsed = JSON.parse(advancedLayout) as PrintLayout;
      if (!parsed.media) throw new Error();
      setLayout(parsed);
      setError('');
      setMessage('LAYOUT AVANÇADO APLICADO À EDIÇÃO.');
    } catch {
      setError('O JSON DO LAYOUT NÃO É VÁLIDO.');
    }
  };

  const renderPreview = async () => {
    if (!layout) return;
    try {
      const data = JSON.parse(sampleData) as Record<string, unknown>;
      const rendered = await requestJson<{ serializedContent: string }>('/printing/preview', {
        method: 'POST', body: JSON.stringify({ ...scope, layout, data }),
      });
      setPreview(rendered.serializedContent);
      setError('');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'PRÉVIA INVÁLIDA.');
    }
  };

  const saveAndPublish = async () => {
    if (!layout || !selectedTemplate) return;
    setSaving(true);
    try {
      const data = JSON.parse(sampleData) as Record<string, unknown>;
      const version = await requestJson<TemplateVersion>(`/printing/templates/${selectedTemplate.id}/versions`, {
        method: 'POST', body: JSON.stringify({ ...scope, layout, sampleData: data }),
      });
      await requestJson(`/printing/templates/${selectedTemplate.id}/versions/${version.id}/publish`, {
        method: 'POST', body: JSON.stringify(scope),
      });
      setMessage(`VERSÃO ${version.version} SALVA E PUBLICADA.`);
      setError('');
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'NÃO FOI POSSÍVEL SALVAR O MODELO.');
    } finally { setSaving(false); }
  };

  const createModel = async () => {
    if (!newModel.code.trim() || !newModel.name.trim()) return;
    const isLabel = newModel.mediaType === 'LABEL';
    const initialLayout: PrintLayout = isLabel
      ? { schemaVersion: 1, media: { type: 'LABEL', widthMm: 60, heightMm: 40, gapMm: 2, dpi: 203 }, elements: [{ id: newId('title'), type: 'TEXT', value: newModel.name.toUpperCase(), xMm: 2, yMm: 2, widthMm: 56, heightMm: 8, fontSize: 10, align: 'CENTER' }] }
      : { schemaVersion: 1, media: { type: 'RECEIPT', columns: 40, widthMm: 80 }, blocks: [{ id: newId('title'), type: 'TEXT', value: newModel.name.toUpperCase(), align: 'CENTER' }, { id: newId('separator'), type: 'SEPARATOR', character: '-' }] };
    setSaving(true);
    try {
      const created = await requestJson<PrintTemplate>('/printing/templates', {
        method: 'POST',
        body: JSON.stringify({ ...scope, code: newModel.code, name: newModel.name, documentType: newModel.documentType, mediaType: newModel.mediaType, layout: initialLayout, sampleData: {} }),
      });
      const initialVersion = created.versions[0];
      if (initialVersion) {
        await requestJson(`/printing/templates/${created.id}/versions/${initialVersion.id}/publish`, {
          method: 'POST', body: JSON.stringify(scope),
        });
      }
      setMessage('NOVO MODELO CRIADO E PUBLICADO.');
      setShowNewModel(false);
      setNewModel({ code: '', name: '', documentType: 'CUSTOM', mediaType: 'RECEIPT' });
      await loadAll();
      setSelectedTemplateId(created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'NÃO FOI POSSÍVEL CRIAR O MODELO.');
    } finally { setSaving(false); }
  };

  const detectPrinters = async () => {
    try {
      const detected = await getLocalPrinters();
      setLocalPrinters(detected);
      if (!printerForm.printerName && detected.length) setPrinterForm((current) => ({ ...current, printerName: detected.find((item) => item.isDefault)?.name || detected[0].name }));
      setMessage(`${detected.length} IMPRESSORA(S) LOCAL(IS) ENCONTRADA(S).`);
      setError('');
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : 'AGENTE LOCAL INDISPONÍVEL.');
    }
  };

  const editPrinter = (printer: PrinterProfile) => setPrinterForm({
    id: printer.id, name: printer.name, printerName: printer.printerName, printerType: printer.printerType, connectionType: printer.connectionType, language: printer.language, paperWidthMm: printer.paperWidthMm, paperHeightMm: printer.paperHeightMm || 40, columns: printer.columns, dpi: printer.dpi, copies: printer.copies, cutterEnabled: printer.cutterEnabled,
  });

  const savePrinter = async () => {
    setSaving(true);
    try {
      await requestJson('/printing/printers', { method: 'POST', body: JSON.stringify({ ...scope, ...printerForm, paperHeightMm: printerForm.printerType === 'LABEL' ? printerForm.paperHeightMm : undefined }) });
      setMessage('PERFIL DE IMPRESSORA SALVO.');
      setError('');
      setPrinterForm((current) => ({ ...current, id: '', name: '' }));
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'NÃO FOI POSSÍVEL SALVAR A IMPRESSORA.');
    } finally { setSaving(false); }
  };

  const saveBinding = async (binding: Binding, changes: Partial<Binding>) => {
    const next = { ...binding, ...changes };
    try {
      await requestJson('/printing/bindings', {
        method: 'PUT',
        body: JSON.stringify({ ...scope, eventType: next.eventType, templateId: next.templateId, printerProfileId: next.printerProfileId || undefined, autoPrint: next.autoPrint, copies: Number(next.copies) || 1 }),
      });
      setMessage('VÍNCULO DE IMPRESSÃO SALVO.');
      await loadAll();
    } catch (bindingError) {
      setError(bindingError instanceof Error ? bindingError.message : 'NÃO FOI POSSÍVEL SALVAR O VÍNCULO.');
    }
  };

  const reprint = async (jobId: string) => {
    try {
      const result = await requestJson<{ job: FinancePrintJob }>(`/printing/jobs/${jobId}/reprint`, { method: 'POST', body: JSON.stringify(scope) });
      await sendJobToLocalAgent(result.job);
      await requestJson(`/printing/jobs/${result.job.id}/status`, { method: 'PATCH', body: JSON.stringify({ ...scope, status: 'COMPLETED', localPrinterName: result.job.printer?.printerName }) });
      setMessage('REIMPRESSÃO CONCLUÍDA.');
      await loadAll();
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : 'NÃO FOI POSSÍVEL REIMPRIMIR.');
    }
  };

  if (runtime.userRole && runtime.userRole !== 'ADMIN') return <section className={`${cardClass} p-8 text-center font-black text-amber-700`}>ACESSO RESTRITO AO PERFIL ADMIN.</section>;

  const items = layout?.media.type === 'LABEL' ? layout.elements || [] : layout?.blocks || [];
  const itemTypes = layout?.media.type === 'LABEL' ? ['TEXT', 'BARCODE', 'QRCODE', 'LINE'] : ['TEXT', 'FIELD', 'TOTAL', 'SEPARATOR', 'SPACER', 'BARCODE', 'QRCODE'];

  return (
    <div className="space-y-6">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-5 py-5 text-white">
          <div className="flex items-center gap-4">
            <img src={runtime.logoUrl || '/logo-msinfor.jpg'} alt="Logo institucional" className="h-14 w-14 rounded-2xl border border-white/20 bg-white object-contain shadow-lg" />
            <div><div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Central MSINFOR</div><h1 className="text-2xl font-black">Modelos e impressão local</h1><p className="mt-1 text-xs font-semibold text-blue-100">Monte recibos e etiquetas, vincule eventos e use as impressoras instaladas no computador.</p></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-4">
          {([['MODELS', 'MODELOS'], ['PRINTERS', 'IMPRESSORAS'], ['BINDINGS', 'AUTOMAÇÕES'], ['HISTORY', 'HISTÓRICO']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-xl px-4 py-2 text-xs font-black ${tab === id ? 'bg-[#1d4f91] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</div> : null}
      {loading ? <section className={`${cardClass} p-8 text-center text-sm font-black text-slate-500`}>CARREGANDO CONFIGURAÇÕES...</section> : null}

      {!loading && tab === 'MODELS' ? (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
          <section className={`${cardClass} p-4`}><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Modelos disponíveis</h2><button type="button" onClick={() => setShowNewModel((value) => !value)} className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">+ NOVO</button></div>{showNewModel ? <div className="mb-4 space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-3"><label className="text-[10px] font-black text-blue-800">CÓDIGO<input className={inputClass} value={newModel.code} onChange={(event) => setNewModel({ ...newModel, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} placeholder="EX.: RECIBO_PEDIDO" /></label><label className="text-[10px] font-black text-blue-800">NOME<input className={inputClass} value={newModel.name} onChange={(event) => setNewModel({ ...newModel, name: event.target.value.toUpperCase() })} /></label><label className="text-[10px] font-black text-blue-800">MÍDIA<select className={inputClass} value={newModel.mediaType} onChange={(event) => setNewModel({ ...newModel, mediaType: event.target.value as 'RECEIPT' | 'LABEL' })}><option value="RECEIPT">RECIBO</option><option value="LABEL">ETIQUETA</option></select></label><button type="button" disabled={!newModel.code || !newModel.name || saving} onClick={createModel} className={`${buttonClass} w-full`}>CRIAR MODELO</button></div> : null}<div className="space-y-2">{templates.map((template) => <button key={template.id} type="button" onClick={() => setSelectedTemplateId(template.id)} className={`w-full rounded-xl border p-3 text-left ${selectedTemplateId === template.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}><div className="text-sm font-black text-slate-800">{template.name}</div><div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500"><span>{template.mediaType === 'LABEL' ? 'ETIQUETA' : 'RECIBO'}</span><span>VERSÃO {template.currentVersion}</span></div></button>)}</div></section>

          <section className={`${cardClass} p-5`}>
            {layout && selectedTemplate ? <>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">{selectedTemplate.name}</h2><p className="text-xs font-semibold text-slate-500">Arraste a ideia do relatório por blocos; use as setas para ordenar.</p></div><button type="button" onClick={saveAndPublish} disabled={saving} className={buttonClass}>{saving ? 'SALVANDO...' : 'SALVAR NOVA VERSÃO E PUBLICAR'}</button></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {layout.media.type === 'LABEL' ? <><label className="text-xs font-black text-slate-600">LARGURA (MM)<input className={inputClass} type="number" value={layout.media.widthMm || 60} onChange={(event) => setLayout({ ...layout, media: { ...layout.media, widthMm: Number(event.target.value) } })} /></label><label className="text-xs font-black text-slate-600">ALTURA (MM)<input className={inputClass} type="number" value={layout.media.heightMm || 40} onChange={(event) => setLayout({ ...layout, media: { ...layout.media, heightMm: Number(event.target.value) } })} /></label><label className="text-xs font-black text-slate-600">INTERVALO (MM)<input className={inputClass} type="number" value={layout.media.gapMm || 2} onChange={(event) => setLayout({ ...layout, media: { ...layout.media, gapMm: Number(event.target.value) } })} /></label><label className="text-xs font-black text-slate-600">DPI<input className={inputClass} type="number" value={layout.media.dpi || 203} onChange={(event) => setLayout({ ...layout, media: { ...layout.media, dpi: Number(event.target.value) } })} /></label></> : <><label className="text-xs font-black text-slate-600">COLUNAS<input className={inputClass} type="number" min={16} max={160} value={layout.media.columns || 40} onChange={(event) => setLayout({ ...layout, media: { ...layout.media, columns: Number(event.target.value) } })} /></label><label className="text-xs font-black text-slate-600">LARGURA (MM)<input className={inputClass} type="number" value={layout.media.widthMm || 80} onChange={(event) => setLayout({ ...layout, media: { ...layout.media, widthMm: Number(event.target.value) } })} /></label></>}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">{itemTypes.map((type) => <button key={type} type="button" onClick={() => addItem(type)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700">+ {TYPE_LABELS[type]}</button>)}</div>
              <div className="mt-4 space-y-3">{items.map((item, index) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between"><span className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black text-white">{TYPE_LABELS[item.type] || item.type}</span><div className="flex gap-1"><button type="button" onClick={() => moveItem(index, -1)} className="rounded bg-white px-2 py-1 font-black text-slate-600">↑</button><button type="button" onClick={() => moveItem(index, 1)} className="rounded bg-white px-2 py-1 font-black text-slate-600">↓</button><button type="button" onClick={() => removeItem(index)} className="rounded bg-red-50 px-2 py-1 font-black text-red-600">×</button></div></div><div className="grid gap-2 sm:grid-cols-2">
                {item.type === 'TEXT' ? <label className="text-[10px] font-black text-slate-500">TEXTO / VARIÁVEL<input className={inputClass} value={item.value || ''} onChange={(event) => updateItem(index, { value: event.target.value.toUpperCase() })} placeholder="EX.: {{company.name}}" /></label> : null}
                {['FIELD', 'TOTAL'].includes(item.type) ? <label className="text-[10px] font-black text-slate-500">RÓTULO<input className={inputClass} value={item.label || ''} onChange={(event) => updateItem(index, { label: event.target.value.toUpperCase() })} /></label> : null}
                {['FIELD', 'TOTAL', 'BARCODE', 'QRCODE'].includes(item.type) || (layout.media.type === 'LABEL' && item.type === 'TEXT') ? <label className="text-[10px] font-black text-slate-500">CAMINHO DO DADO<input className={inputClass} value={item.path || ''} onChange={(event) => updateItem(index, { path: event.target.value })} placeholder="product.name" /></label> : null}
                {item.type === 'SEPARATOR' ? <label className="text-[10px] font-black text-slate-500">CARACTERE<input className={inputClass} maxLength={1} value={item.character || '-'} onChange={(event) => updateItem(index, { character: event.target.value })} /></label> : null}
                {item.type === 'SPACER' ? <label className="text-[10px] font-black text-slate-500">LINHAS<input className={inputClass} type="number" value={item.lines || 1} onChange={(event) => updateItem(index, { lines: Number(event.target.value) })} /></label> : null}
                {['TEXT', 'BARCODE', 'QRCODE'].includes(item.type) ? <label className="text-[10px] font-black text-slate-500">ALINHAMENTO<select className={inputClass} value={item.align || 'LEFT'} onChange={(event) => updateItem(index, { align: event.target.value })}><option value="LEFT">ESQUERDA</option><option value="CENTER">CENTRO</option><option value="RIGHT">DIREITA</option></select></label> : null}
                {layout.media.type === 'LABEL' ? <><label className="text-[10px] font-black text-slate-500">X (MM)<input className={inputClass} type="number" value={item.xMm || 0} onChange={(event) => updateItem(index, { xMm: Number(event.target.value) })} /></label><label className="text-[10px] font-black text-slate-500">Y (MM)<input className={inputClass} type="number" value={item.yMm || 0} onChange={(event) => updateItem(index, { yMm: Number(event.target.value) })} /></label><label className="text-[10px] font-black text-slate-500">LARGURA (MM)<input className={inputClass} type="number" value={item.widthMm || 10} onChange={(event) => updateItem(index, { widthMm: Number(event.target.value) })} /></label><label className="text-[10px] font-black text-slate-500">ALTURA (MM)<input className={inputClass} type="number" value={item.heightMm || 5} onChange={(event) => updateItem(index, { heightMm: Number(event.target.value) })} /></label></> : null}
              </div></div>)}</div>
              <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="mt-5 text-xs font-black text-blue-700">{showAdvanced ? 'OCULTAR MODO AVANÇADO' : 'ABRIR MODO AVANÇADO (JSON)'}</button>
              {showAdvanced ? <div className="mt-3"><textarea className={`${inputClass} min-h-72 font-mono text-xs`} value={advancedLayout} onChange={(event) => setAdvancedLayout(event.target.value)} /><button type="button" onClick={applyAdvanced} className={`${buttonClass} mt-2`}>APLICAR JSON</button></div> : null}
            </> : <div className="p-8 text-center text-sm font-bold text-slate-500">SELECIONE UM MODELO.</div>}
          </section>

          <section className={`${cardClass} h-fit p-5 xl:sticky xl:top-4`}><h2 className="text-sm font-black text-slate-800">PRÉVIA</h2><p className="mt-1 text-xs font-semibold text-slate-500">Os dados abaixo servem somente para testar o layout.</p><textarea className={`${inputClass} mt-3 min-h-48 font-mono text-xs`} value={sampleData} onChange={(event) => setSampleData(event.target.value)} /><button type="button" onClick={renderPreview} className={`${buttonClass} mt-3 w-full`}>ATUALIZAR PRÉVIA</button>{preview ? <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-300">{preview}</pre> : null}</section>
        </div>
      ) : null}

      {!loading && tab === 'PRINTERS' ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className={`${cardClass} p-5`}><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Impressoras deste computador</h2><p className="text-xs font-semibold text-slate-500">O agente local continua servindo as imagens do HD e também detecta as impressoras do Windows.</p></div><button type="button" onClick={detectPrinters} className={buttonClass}>DETECTAR IMPRESSORAS</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{printers.map((printer) => <button key={printer.id} type="button" onClick={() => editPrinter(printer)} className="rounded-2xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50"><div className="font-black text-slate-800">{printer.name}</div><div className="mt-1 text-xs font-semibold text-slate-500">{printer.printerName}</div><div className="mt-2 text-[10px] font-black text-blue-700">{printer.language} · {printer.paperWidthMm} MM · {printer.columns} COLUNAS</div></button>)}</div></section>
        <section className={`${cardClass} p-5`}><h2 className="text-sm font-black text-slate-800">PERFIL DE IMPRESSORA</h2><div className="mt-4 space-y-3"><label className="text-xs font-black text-slate-600">NOME DO PERFIL<input className={inputClass} value={printerForm.name} onChange={(event) => setPrinterForm({ ...printerForm, name: event.target.value.toUpperCase() })} /></label><label className="text-xs font-black text-slate-600">IMPRESSORA DO WINDOWS<select className={inputClass} value={printerForm.printerName} onChange={(event) => setPrinterForm({ ...printerForm, printerName: event.target.value })}><option value={printerForm.printerName}>{printerForm.printerName || 'DETECTE AS IMPRESSORAS'}</option>{localPrinters.filter((item) => item.name !== printerForm.printerName).map((item) => <option key={item.name} value={item.name}>{item.name}{item.isDefault ? ' (PADRÃO)' : ''}</option>)}</select></label><label className="text-xs font-black text-slate-600">TIPO<select className={inputClass} value={printerForm.printerType} onChange={(event) => setPrinterForm({ ...printerForm, printerType: event.target.value })}><option value="RECEIPT">RECIBO TÉRMICO</option><option value="LABEL">ETIQUETA</option></select></label><label className="text-xs font-black text-slate-600">LINGUAGEM<select className={inputClass} value={printerForm.language} onChange={(event) => setPrinterForm({ ...printerForm, language: event.target.value })}><option value="WINDOWS_DRIVER">DRIVER DO WINDOWS</option><option value="ESC_POS">ESC/POS</option><option value="PPLA">ARGOX PPLA</option><option value="PPLB">ARGOX PPLB</option><option value="PPLZ">ARGOX PPLZ</option><option value="ZPL">ZPL</option></select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-black text-slate-600">LARGURA MM<input className={inputClass} type="number" value={printerForm.paperWidthMm} onChange={(event) => setPrinterForm({ ...printerForm, paperWidthMm: Number(event.target.value) })} /></label><label className="text-xs font-black text-slate-600">COLUNAS<input className={inputClass} type="number" value={printerForm.columns} onChange={(event) => setPrinterForm({ ...printerForm, columns: Number(event.target.value) })} /></label><label className="text-xs font-black text-slate-600">DPI<input className={inputClass} type="number" value={printerForm.dpi} onChange={(event) => setPrinterForm({ ...printerForm, dpi: Number(event.target.value) })} /></label><label className="text-xs font-black text-slate-600">CÓPIAS<input className={inputClass} type="number" value={printerForm.copies} onChange={(event) => setPrinterForm({ ...printerForm, copies: Number(event.target.value) })} /></label></div><label className="flex items-center gap-2 text-xs font-black text-slate-600"><input type="checkbox" checked={printerForm.cutterEnabled} onChange={(event) => setPrinterForm({ ...printerForm, cutterEnabled: event.target.checked })} /> ACIONAR GUILHOTINA</label><button type="button" onClick={savePrinter} disabled={!printerForm.name || !printerForm.printerName || saving} className={`${buttonClass} w-full`}>SALVAR PERFIL</button></div></section>
      </div> : null}

      {!loading && tab === 'BINDINGS' ? <section className={`${cardClass} p-5`}><h2 className="text-lg font-black text-slate-900">Automação por evento</h2><p className="mt-1 text-xs font-semibold text-slate-500">Escolha o modelo, a impressora e se a impressão deve ocorrer automaticamente.</p><div className="mt-5 space-y-3">{bindings.map((binding) => <div key={binding.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 md:grid-cols-[220px_1fr_1fr_100px_120px] md:items-end"><div><div className="text-xs font-black text-slate-800">{EVENT_LABELS[binding.eventType] || binding.eventType}</div><div className="mt-1 text-[10px] font-bold text-slate-400">{binding.eventType}</div></div><label className="text-[10px] font-black text-slate-500">MODELO<select className={inputClass} value={binding.templateId} onChange={(event) => void saveBinding(binding, { templateId: event.target.value })}>{templates.filter((item) => item.mediaType === binding.template.mediaType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[10px] font-black text-slate-500">IMPRESSORA<select className={inputClass} value={binding.printerProfileId || ''} onChange={(event) => void saveBinding(binding, { printerProfileId: event.target.value || null })}><option value="">NÃO DEFINIDA</option>{printers.filter((item) => item.printerType === binding.template.mediaType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-[10px] font-black text-slate-500">CÓPIAS<input className={inputClass} type="number" min={1} max={20} value={binding.copies} onChange={(event) => setBindings((list) => list.map((item) => item.id === binding.id ? { ...item, copies: Number(event.target.value) } : item))} onBlur={(event) => void saveBinding(binding, { copies: Number(event.target.value) })} /></label><label className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-[10px] font-black text-slate-700"><input type="checkbox" checked={binding.autoPrint} onChange={(event) => void saveBinding(binding, { autoPrint: event.target.checked })} /> AUTOMÁTICA</label></div>)}</div></section> : null}

      {!loading && tab === 'HISTORY' ? <section className={`${cardClass} overflow-hidden`}><div className="border-b border-slate-200 p-5"><h2 className="text-lg font-black text-slate-900">Histórico de impressão</h2><p className="text-xs font-semibold text-slate-500">Cada tentativa e reimpressão mantém conteúdo, operador, impressora e resultado para auditoria.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr><th className="px-4 py-3">DATA</th><th className="px-4 py-3">MODELO</th><th className="px-4 py-3">EVENTO</th><th className="px-4 py-3">IMPRESSORA</th><th className="px-4 py-3">STATUS</th><th className="px-4 py-3"></th></tr></thead><tbody>{history.map((job) => <tr key={job.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-600">{new Date(job.requestedAt).toLocaleString('pt-BR')}</td><td className="px-4 py-3 font-black text-slate-800">{job.template?.name}</td><td className="px-4 py-3 font-semibold text-slate-600">{EVENT_LABELS[job.eventType] || job.eventType}</td><td className="px-4 py-3 font-semibold text-slate-600">{job.localPrinterName || '—'}</td><td className="px-4 py-3"><span title={job.errorMessage || ''} className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass(job.status)}`}>{job.status}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => void reprint(job.id)} className="rounded-lg bg-blue-50 px-3 py-2 font-black text-blue-700">REIMPRIMIR</button></td></tr>)}</tbody></table></div></section> : null}

      {!runtime.embedded ? <section className={`${cardClass} px-6 py-4`}><ScreenNameCopy screenId={SCREEN_ID} className="justify-end" originText={ORIGIN_TEXT} auditText={`Configuração isolada por empresa e filial. Usuário: ${runtime.cashierDisplayName || runtime.cashierUserId || 'NÃO INFORMADO'}. Todas as mutações e impressões são auditadas.`} sqlText="-- MODELOS VERSIONADOS, PERFIS DE IMPRESSORA, VÍNCULOS E FILA AUDITÁVEL." /></section> : null}
    </div>
  );
}
