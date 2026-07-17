import assert from "node:assert/strict";
import { SuperTefService } from "../src/modules/supertef/application/supertef.service";
import {
  parseSuperTefPaymentResponse,
  parseSuperTefPosResponse,
  SuperTefClient,
} from "../src/modules/supertef/application/supertef.client";
import {
  decryptSecret,
  encryptSecret,
} from "../src/common/secret-crypto.utils";
import { getSuperTefCardApplicationError } from "../src/common/supertef-payment.utils";

process.env.FINANCEIRO_CERTIFICATE_SECRET =
  "SEGREDO-EXCLUSIVO-DO-TESTE-SUPERTEF";

async function run() {
  const parsed = parseSuperTefPosResponse({
    data: [
      {
        id: 43,
        status: 1,
        nome: "Caixa frente",
        marca: "Marca teste",
        modelo: "Modelo teste",
        banco: "Banco teste",
        chave: "NAO-DEVE-SER-MAPEADA",
        token: "NAO-DEVE-SER-MAPEADO",
        cliente_id: 10,
        date_ativacao: "2026-07-17T12:00:00.000Z",
      },
    ],
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].providerPosId, 43);
  assert.equal(parsed[0].name, "CAIXA FRENTE");
  assert.equal("token" in parsed[0], false);
  assert.equal("chave" in parsed[0], false);

  const parsedPayment = parseSuperTefPaymentResponse({
    payment_uniqueid: 179,
    payment_status: 4,
    payment_message: "Pago",
    payment_order: {
      pos_id: 43,
      transaction_type: 2,
      installment_type: 1,
      installment_count: 2,
      amount: "500.00",
      order_id: "pedido-1",
      description: "Pagamento teste",
      print_receipt: true,
    },
    payment_data: {
      pos_id: 43,
      brand: "Mastercard",
      nsu: "123456",
      authorization_code: "ABC123",
      acquirer_banco: "Banco teste",
      token: "NAO-DEVE-SER-MAPEADO",
    },
  });
  assert.equal(parsedPayment.providerPaymentUniqueId, "179");
  assert.equal(parsedPayment.providerPaymentStatus, 4);
  assert.equal(parsedPayment.paymentMessage, "PAGO");
  assert.equal(parsedPayment.paymentOrder.transactionType, 2);
  assert.equal(parsedPayment.paymentData.brand, "MASTERCARD");
  assert.equal("token" in parsedPayment.paymentData, false);

  const plainSecret = "TOKEN-SUPERTEF-TESTE";
  const encryptedSecret = encryptSecret(plainSecret);
  assert.notEqual(encryptedSecret, plainSecret);
  assert.equal(encryptedSecret.includes(plainSecret), false);
  assert.equal(decryptSecret(encryptedSecret), plainSecret);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      message: `Bearer ${plainSecret} CREDENCIAL INVÁLIDA`,
    }),
  })) as unknown as typeof fetch;
  try {
    await assert.rejects(
      () => new SuperTefClient().listPos(plainSecret, 30),
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes(plainSecret) &&
        error.message.includes("CREDENCIAL PROTEGIDA"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  let capturedPaymentUrl = "";
  let capturedPaymentBody: Record<string, unknown> = {};
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    capturedPaymentUrl = String(url);
    capturedPaymentBody = JSON.parse(String(init?.body || "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        payment_uniqueid: 180,
        payment_status: 1,
        payment_message: "Solicitado",
        payment_order: capturedPaymentBody,
        payment_data: { pos_id: 43 },
      }),
    } as Response;
  }) as typeof fetch;
  try {
    const requested = await new SuperTefClient().requestPayment(
      plainSecret,
      {
        clientKey: "CLIENTE-TESTE",
        providerPosId: 43,
        transactionType: 1,
        installmentCount: 1,
        installmentType: 1,
        amount: 1,
        orderId: "TESTE-DEBITO",
        description: "PAGAMENTO HOMOLOGACAO",
        printReceipt: false,
      },
      30,
    );
    assert.equal(capturedPaymentUrl.endsWith("/pagamentos"), true);
    assert.equal(capturedPaymentBody.cliente_chave, "CLIENTE-TESTE");
    assert.equal(capturedPaymentBody.pos_id, 43);
    assert.equal(capturedPaymentBody.transaction_type, "1");
    assert.equal(capturedPaymentBody.installment_count, 1);
    assert.equal(capturedPaymentBody.print_receipt, false);
    assert.equal(requested.providerPaymentStatus, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const capturedConfigurationScopes: Array<Record<string, unknown>> = [];
  const capturedTerminalScopes: Array<Record<string, unknown>> = [];
  const prismaMock = {
    company: {
      findUnique: async ({ where }: any) => {
        const tenant = where.sourceSystem_sourceTenantId.sourceTenantId;
        return {
          id: tenant === "TENANT_A" ? "COMPANY_A" : "COMPANY_B",
          canceledAt: null,
        };
      },
    },
    superTefConfiguration: {
      findFirst: async ({ where }: any) => {
        capturedConfigurationScopes.push(where);
        return {
          id: `CONFIG_${where.companyId}`,
          companyId: where.companyId,
          branchCode: where.branchCode,
          provider: "SUPERTEF",
          status: "ACTIVE",
          environment: "HOMOLOGATION",
          clientKey: "CLIENTE-TESTE",
          accessTokenEncrypted: encryptedSecret,
          tokenFingerprint: "1234567890ABCDEF",
          tokenHint: "TEST",
          printReceipt: true,
          operationTimeoutSeconds: 120,
          pollIntervalSeconds: 4,
          canceledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    },
    superTefTerminal: {
      findMany: async ({ where }: any) => {
        capturedTerminalScopes.push(where);
        return (where.id.in as string[]).map((id) => ({
          id,
          companyId: where.companyId,
          branchCode: where.branchCode,
        }));
      },
    },
  };

  const service = new SuperTefService(prismaMock as any, {} as any);
  assert.deepEqual((service as any).paymentState(4), {
    status: "PAID",
    final: true,
  });
  assert.deepEqual((service as any).paymentState(5), {
    status: "REJECTED",
    final: true,
  });
  assert.deepEqual((service as any).paymentState(1), {
    status: "PENDING",
    final: false,
  });
  const configurationA = await service.getConfiguration({
    sourceSystem: "ESCOLA",
    sourceTenantId: "TENANT_A",
    sourceBranchCode: 7,
    userRole: "ADMIN",
  });
  const configurationB = await service.getConfiguration({
    sourceSystem: "ESCOLA",
    sourceTenantId: "TENANT_B",
    sourceBranchCode: 8,
    userRole: "ADMIN",
  });

  assert.equal(configurationA?.companyId, "COMPANY_A");
  assert.equal(configurationB?.companyId, "COMPANY_B");
  assert.equal("accessTokenEncrypted" in configurationA!, false);
  assert.deepEqual(capturedConfigurationScopes[0], {
    companyId: "COMPANY_A",
    branchCode: 7,
    provider: "SUPERTEF",
    canceledAt: null,
  });
  assert.deepEqual(capturedConfigurationScopes[1], {
    companyId: "COMPANY_B",
    branchCode: 8,
    provider: "SUPERTEF",
    canceledAt: null,
  });

  await assert.rejects(
    () =>
      service.getConfiguration({
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT_A",
        sourceBranchCode: 7,
        userRole: "USER",
      }),
    /PERFIL ADMIN/,
  );

  const terminalIds = await (service as any).validateCheckoutTerminals(
    "COMPANY_A",
    7,
    ["POS_A", "POS_B"],
  );
  assert.deepEqual(terminalIds, ["POS_A", "POS_B"]);
  assert.equal(capturedTerminalScopes[0].companyId, "COMPANY_A");
  assert.equal(capturedTerminalScopes[0].branchCode, 7);

  await assert.rejects(
    () =>
      (service as any).validateCheckoutTerminals(
        "COMPANY_A",
        7,
        ["POS_A", "POS_A"],
      ),
    /MÁQUINAS POS DISTINTAS/,
  );

  const paidCard = {
    companyId: "COMPANY_A",
    branchCode: 7,
    status: "PAID",
    transactionType: "CREDIT",
    amount: 25,
    purpose: "SALE",
    appliedAt: null,
    appliedEntityType: null,
    appliedEntityId: null,
    canceledAt: null,
  };
  assert.equal(
    getSuperTefCardApplicationError(paidCard, {
      companyId: "COMPANY_A",
      branchCode: 7,
      paymentMethod: "CREDIT_CARD",
      amount: 25,
      requiredPurpose: "SALE",
    }),
    null,
  );
  assert.match(
    getSuperTefCardApplicationError(paidCard, {
      companyId: "COMPANY_B",
      branchCode: 7,
      paymentMethod: "CREDIT_CARD",
      amount: 25,
    }) || "",
    /EMPRESA E FILIAL/,
  );
  assert.match(
    getSuperTefCardApplicationError(
      { ...paidCard, appliedAt: new Date() },
      {
        companyId: "COMPANY_A",
        branchCode: 7,
        paymentMethod: "CREDIT_CARD",
        amount: 25,
      },
    ) || "",
    /JÁ FOI UTILIZADO/,
  );
  assert.match(
    getSuperTefCardApplicationError(paidCard, {
      companyId: "COMPANY_A",
      branchCode: 7,
      paymentMethod: "DEBIT_CARD",
      amount: 25,
    }) || "",
    /MODALIDADE/,
  );
  assert.match(
    getSuperTefCardApplicationError(paidCard, {
      companyId: "COMPANY_A",
      branchCode: 7,
      paymentMethod: "CREDIT_CARD",
      amount: 24,
    }) || "",
    /VALOR/,
  );

  console.log("SUPERTEF CORE TESTS: OK");
}

void run();
