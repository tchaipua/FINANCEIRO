import { requestJson } from '@/app/lib/api';
import type { FinanceRuntimeContext } from '@/app/lib/runtime-context';

const LOCAL_AGENT_URL = 'http://127.0.0.1:47821';

export type LocalPrinter = {
  name: string;
  isDefault: boolean;
};

export type FinancePrintJob = {
  id: string;
  autoPrint: boolean;
  status: string;
  renderedFormat: string;
  renderedContent: string;
  copies: number;
  printer?: {
    printerName: string;
    printerType: string;
    language: string;
    paperWidthMm: number;
    paperHeightMm?: number | null;
    columns: number;
    dpi: number;
    cutterEnabled: boolean;
    settings?: Record<string, unknown>;
  } | null;
};

type JobCreationResponse = {
  configured: boolean;
  autoPrint: boolean;
  job?: FinancePrintJob | null;
};

function printingScope(runtime: FinanceRuntimeContext) {
  return {
    sourceSystem: runtime.sourceSystem,
    sourceTenantId: runtime.sourceTenantId,
    sourceBranchCode: runtime.sourceBranchCode,
    userRole: runtime.userRole,
    requestedBy: runtime.cashierDisplayName || runtime.cashierUserId || 'USUÁRIO',
  };
}

async function getAgentSession() {
  const response = await fetch(`${LOCAL_AGENT_URL}/sessao-impressao`, {
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('O AGENTE LOCAL DE IMPRESSÃO NÃO ESTÁ DISPONÍVEL.');
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) throw new Error('O AGENTE LOCAL NÃO AUTORIZOU ESTA TELA.');
  return payload.token;
}

export async function getLocalPrinters(): Promise<LocalPrinter[]> {
  const response = await fetch(`${LOCAL_AGENT_URL}/impressoras`, { cache: 'no-store' });
  if (!response.ok) throw new Error('NÃO FOI POSSÍVEL LER AS IMPRESSORAS DESTE COMPUTADOR.');
  const payload = (await response.json()) as { printers?: LocalPrinter[] } | LocalPrinter[];
  return Array.isArray(payload) ? payload : payload.printers || [];
}

export async function sendJobToLocalAgent(job: FinancePrintJob) {
  if (!job.printer?.printerName) throw new Error('NENHUMA IMPRESSORA FOI VINCULADA AO EVENTO.');
  const token = await getAgentSession();
  const response = await fetch(`${LOCAL_AGENT_URL}/impressoes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(job),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'A IMPRESSORA LOCAL NÃO ACEITOU O DOCUMENTO.');
  }
  return payload;
}

export async function testLocalPrinter(job: FinancePrintJob) {
  return sendJobToLocalAgent(job);
}

export async function createAndDispatchPrintJob(
  endpoint: string,
  runtime: FinanceRuntimeContext,
  idempotencyKey?: string,
) {
  const scope = printingScope(runtime);
  const result = await requestJson<JobCreationResponse>(endpoint, {
    method: 'POST',
    body: JSON.stringify({ ...scope, idempotencyKey }),
    fallbackMessage: 'NÃO FOI POSSÍVEL GERAR O DOCUMENTO DE IMPRESSÃO.',
  });

  if (!result.configured || !result.autoPrint || !result.job) return result;

  try {
    await requestJson(`/printing/jobs/${result.job.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...scope,
        status: 'DISPATCHED',
        localPrinterName: result.job.printer?.printerName,
      }),
    });
    await sendJobToLocalAgent(result.job);
    await requestJson(`/printing/jobs/${result.job.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...scope,
        status: 'COMPLETED',
        localPrinterName: result.job.printer?.printerName,
      }),
    });
  } catch (error) {
    await requestJson(`/printing/jobs/${result.job.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...scope,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'FALHA LOCAL DE IMPRESSÃO',
        localPrinterName: result.job.printer?.printerName,
      }),
    }).catch(() => undefined);
    throw error;
  }

  return result;
}

export { LOCAL_AGENT_URL, printingScope };
