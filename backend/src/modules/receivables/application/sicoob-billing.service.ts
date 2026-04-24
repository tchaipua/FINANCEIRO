import { Injectable } from "@nestjs/common";
import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";
import {
  dateToDateOnly,
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";

const execFileAsync = promisify(execFile);

type SicoobBankConfig = {
  environment?: string | null;
  clientId: string;
  certificateBase64: string;
  certificatePassword: string;
  beneficiaryCode: string;
  accountNumber: string;
  contractNumber?: string | null;
  modalityCode?: string | null;
  documentSpeciesCode?: string | null;
  acceptanceCode?: string | null;
  issueTypeCode?: string | null;
  distributionTypeCode?: string | null;
  registerPixCode?: number | null;
  instructionLine1?: string | null;
  instructionLine2?: string | null;
  defaultFinePercent?: number | null;
  defaultInterestPercent?: number | null;
  protestDays?: number | null;
  negativeDays?: number | null;
};

type SicoobPayer = {
  name: string;
  document: string;
  email?: string | null;
  addressLine1: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
};

type IssueSicoobBankSlipInput = {
  sequenceNumber: number;
  amount: number;
  dueDate: Date;
  installmentNumber: number;
  payer: SicoobPayer;
};

type SicoobIssueResult = {
  nossoNumero: string | null;
  seuNumero: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  qrCode: string | null;
  pdfBoleto: string | null;
  numeroContratoCobranca: string | null;
  rawResponseJson: string;
  payloadJson: string;
};

type DownloadSicoobMovementsInput = {
  numeroCliente: number;
  tipoMovimento: number;
  dataInicial: string;
  dataFinal: string;
  maxAttempts?: number;
  sleepMilliseconds?: number;
};

type DownloadSicoobMovementsResult = {
  codigoSolicitacao: number;
  totalRegistros: number;
  idArquivos: number[];
  records: Array<Record<string, unknown>>;
};

class SicoobApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class SicoobBillingService {
  private readonly billingBaseUrl = "https://api.sicoob.com.br/cobranca-bancaria/v3";

  private parseApiMessage(responseBody: string, fallbackMessage: string) {
    try {
      const parsed = JSON.parse(responseBody);
      if (Array.isArray(parsed?.mensagens) && parsed.mensagens.length) {
        const bankMessage = String(parsed.mensagens[0]?.mensagem || "").trim();
        return bankMessage || fallbackMessage;
      }
    } catch {
      return fallbackMessage;
    }

    return fallbackMessage;
  }

  private normalizeInstruction(value?: string | null) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, 40);
  }

  private parseSequenceNumber(value: number) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new Error("Sequencial do boleto inválido para emissão.");
    }

    return normalized;
  }

  private parseNumericCode(value: string | number | null | undefined) {
    const normalized =
      typeof value === "number"
        ? String(value)
        : normalizeDigits(String(value || ""));

    if (!normalized) {
      return null;
    }

    return Number(normalized);
  }

  private buildLatePaymentLimitDate(dueDate: Date) {
    const baseDate = new Date(dueDate);
    baseDate.setUTCDate(baseDate.getUTCDate() + 20);
    return baseDate;
  }

  private buildFineFields(
    dueDate: Date,
    amount: number,
    defaultFinePercent?: number | null,
  ) {
    if (!defaultFinePercent || defaultFinePercent <= 0 || amount < 1) {
      return {
        tipoMulta: 0,
        valorMulta: 0,
      };
    }

    return {
      tipoMulta: 2,
      dataMulta: dateToDateOnly(new Date(dueDate.getTime() + 86400000)),
      valorMulta: roundMoney(defaultFinePercent),
    };
  }

  private buildInterestFields(
    dueDate: Date,
    amount: number,
    defaultInterestPercent?: number | null,
  ) {
    if (!defaultInterestPercent || defaultInterestPercent <= 0 || amount < 1) {
      return {
        tipoJurosMora: 0,
        valorJurosMora: 0,
      };
    }

    return {
      tipoJurosMora: 1,
      dataJurosMora: dateToDateOnly(new Date(dueDate.getTime() + 86400000)),
      valorJurosMora: roundMoney(defaultInterestPercent),
    };
  }

  private buildProtestFields(protestDays?: number | null) {
    if (!protestDays || protestDays <= 0) {
      return {
        codigoProtesto: 3,
      };
    }

    return {
      codigoProtesto: 1,
      numeroDiasProtesto: protestDays,
    };
  }

  private buildNegativeFields(negativeDays?: number | null) {
    if (!negativeDays || negativeDays <= 0) {
      return {
        codigoNegativacao: 3,
      };
    }

    return {
      codigoNegativacao: 2,
      numeroDiasNegativacao: negativeDays,
    };
  }

  private resolveAcceptance(value?: string | null) {
    const normalized = normalizeText(value);
    return normalized === "S" || normalized === "SIM" || normalized === "TRUE";
  }

  private resolveEnvironment(_value?: string | null) {
    return {
      billingBaseUrl: this.billingBaseUrl,
    };
  }

  private async invokePowerShellIssueRequest(input: {
    clientId: string;
    certificateBase64: string;
    certificatePassword: string;
    url: string;
    scope: string;
    payloadJson: string;
  }) {
    const scriptPath = join(
      process.cwd(),
      "scripts",
      "sicoob-issue-boleto.ps1",
    );

    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-ClientId",
          input.clientId,
          "-CertificateBase64",
          input.certificateBase64,
          "-CertificatePassword",
          input.certificatePassword,
          "-Scope",
          input.scope,
          "-Url",
          input.url,
          "-BodyBase64",
          Buffer.from(input.payloadJson, "utf8").toString("base64"),
        ],
        {
          maxBuffer: 20 * 1024 * 1024,
          windowsHide: true,
        },
      );

      const parsed = JSON.parse(String(stdout || "").trim());
      return {
        statusCode: Number(parsed?.statusCode || 0),
        body: String(parsed?.body || ""),
      };
    } catch (error: any) {
      const rawOutput = String(error?.stdout || error?.stderr || error?.message || "");

      try {
        const parsed = JSON.parse(rawOutput.trim());
        return {
          statusCode: Number(parsed?.statusCode || 0),
          body: String(parsed?.body || ""),
        };
      } catch {
        throw new Error(
          rawOutput || "Falha ao executar a integração PowerShell do Sicoob.",
        );
      }
    }
  }

  private async invokePowerShellDownloadRequest(input: {
    clientId: string;
    certificateBase64: string;
    certificatePassword: string;
    numeroCliente: number;
    tipoMovimento: number;
    dataInicial: string;
    dataFinal: string;
    maxAttempts?: number;
    sleepMilliseconds?: number;
  }) {
    const scriptPath = join(
      process.cwd(),
      "scripts",
      "sicoob-download-movimentacoes.ps1",
    );

    try {
      const { stdout } = await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-ClientId",
          input.clientId,
          "-CertificateBase64",
          input.certificateBase64,
          "-CertificatePassword",
          input.certificatePassword,
          "-NumeroCliente",
          String(input.numeroCliente),
          "-TipoMovimento",
          String(input.tipoMovimento),
          "-DataInicial",
          input.dataInicial,
          "-DataFinal",
          input.dataFinal,
          "-MaxAttempts",
          String(input.maxAttempts || 10),
          "-SleepMilliseconds",
          String(input.sleepMilliseconds || 700),
        ],
        {
          maxBuffer: 40 * 1024 * 1024,
          windowsHide: true,
        },
      );

      return JSON.parse(String(stdout || "").trim());
    } catch (error: any) {
      const rawOutput = String(
        error?.stdout || error?.stderr || error?.message || "",
      );

      try {
        return JSON.parse(rawOutput.trim());
      } catch {
        throw new Error(
          rawOutput ||
            "Falha ao executar a integração PowerShell de movimentações do Sicoob.",
        );
      }
    }
  }

  async issueBankSlip(
    config: SicoobBankConfig,
    input: IssueSicoobBankSlipInput,
  ): Promise<SicoobIssueResult> {
    const normalizedBeneficiaryCode = normalizeDigits(config.beneficiaryCode);
    const normalizedAccountNumber = normalizeDigits(config.accountNumber);
    const normalizedPayerDocument = normalizeDigits(input.payer.document);

    if (!normalizedBeneficiaryCode) {
      throw new Error("Código do beneficiário não configurado para o Sicoob.");
    }

    if (!normalizedAccountNumber) {
      throw new Error("Conta corrente inválida para emissão no Sicoob.");
    }

    if (!normalizedPayerDocument) {
      throw new Error("Documento do pagador inválido para emissão do boleto.");
    }

    const dueDate = new Date(input.dueDate);
    const amount = roundMoney(input.amount);
    const sequenceNumber = this.parseSequenceNumber(input.sequenceNumber);
    const latePaymentLimitDate = this.buildLatePaymentLimitDate(dueDate);
    const issueTypeCode = this.parseNumericCode(config.issueTypeCode) ?? 2;
    const distributionTypeCode =
      this.parseNumericCode(config.distributionTypeCode) ?? 2;
    const registerPixCode =
      typeof config.registerPixCode === "number" ? config.registerPixCode : 1;
    const instructions = [
      this.normalizeInstruction(config.instructionLine1),
      this.normalizeInstruction(config.instructionLine2),
    ].filter((value): value is string => Boolean(value));

    const payload = {
      numeroCliente: Number(normalizedBeneficiaryCode),
      codigoModalidade: this.parseNumericCode(config.modalityCode) ?? 1,
      numeroContaCorrente: Number(normalizedAccountNumber),
      codigoEspecieDocumento:
        normalizeText(config.documentSpeciesCode) || "DM",
      dataEmissao: dateToDateOnly(new Date()),
      nossoNumero: sequenceNumber,
      seuNumero: String(sequenceNumber),
      identificacaoBoletoEmpresa: String(sequenceNumber),
      identificacaoEmissaoBoleto: issueTypeCode,
      identificacaoDistribuicaoBoleto: distributionTypeCode,
      valor: amount,
      dataVencimento: dateToDateOnly(dueDate),
      dataLimitePagamento: dateToDateOnly(latePaymentLimitDate),
      valorAbatimento: 0,
      tipoDesconto: 0,
      ...this.buildFineFields(dueDate, amount, config.defaultFinePercent),
      ...this.buildInterestFields(dueDate, amount, config.defaultInterestPercent),
      numeroParcela: input.installmentNumber,
      aceite: this.resolveAcceptance(config.acceptanceCode),
      ...this.buildNegativeFields(config.negativeDays),
      ...this.buildProtestFields(config.protestDays),
      pagador: {
        numeroCpfCnpj: normalizedPayerDocument,
        nome: normalizeText(input.payer.name),
        endereco: normalizeText(input.payer.addressLine1),
        bairro: normalizeText(input.payer.neighborhood),
        cidade: normalizeText(input.payer.city),
        cep: normalizeDigits(input.payer.postalCode),
        uf: normalizeText(input.payer.state),
        ...(input.payer.email
          ? {
              email: String(input.payer.email).trim().toLowerCase(),
            }
          : {}),
      },
      ...(instructions.length
        ? {
            mensagensInstrucao: instructions,
          }
        : {}),
      gerarPdf: true,
      codigoCadastrarPIX: registerPixCode,
      ...(normalizeDigits(config.contractNumber)
        ? {
            numeroContratoCobranca: Number(normalizeDigits(config.contractNumber)),
          }
        : {}),
    };

    const environment = this.resolveEnvironment(config.environment);
    const payloadJson = JSON.stringify(payload);
    const response = await this.invokePowerShellIssueRequest({
      clientId: config.clientId,
      certificateBase64: config.certificateBase64,
      certificatePassword: config.certificatePassword,
      url: `${environment.billingBaseUrl}/boletos`,
      scope: "boletos_inclusao",
      payloadJson,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new SicoobApiError(
        response.statusCode,
        response.body,
        this.parseApiMessage(
          response.body,
          "A emissão do boleto no Sicoob foi rejeitada.",
        ),
      );
    }

    const parsed = JSON.parse(response.body);
    const result = parsed?.resultado || {};

    return {
      nossoNumero: normalizeDigits(String(result?.nossoNumero || "")),
      seuNumero: String(result?.seuNumero || "").trim() || null,
      linhaDigitavel: String(result?.linhaDigitavel || "").trim() || null,
      codigoBarras: String(result?.codigoBarras || "").trim() || null,
      qrCode: String(result?.qrCode || "").trim() || null,
      pdfBoleto: String(result?.pdfBoleto || "").trim() || null,
      numeroContratoCobranca:
        normalizeDigits(String(result?.numeroContratoCobranca || "")) || null,
      rawResponseJson: response.body,
      payloadJson,
    };
  }

  async downloadMovements(
    config: Pick<
      SicoobBankConfig,
      "clientId" | "certificateBase64" | "certificatePassword"
    >,
    input: DownloadSicoobMovementsInput,
  ): Promise<DownloadSicoobMovementsResult> {
    if (!input.numeroCliente || input.numeroCliente <= 0) {
      throw new Error("Número do cliente inválido para consultar movimentações.");
    }

    const result = await this.invokePowerShellDownloadRequest({
      clientId: config.clientId,
      certificateBase64: config.certificateBase64,
      certificatePassword: config.certificatePassword,
      numeroCliente: input.numeroCliente,
      tipoMovimento: input.tipoMovimento,
      dataInicial: input.dataInicial,
      dataFinal: input.dataFinal,
      maxAttempts: input.maxAttempts,
      sleepMilliseconds: input.sleepMilliseconds,
    });

    if (Number(result?.statusCode || 0) >= 400 && result?.kind !== "SUCCESS") {
      throw new SicoobApiError(
        Number(result?.statusCode || 500),
        String(result?.body || ""),
        String(
          result?.message ||
            "A consulta de movimentações do Sicoob foi rejeitada.",
        ),
      );
    }

    return {
      codigoSolicitacao: Number(result?.codigoSolicitacao || 0),
      totalRegistros: Number(result?.totalRegistros || 0),
      idArquivos: Array.isArray(result?.idArquivos)
        ? result.idArquivos
            .map((item: unknown) => Number(item))
            .filter((item: number) => Number.isInteger(item) && item > 0)
        : [],
      records: Array.isArray(result?.records)
        ? result.records.map((item: unknown) => ({ ...(item as object) }))
        : [],
    };
  }
}
