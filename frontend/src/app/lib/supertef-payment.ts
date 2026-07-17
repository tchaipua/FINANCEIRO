'use client';

import { requestJson } from '@/app/lib/api';
import type { FinanceRuntimeContext } from '@/app/lib/runtime-context';

export type SuperTefOperationalPayment = {
  id: string;
  status: string;
  paymentMessage?: string | null;
  providerPaymentUniqueId?: string | null;
  amount: number;
  transactionType: 'DEBIT' | 'CREDIT';
};

type AuthorizeSuperTefCardPaymentInput = {
  runtimeContext: FinanceRuntimeContext;
  paymentMethod: 'DEBIT_CARD' | 'CREDIT_CARD';
  amount: number;
  installmentCount?: number;
  purpose: 'SALE' | 'RECEIVABLE';
  businessReference: string;
  description: string;
  onStatus?: (message: string) => void;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function mutationContext(runtimeContext: FinanceRuntimeContext) {
  return {
    sourceSystem: runtimeContext.sourceSystem,
    sourceTenantId: runtimeContext.sourceTenantId,
    sourceBranchCode: runtimeContext.sourceBranchCode,
    userRole: runtimeContext.userRole || undefined,
    requestedBy:
      runtimeContext.cashierDisplayName ||
      runtimeContext.cashierUserId ||
      'OPERADOR FINANCEIRO',
  };
}

export async function authorizeSuperTefCardPayment({
  runtimeContext,
  paymentMethod,
  amount,
  installmentCount = 1,
  purpose,
  businessReference,
  description,
  onStatus,
}: AuthorizeSuperTefCardPaymentInput) {
  if (!runtimeContext.sourceSystem || !runtimeContext.sourceTenantId) {
    throw new Error('O contexto da empresa não está disponível para o SuperTEF.');
  }

  const transactionType =
    paymentMethod === 'DEBIT_CARD' ? ('DEBIT' as const) : ('CREDIT' as const);
  const operationId = `${purpose}-${crypto.randomUUID()}`.toUpperCase();
  const normalizedReference = String(businessReference || operationId)
    .trim()
    .toUpperCase()
    .slice(0, 100);

  onStatus?.(
    `Pagamento enviado ao EMULADOR 3120. Conclua o cartão de ${
      transactionType === 'DEBIT' ? 'débito' : 'crédito'
    } na janela do emulador.`,
  );

  let payment = await requestJson<SuperTefOperationalPayment>(
    '/supertef/payments',
    {
      method: 'POST',
      body: JSON.stringify({
        ...mutationContext(runtimeContext),
        operationId,
        purpose,
        businessReference: normalizedReference,
        transactionType,
        installmentCount:
          transactionType === 'DEBIT' ? 1 : Math.max(1, installmentCount),
        amount,
        orderId: normalizedReference,
        description: description.trim().toUpperCase().slice(0, 200),
      }),
      fallbackMessage: 'Não foi possível solicitar o cartão no SuperTEF.',
    },
  );

  const deadline = Date.now() + 120_000;
  while (!['PAID', 'REJECTED', 'ERROR'].includes(payment.status)) {
    if (Date.now() >= deadline) {
      await requestJson<SuperTefOperationalPayment>(
        `/supertef/payments/${encodeURIComponent(payment.id)}/reject`,
        {
          method: 'POST',
          body: JSON.stringify(mutationContext(runtimeContext)),
          fallbackMessage: 'Não foi possível liberar o emulador SuperTEF.',
        },
      ).catch(() => null);
      throw new Error(
        'O SuperTEF não concluiu o pagamento em 120 segundos. Verifique o emulador.',
      );
    }
    await wait(4_000);
    payment = await requestJson<SuperTefOperationalPayment>(
      `/supertef/payments/${encodeURIComponent(payment.id)}/refresh`,
      {
        method: 'POST',
        body: JSON.stringify(mutationContext(runtimeContext)),
        fallbackMessage: 'Não foi possível consultar o pagamento no SuperTEF.',
      },
    );
    onStatus?.(
      payment.status === 'PAID'
        ? 'Pagamento aprovado no SuperTEF.'
        : payment.paymentMessage || 'Aguardando o emulador SuperTEF.',
    );
  }

  if (payment.status !== 'PAID') {
    throw new Error(
      payment.paymentMessage ||
        'O pagamento foi rejeitado ou não concluído no SuperTEF.',
    );
  }

  return payment;
}
