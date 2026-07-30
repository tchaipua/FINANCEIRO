'use client';

import { useEffect, useState } from 'react';
import { getJson, requestJson } from '@/app/lib/api';
import { buildFinanceApiQueryString, type FinanceRuntimeContext } from '@/app/lib/runtime-context';

export type SalesScreenParameters = {
  allowSaleUnitPriceEdit: boolean;
  allowSaleItemDiscount: boolean;
  groupSameProduct: boolean;
  allowProductImageEdit: boolean;
  requirePasswordToRemoveSaleItems: boolean;
};

type Props = {
  isOpen: boolean;
  parameters: SalesScreenParameters;
  companyId: string | null;
  branchId: string | null;
  runtimeContext: FinanceRuntimeContext;
  onClose: () => void;
  onSaved: (parameters: SalesScreenParameters) => void;
};

const SCREEN_ID = 'POPUP_PRINCIPAL_FINANCEIRO_VENDAS_PARAMETROS_TELA';

export default function SalesScreenParametersModal({ isOpen, parameters: initialParameters, companyId, branchId, runtimeContext, onClose, onSaved }: Props) {
  const [parameters, setParameters] = useState(initialParameters);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [tab, setTab] = useState<'GENERAL' | 'IMAGES'>('GENERAL');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locations, setLocations] = useState({ local: '', s3: '', description: '', source: '' });

  useEffect(() => {
    if (!isOpen) return;
    setParameters(initialParameters); setPassword(''); setShowPassword(false); setCapsLock(false); setTab('GENERAL'); setMessage(null);
  }, [initialParameters, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void Promise.all([
      fetch('http://127.0.0.1:47821/configuracao', { cache: 'no-store' }).then(async r => r.ok ? r.json() as Promise<{ imagesDirectory?: string }> : null).catch(() => null),
      getJson<{ imagesFolder?: string; description?: string; sourceScope?: string }>(`/s3-control/effective-configuration${buildFinanceApiQueryString(runtimeContext)}`).catch(() => null),
    ]).then(([local, s3]) => { if (active) setLocations({ local: String(local?.imagesDirectory || '').trim(), s3: String(s3?.imagesFolder || '').trim(), description: String(s3?.description || '').trim(), source: String(s3?.sourceScope || '').trim().toUpperCase() }); });
    return () => { active = false; };
  }, [isOpen, runtimeContext]);

  if (!isOpen) return null;
  const sourceLabel = locations.source === 'BRANCH' ? 'FILIAL' : locations.source === 'COMPANY' ? 'EMPRESA' : locations.source === 'SOFTHOUSE' ? 'SOFTHOUSE' : 'NÃO CONFIGURADA';
  const save = async () => {
    if (!password.trim()) { setMessage('INFORME A SENHA DE UM ADMINISTRADOR.'); return; }
    if (!companyId || !branchId) { setMessage('A EMPRESA OU A FILIAL FINANCEIRA NÃO FOI CARREGADA.'); return; }
    setSaving(true); setMessage(null);
    try {
      const confirmation = await fetch('/api/v1/auth/confirm-administrator-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const confirmationPayload = await confirmation.json().catch(() => null);
      if (!confirmation.ok) throw new Error(confirmationPayload?.message || 'SENHA DE ADMINISTRADOR INVÁLIDA.');
      const saved = await requestJson<SalesScreenParameters>(`/companies/${companyId}/branches/${branchId}/screen-parameters/vendas${buildFinanceApiQueryString(runtimeContext)}`, { method: 'PATCH', body: JSON.stringify(parameters), fallbackMessage: 'NÃO FOI POSSÍVEL SALVAR OS PARÂMETROS DA TELA.' });
      onSaved(saved); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'NÃO FOI POSSÍVEL SALVAR OS PARÂMETROS.'); }
    finally { setSaving(false); }
  };
  const check = (key: keyof SalesScreenParameters, label: string) => <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><span className="pr-4 text-sm font-bold text-slate-800">{label}</span><input type="checkbox" checked={parameters[key]} onChange={e => setParameters(current => ({ ...current, [key]: e.target.checked }))} className="h-5 w-5 accent-blue-700" /></label>;
  return <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/30 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.45)]">
      <header className="flex items-center gap-4 border-b border-blue-800 bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-6 py-4 text-white"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/25 bg-white shadow-lg">{runtimeContext.logoUrl ? <img src={runtimeContext.logoUrl} alt="Escola" className="h-full w-full object-contain p-1" /> : <span className="text-xs font-black text-slate-600">ESC</span>}</div><div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">Financeiro • Vendas</div><h2 className="truncate text-xl font-black">Parâmetros da tela de vendas</h2><p className="mt-1 text-xs font-semibold text-blue-100">Defina as permissões e o comportamento dos itens na tela de vendas.</p></div><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full border border-red-200 bg-red-600 text-xl font-black">×</button></header>
      <div className="space-y-5 px-6 py-6"><div><label className="mb-3 block rounded-xl bg-rose-600 px-4 py-3 text-center text-sm font-black uppercase tracking-[0.18em] text-white">Senha do administrador</label><div className="relative"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setMessage(null); }} onKeyDown={e => setCapsLock(e.getModifierState('CapsLock'))} onKeyUp={e => setCapsLock(e.getModifierState('CapsLock'))} placeholder="Informe a senha do administrador" autoFocus className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-12 text-sm text-slate-900" disabled={saving}/><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 w-12 text-slate-500" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? '◉' : '◉'}</button></div>{capsLock ? <p className="mt-2 text-center text-xs font-black uppercase tracking-[0.12em] text-rose-600">Caps Lock ativado</p> : null}</div><p className="text-sm text-slate-600">Informe a senha de um usuário da empresa com a função ADMINISTRADOR para liberar a alteração destes parâmetros.</p>
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-1"><button type="button" onClick={() => setTab('GENERAL')} className={`rounded-lg px-4 py-2.5 text-xs font-black uppercase ${tab === 'GENERAL' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}>Gerais</button><button type="button" onClick={() => setTab('IMAGES')} className={`rounded-lg px-4 py-2.5 text-xs font-black uppercase ${tab === 'IMAGES' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}>Imagens</button></div>
        {tab === 'GENERAL' ? <div className="space-y-3">{check('allowSaleUnitPriceEdit', 'Permitir alterar valor unitário')}{check('allowSaleItemDiscount', 'Permitir informar desconto por item')}{check('groupSameProduct', 'Agrupar mesmo produto')}{check('requirePasswordToRemoveSaleItems', 'Exigir senha para excluir item ou limpar venda')}</div> : <div className="space-y-3">{check('allowProductImageEdit', 'Permitir alterar foto do produto')}<div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Pasta local das imagens</div><div className="mt-1 break-all text-sm font-bold text-slate-800">{locations.local || 'NÃO CONFIGURADA'}</div></div><div className="border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Pasta de imagens no S3</div><div className="mt-1 break-all text-sm font-bold text-slate-800">{locations.s3 || 'NÃO CONFIGURADA'}</div></div><div className="border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Descrição da configuração S3</div><div className="mt-1 text-sm font-bold text-slate-800">{locations.description || 'NÃO INFORMADA'}</div></div><div className="border-t border-slate-200 pt-3"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Origem da configuração S3</div><div className="mt-1 text-sm font-bold text-slate-800">{sourceLabel}</div></div></div></div>}
      </div>
      <footer className="flex items-center gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4"><button type="button" onClick={() => void save()} disabled={saving} className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-700 disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button><div className="min-w-0 flex-1 truncate text-right text-[10px] font-black uppercase tracking-[0.12em] text-slate-500" title={`Tela: ${SCREEN_ID}`}>Tela: {SCREEN_ID}</div></footer>
    </div>{message ? <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/55 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl"><div className="text-lg font-black text-rose-700">Erro</div><p className="mt-4 text-sm font-bold uppercase text-slate-700">{message}</p><button type="button" onClick={() => setMessage(null)} className="mt-5 rounded-xl bg-rose-600 px-5 py-3 text-xs font-black uppercase text-white">Fechar mensagem</button></div></div> : null}
  </div>;
}
