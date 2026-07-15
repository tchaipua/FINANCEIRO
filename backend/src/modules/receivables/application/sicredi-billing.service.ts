import { Injectable } from "@nestjs/common";
import {
  dateToDateOnly,
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";

type SicrediConfig = {
  environment?: string | null;
  apiKey: string;
  accessCode: string;
  cooperative: string;
  posto: string;
  beneficiaryCode: string;
  collectionType?: string | null;
};

type SicrediPayer = {
  name: string;
  document: string;
  email?: string | null;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
};

export type SicrediIssueResult = {
  nossoNumero: string | null;
  seuNumero: string | null;
  linhaDigitavel: string | null;
  codigoBarras: string | null;
  qrCode: string | null;
  pdfBoleto: string | null;
  rawResponseJson: string;
  payloadJson: string;
};

export type SicrediSettledItem = {
  cooperativa?: string | null;
  codigoBeneficiario?: string | null;
  nossoNumero?: string | null;
  seuNumero?: string | null;
  dataPagamento?: string | null;
  valor?: number | string | null;
  valorLiquidado?: number | string | null;
  jurosLiquido?: number | string | null;
  descontoLiquido?: number | string | null;
  multaLiquida?: number | string | null;
  abatimentoLiquido?: number | string | null;
  tipoLiquidacao?: string | null;
  [key: string]: unknown;
};

export type SicrediFinancialMovement = {
  agencia?: string | null;
  posto?: string | null;
  beneficiario?: string | null;
  nossoNumero?: string | null;
  seuNumero?: string | null;
  nomePagador?: string | null;
  identPagador?: string | null;
  datamovimento?: string | null;
  dataLancamento?: string | null;
  valorNominal?: number | string | null;
  valorAbatimento?: number | string | null;
  valorDesconto?: number | string | null;
  valorJuros?: number | string | null;
  valorMulta?: number | string | null;
  valorMovimento?: number | string | null;
  tipoMovimento?: string | null;
  descMovimento?: string | null;
  [key: string]: unknown;
};

export type SicrediStatementTransaction = {
  tipo?: string | null;
  valor?: number | string | null;
  data?: string | null;
  dataLote?: string | null;
  descricao?: string | null;
  numeroDocumento?: string | null;
  cpfCnpj?: string | null;
  descInfComplementar?: string | null;
};

export type DownloadSicrediStatementResult = {
  periodStart: string;
  periodEnd: string;
  balance: number | null;
  months: Array<{ month: number; year: number; statusCode: number }>;
  transactions: SicrediStatementTransaction[];
};

export class SicrediApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class SicrediBillingService {
  private readonly tokenCache = new Map<
    string,
    {
      accessToken: string;
      refreshToken: string | null;
      accessExpiresAt: number;
      refreshExpiresAt: number;
    }
  >();

  private isProduction(environment?: string | null) {
    const normalized = normalizeText(environment);
    return normalized === "PRODUCAO" || normalized === "PRODUCTION";
  }

  private baseUrl(environment?: string | null) {
    return this.isProduction(environment)
      ? "https://api-parceiro.sicredi.com.br"
      : "https://api-parceiro.sicredi.com.br/sb";
  }

  private cacheKey(config: SicrediConfig) {
    return [
      config.environment || "SANDBOX",
      config.apiKey,
      config.cooperative,
      config.posto,
      config.beneficiaryCode,
    ].join("|");
  }

  private parseResponseBody(body: string) {
    if (!body) return null;
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private formatRequestDate(value: string) {
    const normalized = String(value || "").trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) return normalized;
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : normalized;
  }

  private normalizeResponseDate(value?: string | null) {
    const normalized = String(value || "").trim();
    if (!normalized) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 10);
    const brMatch = normalized.match(/^(\d{2})[\/]?(\d{2})[\/]?(\d{4})$/);
    if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    const slashMatch = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
    return normalized;
  }

  private async authenticate(config: SicrediConfig, refreshToken?: string) {
    const endpoint = `${this.baseUrl(config.environment)}/auth/openapi/token`;
    const form = new URLSearchParams({
      grant_type: refreshToken ? "refresh_token" : "password",
      scope: "cobranca",
    });

    if (refreshToken) {
      form.set("refresh_token", refreshToken);
    } else {
      form.set(
        "username",
        `${normalizeDigits(config.beneficiaryCode)}${normalizeDigits(config.cooperative)}`,
      );
      form.set("password", config.accessCode);
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        context: "COBRANCA",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const body = await response.text();
    const parsed = this.parseResponseBody(body);

    if (!response.ok || !parsed?.access_token) {
      throw new SicrediApiError(
        response.status,
        body,
        String(parsed?.error_description || parsed?.message || "Falha na autenticação da API do Sicredi."),
      );
    }

    const now = Date.now();
    const token = {
      accessToken: String(parsed.access_token),
      refreshToken: parsed.refresh_token ? String(parsed.refresh_token) : null,
      accessExpiresAt: now + Math.max(30, Number(parsed.expires_in || 300) - 30) * 1000,
      refreshExpiresAt: now + Math.max(30, Number(parsed.refresh_expires_in || 900) - 30) * 1000,
    };
    this.tokenCache.set(this.cacheKey(config), token);
    return token;
  }

  private async accessToken(config: SicrediConfig) {
    const key = this.cacheKey(config);
    const cached = this.tokenCache.get(key);
    if (cached && cached.accessExpiresAt > Date.now()) return cached.accessToken;

    if (cached?.refreshToken && cached.refreshExpiresAt > Date.now()) {
      return (await this.authenticate(config, cached.refreshToken)).accessToken;
    }

    return (await this.authenticate(config)).accessToken;
  }

  private async request<T>(
    config: SicrediConfig,
    input: {
      method: "GET" | "POST";
      path: string;
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      responseType?: "json" | "bytes";
      contentType?: string;
    },
  ): Promise<{ status: number; body: string; data: T }> {
    const query = new URLSearchParams();
    Object.entries(input.query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        query.set(key, String(value));
      }
    });
    const url = `${this.baseUrl(config.environment)}${input.path}${query.toString() ? `?${query}` : ""}`;
    const token = await this.accessToken(config);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "x-api-key": config.apiKey,
      cooperativa: config.cooperative,
      posto: config.posto,
      "Content-Type": input.contentType || "application/json",
    };

    const response = await fetch(url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const raw = Buffer.from(await response.arrayBuffer());
    const body = raw.toString("utf8");

    if (response.status === 401) {
      this.tokenCache.delete(this.cacheKey(config));
      const retryToken = await this.accessToken(config);
      headers.Authorization = `Bearer ${retryToken}`;
      const retry = await fetch(url, {
        method: input.method,
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
      const retryRaw = Buffer.from(await retry.arrayBuffer());
      const retryBody = retryRaw.toString("utf8");
      if (!retry.ok) {
        const parsed = this.parseResponseBody(retryBody);
        throw new SicrediApiError(
          retry.status,
          retryBody,
          String(parsed?.message || parsed?.error_description || "A API do Sicredi rejeitou a requisição."),
        );
      }
      return {
        status: retry.status,
        body: retryBody,
        data: (input.responseType === "bytes" ? retryRaw : this.parseResponseBody(retryBody)) as T,
      };
    }

    if (!response.ok) {
      const parsed = this.parseResponseBody(body);
      throw new SicrediApiError(
        response.status,
        body,
        String(parsed?.message || parsed?.error_description || "A API do Sicredi rejeitou a requisição."),
      );
    }

    return {
      status: response.status,
      body,
      data: (input.responseType === "bytes" ? raw : this.parseResponseBody(body)) as T,
    };
  }

  private buildConfig(config: SicrediConfig) {
    const required = [
      [config.apiKey, "chave da API"],
      [config.accessCode, "código de acesso"],
      [config.cooperative, "cooperativa"],
      [config.posto, "posto"],
      [config.beneficiaryCode, "código do beneficiário"],
    ];
    const missing = required.find(([value]) => !String(value || "").trim());
    if (missing) throw new Error(`Informe ${missing[1]} do Sicredi.`);
    return config;
  }

  async issueBankSlip(
    rawConfig: SicrediConfig,
    input: {
      sequenceNumber: number;
      amount: number;
      dueDate: Date;
      installmentNumber: number;
      payer: SicrediPayer;
    },
  ): Promise<SicrediIssueResult> {
    const config = this.buildConfig(rawConfig);
    const sequenceNumber = Number(input.sequenceNumber);
    if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
      throw new Error("Sequencial do boleto inválido para emissão no Sicredi.");
    }

    const document = normalizeDigits(input.payer.document) || "";
    const isCompany = document.length > 11;
    const type =
      normalizeText(config.collectionType) === "HIBRIDO" ? "HIBRIDO" : "NORMAL";
    const payload = {
      tipoCobranca: type,
      codigoBeneficiario: normalizeDigits(config.beneficiaryCode),
      nossoNumero: sequenceNumber,
      seuNumero: String(sequenceNumber),
      valor: roundMoney(input.amount),
      dataVencimento: dateToDateOnly(input.dueDate),
      especieDocumento: "DUPLICATA_MERCANTIL_INDICACAO",
      pagador: {
        tipoPessoa: isCompany ? "PESSOA_JURIDICA" : "PESSOA_FISICA",
        documento: document,
        nome: normalizeText(input.payer.name),
        endereco: normalizeText(input.payer.addressLine1),
        cidade: normalizeText(input.payer.city),
        uf: normalizeText(input.payer.state),
        cep: normalizeDigits(input.payer.postalCode),
        ...(input.payer.email ? { email: String(input.payer.email).trim().toLowerCase() } : {}),
      },
    };

    const created = await this.request<Record<string, unknown>>(config, {
      method: "POST",
      path: "/cobranca/boleto/v1/boletos",
      body: payload,
    });
    const result = created.data || {};
    const linhaDigitavel = String(result.linhaDigitavel || "").trim() || null;
    let pdfBoleto: string | null = null;

    if (linhaDigitavel) {
      const pdf = await this.request<Buffer>(config, {
        method: "GET",
        path: "/cobranca/boleto/v1/boletos/pdf",
        query: { linhaDigitavel },
        responseType: "bytes",
      });
      pdfBoleto = Buffer.from(pdf.data).toString("base64");
    }

    return {
      nossoNumero: normalizeDigits(String(result.nossoNumero || sequenceNumber)) || null,
      seuNumero: String(result.seuNumero || sequenceNumber).trim() || null,
      linhaDigitavel,
      codigoBarras: normalizeDigits(String(result.codigoBarras || "")) || null,
      qrCode: String(result.qrCode || result.txid || "").trim() || null,
      pdfBoleto,
      rawResponseJson: created.body,
      payloadJson: JSON.stringify(payload),
    };
  }

  async downloadSettled(
    rawConfig: SicrediConfig,
    input: { date: string },
  ): Promise<{ items: SicrediSettledItem[]; rawResponseJson: string }> {
    const config = this.buildConfig(rawConfig);
    const items: SicrediSettledItem[] = [];
    let page = 0;
    let hasNext = true;
    const snapshots: unknown[] = [];

    while (hasNext && page < 100) {
      const response = await this.request<{ items?: SicrediSettledItem[]; hasNext?: boolean }>(config, {
        method: "GET",
        path: "/cobranca/boleto/v1/boletos/liquidados/dia",
        query: {
          codigoBeneficiario: config.beneficiaryCode,
          dia: this.formatRequestDate(input.date),
          pagina: page,
        },
        contentType: "application/x-www-form-urlencoded",
      });
      const data = response.data || {};
      const pageItems = Array.isArray(data.items) ? data.items : [];
      items.push(...pageItems);
      snapshots.push(data);
      hasNext = Boolean(data.hasNext);
      page += 1;
    }

    return { items, rawResponseJson: JSON.stringify(snapshots) };
  }

  async downloadFinancialMovements(
    rawConfig: SicrediConfig,
    input: { date: string; type?: "CREDITO" | "DEBITO" | "AMBOS" },
  ): Promise<{ items: SicrediFinancialMovement[]; rawResponseJson: string }> {
    const config = this.buildConfig(rawConfig);
    const items: SicrediFinancialMovement[] = [];
    let page = 0;
    let totalPages = 1;
    const snapshots: unknown[] = [];

    while (page < totalPages && page < 100) {
      const response = await this.request<Record<string, unknown> | SicrediFinancialMovement[]>(config, {
        method: "GET",
        path: "/cobranca/v1/cobranca-financeiro/movimentacoes/",
        query: {
          pagina: page,
          codigoBeneficiario: config.beneficiaryCode,
          cooperativa: config.cooperative,
          posto: config.posto,
          dataLancamento: this.formatRequestDate(input.date),
          tipoMovimento: input.type || "AMBOS",
        },
        contentType: "application/x-www-form-urlencoded",
      });
      const data = response.data;
      const pageItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      items.push(...(pageItems as SicrediFinancialMovement[]));
      snapshots.push(data);
      totalPages = Number(!Array.isArray(data) && data?.totalPaginas) || (pageItems.length ? page + 1 : 0);
      page += 1;
    }

    return { items, rawResponseJson: JSON.stringify(snapshots) };
  }

  async downloadStatement(
    rawConfig: SicrediConfig,
    input: { periodStart: string; periodEnd: string },
  ): Promise<DownloadSicrediStatementResult> {
    const start = new Date(`${input.periodStart}T12:00:00.000Z`);
    const end = new Date(`${input.periodEnd}T12:00:00.000Z`);
    const transactions: SicrediStatementTransaction[] = [];
    let current = start;

    while (current <= end) {
      const date = dateToDateOnly(current)!;
      const result = await this.downloadFinancialMovements(rawConfig, { date, type: "AMBOS" });
      for (const item of result.items) {
        const rawAmount = Number(item.valorMovimento || 0);
        transactions.push({
          tipo: item.tipoMovimento,
          valor: rawAmount,
          data: this.normalizeResponseDate(
            item.dataLancamento || item.datamovimento || date,
          ),
          dataLote: this.normalizeResponseDate(item.datamovimento),
          descricao: item.descMovimento || "MOVIMENTAÇÃO FINANCEIRA SICREDI",
          numeroDocumento: item.nossoNumero || item.seuNumero || null,
          cpfCnpj: item.identPagador || null,
          descInfComplementar: item.nomePagador || null,
        });
      }
      current = new Date(current.getTime() + 86400000);
    }

    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      balance: null,
      months: [],
      transactions,
    };
  }
}
