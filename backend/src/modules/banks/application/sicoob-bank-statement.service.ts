import { Injectable } from "@nestjs/common";
import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type SicoobStatementTransaction = {
  tipo?: string | null;
  valor?: number | string | null;
  data?: string | null;
  dataLote?: string | null;
  descricao?: string | null;
  numeroDocumento?: string | null;
  cpfCnpj?: string | null;
  descInfComplementar?: string | null;
};

export type DownloadSicoobStatementResult = {
  accountNumber: number;
  periodStart: string;
  periodEnd: string;
  balance: number | null;
  months: Array<{
    month: number;
    year: number;
    statusCode: number;
  }>;
  transactions: SicoobStatementTransaction[];
};

export class SicoobStatementApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly kind: string,
    public readonly responseBody: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class SicoobBankStatementService {
  private async invokePowerShellStatementRequest(input: {
    clientId: string;
    certificateBase64: string;
    certificatePassword: string;
    accountNumber: number;
    periodStart: string;
    periodEnd: string;
  }) {
    const scriptPath = join(
      process.cwd(),
      "scripts",
      "sicoob-download-extrato.ps1",
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
          "-NumeroContaCorrente",
          String(input.accountNumber),
          "-PeriodStart",
          input.periodStart,
          "-PeriodEnd",
          input.periodEnd,
        ],
        {
          maxBuffer: 20 * 1024 * 1024,
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
            "Falha ao executar a integração PowerShell de extrato do Sicoob.",
        );
      }
    }
  }

  async downloadStatement(
    config: {
      clientId: string;
      certificateBase64: string;
      certificatePassword: string;
    },
    input: {
      accountNumber: number;
      periodStart: string;
      periodEnd: string;
    },
  ): Promise<DownloadSicoobStatementResult> {
    const result = await this.invokePowerShellStatementRequest({
      clientId: config.clientId,
      certificateBase64: config.certificateBase64,
      certificatePassword: config.certificatePassword,
      accountNumber: input.accountNumber,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    if (Number(result?.statusCode || 0) >= 400 || result?.kind !== "SUCCESS") {
      throw new SicoobStatementApiError(
        Number(result?.statusCode || 500),
        String(result?.kind || "STATEMENT_ERROR"),
        String(result?.body || ""),
        String(
          result?.message ||
            "A consulta de extrato bancário do Sicoob foi rejeitada.",
        ),
      );
    }

    return {
      accountNumber: Number(result?.accountNumber || input.accountNumber),
      periodStart: String(result?.periodStart || input.periodStart),
      periodEnd: String(result?.periodEnd || input.periodEnd),
      balance:
        result?.balance === null || result?.balance === undefined
          ? null
          : Number(result.balance),
      months: Array.isArray(result?.months)
        ? result.months.map((item: any) => ({
            month: Number(item?.month || 0),
            year: Number(item?.year || 0),
            statusCode: Number(item?.statusCode || 0),
          }))
        : [],
      transactions: Array.isArray(result?.transactions)
        ? result.transactions.map((item: unknown) => ({ ...(item as object) }))
        : [],
    };
  }
}
