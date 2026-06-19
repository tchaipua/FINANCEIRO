import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  dateToDateOnly,
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  ChangeBankStatusDto,
  GetBankDto,
  GetBankDdaDto,
  GetBankStatementDto,
  ImportBankStatementOfxDto,
  ListBanksDto,
  ReconcileBankStatementMovementDto,
  ReviewBankStatementMovementDto,
  ReviewBankStatementMovementsDto,
  SaveBankDto,
} from "./dto/banks.dto";
import {
  DownloadSicoobStatementResult,
  SicoobBankStatementService,
  SicoobStatementApiError,
  SicoobStatementTransaction,
} from "./sicoob-bank-statement.service";
import {
  DownloadSicoobDdaResult,
  SicoobDdaApiError,
  SicoobDdaBoleto,
  SicoobDdaService,
} from "./sicoob-dda.service";

type NormalizedBankPayload = {
  bankCode: string;
  bankName: string;
  branchNumber: string;
  branchDigit: string;
  accountNumber: string;
  accountDigit: string;
  walletCode: string | null;
  agreementCode: string | null;
  pixKey: string | null;
  beneficiaryName: string | null;
  beneficiaryDocument: string | null;
  billingProvider: string | null;
  billingEnvironment: string | null;
  billingApiClientId: string | null;
  billingApiClientSecret: string | null;
  billingCertificateBase64: string | null;
  billingCertificatePassword: string | null;
  billingBeneficiaryCode: string | null;
  billingWalletVariation: string | null;
  billingContractNumber: string | null;
  billingModalityCode: string | null;
  billingDocumentSpeciesCode: string | null;
  billingAcceptanceCode: string | null;
  billingIssueTypeCode: string | null;
  billingDistributionTypeCode: string | null;
  billingNextBoletoNumber: number | null;
  billingRegisterPixCode: number | null;
  billingInstructionLine1: string | null;
  billingInstructionLine2: string | null;
  billingDefaultFinePercent: number | null;
  billingDefaultInterestPercent: number | null;
  billingDefaultDiscountPercent: number | null;
  billingProtestDays: number | null;
  billingNegativeDays: number | null;
  notes: string | null;
};

type MappedBankStatementMovement = {
  id: string;
  externalId: string;
  occurredAt: string;
  description: string;
  detailLines: string[];
  documentNumber: string | null;
  movementType: string;
  amount: number;
  balanceAfter: number | null;
  status: string;
  reviewStatus?: string;
  isReviewed?: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rawPayloadJson: string;
};

type MappedBankStatement = {
  provider: string;
  bankAccountId: string;
  bankAccountLabel: string;
  periodStart: string;
  periodEnd: string;
  currentBalance: number | null;
  creditAmount: number;
  debitAmount: number;
  movementCount: number;
  months: Array<{
    month: number;
    year: number;
    statusCode: number;
  }>;
  pulledAt: string;
  movements: MappedBankStatementMovement[];
  message: string;
};

type MappedBankDdaItem = {
  id: string;
  externalId: string;
  dueDate: string | null;
  issueDate: string | null;
  beneficiaryName: string;
  beneficiaryDocument: string | null;
  payerName: string | null;
  payerDocument: string | null;
  documentNumber: string | null;
  digitableLine: string | null;
  barcode: string | null;
  amount: number;
  status: string;
  rawPayloadJson: string;
};

type MappedBankDda = {
  provider: string;
  bankAccountId: string;
  bankAccountLabel: string;
  accountNumber: number;
  ddaCount: number;
  openAmount: number;
  pulledAt: string;
  scope: string | null;
  items: MappedBankDdaItem[];
  message: string;
};

type StatementRequestedByInput = {
  requestedBy?: string | null;
  cashierUserId?: string | null;
  cashierDisplayName?: string | null;
};

type ParsedOfxStatementTransaction = {
  fitId: string | null;
  trnType: string | null;
  postedAt: Date;
  amount: number;
  memo: string | null;
  name: string | null;
  checkNumber: string | null;
  referenceNumber: string | null;
  rawBlock: string;
};

type ParsedOfxStatement = {
  bankId: string | null;
  accountId: string | null;
  accountType: string | null;
  ledgerBalance: number | null;
  transactions: ParsedOfxStatementTransaction[];
};

type PersistedStatementMovement = {
  id: string;
  occurredAt: Date;
  description: string;
  rawPayloadJson?: string | null;
  documentNumber: string | null;
  movementType: string;
  amount: number;
  balanceAfter: number | null;
  reconciliationStatus: string;
  reviewStatus: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};

@Injectable()
export class BanksService {
  private readonly sicoobBankStatementService: SicoobBankStatementService;
  private readonly sicoobDdaService: SicoobDdaService;

  constructor(
    private readonly prisma: PrismaService,
    sicoobBankStatementService?: SicoobBankStatementService,
    sicoobDdaService?: SicoobDdaService,
  ) {
    this.sicoobBankStatementService =
      sicoobBankStatementService || new SicoobBankStatementService();
    this.sicoobDdaService = sicoobDdaService || new SicoobDdaService();
  }

  private normalizeOptionalRawText(value: string | null | undefined) {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  private normalizeRequiredText(value: string | null | undefined, label: string) {
    const normalized = normalizeText(value);
    if (!normalized) {
      throw new BadRequestException(`Informe ${label}.`);
    }

    return normalized;
  }

  private normalizeRequiredDigits(
    value: string | null | undefined,
    label: string,
  ) {
    const normalized = normalizeDigits(value);
    if (!normalized) {
      throw new BadRequestException(`Informe ${label}.`);
    }

    return normalized;
  }

  private parseDateOnly(value?: string | null, label = "a data") {
    const normalized = String(value || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(`Informe ${label} válida.`);
    }

    const [year, month, day] = normalized.split("-").map((item) => Number(item));
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException(`Informe ${label} válida.`);
    }

    return parsed;
  }

