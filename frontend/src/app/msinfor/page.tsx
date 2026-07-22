'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ScreenNameCopy from '@/app/components/screen-name-copy';
import {
  buildFinanceNavigationQueryString,
  useFinanceRuntimeContext,
} from '@/app/lib/runtime-context';

const cardClass = 'rounded-3xl border border-slate-200 bg-white shadow-sm';
const FINANCE_SCREEN_ID = 'FINANCEIRO_MSINFOR_CENTRAL';
const EMBEDDED_SCREEN_ID = 'PRINCIPAL_FINANCEIRO_MSINFOR';
const S3_ACCESS_POPUP_ID = 'POPUP_PRINCIPAL_FINANCEIRO_MSINFOR_CONTROLE_S3_ACESSO';
const ORIGIN_TEXT =
  'Origem: Sistema Financeiro - caminho físico: C:/Sistemas/IA/Financeiro/frontend/src/app/msinfor/page.tsx';
function isValidMasterPass(input: string, date: Date) {
  const normalizedInput = input.trim().toUpperCase();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const expectedNumber = Number.parseInt(`${day + date.getHours()}${month + date.getMinutes()}`, 10);
  if (normalizedInput === `S${expectedNumber}`) return true;
  return Number.isFinite(expectedNumber) && normalizedInput === `S${expectedNumber + 1}`;
}

