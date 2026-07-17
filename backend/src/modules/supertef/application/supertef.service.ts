import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeText, parseJson, serializeJson } from "../../../common/finance-core.utils";
import { decryptSecret, encryptSecret } from "../../../common/secret-crypto.utils";
import {
  ChangeSuperTefTerminalStatusDto,
  CreateSuperTefPaymentDto,
  ListSuperTefAuditDto,
  ListSuperTefPaymentsDto,
  SaveSuperTefCheckoutDto,
  SaveSuperTefConfigurationDto,
  SuperTefContextDto,
  SuperTefMutationContextDto,
} from "./dto/supertef.dto";
import {
  SUPERTEF_API_BASE_URL,
  SuperTefPayment,
  SuperTefClient,
  SuperTefPos,
} from "./supertef.client";

const SUPERTEF_PROVIDER = "SUPERTEF";

@Injectable()
export class SuperTefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: SuperTefClient,
  ) {}

  private assertAdmin(userRole?: string | null) {
    if (normalizeText(userRole) !== "ADMIN") {
      throw new ForbiddenException(
        "A CONFIGURAÇÃO DO SUPERTEF EXIGE PERFIL ADMIN.",
      );
    }
  }

  private branchCode(value: unknown) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 1) {
      throw new BadRequestException("INFORME UMA FILIAL VÁLIDA.");
    }
    return normalized;
  }

  private requestedBy(value?: string | null) {
    return normalizeText(value) || "ADMIN_FINANCEIRO";
  }

  private normalizeCredential(value?: string | null) {
    return String(value || "").trim();
  }

  private tokenMetadata(accessToken: string) {
    return {
      fingerprint: createHash("sha256")
        .update(accessToken)
        .digest("hex")
        .slice(0, 16)
        .toUpperCase(),
      hint: accessToken.slice(-4).toUpperCase(),
    };
  }

  private async findCompany(sourceSystem?: string, sourceTenantId?: string) {
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);
    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "INFORME O SISTEMA E O TENANT DE ORIGEM.",
      );
    }

    const company = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
    });

    return company?.canceledAt ? null : company;
  }

  private async requireCompany(
    sourceSystem?: string,
    sourceTenantId?: string,
  ) {
    const company = await this.findCompany(sourceSystem, sourceTenantId);
    if (!company) {
      throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    }
    return company;
  }

  private async resolveCompany(payload: SaveSuperTefConfigurationDto) {
    const existing = await this.findCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    if (existing) {
      const companyName = normalizeText(payload.companyName);
      if (companyName && companyName !== existing.name) {
        return this.prisma.company.update({
          where: { id: existing.id },
          data: {
            name: companyName,
            updatedBy: this.requestedBy(payload.requestedBy),
          },
        });
      }
      return existing;
    }

    const sourceSystem = normalizeText(payload.sourceSystem)!;
    const sourceTenantId = normalizeText(payload.sourceTenantId)!;
    const actor = this.requestedBy(payload.requestedBy);
    return this.prisma.company.create({
      data: {
        sourceSystem,
        sourceTenantId,
        name:
          normalizeText(payload.companyName) ||
          `${sourceSystem} ${sourceTenantId}`,
        createdBy: actor,
        updatedBy: actor,
      },
    });
  }

  private async findConfiguration(companyId: string, branchCode: number) {
    return this.prisma.superTefConfiguration.findFirst({
      where: {
        companyId,
        branchCode,
        provider: SUPERTEF_PROVIDER,
        canceledAt: null,
      },
    });
  }

  private mapConfiguration(configuration: any) {
    if (!configuration) return null;
    return {
      id: configuration.id,
      companyId: configuration.companyId,
      branchCode: configuration.branchCode,
      provider: configuration.provider,
      active:
        configuration.status === "ACTIVE" && !configuration.canceledAt,
      status: configuration.status,
      environment: configuration.environment,
      clientKey: configuration.clientKey,
      tokenConfigured: Boolean(configuration.accessTokenEncrypted),
      tokenHint: configuration.tokenHint
        ? `FINAL ${configuration.tokenHint}`
        : null,
      tokenFingerprint: configuration.tokenFingerprint || null,
      printReceipt: Boolean(configuration.printReceipt),
      operationTimeoutSeconds: configuration.operationTimeoutSeconds,
      pollIntervalSeconds: configuration.pollIntervalSeconds,
      apiBaseUrl: SUPERTEF_API_BASE_URL,
      lastConnectionTestAt:
        configuration.lastConnectionTestAt?.toISOString?.() || null,
      lastConnectionStatus: configuration.lastConnectionStatus || null,
      lastConnectionMessage: configuration.lastConnectionMessage || null,
      lastPosSyncAt: configuration.lastPosSyncAt?.toISOString?.() || null,
      createdAt: configuration.createdAt?.toISOString?.() || null,
      createdBy: configuration.createdBy || null,
      updatedAt: configuration.updatedAt?.toISOString?.() || null,
      updatedBy: configuration.updatedBy || null,
    };
  }

  private mapTerminal(terminal: any) {
    return {
      id: terminal.id,
      configurationId: terminal.configurationId,
      companyId: terminal.companyId,
      branchCode: terminal.branchCode,
      providerPosId: terminal.providerPosId,
      operationalStatus: terminal.operationalStatus,
      providerStatus: terminal.providerStatus,
      name: terminal.name,
      brand: terminal.brand || null,
      model: terminal.model || null,
      bank: terminal.bank || null,
      providerClientId: terminal.providerClientId || null,
      providerCreatedAt: terminal.providerCreatedAt?.toISOString?.() || null,
      providerUpdatedAt: terminal.providerUpdatedAt?.toISOString?.() || null,
      activatedAt: terminal.activatedAt?.toISOString?.() || null,
      lastSeenAt: terminal.lastSeenAt?.toISOString?.() || null,
      lastSyncedAt: terminal.lastSyncedAt?.toISOString?.() || null,
      routeCount: terminal._count?.checkoutRoutes || 0,
      createdAt: terminal.createdAt?.toISOString?.() || null,
      updatedAt: terminal.updatedAt?.toISOString?.() || null,
    };
  }

  private mapCheckout(checkout: any) {
    const routes = Array.isArray(checkout?.routes)
      ? checkout.routes
          .filter(
            (route: any) =>
              route.status === "ACTIVE" && !route.canceledAt,
          )
          .sort((left: any, right: any) => left.priority - right.priority)
      : [];

    return {
      id: checkout.id,
      companyId: checkout.companyId,
      branchCode: checkout.branchCode,
      code: checkout.code,
      name: checkout.name,
      status: checkout.status,
      routes: routes.map((route: any) => ({
        id: route.id,
        priority: route.priority,
        terminalId: route.terminalId,
        terminal: route.terminal
          ? this.mapTerminal(route.terminal)
          : null,
      })),
      createdAt: checkout.createdAt?.toISOString?.() || null,
      createdBy: checkout.createdBy || null,
      updatedAt: checkout.updatedAt?.toISOString?.() || null,
      updatedBy: checkout.updatedBy || null,
    };
  }

  private paymentState(providerStatus: number) {
    if (providerStatus === 4) return { status: "PAID", final: true };
    if (providerStatus === 5) return { status: "REJECTED", final: true };
    return { status: "PENDING", final: false };
  }

  private mapPayment(payment: any) {
    if (!payment) return null;
    return {
      id: payment.id,
      companyId: payment.companyId,
      branchCode: payment.branchCode,
      terminalId: payment.terminalId,
      terminalName: payment.terminal?.name || null,
      providerPosId: payment.terminal?.providerPosId || null,
      checkoutId: payment.checkoutId || null,
      checkoutCode: payment.checkout?.code || null,
      operationId: payment.operationId,
      providerPaymentUniqueId: payment.providerPaymentUniqueId || null,
      providerPaymentStatus: payment.providerPaymentStatus ?? null,
      status: payment.status,
      transactionType: payment.transactionType,
      installmentType: payment.installmentType,
      installmentCount: payment.installmentCount,
      amount: Number(payment.amount),
      orderId: payment.orderId,
      description: payment.description,
      purpose: payment.purpose || "MANUAL",
      businessReference: payment.businessReference || null,
      printReceipt: Boolean(payment.printReceipt),
      paymentMessage: payment.paymentMessage || null,
      paymentOrder: parseJson(payment.paymentOrderJson, null),
      paymentData: parseJson(payment.paymentDataJson, null),
      requestedAt: payment.requestedAt?.toISOString?.() || null,
      lastPolledAt: payment.lastPolledAt?.toISOString?.() || null,
      completedAt: payment.completedAt?.toISOString?.() || null,
      appliedEntityType: payment.appliedEntityType || null,
      appliedEntityId: payment.appliedEntityId || null,
      appliedAt: payment.appliedAt?.toISOString?.() || null,
      createdAt: payment.createdAt?.toISOString?.() || null,
      createdBy: payment.createdBy || null,
      updatedAt: payment.updatedAt?.toISOString?.() || null,
      updatedBy: payment.updatedBy || null,
    };
  }

  private paymentInclude() {
    return {
      terminal: true,
      checkout: true,
    } as const;
  }

  private providerPaymentData(payment: SuperTefPayment, actor: string) {
    const state = this.paymentState(payment.providerPaymentStatus);
    const now = new Date();
    return {
      providerPaymentUniqueId: payment.providerPaymentUniqueId,
      providerPaymentStatus: payment.providerPaymentStatus,
      status: state.status,
      paymentMessage: payment.paymentMessage,
      paymentOrderJson: serializeJson(payment.paymentOrder),
      paymentDataJson: serializeJson(payment.paymentData),
      lastPolledAt: now,
      completedAt: state.final ? now : null,
      terminalLockKey: state.final ? null : undefined,
      updatedBy: actor,
    };
  }

  private async selectPaymentTerminal(
    companyId: string,
    branchCode: number,
    terminalId?: string,
    checkoutId?: string,
  ) {
    const normalizedTerminalId = String(terminalId || "").trim();
    const normalizedCheckoutId = String(checkoutId || "").trim();
    if (!normalizedTerminalId && !normalizedCheckoutId) {
      throw new BadRequestException(
        "SELECIONE UMA MÁQUINA POS OU UM CHECKOUT.",
      );
    }

    if (normalizedTerminalId) {
      const terminal = await this.prisma.superTefTerminal.findFirst({
        where: {
          id: normalizedTerminalId,
          companyId,
          branchCode,
          operationalStatus: "ACTIVE",
          canceledAt: null,
        },
      });
      if (!terminal) {
        throw new BadRequestException(
          "A MÁQUINA POS NÃO ESTÁ DISPONÍVEL NESTA EMPRESA E FILIAL.",
        );
      }
      const locked = await this.prisma.superTefPayment.findUnique({
        where: { terminalLockKey: terminal.id },
      });
      if (locked) {
        throw new ConflictException(
          "A MÁQUINA POS JÁ POSSUI UM PAGAMENTO EM ANDAMENTO.",
        );
      }
      return { terminal, checkout: null };
    }

    const checkout = await this.prisma.superTefCheckout.findFirst({
      where: {
        id: normalizedCheckoutId,
        companyId,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
      },
      include: this.checkoutInclude(),
    });
    if (!checkout) throw new NotFoundException("CHECKOUT NÃO ENCONTRADO.");

    for (const route of checkout.routes) {
      const terminal = route.terminal;
      if (
        !terminal ||
        terminal.operationalStatus !== "ACTIVE" ||
        terminal.canceledAt
      ) {
        continue;
      }
      const locked = await this.prisma.superTefPayment.findUnique({
        where: { terminalLockKey: terminal.id },
      });
      if (!locked) return { terminal, checkout };
    }
    throw new ConflictException(
      "NENHUMA MÁQUINA POS DO CHECKOUT ESTÁ DISPONÍVEL.",
    );
  }

  private async selectOperationalEmulator(
    companyId: string,
    branchCode: number,
  ) {
    const terminal = await this.prisma.superTefTerminal.findFirst({
      where: {
        companyId,
        branchCode,
        operationalStatus: "ACTIVE",
        canceledAt: null,
        OR: [
          { name: { contains: "EMULADOR" } },
          { brand: { contains: "EMULADOR" } },
          { providerPosId: 3120 },
        ],
      },
      orderBy: [{ providerPosId: "asc" }],
    });
    if (!terminal) {
      throw new BadRequestException(
        "SINCRONIZE E ATIVE A POS EMULADOR 3120 ANTES DE RECEBER CARTÃO.",
      );
    }
    const locked = await this.prisma.superTefPayment.findUnique({
      where: { terminalLockKey: terminal.id },
    });
    if (locked) {
      throw new ConflictException(
        "O EMULADOR JÁ POSSUI UM PAGAMENTO EM ANDAMENTO.",
      );
    }
    return { terminal, checkout: null };
  }

  private async audit(
    tx: any,
    input: {
      companyId: string;
      branchCode: number;
      entityType: string;
      entityId?: string | null;
      action: string;
      summary: string;
      before?: unknown;
      after?: unknown;
      metadata?: unknown;
      performedBy: string;
    },
  ) {
    return tx.superTefAuditEvent.create({
      data: {
        companyId: input.companyId,
        branchCode: input.branchCode,
        entityType: normalizeText(input.entityType)!,
        entityId: input.entityId || null,
        action: normalizeText(input.action)!,
        summary: normalizeText(input.summary)!,
        beforeJson: serializeJson(input.before),
        afterJson: serializeJson(input.after),
        metadataJson: serializeJson(input.metadata),
        performedBy: input.performedBy,
        createdBy: input.performedBy,
      },
    });
  }

  private async requireConfiguration(
    payload: SuperTefContextDto,
    requireAdmin = true,
  ) {
    if (requireAdmin) this.assertAdmin(payload.userRole);
    const company = await this.requireCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const configuration = await this.findConfiguration(company.id, branchCode);
    if (!configuration) {
      throw new BadRequestException(
        "SALVE A CONFIGURAÇÃO DO SUPERTEF ANTES DE CONTINUAR.",
      );
    }
    return { company, branchCode, configuration };
  }

  async getConfiguration(query: SuperTefContextDto) {
    this.assertAdmin(query.userRole);
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    if (!company) return null;
    const branchCode = this.branchCode(query.sourceBranchCode);
    const configuration = await this.findConfiguration(company.id, branchCode);
    return this.mapConfiguration(configuration);
  }

  async saveConfiguration(payload: SaveSuperTefConfigurationDto) {
    this.assertAdmin(payload.userRole);
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const actor = this.requestedBy(payload.requestedBy);
    const knownCompany = await this.findCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const existing = knownCompany
      ? await this.findConfiguration(knownCompany.id, branchCode)
      : null;
    const clientKey = this.normalizeCredential(payload.clientKey);
    const accessToken = this.normalizeCredential(payload.accessToken);

    if (!clientKey) {
      throw new BadRequestException(
        "INFORME A CHAVE DO CLIENTE SUPERTEF.",
      );
    }
    if (!accessToken && !existing?.accessTokenEncrypted) {
      throw new BadRequestException(
        "INFORME O TOKEN DA SOFTWARE HOUSE NO PRIMEIRO CADASTRO.",
      );
    }

    const company = await this.resolveCompany(payload);
    const token = accessToken ? this.tokenMetadata(accessToken) : null;
    const before = this.mapConfiguration(existing);
    const status = payload.active ? "ACTIVE" : "INACTIVE";
    const environment = normalizeText(payload.environment);
    if (!["HOMOLOGATION", "PRODUCTION"].includes(environment || "")) {
      throw new BadRequestException("AMBIENTE SUPERTEF INVÁLIDO.");
    }

    const saved = await this.prisma.$transaction(async (tx: any) => {
      const configuration = await tx.superTefConfiguration.upsert({
        where: {
          companyId_branchCode_provider: {
            companyId: company.id,
            branchCode,
            provider: SUPERTEF_PROVIDER,
          },
        },
        create: {
          companyId: company.id,
          branchCode,
          provider: SUPERTEF_PROVIDER,
          status,
          environment,
          clientKey,
          accessTokenEncrypted:
            accessToken && token
              ? encryptSecret(accessToken)
              : existing!.accessTokenEncrypted,
          tokenFingerprint: token?.fingerprint ?? existing!.tokenFingerprint,
          tokenHint: token?.hint ?? existing!.tokenHint,
          printReceipt: payload.printReceipt,
          operationTimeoutSeconds: payload.operationTimeoutSeconds,
          pollIntervalSeconds: payload.pollIntervalSeconds,
          createdBy: actor,
          updatedBy: actor,
        },
        update: {
          status,
          environment,
          clientKey,
          ...(accessToken
            ? {
                accessTokenEncrypted: encryptSecret(accessToken),
                tokenFingerprint: token!.fingerprint,
                tokenHint: token!.hint,
              }
            : {}),
          printReceipt: payload.printReceipt,
          operationTimeoutSeconds: payload.operationTimeoutSeconds,
          pollIntervalSeconds: payload.pollIntervalSeconds,
          canceledAt: null,
          canceledBy: null,
          updatedBy: actor,
        },
      });

      const after = this.mapConfiguration(configuration);
      await this.audit(tx, {
        companyId: company.id,
        branchCode,
        entityType: "CONFIGURATION",
        entityId: configuration.id,
        action: existing ? "UPDATE" : "CREATE",
        summary: existing
          ? "CONFIGURAÇÃO SUPERTEF ATUALIZADA"
          : "CONFIGURAÇÃO SUPERTEF CRIADA",
        before,
        after,
        metadata: {
          tokenReplaced: Boolean(accessToken),
          tokenFingerprint: configuration.tokenFingerprint,
        },
        performedBy: actor,
      });
      return configuration;
    });

    return this.mapConfiguration(saved);
  }

  async testConnection(payload: SuperTefMutationContextDto) {
    const { company, branchCode, configuration } =
      await this.requireConfiguration(payload);
    const actor = this.requestedBy(payload.requestedBy);
    const testedAt = new Date();

    try {
      const terminals = await this.client.listPos(
        decryptSecret(configuration.accessTokenEncrypted),
        configuration.operationTimeoutSeconds,
      );
      const message = `CONEXÃO REALIZADA. ${terminals.length} POS LOCALIZADA(S).`;

      await this.prisma.$transaction(async (tx: any) => {
        await tx.superTefConfiguration.update({
          where: { id: configuration.id },
          data: {
            lastConnectionTestAt: testedAt,
            lastConnectionStatus: "SUCCESS",
            lastConnectionMessage: message,
            updatedBy: actor,
          },
        });
        await this.audit(tx, {
          companyId: company.id,
          branchCode,
          entityType: "CONNECTION",
          entityId: configuration.id,
          action: "TEST_SUCCESS",
          summary: message,
          metadata: { terminalCount: terminals.length },
          performedBy: actor,
        });
      });

      return {
        success: true,
        terminalCount: terminals.length,
        testedAt: testedAt.toISOString(),
        message,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? String(error.message || "").slice(0, 500)
          : "FALHA NA CONEXÃO COM O SUPERTEF.";

      await this.prisma.$transaction(async (tx: any) => {
        await tx.superTefConfiguration.update({
          where: { id: configuration.id },
          data: {
            lastConnectionTestAt: testedAt,
            lastConnectionStatus: "ERROR",
            lastConnectionMessage: message,
            updatedBy: actor,
          },
        });
        await this.audit(tx, {
          companyId: company.id,
          branchCode,
          entityType: "CONNECTION",
          entityId: configuration.id,
          action: "TEST_ERROR",
          summary: "FALHA NO TESTE DE CONEXÃO COM O SUPERTEF",
          metadata: { message },
          performedBy: actor,
        });
      });

      throw error instanceof BadGatewayException
        ? error
        : new BadGatewayException(message);
    }
  }

  async listTerminals(query: SuperTefContextDto) {
    this.assertAdmin(query.userRole);
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    if (!company) return [];
    const branchCode = this.branchCode(query.sourceBranchCode);
    const terminals = await this.prisma.superTefTerminal.findMany({
      where: {
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
      include: {
        _count: {
          select: {
            checkoutRoutes: {
              where: { status: "ACTIVE", canceledAt: null },
            },
          },
        },
      },
      orderBy: [{ operationalStatus: "asc" }, { name: "asc" }],
    });
    return terminals.map((terminal) => this.mapTerminal(terminal));
  }

  private terminalData(pos: SuperTefPos, actor: string, syncedAt: Date) {
    return {
      providerStatus: pos.providerStatus,
      name: pos.name,
      brand: pos.brand,
      model: pos.model,
      bank: pos.bank,
      providerClientId: pos.providerClientId,
      providerCreatedAt: pos.providerCreatedAt,
      providerUpdatedAt: pos.providerUpdatedAt,
      activatedAt: pos.activatedAt,
      lastSeenAt: syncedAt,
      lastSyncedAt: syncedAt,
      canceledAt: null,
      canceledBy: null,
      updatedBy: actor,
    };
  }

  async syncTerminals(payload: SuperTefMutationContextDto) {
    const { company, branchCode, configuration } =
      await this.requireConfiguration(payload);
    if (configuration.status !== "ACTIVE") {
      throw new BadRequestException(
        "ATIVE A INTEGRAÇÃO SUPERTEF ANTES DE SINCRONIZAR AS POS.",
      );
    }

    const actor = this.requestedBy(payload.requestedBy);
    const syncedAt = new Date();
    const positions = await this.client.listPos(
      decryptSecret(configuration.accessTokenEncrypted),
      configuration.operationTimeoutSeconds,
    );

    await this.prisma.$transaction(async (tx: any) => {
      for (const position of positions) {
        await tx.superTefTerminal.upsert({
          where: {
            configurationId_providerPosId: {
              configurationId: configuration.id,
              providerPosId: position.providerPosId,
            },
          },
          create: {
            configurationId: configuration.id,
            companyId: company.id,
            branchCode,
            providerPosId: position.providerPosId,
            operationalStatus: "ACTIVE",
            ...this.terminalData(position, actor, syncedAt),
            createdBy: actor,
          },
          update: this.terminalData(position, actor, syncedAt),
        });
      }

      await tx.superTefConfiguration.update({
        where: { id: configuration.id },
        data: {
          lastPosSyncAt: syncedAt,
          lastConnectionTestAt: syncedAt,
          lastConnectionStatus: "SUCCESS",
          lastConnectionMessage: `${positions.length} POS SINCRONIZADA(S).`,
          updatedBy: actor,
        },
      });
      await this.audit(tx, {
        companyId: company.id,
        branchCode,
        entityType: "TERMINAL",
        entityId: configuration.id,
        action: "SYNC",
        summary: `${positions.length} POS SUPERTEF SINCRONIZADA(S)`,
        metadata: {
          terminalCount: positions.length,
          providerPosIds: positions.map((position) => position.providerPosId),
        },
        performedBy: actor,
      });
    });

    return {
      success: true,
      terminalCount: positions.length,
      syncedAt: syncedAt.toISOString(),
      terminals: await this.listTerminals(payload),
      message: `${positions.length} POS SINCRONIZADA(S) COM SUCESSO.`,
    };
  }

  async changeTerminalStatus(
    terminalId: string,
    payload: ChangeSuperTefTerminalStatusDto,
  ) {
    this.assertAdmin(payload.userRole);
    const company = await this.requireCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const actor = this.requestedBy(payload.requestedBy);
    const terminal = await this.prisma.superTefTerminal.findFirst({
      where: {
        id: String(terminalId || "").trim(),
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
    });
    if (!terminal) throw new NotFoundException("MÁQUINA POS NÃO ENCONTRADA.");

    const before = this.mapTerminal(terminal);
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const saved = await tx.superTefTerminal.update({
        where: { id: terminal.id },
        data: {
          operationalStatus: normalizeText(payload.operationalStatus),
          updatedBy: actor,
        },
      });
      await this.audit(tx, {
        companyId: company.id,
        branchCode,
        entityType: "TERMINAL",
        entityId: terminal.id,
        action: "STATUS_CHANGE",
        summary: `SITUAÇÃO DA POS ${terminal.name} ALTERADA`,
        before,
        after: this.mapTerminal(saved),
        performedBy: actor,
      });
      return saved;
    });
    return this.mapTerminal(updated);
  }

  private checkoutInclude() {
    return {
      routes: {
        where: { status: "ACTIVE", canceledAt: null },
        include: { terminal: true },
        orderBy: { priority: "asc" },
      },
    } as const;
  }

  async listCheckouts(query: SuperTefContextDto) {
    this.assertAdmin(query.userRole);
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    if (!company) return [];
    const branchCode = this.branchCode(query.sourceBranchCode);
    const checkouts = await this.prisma.superTefCheckout.findMany({
      where: {
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
      },
      include: this.checkoutInclude(),
      orderBy: [{ code: "asc" }],
    });
    return checkouts.map((checkout) => this.mapCheckout(checkout));
  }

  private async validateCheckoutTerminals(
    companyId: string,
    branchCode: number,
    terminalIds: string[],
  ) {
    const normalizedIds = terminalIds
      .map((terminalId) => String(terminalId || "").trim())
      .filter(Boolean);
    if (!normalizedIds.length || new Set(normalizedIds).size !== normalizedIds.length) {
      throw new BadRequestException(
        "INFORME MÁQUINAS POS DISTINTAS NA ORDEM DE PRIORIDADE.",
      );
    }

    const terminals = await this.prisma.superTefTerminal.findMany({
      where: {
        id: { in: normalizedIds },
        companyId,
        branchCode,
        canceledAt: null,
      },
    });
    if (terminals.length !== normalizedIds.length) {
      throw new BadRequestException(
        "UMA OU MAIS MÁQUINAS POS NÃO PERTENCEM À EMPRESA E FILIAL ATUAIS.",
      );
    }
    return normalizedIds;
  }

  private async saveCheckout(
    company: any,
    branchCode: number,
    payload: SaveSuperTefCheckoutDto,
    existing?: any,
  ) {
    const actor = this.requestedBy(payload.requestedBy);
    const terminalIds = await this.validateCheckoutTerminals(
      company.id,
      branchCode,
      payload.terminalIds,
    );
    const code = normalizeText(payload.code) || "";
    const name = normalizeText(payload.name);
    if (!code || !name) {
      throw new BadRequestException("INFORME O CÓDIGO E O NOME DO CHECKOUT.");
    }

    const before = existing ? this.mapCheckout(existing) : null;
    return this.prisma.$transaction(async (tx: any) => {
      const checkout = existing
        ? await tx.superTefCheckout.update({
            where: { id: existing.id },
            data: {
              code,
              name,
              status: "ACTIVE",
              canceledAt: null,
              canceledBy: null,
              updatedBy: actor,
            },
          })
        : await tx.superTefCheckout.create({
            data: {
              companyId: company.id,
              branchCode,
              code,
              name,
              status: "ACTIVE",
              createdBy: actor,
              updatedBy: actor,
            },
          });

      await tx.superTefCheckoutRoute.updateMany({
        where: {
          checkoutId: checkout.id,
          terminalId: { notIn: terminalIds },
          status: "ACTIVE",
        },
        data: {
          status: "INACTIVE",
          canceledAt: new Date(),
          canceledBy: actor,
          updatedBy: actor,
        },
      });

      for (const [index, terminalId] of terminalIds.entries()) {
        await tx.superTefCheckoutRoute.upsert({
          where: {
            checkoutId_terminalId: {
              checkoutId: checkout.id,
              terminalId,
            },
          },
          create: {
            companyId: company.id,
            branchCode,
            checkoutId: checkout.id,
            terminalId,
            priority: index + 1,
            status: "ACTIVE",
            createdBy: actor,
            updatedBy: actor,
          },
          update: {
            priority: index + 1,
            status: "ACTIVE",
            canceledAt: null,
            canceledBy: null,
            updatedBy: actor,
          },
        });
      }

      const saved = await tx.superTefCheckout.findFirst({
        where: {
          id: checkout.id,
          companyId: company.id,
          branchCode,
        },
        include: this.checkoutInclude(),
      });
      const after = this.mapCheckout(saved);
      await this.audit(tx, {
        companyId: company.id,
        branchCode,
        entityType: "CHECKOUT",
        entityId: checkout.id,
        action: existing ? "UPDATE" : "CREATE",
        summary: existing
          ? `ROTEAMENTO DO CHECKOUT ${code} ATUALIZADO`
          : `CHECKOUT ${code} CADASTRADO`,
        before,
        after,
        metadata: { terminalIds },
        performedBy: actor,
      });
      return after;
    });
  }

  async createCheckout(payload: SaveSuperTefCheckoutDto) {
    this.assertAdmin(payload.userRole);
    const company = await this.requireCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const code = normalizeText(payload.code) || "";
    const existing = await this.prisma.superTefCheckout.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        code,
      },
      include: this.checkoutInclude(),
    });
    if (existing && existing.status === "ACTIVE" && !existing.canceledAt) {
      throw new ConflictException(
        "JÁ EXISTE UM CHECKOUT ATIVO COM ESTE CÓDIGO.",
      );
    }
    return this.saveCheckout(
      company,
      branchCode,
      payload,
      existing || undefined,
    );
  }

  async updateCheckout(
    checkoutId: string,
    payload: SaveSuperTefCheckoutDto,
  ) {
    this.assertAdmin(payload.userRole);
    const company = await this.requireCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const existing = await this.prisma.superTefCheckout.findFirst({
      where: {
        id: String(checkoutId || "").trim(),
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
      },
      include: this.checkoutInclude(),
    });
    if (!existing) throw new NotFoundException("CHECKOUT NÃO ENCONTRADO.");

    const duplicatedCode = await this.prisma.superTefCheckout.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        code: normalizeText(payload.code) || "",
        id: { not: existing.id },
        status: "ACTIVE",
        canceledAt: null,
      },
    });
    if (duplicatedCode) {
      throw new ConflictException(
        "JÁ EXISTE OUTRO CHECKOUT ATIVO COM ESTE CÓDIGO.",
      );
    }
    return this.saveCheckout(company, branchCode, payload, existing);
  }

  async inactivateCheckout(
    checkoutId: string,
    payload: SuperTefMutationContextDto,
  ) {
    this.assertAdmin(payload.userRole);
    const company = await this.requireCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const actor = this.requestedBy(payload.requestedBy);
    const existing = await this.prisma.superTefCheckout.findFirst({
      where: {
        id: String(checkoutId || "").trim(),
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
      },
      include: this.checkoutInclude(),
    });
    if (!existing) throw new NotFoundException("CHECKOUT NÃO ENCONTRADO.");
    const before = this.mapCheckout(existing);
    const canceledAt = new Date();

    await this.prisma.$transaction(async (tx: any) => {
      await tx.superTefCheckout.update({
        where: { id: existing.id },
        data: {
          status: "INACTIVE",
          canceledAt,
          canceledBy: actor,
          updatedBy: actor,
        },
      });
      await tx.superTefCheckoutRoute.updateMany({
        where: { checkoutId: existing.id, status: "ACTIVE" },
        data: {
          status: "INACTIVE",
          canceledAt,
          canceledBy: actor,
          updatedBy: actor,
        },
      });
      await this.audit(tx, {
        companyId: company.id,
        branchCode,
        entityType: "CHECKOUT",
        entityId: existing.id,
        action: "INACTIVATE",
        summary: `CHECKOUT ${existing.code} INATIVADO`,
        before,
        after: {
          ...before,
          status: "INACTIVE",
          canceledAt: canceledAt.toISOString(),
        },
        performedBy: actor,
      });
    });

    return { success: true, message: "CHECKOUT INATIVADO COM SUCESSO." };
  }

  async listPayments(query: ListSuperTefPaymentsDto) {
    this.assertAdmin(query.userRole);
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    if (!company) return [];
    const branchCode = this.branchCode(query.sourceBranchCode);
    const payments = await this.prisma.superTefPayment.findMany({
      where: {
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
      include: this.paymentInclude(),
      orderBy: [{ requestedAt: "desc" }, { createdAt: "desc" }],
      take: Math.max(1, Math.min(100, Number(query.take || 30))),
    });
    return payments.map((payment) => this.mapPayment(payment));
  }

  async createPayment(payload: CreateSuperTefPaymentDto) {
    const purpose = normalizeText(payload.purpose) || "MANUAL";
    const { company, branchCode, configuration } =
      await this.requireConfiguration(payload, purpose === "MANUAL");
    if (
      configuration.status !== "ACTIVE" ||
      configuration.environment !== "HOMOLOGATION"
    ) {
      throw new BadRequestException(
        "ATIVE A CONFIGURAÇÃO NO AMBIENTE DE HOMOLOGAÇÃO ANTES DE EMITIR O PAGAMENTO.",
      );
    }

    const actor = this.requestedBy(payload.requestedBy);
    const operationId = normalizeText(payload.operationId);
    const orderId = normalizeText(payload.orderId);
    const description = normalizeText(payload.description);
    const businessReference = normalizeText(payload.businessReference);
    const transactionType = normalizeText(payload.transactionType);
    const amount = Math.round(Number(payload.amount) * 100) / 100;
    const installmentCount =
      transactionType === "DEBIT" ? 1 : Number(payload.installmentCount);
    if (!operationId || !orderId || !description || amount <= 0) {
      throw new BadRequestException(
        "INFORME IDENTIFICADOR, PEDIDO, DESCRIÇÃO E VALOR VÁLIDOS.",
      );
    }

    const existing = await this.prisma.superTefPayment.findUnique({
      where: {
        companyId_branchCode_operationId: {
          companyId: company.id,
          branchCode,
          operationId,
        },
      },
      include: this.paymentInclude(),
    });
    if (existing) return this.mapPayment(existing);

    const { terminal, checkout } =
      purpose === "MANUAL"
        ? await this.selectPaymentTerminal(
            company.id,
            branchCode,
            payload.terminalId,
            payload.checkoutId,
          )
        : await this.selectOperationalEmulator(company.id, branchCode);

    let localPayment: any;
    try {
      localPayment = await this.prisma.$transaction(async (tx: any) => {
        const created = await tx.superTefPayment.create({
          data: {
            configurationId: configuration.id,
            companyId: company.id,
            branchCode,
            terminalId: terminal.id,
            checkoutId: checkout?.id || null,
            operationId,
            status: "PENDING_SEND",
            transactionType,
            installmentType: 1,
            installmentCount,
            amount,
            orderId,
            description,
            purpose,
            businessReference,
            printReceipt: Boolean(configuration.printReceipt),
            paymentMessage: "PREPARANDO ENVIO AO SUPERTEF",
            terminalLockKey: terminal.id,
            createdBy: actor,
            updatedBy: actor,
          },
        });
        await this.audit(tx, {
          companyId: company.id,
          branchCode,
          entityType: "PAYMENT",
          entityId: created.id,
          action: "REQUEST_CREATED",
          summary: `PAGAMENTO ${transactionType} PREPARADO PARA A POS ${terminal.name}`,
          after: {
            operationId,
            terminalId: terminal.id,
            providerPosId: terminal.providerPosId,
            checkoutId: checkout?.id || null,
            transactionType,
            installmentCount,
            amount,
            orderId,
            purpose,
            businessReference,
          },
          performedBy: actor,
        });
        return created;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        throw new ConflictException(
          "A MÁQUINA POS JÁ POSSUI UM PAGAMENTO EM ANDAMENTO.",
        );
      }
      throw error;
    }

    try {
      const providerPayment = await this.client.requestPayment(
        decryptSecret(configuration.accessTokenEncrypted),
        {
          clientKey: configuration.clientKey,
          providerPosId: terminal.providerPosId,
          transactionType: transactionType === "DEBIT" ? 1 : 2,
          installmentCount,
          installmentType: 1,
          amount,
          orderId,
          description,
          printReceipt: Boolean(configuration.printReceipt),
        },
        configuration.operationTimeoutSeconds,
      );
      const saved = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.superTefPayment.update({
          where: { id: localPayment.id },
          data: this.providerPaymentData(providerPayment, actor),
          include: this.paymentInclude(),
        });
        await this.audit(tx, {
          companyId: company.id,
          branchCode,
          entityType: "PAYMENT",
          entityId: updated.id,
          action: "REQUEST_SENT",
          summary: `PAGAMENTO ENVIADO AO SUPERTEF: ${providerPayment.paymentMessage}`,
          after: this.mapPayment(updated),
          metadata: {
            providerPaymentUniqueId:
              providerPayment.providerPaymentUniqueId,
            providerPaymentStatus: providerPayment.providerPaymentStatus,
          },
          performedBy: actor,
        });
        return updated;
      });
      return this.mapPayment(saved);
    } catch (error) {
      const message =
        error instanceof Error
          ? String(error.message || "").slice(0, 500)
          : "FALHA AO SOLICITAR PAGAMENTO NO SUPERTEF.";
      await this.prisma.$transaction(async (tx: any) => {
        await tx.superTefPayment.update({
          where: { id: localPayment.id },
          data: {
            status: "ERROR",
            paymentMessage: message,
            terminalLockKey: null,
            completedAt: new Date(),
            updatedBy: actor,
          },
        });
        await this.audit(tx, {
          companyId: company.id,
          branchCode,
          entityType: "PAYMENT",
          entityId: localPayment.id,
          action: "REQUEST_ERROR",
          summary: "FALHA AO SOLICITAR PAGAMENTO NO SUPERTEF",
          metadata: { message },
          performedBy: actor,
        });
      });
      throw error instanceof BadGatewayException
        ? error
        : new BadGatewayException(message);
    }
  }

  async refreshPayment(
    paymentId: string,
    payload: SuperTefMutationContextDto,
  ) {
    const { company, branchCode, configuration } =
      await this.requireConfiguration(payload, false);
    const actor = this.requestedBy(payload.requestedBy);
    const payment = await this.prisma.superTefPayment.findFirst({
      where: {
        id: String(paymentId || "").trim(),
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
      include: this.paymentInclude(),
    });
    if (!payment) throw new NotFoundException("PAGAMENTO NÃO ENCONTRADO.");
    if (!payment.providerPaymentUniqueId) {
      throw new BadRequestException(
        "O PAGAMENTO AINDA NÃO POSSUI IDENTIFICADOR DO SUPERTEF.",
      );
    }
    if (["PAID", "REJECTED"].includes(payment.status)) {
      return this.mapPayment(payment);
    }

    const providerPayment = await this.client.getPayment(
      decryptSecret(configuration.accessTokenEncrypted),
      payment.providerPaymentUniqueId,
      configuration.operationTimeoutSeconds,
    );
    const before = this.mapPayment(payment);
    const saved = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.superTefPayment.update({
        where: { id: payment.id },
        data: this.providerPaymentData(providerPayment, actor),
        include: this.paymentInclude(),
      });
      if (
        payment.providerPaymentStatus !==
          providerPayment.providerPaymentStatus ||
        payment.paymentMessage !== providerPayment.paymentMessage
      ) {
        await this.audit(tx, {
          companyId: company.id,
          branchCode,
          entityType: "PAYMENT",
          entityId: payment.id,
          action: "STATUS_UPDATE",
          summary: `PAGAMENTO SUPERTEF: ${providerPayment.paymentMessage}`,
          before,
          after: this.mapPayment(updated),
          metadata: {
            providerPaymentUniqueId:
              providerPayment.providerPaymentUniqueId,
            providerPaymentStatus: providerPayment.providerPaymentStatus,
          },
          performedBy: actor,
        });
      }
      return updated;
    });
    return this.mapPayment(saved);
  }

  async rejectPayment(
    paymentId: string,
    payload: SuperTefMutationContextDto,
  ) {
    const { company, branchCode, configuration } =
      await this.requireConfiguration(payload, false);
    const actor = this.requestedBy(payload.requestedBy);
    const payment = await this.prisma.superTefPayment.findFirst({
      where: {
        id: String(paymentId || "").trim(),
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
      include: this.paymentInclude(),
    });
    if (!payment) throw new NotFoundException("PAGAMENTO NÃO ENCONTRADO.");
    if (payment.status === "PAID") {
      throw new BadRequestException(
        "PAGAMENTO PAGO EXIGE ESTORNO E NÃO PODE SER REJEITADO.",
      );
    }
    if (payment.status === "REJECTED") return this.mapPayment(payment);
    if (!payment.providerPaymentUniqueId) {
      throw new BadRequestException(
        "O PAGAMENTO AINDA NÃO POSSUI IDENTIFICADOR DO SUPERTEF.",
      );
    }

    const providerPayment = await this.client.rejectPayment(
      decryptSecret(configuration.accessTokenEncrypted),
      payment.providerPaymentUniqueId,
      configuration.operationTimeoutSeconds,
    );
    const saved = await this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.superTefPayment.update({
        where: { id: payment.id },
        data: this.providerPaymentData(providerPayment, actor),
        include: this.paymentInclude(),
      });
      await this.audit(tx, {
        companyId: company.id,
        branchCode,
        entityType: "PAYMENT",
        entityId: payment.id,
        action: "REQUEST_REJECTED",
        summary: "SOLICITAÇÃO REJEITADA NO SUPERTEF",
        before: this.mapPayment(payment),
        after: this.mapPayment(updated),
        performedBy: actor,
      });
      return updated;
    });
    return this.mapPayment(saved);
  }

  async listAudit(query: ListSuperTefAuditDto) {
    this.assertAdmin(query.userRole);
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    if (!company) return [];
    const branchCode = this.branchCode(query.sourceBranchCode);
    const events = await this.prisma.superTefAuditEvent.findMany({
      where: { companyId: company.id, branchCode },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: Math.max(1, Math.min(200, Number(query.take || 100))),
    });
    return events.map((event) => ({
      id: event.id,
      entityType: event.entityType,
      entityId: event.entityId || null,
      action: event.action,
      summary: event.summary,
      before: parseJson(event.beforeJson, null),
      after: parseJson(event.afterJson, null),
      metadata: parseJson(event.metadataJson, null),
      occurredAt: event.occurredAt.toISOString(),
      performedBy: event.performedBy || null,
    }));
  }
}