  private parseStatementPeriod(periodStart?: string | null, periodEnd?: string | null) {
    const parsedStart = this.parseDateOnly(periodStart, "a data inicial");
    const parsedEnd = this.parseDateOnly(periodEnd, "a data final");

    if (parsedStart > parsedEnd) {
      throw new BadRequestException(
        "A data inicial do extrato bancário não pode ser maior que a data final.",
      );
    }

    const rangeInDays =
      Math.floor(
        (parsedEnd.getTime() - parsedStart.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1;

    if (rangeInDays > 93) {
      throw new BadRequestException(
        "Consulte no máximo 3 meses por vez no extrato bancário do Sicoob.",
      );
    }

    return {
      parsedStart,
      parsedEnd,
      periodStart: dateToDateOnly(parsedStart)!,
      periodEnd: dateToDateOnly(parsedEnd)!,
      rangeInDays,
    };
  }

  private buildSicoobAccountNumber(bank: {
    accountNumber: string;
    accountDigit?: string | null;
  }) {
    return normalizeDigits(`${bank.accountNumber || ""}${bank.accountDigit || ""}`);
  }

  private normalizeStatementDirection(transaction: SicoobStatementTransaction) {
    const normalizedType = normalizeText(transaction.tipo);
    const amount = Number(transaction.valor || 0);

    if (
      normalizedType === "D" ||
      normalizedType === "DEBITO" ||
      normalizedType === "DÉBITO" ||
      normalizedType?.includes("DEB") ||
      amount < 0
    ) {
      return "DEBIT";
    }

    return "CREDIT";
  }

  private parseStatementDate(value?: string | null) {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private buildStatementMovementBaseKey(transaction: SicoobStatementTransaction) {
    return [
      transaction.data || "",
      transaction.dataLote || "",
      normalizeText(transaction.numeroDocumento) || "",
      normalizeText(transaction.descricao) || "",
      normalizeText(transaction.descInfComplementar) || "",
      normalizeText(transaction.tipo) || "",
      roundMoney(Math.abs(Number(transaction.valor || 0))),
    ].join("|");
  }

  private buildStatementMovementExternalId(
    bankAccountId: string,
    transaction: SicoobStatementTransaction,
    occurrence: number,
  ) {
    return createHash("sha1")
      .update([bankAccountId, this.buildStatementMovementBaseKey(transaction), occurrence].join("|"))
      .digest("hex");
  }

  private decodeOfxText(value?: string | null) {
    const normalized = String(value || "").trim();

    if (!normalized) {
      return null;
    }

    return normalized
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  }

  private readOfxTag(block: string, tag: string) {
    const normalizedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const closedMatch = block.match(
      new RegExp(`<${normalizedTag}>\\s*([\\s\\S]*?)\\s*</${normalizedTag}>`, "i"),
    );

    if (closedMatch) {
      return this.decodeOfxText(closedMatch[1]);
    }

    const openMatch = block.match(
      new RegExp(`<${normalizedTag}>\\s*([^\\r\\n<]*)`, "i"),
    );

    return openMatch ? this.decodeOfxText(openMatch[1]) : null;
  }

  private readOfxBlocks(content: string, tag: string) {
    const normalizedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blocks: string[] = [];
    const matcher = new RegExp(
      `<${normalizedTag}>\\s*([\\s\\S]*?)\\s*</${normalizedTag}>`,
      "gi",
    );
    let match: RegExpExecArray | null;

    while ((match = matcher.exec(content)) !== null) {
      blocks.push(match[1]);
    }

    return blocks;
  }

  private parseOfxDate(value?: string | null) {
    const normalized = String(value || "").trim();
    const match = normalized.match(
      /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?/,
    );

    if (!match) {
      return null;
    }

    const parsed = new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || "12"),
        Number(match[5] || "0"),
        Number(match[6] || "0"),
      ),
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseOfxAmount(value?: string | null) {
    const normalized = String(value || "").trim().replace(",", ".");

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeOfxDirection(transaction: ParsedOfxStatementTransaction) {
    const normalizedType = normalizeText(transaction.trnType);

    if (
      transaction.amount < 0 ||
      [
        "ATM",
        "CHECK",
        "DEBIT",
        "FEE",
        "PAYMENT",
        "POS",
        "SRVCHG",
        "XFER",
      ].includes(normalizedType || "")
    ) {
      return "DEBIT";
    }

    return "CREDIT";
  }

  private buildOfxMovementExternalId(
    bankAccountId: string,
    transaction: ParsedOfxStatementTransaction,
    occurrence: number,
  ) {
    const fitId = normalizeText(transaction.fitId);

    if (fitId) {
      return `OFX:${fitId}`;
    }

    return createHash("sha1")
      .update(
        [
          "OFX",
          bankAccountId,
          transaction.postedAt.toISOString(),
          roundMoney(Math.abs(transaction.amount)),
          normalizeText(transaction.memo),
          normalizeText(transaction.name),
          normalizeText(transaction.checkNumber),
          normalizeText(transaction.referenceNumber),
          occurrence,
        ].join("|"),
      )
      .digest("hex");
  }

  private parseOfxStatementContent(content: string): ParsedOfxStatement {
    const normalizedContent = String(content || "").replace(/^\uFEFF/, "").trim();

    if (!normalizedContent) {
      throw new BadRequestException("Informe o conteúdo do arquivo OFX.");
    }

    if (normalizedContent.length > 5 * 1024 * 1024) {
      throw new BadRequestException("Arquivo OFX muito grande para importação.");
    }

    if (!/<OFX[\s>]/i.test(normalizedContent)) {
      throw new BadRequestException("Arquivo OFX inválido.");
    }

    const transactionBlocks = this.readOfxBlocks(normalizedContent, "STMTTRN");
    if (!transactionBlocks.length) {
      throw new BadRequestException("Nenhum lançamento STMTTRN encontrado no OFX.");
    }

    const ledgerBalanceBlock = this.readOfxBlocks(
      normalizedContent,
      "LEDGERBAL",
    )[0];
    const transactions = transactionBlocks.map((block) => {
      const postedAt = this.parseOfxDate(this.readOfxTag(block, "DTPOSTED"));
      const amount = this.parseOfxAmount(this.readOfxTag(block, "TRNAMT"));

      if (!postedAt) {
        throw new BadRequestException("Arquivo OFX contém lançamento sem data válida.");
      }

      if (amount === null) {
        throw new BadRequestException("Arquivo OFX contém lançamento sem valor válido.");
      }

      return {
        fitId: this.readOfxTag(block, "FITID"),
        trnType: this.readOfxTag(block, "TRNTYPE"),
        postedAt,
        amount,
        memo: this.readOfxTag(block, "MEMO"),
        name: this.readOfxTag(block, "NAME"),
        checkNumber: this.readOfxTag(block, "CHECKNUM"),
        referenceNumber: this.readOfxTag(block, "REFNUM"),
        rawBlock: block.trim(),
      };
    });

    return {
      bankId: this.readOfxTag(normalizedContent, "BANKID"),
      accountId: this.readOfxTag(normalizedContent, "ACCTID"),
      accountType: this.readOfxTag(normalizedContent, "ACCTTYPE"),
      ledgerBalance: ledgerBalanceBlock
        ? this.parseOfxAmount(this.readOfxTag(ledgerBalanceBlock, "BALAMT"))
        : null,
      transactions,
    };
  }

  private buildBankAccountLabel(bank: {
    bankName: string;
    branchNumber: string;
    branchDigit?: string | null;
    accountNumber: string;
    accountDigit?: string | null;
  }) {
    return `${bank.bankName} - AG ${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ""} - CC ${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ""}`;
  }

  private parseDdaDateOnly(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
      return normalized.slice(0, 10);
    }

    const brDate = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brDate) {
      return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return normalized;
    }

    return dateToDateOnly(parsed);
  }

  private buildDdaExternalId(
    bankAccountId: string,
    item: SicoobDdaBoleto,
    index: number,
  ) {
    return createHash("sha1")
      .update(
        [
          bankAccountId,
          normalizeText(item.id),
          normalizeText(item.digitableLine),
          normalizeText(item.barcode),
          normalizeText(item.documentNumber),
          this.parseDdaDateOnly(item.dueDate),
          roundMoney(Math.abs(Number(item.amount || 0))),
          index,
        ].join("|"),
      )
      .digest("hex");
  }

  private mapSicoobDda(
    bank: {
      id: string;
      bankName: string;
      branchNumber: string;
      branchDigit?: string | null;
      accountNumber: string;
      accountDigit?: string | null;
    },
    result: DownloadSicoobDdaResult,
  ): MappedBankDda {
    const bankAccountLabel = this.buildBankAccountLabel(bank);
    const items = result.items.map((item, index) => {
      const externalId = this.buildDdaExternalId(bank.id, item, index + 1);
      const amount = roundMoney(Math.abs(Number(item.amount || 0)));

      return {
        id: externalId,
        externalId,
        dueDate: this.parseDdaDateOnly(item.dueDate),
        issueDate: this.parseDdaDateOnly(item.issueDate),
        beneficiaryName:
          normalizeText(item.beneficiaryName) || "BENEFICIÁRIO NÃO INFORMADO",
        beneficiaryDocument: normalizeDigits(item.beneficiaryDocument) || null,
        payerName: normalizeText(item.payerName) || null,
        payerDocument: normalizeDigits(item.payerDocument) || null,
        documentNumber: normalizeText(item.documentNumber) || null,
        digitableLine: String(item.digitableLine || "").trim() || null,
        barcode: normalizeDigits(item.barcode) || null,
        amount,
        status: normalizeText(item.status) || "EM ABERTO",
        rawPayloadJson: item.rawPayloadJson || JSON.stringify(item),
      };
    });

    const openAmount = roundMoney(
      items.reduce((total, item) => total + item.amount, 0),
    );

    return {
      provider: "SICOOB",
      bankAccountId: bank.id,
      bankAccountLabel,
      accountNumber: result.accountNumber,
      ddaCount: items.length,
      openAmount,
      pulledAt: result.pulledAt,
      scope: result.scope,
      items,
      message:
        items.length === 1
          ? "1 DDA em aberto encontrado no Sicoob."
          : `${items.length} DDAs em aberto encontrados no Sicoob.`,
    };
  }

  private buildStatementDateBounds(period: {
    periodStart: string;
    periodEnd: string;
  }) {
    return {
      start: new Date(`${period.periodStart}T00:00:00.000Z`),
      end: new Date(`${period.periodEnd}T23:59:59.999Z`),
    };
  }

  private buildStatementDetailLines(payload?: {
    descInfComplementar?: string | null;
    cpfCnpj?: string | null;
  }) {
    const detailLines = [
      ...String(payload?.descInfComplementar || "")
        .split(/\r?\n/g)
        .map((line) => normalizeText(line))
        .filter((line): line is string => Boolean(line)),
      normalizeText(payload?.cpfCnpj),
    ].filter((line): line is string => Boolean(line));

    return Array.from(new Set(detailLines));
  }

  private parseStatementRawPayload(rawPayloadJson?: string | null) {
    if (!rawPayloadJson) {
      return null;
    }

    try {
      return JSON.parse(rawPayloadJson) as SicoobStatementTransaction;
    } catch {
      return null;
    }
  }

  private applyRunningStatementBalances<
    T extends {
      movementType: string;
      amount: number;
      balanceAfter: number | null;
    },
  >(movements: T[], finalBalance?: number | null) {
    if (typeof finalBalance !== "number") {
      return movements;
    }

    let nextBalance = roundMoney(finalBalance);

    for (let index = movements.length - 1; index >= 0; index -= 1) {
      const movement = movements[index];
      movement.balanceAfter = nextBalance;
      nextBalance = roundMoney(
        movement.movementType === "DEBIT"
          ? nextBalance + movement.amount
          : nextBalance - movement.amount,
      );
    }

    return movements;
  }

  private mapSicoobStatement(
    bank: {
      id: string;
      bankName: string;
      branchNumber: string;
      branchDigit?: string | null;
      accountNumber: string;
      accountDigit?: string | null;
    },
    period: {
      periodStart: string;
      periodEnd: string;
    },
    result: DownloadSicoobStatementResult,
  ): MappedBankStatement {
    const bankAccountLabel = this.buildBankAccountLabel(bank);
    const orderedTransactions = [...result.transactions].sort((left, right) => {
      const leftDate = this.parseStatementDate(left.data)?.getTime() || 0;
      const rightDate = this.parseStatementDate(right.data)?.getTime() || 0;
      return leftDate - rightDate;
    });
    const occurrenceByBaseKey = new Map<string, number>();

    const movements = orderedTransactions.map((transaction, index) => {
      const movementType = this.normalizeStatementDirection(transaction);
      const amount = roundMoney(Math.abs(Number(transaction.valor || 0)));
      const occurredAt =
        this.parseStatementDate(transaction.data)?.toISOString() ||
        this.parseStatementDate(transaction.dataLote)?.toISOString() ||
        `${period.periodStart}T12:00:00.000Z`;
      const baseKey = this.buildStatementMovementBaseKey(transaction);
      const occurrence = (occurrenceByBaseKey.get(baseKey) || 0) + 1;
      occurrenceByBaseKey.set(baseKey, occurrence);
      const externalId = this.buildStatementMovementExternalId(
        bank.id,
        transaction,
        occurrence,
      );

      return {
        id: externalId,
        externalId,
        occurredAt,
        description:
          normalizeText(transaction.descricao) ||
          normalizeText(transaction.descInfComplementar) ||
          "LANÇAMENTO BANCÁRIO",
        detailLines: this.buildStatementDetailLines(transaction),
        documentNumber:
          normalizeText(transaction.numeroDocumento) || null,
        movementType,
        amount,
        balanceAfter: null,
        status: "PENDENTE",
        rawPayloadJson: JSON.stringify(transaction),
      };
    });
    this.applyRunningStatementBalances(movements, result.balance);

    const creditAmount = roundMoney(
      movements
        .filter((movement) => movement.movementType === "CREDIT")
        .reduce((total, movement) => total + movement.amount, 0),
    );
    const debitAmount = roundMoney(
      movements
        .filter((movement) => movement.movementType === "DEBIT")
        .reduce((total, movement) => total + movement.amount, 0),
    );

    return {
      provider: "SICOOB",
      bankAccountId: bank.id,
      bankAccountLabel,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      currentBalance:
        typeof result.balance === "number" ? roundMoney(result.balance) : null,
      creditAmount,
      debitAmount,
      movementCount: movements.length,
      months: result.months,
      pulledAt: new Date().toISOString(),
      movements,
      message:
        movements.length === 1
          ? "1 lançamento de extrato bancário encontrado no Sicoob."
          : `${movements.length} lançamentos de extrato bancário encontrados no Sicoob.`,
    };
  }

  private mapOfxStatement(
    bank: {
      id: string;
      bankName: string;
      branchNumber: string;
      branchDigit?: string | null;
      accountNumber: string;
      accountDigit?: string | null;
    },
    period: {
      periodStart: string;
      periodEnd: string;
    },
    payload: ImportBankStatementOfxDto,
  ): MappedBankStatement {
    const parsedStatement = this.parseOfxStatementContent(payload.ofxContent);
    const dateBounds = this.buildStatementDateBounds(period);
    const bankAccountLabel = this.buildBankAccountLabel(bank);
    const orderedTransactions = parsedStatement.transactions
      .filter(
        (transaction) =>
          transaction.postedAt >= dateBounds.start &&
          transaction.postedAt <= dateBounds.end,
      )
      .sort(
        (left, right) => left.postedAt.getTime() - right.postedAt.getTime(),
      );
    const occurrenceByBaseKey = new Map<string, number>();

    const movements = orderedTransactions.map((transaction) => {
      const movementType = this.normalizeOfxDirection(transaction);
      const amount = roundMoney(Math.abs(transaction.amount));
      const baseKey = [
        normalizeText(transaction.fitId),
        transaction.postedAt.toISOString(),
        amount,
        normalizeText(transaction.memo),
        normalizeText(transaction.name),
        normalizeText(transaction.checkNumber),
        normalizeText(transaction.referenceNumber),
      ].join("|");
      const occurrence = (occurrenceByBaseKey.get(baseKey) || 0) + 1;
      occurrenceByBaseKey.set(baseKey, occurrence);
      const externalId = this.buildOfxMovementExternalId(
        bank.id,
        transaction,
        occurrence,
      );
      const description =
        normalizeText(transaction.memo) ||
        normalizeText(transaction.name) ||
        "LANÇAMENTO BANCÁRIO OFX";
      const detailLines = [
        transaction.name ? `NOME: ${normalizeText(transaction.name)}` : null,
        transaction.trnType ? `TIPO OFX: ${normalizeText(transaction.trnType)}` : null,
        transaction.fitId ? `FITID: ${normalizeText(transaction.fitId)}` : null,
        transaction.referenceNumber
          ? `REF: ${normalizeText(transaction.referenceNumber)}`
          : null,
      ].filter((line): line is string => Boolean(line));

      return {
        id: externalId,
        externalId,
        occurredAt: transaction.postedAt.toISOString(),
        description,
        detailLines,
        documentNumber:
          normalizeText(transaction.checkNumber) ||
          normalizeText(transaction.referenceNumber) ||
          null,
        movementType,
        amount,
        balanceAfter: null,
        status: "PENDENTE",
        rawPayloadJson: JSON.stringify({
          source: "OFX",
          fileName: normalizeText(payload.fileName) || null,
          bankId: normalizeText(parsedStatement.bankId) || null,
          accountId: normalizeText(parsedStatement.accountId) || null,
          accountType: normalizeText(parsedStatement.accountType) || null,
          fitId: normalizeText(transaction.fitId) || null,
          trnType: normalizeText(transaction.trnType) || null,
          memo: normalizeText(transaction.memo) || null,
          name: normalizeText(transaction.name) || null,
          checkNumber: normalizeText(transaction.checkNumber) || null,
          referenceNumber: normalizeText(transaction.referenceNumber) || null,
          descInfComplementar: detailLines.join("\n"),
          rawBlock: transaction.rawBlock,
        }),
      };
    });
    this.applyRunningStatementBalances(movements, parsedStatement.ledgerBalance);

    const creditAmount = roundMoney(
      movements
        .filter((movement) => movement.movementType === "CREDIT")
        .reduce((total, movement) => total + movement.amount, 0),
    );
    const debitAmount = roundMoney(
      movements
        .filter((movement) => movement.movementType === "DEBIT")
        .reduce((total, movement) => total + movement.amount, 0),
    );

    return {
      provider: "OFX",
      bankAccountId: bank.id,
      bankAccountLabel,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      currentBalance:
        typeof parsedStatement.ledgerBalance === "number"
          ? roundMoney(parsedStatement.ledgerBalance)
          : null,
      creditAmount,
      debitAmount,
      movementCount: movements.length,
      months: [],
      pulledAt: new Date().toISOString(),
      movements,
      message:
        movements.length === 1
          ? "1 lançamento de extrato bancário encontrado no OFX."
          : `${movements.length} lançamentos de extrato bancário encontrados no OFX.`,
    };
  }

  private resolveStatementRequestedBy(query: StatementRequestedByInput) {
    return (
      normalizeText(query.requestedBy) ||
      normalizeText(query.cashierDisplayName) ||
      normalizeText(query.cashierUserId) ||
      "SISTEMA"
    );
  }

  private mapPersistedStatementMovement(movement: PersistedStatementMovement) {
    const rawPayload = this.parseStatementRawPayload(movement.rawPayloadJson);

    return {
      id: movement.id,
      occurredAt: movement.occurredAt.toISOString(),
      description: movement.description,
      detailLines: this.buildStatementDetailLines(rawPayload || undefined),
      documentNumber: movement.documentNumber,
      movementType: movement.movementType,
      amount: movement.amount,
      balanceAfter: movement.balanceAfter,
      status:
        movement.reconciliationStatus === "PENDING"
          ? "PENDENTE"
          : movement.reconciliationStatus === "RECONCILED"
            ? "CONCILIADO"
          : movement.reconciliationStatus,
      reviewStatus:
        movement.reviewStatus === "REVIEWED"
          ? "CONFERIDO"
          : "NAO_CONFERIDO",
      isReviewed: movement.reviewStatus === "REVIEWED",
      reviewedAt: movement.reviewedAt?.toISOString() || null,
      reviewedBy: movement.reviewedBy || null,
    };
  }

  private buildPersistedStatementMessage(
    movementCount: number,
    createdMovementCount: number,
    duplicateMovementCount: number,
    provider = "SICOOB",
  ) {
    const sourceDescription = normalizeText(provider) === "OFX" ? "no OFX" : "no Sicoob";
    const foundMessage =
      movementCount === 1
        ? `1 lançamento de extrato bancário encontrado ${sourceDescription}.`
        : `${movementCount} lançamentos de extrato bancário encontrados ${sourceDescription}.`;

    if (!movementCount) {
      return `Nenhum lançamento de extrato bancário encontrado ${sourceDescription} para o período informado.`;
    }

    if (duplicateMovementCount > 0) {
      return `${foundMessage} ${createdMovementCount} novo(s) gravado(s) e ${duplicateMovementCount} já existente(s) mantido(s).`;
    }

    return `${foundMessage} ${createdMovementCount} lançamento(s) gravado(s) no Financeiro.`;
  }

  private async persistSicoobStatement(
    company: {
      id: string;
      sourceSystem: string;
      sourceTenantId: string;
    },
    bank: {
      id: string;
      branchCode: number;
    },
    period: {
      parsedStart: Date;
      parsedEnd: Date;
      periodStart: string;
      periodEnd: string;
    },
    mappedStatement: MappedBankStatement,
    query: GetBankStatementDto,
  ) {
    const requestedBy = this.resolveStatementRequestedBy(query);
    const pulledAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const importSession = await tx.bankStatementImport.create({
        data: {
          companyId: company.id,
          branchCode: bank.branchCode,
          bankAccountId: bank.id,
          provider: mappedStatement.provider,
          periodStart: period.parsedStart,
          periodEnd: period.parsedEnd,
          pulledAt,
          importedMovementCount: mappedStatement.movementCount,
          creditAmount: mappedStatement.creditAmount,
          debitAmount: mappedStatement.debitAmount,
          currentBalance: mappedStatement.currentBalance,
          status: "IMPORTED",
          requestSnapshotJson: JSON.stringify({
            sourceSystem: company.sourceSystem,
            sourceTenantId: company.sourceTenantId,
            bankAccountId: bank.id,
            provider: mappedStatement.provider,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            months: mappedStatement.months,
          }),
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      let createdMovementCount = 0;
      let duplicateMovementCount = 0;
      const persistedMovements: PersistedStatementMovement[] = [];

      for (const movement of mappedStatement.movements) {
        const occurredAt = new Date(movement.occurredAt);
        const existingMovement = await tx.bankStatementMovement.findUnique({
          where: {
            companyId_bankAccountId_externalId: {
              companyId: company.id,
              bankAccountId: bank.id,
              externalId: movement.externalId,
            },
          },
        });

        const movementData = {
          lastImportId: importSession.id,
          provider: mappedStatement.provider,
          occurredAt,
          description: movement.description,
          documentNumber: movement.documentNumber,
          movementType: movement.movementType,
          amount: movement.amount,
          balanceAfter: movement.balanceAfter,
          rawPayloadJson: movement.rawPayloadJson,
          updatedBy: requestedBy,
        };

        if (existingMovement) {
          duplicateMovementCount += 1;
          persistedMovements.push(
            await tx.bankStatementMovement.update({
              where: {
                id: existingMovement.id,
              },
              data: movementData,
            }),
          );
          continue;
        }

        createdMovementCount += 1;
        persistedMovements.push(
          await tx.bankStatementMovement.create({
            data: {
              companyId: company.id,
              branchCode: bank.branchCode,
              bankAccountId: bank.id,
              firstImportId: importSession.id,
              externalId: movement.externalId,
              reconciliationStatus: "PENDING",
              createdBy: requestedBy,
              ...movementData,
            },
          }),
        );
      }

      const sortedMovements = persistedMovements.sort(
        (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
      );
      const persistedMovementCount = sortedMovements.length;
      const message = this.buildPersistedStatementMessage(
        mappedStatement.movementCount,
        createdMovementCount,
        duplicateMovementCount,
        mappedStatement.provider,
      );
      const summary = {
        provider: mappedStatement.provider,
        bankAccountId: bank.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        movementCount: mappedStatement.movementCount,
        persistedMovementCount,
        createdMovementCount,
        duplicateMovementCount,
        creditAmount: mappedStatement.creditAmount,
        debitAmount: mappedStatement.debitAmount,
        currentBalance: mappedStatement.currentBalance,
        pulledAt: pulledAt.toISOString(),
      };

      await tx.bankStatementImport.update({
        where: {
          id: importSession.id,
        },
        data: {
          createdMovementCount,
          duplicateMovementCount,
          summaryJson: JSON.stringify(summary),
          updatedBy: requestedBy,
        },
      });

      return {
        ...mappedStatement,
        importSessionId: importSession.id,
        persistedMovementCount,
        createdMovementCount,
        duplicateMovementCount,
        pulledAt: pulledAt.toISOString(),
        message,
        movements: sortedMovements.map((movement) =>
          this.mapPersistedStatementMovement(movement),
        ),
      };
    });
  }

  private normalizeOptionalPercent(
    value: number | null | undefined,
    label: string,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`Informe ${label} válida.`);
    }

    return Number(normalized.toFixed(2));
  }

  private normalizeOptionalInteger(
    value: number | null | undefined,
    label: string,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = Number(value);
    if (
      !Number.isFinite(normalized) ||
      !Number.isInteger(normalized) ||
      normalized < 0
    ) {
      throw new BadRequestException(`Informe ${label} válido.`);
    }

    return normalized;
  }

  private buildNormalizedPayload(payload: SaveBankDto): NormalizedBankPayload {
    return {
      bankCode: this.normalizeRequiredDigits(payload.bankCode, "o código do banco"),
      bankName: this.normalizeRequiredText(payload.bankName, "o nome do banco"),
      branchNumber: this.normalizeRequiredDigits(
        payload.branchNumber,
        "a agência",
      ),
      branchDigit: normalizeDigits(payload.branchDigit) || "",
      accountNumber: this.normalizeRequiredDigits(
        payload.accountNumber,
        "a conta",
      ),
      accountDigit: normalizeDigits(payload.accountDigit) || "",
      walletCode: normalizeText(payload.walletCode),
      agreementCode: normalizeText(payload.agreementCode),
      pixKey: normalizeText(payload.pixKey),
      beneficiaryName: normalizeText(payload.beneficiaryName),
      beneficiaryDocument: normalizeDigits(payload.beneficiaryDocument),
      billingProvider: normalizeText(payload.billingProvider),
      billingEnvironment: normalizeText(payload.billingEnvironment),
      billingApiClientId: this.normalizeOptionalRawText(payload.billingApiClientId),
      billingApiClientSecret: this.normalizeOptionalRawText(
        payload.billingApiClientSecret,
      ),
      billingCertificateBase64: this.normalizeOptionalRawText(
        payload.billingCertificateBase64,
      ),
      billingCertificatePassword: this.normalizeOptionalRawText(
        payload.billingCertificatePassword,
      ),
      billingBeneficiaryCode: normalizeText(payload.billingBeneficiaryCode),
      billingWalletVariation: normalizeText(payload.billingWalletVariation),
      billingContractNumber: normalizeText(payload.billingContractNumber),
      billingModalityCode: normalizeText(payload.billingModalityCode),
      billingDocumentSpeciesCode: normalizeText(
        payload.billingDocumentSpeciesCode,
      ),
      billingAcceptanceCode: normalizeText(payload.billingAcceptanceCode),
      billingIssueTypeCode: normalizeText(payload.billingIssueTypeCode),
      billingDistributionTypeCode: normalizeText(
        payload.billingDistributionTypeCode,
      ),
      billingNextBoletoNumber: this.normalizeOptionalInteger(
        payload.billingNextBoletoNumber,
        "o próximo boleto",
      ),
      billingRegisterPixCode: this.normalizeOptionalInteger(
        payload.billingRegisterPixCode,
        "o código de PIX",
      ),
      billingInstructionLine1: normalizeText(payload.billingInstructionLine1),
      billingInstructionLine2: normalizeText(payload.billingInstructionLine2),
      billingDefaultFinePercent: this.normalizeOptionalPercent(
        payload.billingDefaultFinePercent,
        "a multa padrão",
      ),
      billingDefaultInterestPercent: this.normalizeOptionalPercent(
        payload.billingDefaultInterestPercent,
        "o juro padrão",
      ),
      billingDefaultDiscountPercent: this.normalizeOptionalPercent(
        payload.billingDefaultDiscountPercent,
        "o desconto padrão",
      ),
      billingProtestDays: this.normalizeOptionalInteger(
        payload.billingProtestDays,
        "os dias de protesto",
      ),
      billingNegativeDays: this.normalizeOptionalInteger(
        payload.billingNegativeDays,
        "os dias de negativação",
      ),
      notes: normalizeText(payload.notes),
    };
  }

  private async findCompany(sourceSystem: string, sourceTenantId: string) {
    return this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: this.normalizeRequiredText(
            sourceSystem,
            "o sistema de origem",
          ),
          sourceTenantId: this.normalizeRequiredText(
            sourceTenantId,
            "o tenant de origem",
          ),
        },
      },
    });
  }

  private async resolveOrCreateCompany(payload: SaveBankDto) {
    const normalizedSourceSystem = this.normalizeRequiredText(
      payload.sourceSystem,
      "o sistema de origem",
    );
    const normalizedSourceTenantId = this.normalizeRequiredText(
      payload.sourceTenantId,
      "o tenant de origem",
    );

    const existingCompany = await this.findCompany(
      normalizedSourceSystem,
      normalizedSourceTenantId,
    );

    if (existingCompany) {
      return existingCompany;
    }

    const normalizedCompanyName =
      normalizeText(payload.companyName) ||
      `EMPRESA ${normalizedSourceTenantId}`;

    return this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        name: normalizedCompanyName,
        document: normalizeDigits(payload.companyDocument),
        status: "ACTIVE",
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  private mapBank(bank: any, includeSecrets = false) {
    const normalizedProvider = normalizeText(bank.billingProvider);
    const hasBillingApiCredentials =
      normalizedProvider === "SICOOB"
        ? Boolean(bank.billingApiClientId)
        : Boolean(bank.billingApiClientId && bank.billingApiClientSecret);
    const latestStatementImport = Array.isArray(bank.bankStatementImports)
      ? bank.bankStatementImports[0]
      : null;
    const latestBalanceMovement = Array.isArray(bank.bankStatementMovements)
      ? bank.bankStatementMovements[0]
      : null;
    const lastStatementBalance =
      typeof latestStatementImport?.currentBalance === "number"
        ? latestStatementImport.currentBalance
        : typeof latestBalanceMovement?.balanceAfter === "number"
          ? latestBalanceMovement.balanceAfter
          : null;
    const lastStatementBalanceDate =
      lastStatementBalance !== null
        ? latestStatementImport?.periodEnd || latestBalanceMovement?.occurredAt || null
        : null;

    return {
      id: bank.id,
      companyId: bank.companyId,
      companyName: bank.company?.name || null,
      sourceSystem: bank.company?.sourceSystem || null,
      sourceTenantId: bank.company?.sourceTenantId || null,
      status: bank.status,
      bankCode: bank.bankCode,
      bankName: bank.bankName,
      branchNumber: bank.branchNumber,
      branchDigit: bank.branchDigit || null,
      accountNumber: bank.accountNumber,
      accountDigit: bank.accountDigit || null,
      walletCode: bank.walletCode || null,
      agreementCode: bank.agreementCode || null,
      pixKey: bank.pixKey || null,
      beneficiaryName: bank.beneficiaryName || null,
      beneficiaryDocument: bank.beneficiaryDocument || null,
      billingProvider: bank.billingProvider || null,
      billingEnvironment: bank.billingEnvironment || null,
      billingBeneficiaryCode: bank.billingBeneficiaryCode || null,
      billingWalletVariation: bank.billingWalletVariation || null,
      billingContractNumber: bank.billingContractNumber || null,
      billingModalityCode: bank.billingModalityCode || null,
      billingDocumentSpeciesCode: bank.billingDocumentSpeciesCode || null,
      billingAcceptanceCode: bank.billingAcceptanceCode || null,
      billingIssueTypeCode: bank.billingIssueTypeCode || null,
      billingDistributionTypeCode: bank.billingDistributionTypeCode || null,
      billingNextBoletoNumber:
        typeof bank.billingNextBoletoNumber === "number"
          ? bank.billingNextBoletoNumber
          : null,
      billingRegisterPixCode:
        typeof bank.billingRegisterPixCode === "number"
          ? bank.billingRegisterPixCode
          : null,
      billingInstructionLine1: bank.billingInstructionLine1 || null,
      billingInstructionLine2: bank.billingInstructionLine2 || null,
      billingDefaultFinePercent:
        typeof bank.billingDefaultFinePercent === "number"
          ? bank.billingDefaultFinePercent
          : null,
      billingDefaultInterestPercent:
        typeof bank.billingDefaultInterestPercent === "number"
          ? bank.billingDefaultInterestPercent
          : null,
      billingDefaultDiscountPercent:
        typeof bank.billingDefaultDiscountPercent === "number"
          ? bank.billingDefaultDiscountPercent
          : null,
      billingProtestDays:
        typeof bank.billingProtestDays === "number"
          ? bank.billingProtestDays
          : null,
      billingNegativeDays:
        typeof bank.billingNegativeDays === "number"
          ? bank.billingNegativeDays
          : null,
      hasBillingApiCredentials,
      hasBillingCertificate: Boolean(
        bank.billingCertificateBase64 && bank.billingCertificatePassword,
      ),
      lastStatementBalance,
      lastStatementBalanceDate:
        lastStatementBalanceDate instanceof Date
          ? lastStatementBalanceDate.toISOString()
          : null,
      lastStatementPulledAt:
        latestStatementImport?.pulledAt instanceof Date
          ? latestStatementImport.pulledAt.toISOString()
          : null,
      ...(includeSecrets
        ? {
            billingApiClientId: bank.billingApiClientId || null,
            billingApiClientSecret: bank.billingApiClientSecret || null,
            billingCertificateBase64: bank.billingCertificateBase64 || null,
            billingCertificatePassword:
              bank.billingCertificatePassword || null,
          }
        : {}),
      notes: bank.notes || null,
      createdAt: bank.createdAt.toISOString(),
      createdBy: bank.createdBy || null,
      updatedAt: bank.updatedAt.toISOString(),
      updatedBy: bank.updatedBy || null,
      canceledAt: bank.canceledAt?.toISOString() || null,
      canceledBy: bank.canceledBy || null,
    };
  }

  private async loadScopedBank(
    bankId: string,
    sourceSystem: string,
    sourceTenantId: string,
  ) {
    const company = await this.findCompany(sourceSystem, sourceTenantId);
    if (!company) {
      throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    }

    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: String(bankId || "").trim(),
        companyId: company.id,
      },
      include: {
        company: true,
        bankStatementImports: {
          where: {
            canceledAt: null,
          },
          orderBy: {
            pulledAt: "desc",
          },
          take: 1,
          select: {
            currentBalance: true,
            periodEnd: true,
            pulledAt: true,
          },
        },
        bankStatementMovements: {
          where: {
            canceledAt: null,
            balanceAfter: {
              not: null,
            },
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            balanceAfter: true,
            occurredAt: true,
          },
        },
      },
    });

    if (!bank) {
      throw new NotFoundException("BANCO NÃO ENCONTRADO.");
    }

    return {
      company,
      bank,
    };
  }

  private async ensureNoDuplicateBank(
    companyId: string,
    payload: NormalizedBankPayload,
    ignoredBankId?: string,
  ) {
    const duplicatedBank = await this.prisma.bankAccount.findFirst({
      where: {
        companyId,
        bankCode: payload.bankCode,
        branchNumber: payload.branchNumber,
        branchDigit: payload.branchDigit,
        accountNumber: payload.accountNumber,
        accountDigit: payload.accountDigit,
        ...(ignoredBankId
          ? {
              id: {
                not: ignoredBankId,
              },
            }
          : {}),
      },
    });

    if (!duplicatedBank) {
      return;
    }

    if (duplicatedBank.status === "INACTIVE") {
      throw new BadRequestException(
        "Já existe um cadastro inativo para este banco/agência/conta. Reative o registro existente.",
      );
    }

    throw new BadRequestException(
      "Já existe um cadastro para este banco/agência/conta.",
    );
  }

  async list(query: ListBanksDto) {
    const company = await this.findCompany(query.sourceSystem, query.sourceTenantId);
    if (!company) {
      return [];
    }

    const normalizedSearch = normalizeText(query.search);
    const normalizedStatus = normalizeText(query.status);
    const normalizedSearchDigits =
      normalizeDigits(normalizedSearch) || normalizedSearch;

    const banks = await this.prisma.bankAccount.findMany({
      where: {
        companyId: company.id,
        ...(normalizedStatus && normalizedStatus !== "ALL"
          ? { status: normalizedStatus }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { bankName: { contains: normalizedSearch } },
                { bankCode: { contains: normalizedSearchDigits || normalizedSearch } },
                { branchNumber: { contains: normalizedSearchDigits || normalizedSearch } },
                {
                  accountNumber: {
                    contains: normalizedSearchDigits || normalizedSearch,
                  },
                },
                { beneficiaryName: { contains: normalizedSearch } },
                {
                  beneficiaryDocument: {
                    contains: normalizedSearchDigits || normalizedSearch,
                  },
                },
                { pixKey: { contains: normalizedSearch } },
              ],
            }
          : {}),
      },
      include: {
        company: true,
        bankStatementImports: {
          where: {
            canceledAt: null,
          },
          orderBy: {
            pulledAt: "desc",
          },
          take: 1,
          select: {
            currentBalance: true,
            periodEnd: true,
            pulledAt: true,
          },
        },
        bankStatementMovements: {
          where: {
            canceledAt: null,
            balanceAfter: {
              not: null,
            },
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            balanceAfter: true,
            occurredAt: true,
          },
        },
      },
      orderBy: [{ bankName: "asc" }, { branchNumber: "asc" }, { accountNumber: "asc" }],
    });

    return banks.map((bank) => this.mapBank(bank));
  }

  async get(bankId: string, query: GetBankDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    return this.mapBank(bank, true);
  }

  async getSavedStatement(bankId: string, query: GetBankStatementDto) {
    const period = this.parseStatementPeriod(query.periodStart, query.periodEnd);
    const { bank } = await this.loadScopedBank(
      bankId,
      query.sourceSystem,
      query.sourceTenantId,
    );
    const dateBounds = this.buildStatementDateBounds(period);

    const [movements, latestImport] = await Promise.all([
      this.prisma.bankStatementMovement.findMany({
        where: {
          companyId: bank.companyId,
          bankAccountId: bank.id,
          canceledAt: null,
          occurredAt: {
            gte: dateBounds.start,
            lte: dateBounds.end,
          },
        },
        orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      }),
      this.prisma.bankStatementImport.findFirst({
        where: {
          companyId: bank.companyId,
          bankAccountId: bank.id,
          canceledAt: null,
          periodStart: period.parsedStart,
          periodEnd: period.parsedEnd,
        },
        orderBy: {
          pulledAt: "desc",
        },
      }),
    ]);
    const latestMovementBalance = [...movements]
      .reverse()
      .find((movement) => typeof movement.balanceAfter === "number");
    const currentBalance =
      typeof latestImport?.currentBalance === "number"
        ? latestImport.currentBalance
        : latestMovementBalance?.balanceAfter ?? null;
    const movementsWithBalance = this.applyRunningStatementBalances(
      movements.map((movement) => ({ ...movement })),
      currentBalance,
    );
    const creditAmount = roundMoney(
      movements
        .filter((movement) => movement.movementType === "CREDIT")
        .reduce((total, movement) => total + movement.amount, 0),
    );
    const debitAmount = roundMoney(
      movements
        .filter((movement) => movement.movementType === "DEBIT")
        .reduce((total, movement) => total + movement.amount, 0),
    );

    return {
      provider: latestImport?.provider || normalizeText(bank.billingProvider) || "SICOOB",
      bankAccountId: bank.id,
      bankAccountLabel: this.buildBankAccountLabel(bank),
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      currentBalance,
      creditAmount,
      debitAmount,
      movementCount: movements.length,
      persistedMovementCount: movements.length,
      pulledAt: latestImport?.pulledAt?.toISOString() || null,
      message: movements.length
        ? `${movements.length} lançamento(s) de extrato bancário gravado(s) carregado(s).`
        : "Nenhum lançamento de extrato bancário gravado para o período informado.",
      movements: movementsWithBalance.map((movement) =>
        this.mapPersistedStatementMovement(movement),
      ),
    };
  }

  async reconcileStatementMovement(
    bankId: string,
    movementId: string,
    payload: ReconcileBankStatementMovementDto,
  ) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const normalizedMovementId = String(movementId || "").trim();

    if (!normalizedMovementId) {
      throw new BadRequestException("Informe o lançamento do extrato bancário.");
    }

    const movement = await this.prisma.bankStatementMovement.findFirst({
      where: {
        id: normalizedMovementId,
        companyId: bank.companyId,
        bankAccountId: bank.id,
        canceledAt: null,
      },
    });

    if (!movement) {
      throw new NotFoundException("LANÇAMENTO DO EXTRATO BANCÁRIO NÃO ENCONTRADO.");
    }

    if (movement.reconciliationStatus === "RECONCILED") {
      return this.mapPersistedStatementMovement(movement);
    }

    const updatedMovement = await this.prisma.bankStatementMovement.update({
      where: {
        id: movement.id,
      },
      data: {
        reconciliationStatus: "RECONCILED",
        updatedBy: this.resolveStatementRequestedBy(payload),
      },
    });

    return this.mapPersistedStatementMovement(updatedMovement);
  }

  async unreconcileStatementMovement(
    bankId: string,
    movementId: string,
    payload: ReconcileBankStatementMovementDto,
  ) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const normalizedMovementId = String(movementId || "").trim();

    if (!normalizedMovementId) {
      throw new BadRequestException("Informe o lançamento do extrato bancário.");
    }

    const movement = await this.prisma.bankStatementMovement.findFirst({
      where: {
        id: normalizedMovementId,
        companyId: bank.companyId,
        bankAccountId: bank.id,
        canceledAt: null,
      },
    });

    if (!movement) {
      throw new NotFoundException("LANÇAMENTO DO EXTRATO BANCÁRIO NÃO ENCONTRADO.");
    }

    if (movement.reconciliationStatus === "PENDING") {
      return this.mapPersistedStatementMovement(movement);
    }

    const updatedMovement = await this.prisma.bankStatementMovement.update({
      where: {
        id: movement.id,
      },
      data: {
        reconciliationStatus: "PENDING",
        updatedBy: this.resolveStatementRequestedBy(payload),
      },
    });

    return this.mapPersistedStatementMovement(updatedMovement);
  }

  async reviewStatementMovement(
    bankId: string,
    movementId: string,
    payload: ReviewBankStatementMovementDto,
  ) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const normalizedMovementId = String(movementId || "").trim();

    if (!normalizedMovementId) {
      throw new BadRequestException("Informe o lançamento do extrato bancário.");
    }

    const movement = await this.prisma.bankStatementMovement.findFirst({
      where: {
        id: normalizedMovementId,
        companyId: bank.companyId,
        bankAccountId: bank.id,
        canceledAt: null,
      },
    });

    if (!movement) {
      throw new NotFoundException("LANÇAMENTO DO EXTRATO BANCÁRIO NÃO ENCONTRADO.");
    }

    const requestedBy = this.resolveStatementRequestedBy(payload);
    const shouldMarkReviewed = movement.reviewStatus !== "REVIEWED";
    const updatedMovement = await this.prisma.bankStatementMovement.update({
      where: {
        id: movement.id,
      },
      data: shouldMarkReviewed
        ? {
            reviewStatus: "REVIEWED",
            reviewedAt: new Date(),
            reviewedBy: requestedBy,
            updatedBy: requestedBy,
          }
        : {
            reviewStatus: "NOT_REVIEWED",
            reviewedAt: null,
            reviewedBy: null,
            updatedBy: requestedBy,
          },
    });

    return this.mapPersistedStatementMovement(updatedMovement);
  }

  async reviewStatementMovements(
    bankId: string,
    payload: ReviewBankStatementMovementsDto,
  ) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const movementIds = Array.from(
      new Set(
        (payload.movementIds || [])
          .map((movementId) => String(movementId || "").trim())
          .filter(Boolean),
      ),
    );

    if (!movementIds.length) {
      throw new BadRequestException("Informe os lançamentos do extrato bancário.");
    }

    const reviewStatus = normalizeText(payload.reviewStatus) || "";

    if (!["REVIEWED", "NOT_REVIEWED"].includes(reviewStatus)) {
      throw new BadRequestException("Informe o status de conferência válido.");
    }

    const requestedBy = this.resolveStatementRequestedBy(payload);
    const data =
      reviewStatus === "REVIEWED"
        ? {
            reviewStatus: "REVIEWED",
            reviewedAt: new Date(),
            reviewedBy: requestedBy,
            updatedBy: requestedBy,
          }
        : {
            reviewStatus: "NOT_REVIEWED",
            reviewedAt: null,
            reviewedBy: null,
            updatedBy: requestedBy,
          };

    const result = await this.prisma.bankStatementMovement.updateMany({
      where: {
        id: {
          in: movementIds,
        },
        companyId: bank.companyId,
        bankAccountId: bank.id,
        canceledAt: null,
      },
      data,
    });
    const movements = await this.prisma.bankStatementMovement.findMany({
      where: {
        id: {
          in: movementIds,
        },
        companyId: bank.companyId,
        bankAccountId: bank.id,
        canceledAt: null,
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    });

    return {
      updatedCount: result.count,
      movements: movements.map((movement) =>
        this.mapPersistedStatementMovement(movement),
      ),
    };
  }

  async getOpenDda(bankId: string, query: GetBankDdaDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    if (bank.status !== "ACTIVE" || bank.canceledAt) {
      throw new BadRequestException("BANCO INATIVO PARA CONSULTA DE DDA.");
    }

    if (normalizeText(bank.billingProvider) !== "SICOOB") {
      throw new BadRequestException(
        "A consulta automática de DDA disponível no momento atende apenas bancos configurados como SICOOB.",
      );
    }

    if (!bank.billingApiClientId) {
      throw new BadRequestException(
        "Client ID não configurado no cadastro do banco.",
      );
    }

    if (!bank.billingCertificateBase64 || !bank.billingCertificatePassword) {
      throw new BadRequestException(
        "Certificado digital não configurado no cadastro do banco.",
      );
    }

    const accountNumber = Number(this.buildSicoobAccountNumber(bank));
    if (!Number.isInteger(accountNumber) || accountNumber <= 0) {
      throw new BadRequestException(
        "Conta corrente inválida para consultar DDA no Sicoob.",
      );
    }

    try {
      const dda = await this.sicoobDdaService.downloadOpenDda(
        {
          clientId: bank.billingApiClientId,
          certificateBase64: bank.billingCertificateBase64,
          certificatePassword: bank.billingCertificatePassword,
        },
        {
          accountNumber,
        },
      );

      return this.mapSicoobDda(bank, dda);
    } catch (error) {
      if (error instanceof SicoobDdaApiError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  async getStatement(bankId: string, query: GetBankStatementDto) {
    const period = this.parseStatementPeriod(query.periodStart, query.periodEnd);
    const { company, bank } = await this.loadScopedBank(
      bankId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    if (bank.status !== "ACTIVE" || bank.canceledAt) {
      throw new BadRequestException("BANCO INATIVO PARA CONSULTA DE EXTRATO.");
    }

    if (normalizeText(bank.billingProvider) !== "SICOOB") {
      throw new BadRequestException(
        "A consulta automática de extrato disponível no momento atende apenas bancos configurados como SICOOB.",
      );
    }

    if (!bank.billingApiClientId) {
      throw new BadRequestException(
        "Client ID não configurado no cadastro do banco.",
      );
    }

    if (!bank.billingCertificateBase64 || !bank.billingCertificatePassword) {
      throw new BadRequestException(
        "Certificado digital não configurado no cadastro do banco.",
      );
    }

    const accountNumber = Number(this.buildSicoobAccountNumber(bank));
    if (!Number.isInteger(accountNumber) || accountNumber <= 0) {
      throw new BadRequestException(
        "Conta corrente inválida para consultar o extrato do Sicoob.",
      );
    }

    try {
      const statement = await this.sicoobBankStatementService.downloadStatement(
        {
          clientId: bank.billingApiClientId,
          certificateBase64: bank.billingCertificateBase64,
          certificatePassword: bank.billingCertificatePassword,
        },
        {
          accountNumber,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        },
      );

      const mappedStatement = this.mapSicoobStatement(bank, period, statement);
      return this.persistSicoobStatement(
        company,
        bank,
        period,
        mappedStatement,
        query,
      );
    } catch (error) {
      if (error instanceof SicoobStatementApiError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  async importOfxStatement(bankId: string, payload: ImportBankStatementOfxDto) {
    const period = this.parseStatementPeriod(payload.periodStart, payload.periodEnd);
    const { company, bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    if (bank.status !== "ACTIVE" || bank.canceledAt) {
      throw new BadRequestException("BANCO INATIVO PARA IMPORTAR EXTRATO OFX.");
    }

    const mappedStatement = this.mapOfxStatement(bank, period, payload);
    return this.persistSicoobStatement(
      company,
      bank,
      period,
      mappedStatement,
      payload,
    );
  }

  async create(payload: SaveBankDto) {
    const company = await this.resolveOrCreateCompany(payload);
    const normalizedPayload = this.buildNormalizedPayload(payload);

    await this.ensureNoDuplicateBank(company.id, normalizedPayload);

    const bank = await this.prisma.bankAccount.create({
      data: {
        companyId: company.id,
        status: "ACTIVE",
        ...normalizedPayload,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(bank, true);
  }

  async update(bankId: string, payload: SaveBankDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const normalizedPayload = this.buildNormalizedPayload(payload);

    await this.ensureNoDuplicateBank(bank.companyId, normalizedPayload, bank.id);

    const updatedBank = await this.prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        ...normalizedPayload,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(updatedBank, true);
  }

  async activate(bankId: string, payload: ChangeBankStatusDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updatedBank = await this.prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        status: "ACTIVE",
        canceledAt: null,
        canceledBy: null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(updatedBank);
  }

  async inactivate(bankId: string, payload: ChangeBankStatusDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updatedBank = await this.prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        status: "INACTIVE",
        canceledAt: new Date(),
        canceledBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(updatedBank);
  }
}
