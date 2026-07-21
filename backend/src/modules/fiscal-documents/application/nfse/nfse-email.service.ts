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

type TakerSnapshot = {
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

function escapeHtml(value?: string | null) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function resolveNfseEmailRecipient(params: {
  explicitEmail?: string | null;
  environment: string;
  homologationEmail?: string | null;
  takerEmail?: string | null;
}) {
  return normalizeEmail(
    params.explicitEmail ||
      (params.environment === "HOMOLOGATION"
        ? params.homologationEmail
        : null) ||
      params.takerEmail,
  );
}

@Injectable()
export class NfseEmailService {
  constructor(private readonly prisma: PrismaService) {}

  private mapDelivery(delivery: any, reused = false) {
    return {
      id: delivery.id,
      nfseDocumentId: delivery.nfseDocumentId,
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
      entityType: "NFSE_DOCUMENT",
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
    const document = await this.prisma.nfseDocument.findFirst({
      where: {
        id: params.documentId,
        companyId: params.companyId,
        branchCode: params.branchCode,
        canceledAt: null,
      },
      include: { profile: true },
    });
    if (!document) {
      throw new NotFoundException("NFS-E NÃO ENCONTRADA PARA ENVIO.");
    }
    if (document.status !== "AUTHORIZED") {
      throw new BadRequestException(
        "SOMENTE UMA NFS-E AUTORIZADA PODE SER ENVIADA POR E-MAIL.",
      );
    }
    if (!document.authorizedXml || !document.danfsePdfBlob) {
      throw new BadRequestException(
        "O XML AUTORIZADO E O DANFSE OFICIAL DEVEM ESTAR ARMAZENADOS ANTES DO ENVIO.",
      );
    }
    const profile = document.profile;
    if (!profile || profile.status !== "ACTIVE" || profile.canceledAt) {
      throw new BadRequestException(
        "PERFIL NFS-E ATIVO NÃO ENCONTRADO PARA O ENVIO.",
      );
    }
    const taker = parseJson<TakerSnapshot>(document.takerSnapshotJson, {});
    const issuer = parseJson<IssuerSnapshot>(document.issuerSnapshotJson, {});
    const recipientEmail = resolveNfseEmailRecipient({
      explicitEmail: params.recipientEmail,
      environment: document.environment,
      homologationEmail: profile.homologationEmailRecipient,
      takerEmail: taker?.email,
    });
    if (!recipientEmail || !validEmail(recipientEmail)) {
      throw new BadRequestException(
        "INFORME UM E-MAIL VÁLIDO PARA RECEBER O DANFSE E O XML.",
      );
    }
    if (!params.force) {
      const sent = await this.prisma.nfseEmailDelivery.findFirst({
        where: {
          nfseDocumentId: document.id,
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
        "CONFIGURAÇÃO SMTP INCOMPLETA NO PERFIL NFS-E DA FILIAL.",
      );
    }
    if (
      smtp.authenticate &&
      (!smtpUsername || !smtp.passwordEncrypted)
    ) {
      throw new BadRequestException(
        "USUÁRIO OU SENHA SMTP NÃO CONFIGURADOS NO PERFIL NFS-E.",
      );
    }

    const issuerName =
      normalizeText(
        smtp.fromName || issuer?.tradeName || issuer?.legalName,
      ) || "FINANCEIRO";
    const subject = `NFS-E ${document.series}/${document.number} - ${issuerName}`;
    const pdfFileName =
      document.danfseFileName || `DANFSE-${document.accessKey}.pdf`;
    const xmlFileName = `NFSE-${document.accessKey}.xml`;
    const delivery = await this.prisma.nfseEmailDelivery.create({
      data: {
        companyId: document.companyId,
        branchCode: document.branchCode,
        nfseDocumentId: document.id,
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
      const warning =
        document.environment === "HOMOLOGATION"
          ? "DOCUMENTO EMITIDO EM PRODUÇÃO RESTRITA - SEM VALOR FISCAL."
          : "";
      const sent = await transporter.sendMail({
        from: { name: issuerName, address: smtpFromEmail },
        to: recipientEmail,
        subject,
        text: [
          `NFS-E ${document.series}/${document.number}.`,
          `CHAVE DE ACESSO: ${document.accessKey}.`,
          warning,
          "O DANFSE OFICIAL EM PDF E O XML AUTORIZADO ESTÃO ANEXADOS.",
        ]
          .filter(Boolean)
          .join("\n"),
        html: [
          `<p>NFS-E <strong>${document.series}/${document.number}</strong>.</p>`,
          `<p>CHAVE DE ACESSO: <strong>${escapeHtml(document.accessKey)}</strong>.</p>`,
          warning ? `<p><strong>${warning}</strong></p>` : "",
          "<p>O DANFSE OFICIAL EM PDF E O XML AUTORIZADO ESTÃO ANEXADOS.</p>",
        ].join(""),
        attachments: [
          {
            filename: pdfFileName,
            content: Buffer.from(document.danfsePdfBlob),
            contentType: "application/pdf",
          },
          {
            filename: xmlFileName,
            content: Buffer.from(document.authorizedXml, "utf8"),
            contentType: "application/xml",
          },
        ],
      });
      const sentAt = new Date();
      const saved = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.nfseEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SENT",
            messageId: String(sent.messageId || "") || null,
            sentAt,
            errorMessage: null,
            updatedBy: params.requestedBy || null,
          },
        });
        await tx.nfseDocument.update({
          where: { id: document.id },
          data: {
            emailSentAt: sentAt,
            emailError: null,
            updatedBy: params.requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: document.companyId,
            branchCode: document.branchCode,
            documentId: document.id,
            action: "SEND_EMAIL",
            summary: "DANFSE E XML DA NFS-E ENVIADOS POR E-MAIL",
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
        await tx.nfseEmailDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "ERROR",
            errorMessage: message,
            updatedBy: params.requestedBy || null,
          },
        });
        await tx.nfseDocument.update({
          where: { id: document.id },
          data: {
            emailError: message,
            updatedBy: params.requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: document.companyId,
            branchCode: document.branchCode,
            documentId: document.id,
            action: "EMAIL_ERROR",
            summary: "FALHA NO ENVIO DO DANFSE E XML POR E-MAIL",
            after: { deliveryId: delivery.id, recipientEmail, error: message },
            requestedBy: params.requestedBy,
          }),
        });
      });
      throw new BadRequestException(
        `NFS-E AUTORIZADA, MAS O E-MAIL NÃO FOI ENVIADO: ${message}`,
      );
    }
  }
}
