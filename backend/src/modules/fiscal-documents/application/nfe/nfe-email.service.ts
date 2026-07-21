import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import nodemailer from "nodemailer";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  normalizeEmail,
  normalizeText,
  parseJson,
  serializeJson,
} from "../../../../common/finance-core.utils";
import { decryptSecret } from "../../../../common/secret-crypto.utils";
import { resolveEffectiveSmtpSettings } from "../../../../common/source-integration-settings";

type RecipientSnapshot = {
  name?: string | null;
  email?: string | null;
};

type IssuerSnapshot = {
  legalName?: string | null;
  tradeName?: string | null;
};

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return (normalizeText(raw) || "FALHA NÃO IDENTIFICADA NO ENVIO DO E-MAIL").slice(
    0,
    2000,
  );
}

function validEmail(value?: string | null) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export function resolveNfeEmailRecipient(params: {
  explicitEmail?: string | null;
  environment: string;
  homologationEmail?: string | null;
  recipientEmail?: string | null;
}) {
  return normalizeEmail(
    params.explicitEmail ||
      (params.environment === "HOMOLOGATION"
        ? params.homologationEmail
        : null) ||
      params.recipientEmail,
  );
}

function escapeHtml(value?: string | null) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

@Injectable()
export class NfeEmailService {
  constructor(private readonly prisma: PrismaService) {}

  private mapDelivery(delivery: any, reused = false) {
    return {
      id: delivery.id,
      fiscalDocumentId: delivery.fiscalDocumentId,
      recipientEmail: delivery.recipientEmail,
      subject: delivery.subject,
      status: delivery.status,
      messageId: delivery.messageId || null,
      attemptedAt: delivery.attemptedAt?.toISOString?.() || null,
      sentAt: delivery.sentAt?.toISOString?.() || null,
      errorMessage: delivery.errorMessage || null,
      reused,
    };
  }

  private auditData(params: {
    companyId: string;
    branchCode: number;
    documentId: string;
    action: string;
    summary: string;
    after?: unknown;
    requestedBy?: string | null;
  }) {
    return {
      companyId: params.companyId,
      branchCode: params.branchCode,
      entityType: "FISCAL_DOCUMENT",
      entityId: params.documentId,
      action: params.action,
      summary: normalizeText(params.summary)!,
      afterJson: serializeJson(params.after),
      occurredAt: new Date(),
      performedBy: params.requestedBy || null,
      createdBy: params.requestedBy || null,
    };
  }