export default function MsinforPage() {
  const runtimeContext = useFinanceRuntimeContext();
  const [isMounted, setIsMounted] = useState(false);
  const [isS3AccessPopupOpen, setIsS3AccessPopupOpen] = useState(false);
  const [s3MasterPassword, setS3MasterPassword] = useState('');
  const [s3MasterPasswordError, setS3MasterPasswordError] = useState(false);
  const [isS3PasswordVisible, setIsS3PasswordVisible] = useState(false);
  const screenId = runtimeContext.embedded ? EMBEDDED_SCREEN_ID : FINANCE_SCREEN_ID;
  const preservedQueryString = buildFinanceNavigationQueryString(runtimeContext);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const openS3AccessConfirmation = () => {
    setS3MasterPassword('');
    setS3MasterPasswordError(false);
    setIsS3AccessPopupOpen(true);
  };

  const confirmS3Access = () => {
    const now = new Date();
    const valid = [new Date(now.getTime() - 60_000), now, new Date(now.getTime() + 60_000)].some((date) => isValidMasterPass(s3MasterPassword, date));
    if (!valid) {
      setS3MasterPasswordError(true);
      return;
    }
    window.location.assign(`/msinfor/controle-s3${preservedQueryString}`);
  };

  useEffect(() => {
    if (!runtimeContext.embedded || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'MSINFOR_SCREEN_CONTEXT',
        screenId: EMBEDDED_SCREEN_ID,
      },
      '*',
    );
  }, [runtimeContext.embedded]);

  if (!isMounted) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <div className={`${cardClass} px-8 py-6 text-center text-sm font-bold text-slate-600`}>
          CARREGANDO CENTRAL MSINFOR...
        </div>
      </div>
    );
  }

  if (runtimeContext.userRole !== 'ADMIN') {
    return (
      <div className="space-y-6">
        <section className={`${cardClass} border-amber-200 p-8 text-center`}>
          <div className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-600">
            Acesso restrito
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Central MSINFOR</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Esta área está disponível somente para usuários com perfil ADMIN.
          </p>
        </section>

        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText="Acesso negado porque o contexto atual não possui perfil ADMIN."
            sqlText="-- ESTA TELA NÃO CONSULTA DADOS QUANDO O ACESSO É NEGADO."
          />
        </section>
      </div>
    );
  }

  const auditText = `Central de integrações compartilhadas do Financeiro.

Contexto operacional:
- sistema de origem: ${runtimeContext.sourceSystem || 'NÃO INFORMADO'}
- tenant de origem: ${runtimeContext.sourceTenantId || 'NÃO INFORMADO'}
- filial: ${runtimeContext.sourceBranchCode}
- perfil exigido: ADMIN

Estrutura atual:
- card SUPERTEF abre a administração da integração em uma tela única com abas
- card PARÂMETROS FISCAIS abre a central de cadastros necessários à emissão fiscal por filial
- card CONTROLE S3 abre a administração do armazenamento no próprio Financeiro
- credenciais do S3 são mantidas criptografadas no banco do Financeiro e nunca exibidas na tela
- todas as integrações futuras devem preservar o isolamento por sourceSystem + sourceTenantId`;

  return (
    <div className="space-y-6">

      {!runtimeContext.embedded ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="bg-gradient-to-r from-[#153a6a] via-[#1d4f91] to-[#2563eb] px-4 py-5 text-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
                <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="h-full w-full object-cover" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
                  Financeiro integrado
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Central MSINFOR</h1>
                <p className="mt-1 max-w-3xl text-xs font-medium text-blue-100/90">
                  Integrações e serviços compartilhados por todas as verticais do Financeiro.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={`${cardClass} p-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <Link
            href={`/msinfor/supertef${preservedQueryString}`}
            title="Configurar máquinas, checkouts, roteamento, operações e estornos do SuperTEF."
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
              <img
                src="/principal-financeiro/supertef.svg"
                alt="SuperTEF"
                className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
              <div className="text-sm font-black text-slate-800">SUPERTEF</div>
            </div>
          </Link>

          <Link
            href={`/msinfor/parametros-fiscais${preservedQueryString}`}
            title="Configurar por filial os dados, regras e cadastros necessários à emissão de documentos fiscais."
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3">
              <img
                src="/principal-financeiro/empresa.svg"
                alt="Parâmetros fiscais"
                className="max-h-full max-w-full object-contain opacity-95 transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
              <div className="text-sm font-black text-slate-800">PARÂMETROS FISCAIS</div>
            </div>
          </Link>

          <button
            type="button"
            onClick={openS3AccessConfirmation}
            title="Configurar e explorar os arquivos S3 exclusivos do Financeiro."
            className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50"
          >
            <div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100 p-3 text-4xl">
              ☁️
            </div>
            <div className="flex min-h-11 items-center justify-center p-2.5 text-center">
              <div className="text-sm font-black text-slate-800">CONTROLE S3</div>
            </div>
          </button>
        </div>
      </section>

      {isS3AccessPopupOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#071526]/80 p-4 backdrop-blur-md">
          <div className="relative flex w-full max-w-sm flex-col items-center">
            <div className="mb-8">
              <img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="h-32 w-32 rounded-full border-4 border-indigo-500/30 shadow-[0_0_48px_rgba(99,102,241,0.45)]" />
            </div>
            <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#112240] p-8 shadow-2xl">
              <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
              <h2 className="mb-8 text-center text-xl font-bold tracking-[0.15em] text-white">ACESSO EXCLUSIVO MSINFOR</h2>
              <form onSubmit={(event) => { event.preventDefault(); confirmS3Access(); }}>
                <div className="relative mb-6">
                  <input type={isS3PasswordVisible ? 'text' : 'password'} placeholder="Chave de Acesso Admin" value={s3MasterPassword} onChange={(event) => { setS3MasterPassword(event.target.value); setS3MasterPasswordError(false); }} className="w-full rounded-xl border border-slate-700/50 bg-[#0a192f] px-12 py-3.5 text-center font-mono text-lg tracking-widest text-slate-200 shadow-inner outline-none transition-all placeholder:text-sm placeholder:text-slate-600 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" autoFocus />
                  <button type="button" onClick={() => setIsS3PasswordVisible((current) => !current)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label={isS3PasswordVisible ? 'Ocultar chave master' : 'Mostrar chave master'} title={isS3PasswordVisible ? 'Ocultar chave master' : 'Mostrar chave master'}>
                    {isS3PasswordVisible ? <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.88 5.09A9.77 9.77 0 0112 4.8c5.05 0 9.27 3.11 10.5 7.2a10.76 10.76 0 01-4.04 5.45M6.1 6.1A10.75 10.75 0 001.5 12c.64 2.13 2.1 3.99 4.1 5.3" /></svg> : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M1.5 12S5.5 4.8 12 4.8 22.5 12 22.5 12 18.5 19.2 12 19.2 1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></svg>}
                  </button>
                </div>
                <button type="submit" className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold tracking-widest text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95">ACESSAR</button>
                <button type="button" onClick={() => setIsS3AccessPopupOpen(false)} className="mt-4 w-full rounded-xl border border-slate-700/60 bg-[#0a192f] py-3 text-sm font-bold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900">Voltar ao login principal</button>
              </form>
            </div>
          </div>
        </div>
      )}
      {s3MasterPasswordError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-red-50 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white shadow-sm"><img src="/logo-msinfor.jpg" alt="Logo MSINFOR" className="h-full w-full object-cover" /></div>
            <h3 className="mt-4 text-xl font-black text-[#13233b]">Acesso Negado</h3>
            <p className="mt-3 text-sm font-black uppercase tracking-[0.18em] text-[#42547a]">Senha master invalida</p>
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-center shadow-inner"><p className="font-mono text-sm font-black tracking-[0.18em] text-red-600">Intruso Detectado.</p><div className="my-3 h-px bg-red-200" /><p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">CÓDIGO DE REFERÊNCIA: S(D+H)(M+M)</p></div>
            <p className="mt-5 text-xs font-medium text-blue-500">Confira a chave de acesso e tente novamente.</p>
            <button type="button" onClick={() => setS3MasterPasswordError(false)} className="mt-6 w-full rounded-xl bg-[#15243c] py-3 text-base font-black text-white shadow-sm transition hover:bg-[#0f1b2e]">Dispensar Aviso</button>
          </div>
        </div>
      )}
      {!runtimeContext.embedded ? (
        <section className={`${cardClass} px-6 py-4`}>
          <ScreenNameCopy
            screenId={screenId}
            className="justify-end"
            originText={ORIGIN_TEXT}
            auditText={auditText}
            sqlText="-- CENTRAL DE NAVEGAÇÃO: ESTA TELA AINDA NÃO CONSULTA DADOS PERSISTIDOS."
          />
        </section>
      ) : null}
    </div>
  );
}
