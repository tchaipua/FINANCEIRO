'use client';

type ScreenAuditModalProps = {
  screenId: string;
  systemName: string;
  originText?: string;
  auditText?: string;
  onClose: () => void;
};

const DEFAULT_AUDIT_TEXT = `--- LOGICA DA TELA ---
Esta tela nao possui acesso direto ao banco de dados mapeado neste ponto.

TABELAS PRINCIPAIS:
- Nenhuma tabela fisica consultada diretamente por esta tela.

RELACIONAMENTOS:
- Nao aplicavel.

METRICAS / CAMPOS EXIBIDOS:
- Conteudo visual, navegacao, mensagens ou dados recebidos de componentes/rotas externas.

FILTROS APLICADOS:
- Nao aplicavel.

ORDENACAO:
- Nao aplicavel.

OBSERVACAO:
- Quando esta tela passar a consultar dados diretamente, registrar aqui as tabelas fisicas, aliases, relacionamentos, metricas, filtros, ordenacao e SQL/base logica utilizada.`;

async function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined' || !document.body) return;

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function AuditContent({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => {
        const tableMatch = line.match(/^(-\s)([a-zA-Z0-9_]+)(\s\([A-Z0-9_]+\))?(\s-\s.*)$/);
        if (tableMatch) {
          return (
            <div key={`${line}-${index}`} className="text-[13px] leading-5">
              {tableMatch[1]}
              <strong className="text-[15px] font-black text-slate-950">{tableMatch[2]}</strong>
              {tableMatch[3] ? <strong className="font-black text-slate-950">{tableMatch[3]}</strong> : null}
              {tableMatch[4]}
            </div>
          );
        }

        return (
          <div key={`${line}-${index}`} className="leading-4">
            {line || '\u00A0'}
          </div>
        );
      })}
    </>
  );
}

export default function ScreenAuditModal({
  screenId,
  systemName,
  originText,
  auditText = DEFAULT_AUDIT_TEXT,
  onClose,
}: ScreenAuditModalProps) {
  const effectivePathText = originText
    ? originText
        .replace(/^Origem:\s*Sistema\s+[^-]+-\s*/i, '')
        .replace(/^Origem:\s*[^-]+-\s*/i, '')
        .replace(/^caminho\s+f[ií]sico:\s*/i, '')
        .trim()
    : 'caminho fisico nao mapeado para esta tela.';

  return (
    <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/40 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.45)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-800 to-blue-900 px-6 py-4 text-white">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-200">Auditoria SQL</div>
            <div className="mt-1 text-sm font-black">{screenId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
            aria-label="Fechar auditoria SQL"
          >
            ×
          </button>
        </div>

        <div className="bg-slate-100 px-6 py-6">
          <div className="mb-5">
            <div className="mb-4 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <img
                src="/logo-msinfor.jpg"
                alt="MSINFOR Sistemas"
                className="h-24 w-24 rounded-full border-4 border-white object-contain shadow-lg shadow-slate-950/15"
              />
              <div className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm">
                {`ORIGEM: SISTEMA ${String(systemName || '').toUpperCase().replace(/^SISTEMA\s+/i, '')}`}
              </div>
            </div>
            <div className="mx-auto mt-3 max-w-4xl rounded-full border border-red-100 bg-red-50 px-4 py-2 text-center text-xs font-black text-red-700">
              {effectivePathText}
            </div>
          </div>

          <div className="max-h-[55vh] overflow-auto rounded-2xl border border-slate-200 bg-white px-6 py-6 font-mono text-[12px] text-slate-950 shadow-inner">
            <AuditContent text={auditText} />
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => void copyText(auditText)}
              className="rounded-xl bg-emerald-700 px-10 py-3 text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800"
            >
              Copiar SQL
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-700 px-12 py-3 text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-slate-700/20 transition hover:bg-slate-800"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