  async sendAuthorizedDocument(params: {
    companyId: string;
    branchCode: number;
    documentId: string;
    recipientEmail?: string | null;
    requestedBy?: string | null;
    force?: boolean;
  }) {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: {
        id: params.documentId,
        companyId: params.companyId,
        branchCode: params.branchCode,
        model: "55",
        canceledAt: null,
      },
      include: {
        nfeProfile: true,
      },
    });
    if (!document) {
      throw new NotFoundException("NF-E NÃO ENCONTRADA PARA ENVIO.");
    }
    if (document.status !== "AUTHORIZED") {
      throw new BadRequestException(
        "SOMENTE UMA NF-E AUTORIZADA PODE SER ENVIADA POR E-MAIL.",
      );
    }
    if (!document.processedXml || !document.danfePdfBlob) {
      throw new BadRequestException(
        "O XML PROCESSADO E O DANFE DEVEM ESTAR ARMAZENADOS ANTES DO ENVIO.",
      );
    }

    const profile = document.nfeProfile;
    if (!profile || profile.status !== "ACTIVE" || profile.canceledAt) {
      throw new BadRequestException(
        "PERFIL NF-E ATIVO NÃO ENCONTRADO PARA O ENVIO.",
      );
    }
    const recipientSnapshot = parseJson<RecipientSnapshot>(
      document.recipientSnapshotJson,
      {},
    );
    const issuerSnapshot = parseJson<IssuerSnapshot>(
      document.issuerSnapshotJson,
      {},
    );
    const recipientEmail = resolveNfeEmailRecipient({
      explicitEmail: params.recipientEmail,
      environment: document.environment,
      homologationEmail: profile.homologationEmailRecipient,
      recipientEmail: recipientSnapshot?.email,
    });
    if (!recipientEmail || !validEmail(recipientEmail)) {
      throw new BadRequestException(
        "INFORME UM E-MAIL VÁLIDO PARA RECEBER O DANFE E O XML.",
      );
    }

    if (!params.force) {
      const sent = await this.prisma.fiscalDocumentEmailDelivery.findFirst({
        where: {
          fiscalDocumentId: document.id,
          recipientEmail,
          status: "SENT",
          canceledAt: null,
        },
        orderBy: { sentAt: "desc" },
      });
      if (sent) return this.mapDelivery(sent, true);
    }

    const sourceConfiguration =
      await this.prisma.sourceIntegrationConfiguration.findFirst({
        where: {
          companyId: document.companyId,
          branchCode: document.branchCode,
          status: "ACTIVE",
          canceledAt: null,
        },
      });
    const smtp = resolveEffectiveSmtpSettings(profile, sourceConfiguration);
    const smtpHost = smtp.host;
    const smtpPort = smtp.port;
    const smtpFromEmail = normalizeEmail(smtp.fromEmail);
    const smtpUsername = smtp.username;
    if (
      !smtpHost ||
      !Number.isInteger(smtpPort) ||
      smtpPort < 1 ||
      smtpPort > 65535 ||
      !smtpFromEmail ||
      !validEmail(smtpFromEmail)
    ) {
      throw new BadRequestException(
        "CONFIGURAÇÃO SMTP INCOMPLETA NO PERFIL NF-E DA FILIAL.",
      );
    }
    if (
      smtp.authenticate &&
      (!smtpUsername || !smtp.passwordEncrypted)
    ) {
      throw new BadRequestException(
        "USUÁRIO OU SENHA SMTP NÃO CONFIGURADOS NO PERFIL NF-E.",
      );
    }

    const issuerName =
      normalizeText(
        smtp.fromName ||
          issuerSnapshot?.tradeName ||
          issuerSnapshot?.legalName,
      ) || "FINANCEIRO";
    const subject = `NF-E ${document.series}/${document.number} - ${issuerName}`;
    const pdfFileName =
      document.danfeFileName || `DANFE-NFE-${document.accessKey}.pdf`;
    const xmlFileName = `NFE-${document.accessKey}.xml`;
    const delivery = await this.prisma.fiscalDocumentEmailDelivery.create({
      data: {
        companyId: document.companyId,
        branchCode: document.branchCode,
        fiscalDocumentId: document.id,
        recipientEmail,
        subject,
        status: "PENDING",
        attemptedAt: new Date(),
        attachmentsJson: serializeJson([pdfFileName, xmlFileName]),
        createdBy: params.requestedBy || null,
        updatedBy: params.requestedBy || null,
      },
    });

    try {
      const timeout = Math.max(
        5,
        Math.min(300, Number(smtp.timeoutSeconds || 60)),
      );
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtp.secure,
        connectionTimeout: timeout * 1000,
        greetingTimeout: timeout * 1000,
        socketTimeout: timeout * 1000,
        auth: smtp.authenticate
          ? {
              user: smtpUsername,
              pass: decryptSecret(smtp.passwordEncrypted!),
            }
          : undefined,
      });
      const environmentWarning =
        document.environment === "HOMOLOGATION"
          ? "<p><strong>DOCUMENTO EMITIDO EM HOMOLOGAÇÃO — SEM VALOR FISCAL.</strong></p>"
          : "";
      const sent = await transporter.sendMail({
        from: {
          name: issuerName,
          address: smtpFromEmail,
        },
        to: recipientEmail,
        subject,
        text: [
          `NF-E ${document.series}/${document.number}.`,
          `CHAVE DE ACESSO: ${document.accessKey}.`,
          document.environment === "HOMOLOGATION"
            ? "DOCUMENTO EMITIDO EM HOMOLOGAÇÃO - SEM VALOR FISCAL."
            : "",
          "O DANFE EM PDF E O XML AUTORIZADO ESTÃO ANEXADOS.",
        ]
          .filter(Boolean)
          .join("\n"),
        html: [
          `<p>NF-E <strong>${document.series}/${document.number}</strong>.</p>`,
          `<p>CHAVE DE ACESSO: <strong>${escapeHtml(document.accessKey)}</strong>.</p>`,
          environmentWarning,
          "<p>O DANFE EM PDF E O XML AUTORIZADO ESTÃO ANEXADOS.</p>",
        ].join(""),
        attachments: [
          {
            filename: pdfFileName,
            content: Buffer.from(document.danfePdfBlob),
            contentType: "application/pdf",
          },
          {
            filename: xmlFileName,
            content: Buffer.from(document.processedXml, "utf8"),
            contentType: "application/xml",
          },
        ],
      });
      const sentAt = new Date();
      const saved = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.fiscalDocumentEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SENT",
            messageId: String(sent.messageId || "") || null,
            sentAt,
            errorMessage: null,
            updatedBy: params.requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: document.companyId,
            branchCode: document.branchCode,
            documentId: document.id,
            action: "SEND_EMAIL",
            summary: "DANFE E XML DA NF-E ENVIADOS POR E-MAIL",
            after: {
              deliveryId: delivery.id,
              recipientEmail,
              sentAt: sentAt.toISOString(),
              messageId: sent.messageId || null,
            },
            requestedBy: params.requestedBy,
          }),
        });
        return updated;
      });
      return this.mapDelivery(saved);
    } catch (error) {
      const message = errorMessage(error);
      await this.prisma.$transaction(async (tx: any) => {
        await tx.fiscalDocumentEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "ERROR",
            errorMessage: message,
            updatedBy: params.requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: document.companyId,
            branchCode: document.branchCode,
            documentId: document.id,
            action: "EMAIL_ERROR",
            summary: "FALHA NO ENVIO DO DANFE E XML POR E-MAIL",
            after: {
              deliveryId: delivery.id,
              recipientEmail,
              error: message,
            },
            requestedBy: params.requestedBy,
          }),
        });
      });
      throw new BadRequestException(
        `NF-E AUTORIZADA, MAS O E-MAIL NÃO FOI ENVIADO: ${message}`,
      );
    }
  }
}
