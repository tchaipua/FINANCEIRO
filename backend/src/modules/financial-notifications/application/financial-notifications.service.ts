import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { getFinanceContext, hasAuthenticatedFinanceScope } from "../../../common/finance-context";
import { sendFinancialNotificationToSource } from "../../../common/source-system-notifications.client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  FINANCIAL_NOTIFICATION_EVENTS,
  FinancialNotificationEventType,
  getFinancialNotificationEvent,
} from "../domain/financial-notification-events";
import {
  formatFinancialNotificationMessage,
  sanitizeFinancialNotificationMetadata,
} from "./financial-notification-message";
import {
  DispatchFinancialNotificationDto,
  SaveFinancialNotificationPreferencesDto,
  SimulateFinancialNotificationDto,
} from "./dto/financial-notifications.dto";

function requiredContext() {
  const context = getFinanceContext();
  if (!context?.authenticated || !context.companyId || !context.sourceSystem ||
      !context.sourceTenantId || !context.sourceUserId || !context.sourceBranchCode) {
    throw new ForbiddenException("CONTEXTO FINANCEIRO AUTENTICADO É OBRIGATÓRIO.");
  }
  return context as typeof context & {
    companyId: string; sourceSystem: string; sourceTenantId: string;
    sourceUserId: string; sourceBranchCode: number;
  };
}

function assertAdmin() {
  if (!hasAuthenticatedFinanceScope("FINANCE_ADMIN")) {
    throw new ForbiddenException("PERFIL ADMINISTRADOR FINANCEIRO É OBRIGATÓRIO.");
  }
}

function readPersistedMetadata(metadataJson: string | null | undefined) {
  if (!metadataJson) return undefined;
  try {
    const parsed = JSON.parse(metadataJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class FinancialNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  listEvents() {
    assertAdmin();
    requiredContext();
    return FINANCIAL_NOTIFICATION_EVENTS;
  }

  private async requireSubject(subjectId: string) {
    const context = requiredContext();
    const subject = await this.prisma.financeAccessSubject.findFirst({
      where: {
        id: subjectId,
        companyId: context.companyId,
        sourceSystem: context.sourceSystem,
        sourceTenantId: context.sourceTenantId,
        sourceActive: true,
        canceledAt: null,
      },
    });
    let branchCodes: unknown = [];
    try { branchCodes = JSON.parse(subject?.sourceBranchCodesJson || "[]"); } catch { branchCodes = []; }
    if (!subject || !Array.isArray(branchCodes) || !branchCodes.includes(context.sourceBranchCode)) {
      throw new NotFoundException("USUÁRIO DO SISTEMA NÃO LOCALIZADO NESTA FILIAL.");
    }
    return subject;
  }

  async getPreferences(subjectId: string) {
    assertAdmin();
    const context = requiredContext();
    const subject = await this.requireSubject(subjectId);
    const saved = await this.prisma.financialNotificationPreference.findMany({
      where: {
        companyId: context.companyId,
        branchCode: context.sourceBranchCode,
        sourceSystem: context.sourceSystem,
        sourceTenantId: context.sourceTenantId,
        subjectId: subject.id,
        canceledAt: null,
      },
    });
    const byEvent = new Map(saved.map((item) => [item.eventType, item]));
    return {
      subject: { id: subject.id, sourceUserId: subject.sourceUserId, displayName: subject.displayName, email: subject.email },
      preferences: FINANCIAL_NOTIFICATION_EVENTS.map((event) => {
        const preference = byEvent.get(event.code);
        return {
          ...event,
          enabled: preference?.enabled || false,
          sendInternal: preference?.sendInternal || false,
          sendEmail: preference?.sendEmail || false,
          sendTelegram: preference?.sendTelegram || false,
          updatedAt: preference?.updatedAt || null,
        };
      }),
    };
  }

  async savePreferences(subjectId: string, payload: SaveFinancialNotificationPreferencesDto) {
    assertAdmin();
    const context = requiredContext();
    const subject = await this.requireSubject(subjectId);
    const actor = context.sourceUserId;
    const distinct = new Map(payload.preferences.map((item) => [item.eventType, item]));
    if (distinct.size !== payload.preferences.length) {
      throw new BadRequestException("NÃO REPITA O MESMO EVENTO NA CONFIGURAÇÃO.");
    }
    await this.prisma.$transaction(async (transaction) => {
      const before = await transaction.financialNotificationPreference.findMany({
        where: { companyId: context.companyId, branchCode: context.sourceBranchCode, subjectId: subject.id, canceledAt: null },
      });
      for (const event of FINANCIAL_NOTIFICATION_EVENTS) {
        const input = distinct.get(event.code) || {
          enabled: false, sendInternal: false, sendEmail: false, sendTelegram: false,
        };
        const enabled = Boolean(input.enabled && (input.sendInternal || input.sendEmail || input.sendTelegram));
        await transaction.financialNotificationPreference.upsert({
          where: { companyId_branchCode_sourceSystem_sourceTenantId_subjectId_eventType: {
            companyId: context.companyId, branchCode: context.sourceBranchCode,
            sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
            subjectId: subject.id, eventType: event.code,
          } },
          create: {
            companyId: context.companyId, branchCode: context.sourceBranchCode,
            sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
            subjectId: subject.id, eventType: event.code, enabled,
            sendInternal: enabled && input.sendInternal,
            sendEmail: enabled && input.sendEmail,
            sendTelegram: enabled && input.sendTelegram,
            createdBy: actor, updatedBy: actor,
          },
          update: {
            enabled, sendInternal: enabled && input.sendInternal,
            sendEmail: enabled && input.sendEmail,
            sendTelegram: enabled && input.sendTelegram,
            updatedBy: actor, canceledAt: null, canceledBy: null,
          },
        });
      }
      const after = await transaction.financialNotificationPreference.findMany({
        where: { companyId: context.companyId, branchCode: context.sourceBranchCode, subjectId: subject.id, canceledAt: null },
      });
      await transaction.financialNotificationAuditEvent.create({ data: {
        companyId: context.companyId, branchCode: context.sourceBranchCode,
        sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
        subjectId: subject.id, action: "PREFERENCES_UPDATED",
        summary: `NOTIFICAÇÕES FINANCEIRAS DE ${subject.displayName} ATUALIZADAS.`,
        beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after),
        performedBy: actor, createdBy: actor,
      } });
    });
    return this.getPreferences(subjectId);
  }

  async dispatch(input: DispatchFinancialNotificationDto & { simulationEmailOverride?: string; targetSubjectId?: string }) {
    const context = requiredContext();
    if (!getFinancialNotificationEvent(input.eventType)) {
      throw new BadRequestException("EVENTO FINANCEIRO INVÁLIDO.");
    }
    const preferences = await this.prisma.financialNotificationPreference.findMany({
      where: {
        companyId: context.companyId, branchCode: context.sourceBranchCode,
        sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
        eventType: input.eventType, enabled: true, canceledAt: null,
        ...(input.targetSubjectId ? { subjectId: input.targetSubjectId } : {}),
        subject: {
          sourceActive: true, canceledAt: null,
        },
      },
      include: { subject: true },
    });
    const results = [];
    for (const preference of preferences.filter((item) => {
      try {
        const branchCodes = JSON.parse(item.subject.sourceBranchCodesJson);
        return Array.isArray(branchCodes) && branchCodes.includes(context.sourceBranchCode);
      } catch { return false; }
    })) {
      const metadata = sanitizeFinancialNotificationMetadata(input.metadata);
      const message = formatFinancialNotificationMessage(
        input.eventType,
        metadata,
        input.message,
      );
      let delivery = await this.prisma.financialNotificationDelivery.upsert({
        where: { companyId_branchCode_sourceSystem_sourceTenantId_subjectId_eventKey: {
          companyId: context.companyId, branchCode: context.sourceBranchCode,
          sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
          subjectId: preference.subjectId, eventKey: input.eventKey,
        } },
        create: {
          companyId: context.companyId, branchCode: context.sourceBranchCode,
          sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
          subjectId: preference.subjectId, eventType: input.eventType,
          eventKey: input.eventKey, title: input.title.toUpperCase(),
          message, actionUrl: input.actionUrl || "/principal/notificacoes",
          metadataJson: metadata ? JSON.stringify(metadata) : null,
          sendInternal: preference.sendInternal, sendEmail: preference.sendEmail,
          sendTelegram: preference.sendTelegram,
          createdBy: context.sourceUserId, updatedBy: context.sourceUserId,
        },
        update: {},
      });
      if (delivery.deliveredAt) {
        results.push(delivery);
        continue;
      }
      const persistedMetadata = readPersistedMetadata(delivery.metadataJson);
      try {
        const callback = await sendFinancialNotificationToSource({
          deliveryId: delivery.id, eventType: delivery.eventType,
          title: delivery.title, message: delivery.message,
          recipientUserId: preference.subject.sourceUserId,
          recipientEmail: preference.subject.email,
          sendInternal: delivery.sendInternal, sendEmail: delivery.sendEmail,
          sendTelegram: delivery.sendTelegram, actionUrl: delivery.actionUrl,
          metadata: persistedMetadata,
          simulationEmailOverride: input.simulationEmailOverride,
        });
        delivery = await this.prisma.financialNotificationDelivery.update({
          where: { id: delivery.id }, data: {
            internalStatus: callback.internalStatus, emailStatus: callback.emailStatus,
            telegramStatus: callback.telegramStatus, attemptCount: { increment: 1 },
            lastError: null, deliveredAt: new Date(callback.processedAt), updatedBy: context.sourceUserId,
          },
        });
      } catch (error) {
        delivery = await this.prisma.financialNotificationDelivery.update({
          where: { id: delivery.id }, data: {
            attemptCount: { increment: 1 },
            lastError: error instanceof Error ? error.message.slice(0, 1000) : "FALHA NO CALLBACK.",
            updatedBy: context.sourceUserId,
          },
        });
      }
      results.push(delivery);
    }
    return { eventType: input.eventType, recipients: results.length, deliveries: results };
  }

  async simulate(payload: SimulateFinancialNotificationDto) {
    assertAdmin();
    const context = requiredContext();
    const subject = await this.requireSubject(payload.subjectId);
    if (payload.recipientEmailOverride &&
        (process.env.NODE_ENV === "production" || payload.recipientEmailOverride.toUpperCase() !== "TCHAIPUA@GMAIL.COM")) {
      throw new ForbiddenException("O E-MAIL DE SIMULAÇÃO NÃO É PERMITIDO NESTE AMBIENTE.");
    }
    const events = payload.eventType
      ? FINANCIAL_NOTIFICATION_EVENTS.filter((event) => event.code === payload.eventType)
      : FINANCIAL_NOTIFICATION_EVENTS;
    const simulationId = `${Date.now()}-${subject.id}`;
    const results = await Promise.all(events.map((event) =>
      this.dispatch({
        eventType: event.code as FinancialNotificationEventType,
        eventKey: `SIMULATION:${simulationId}:${event.code}`,
        title: `SIMULAÇÃO - ${event.name}`,
        message: `EVENTO DE TESTE DO FINANCEIRO: ${event.name}. EMPRESA ${context.companyId}, FILIAL ${context.sourceBranchCode}.`,
        actionUrl: "/principal/notificacoes",
        metadata: {
          simulation: true,
          group: event.group,
          targetSubjectId: subject.id,
          customerName: "CLIENTE DE TESTE CEC",
          saleNumber: "SIMULAÇÃO V-0001",
          installmentNumber: 1,
          installmentCount: 3,
          previousAmount: 100,
          nextAmount: 125,
          previousDueDate: "2026-08-10",
          nextDueDate: "2026-08-20",
          reversedAmount: 125,
          reason: "SIMULAÇÃO CONTROLADA",
        },
        targetSubjectId: subject.id,
        simulationEmailOverride: payload.recipientEmailOverride,
      }),
    ));
    await this.prisma.financialNotificationAuditEvent.create({ data: {
      companyId: context.companyId, branchCode: context.sourceBranchCode,
      sourceSystem: context.sourceSystem, sourceTenantId: context.sourceTenantId,
      subjectId: subject.id, action: "EVENTS_SIMULATED",
      summary: `${events.length} EVENTO(S) FINANCEIRO(S) SIMULADO(S) PARA ${subject.displayName}.`,
      metadataJson: JSON.stringify({ eventTypes: events.map((event) => event.code), recipientEmailOverride: payload.recipientEmailOverride || null }),
      performedBy: context.sourceUserId, createdBy: context.sourceUserId,
    } });
    return { simulated: results.length, results };
  }
}
