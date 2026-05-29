import { Injectable } from "@nestjs/common";
import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type SicoobDdaBoleto = {
  id?: string | null;
  dueDate?: string | null;
  issueDate?: string | null;
  beneficiaryName?: string | null;
  beneficiaryDocument?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  documentNumber?: string | null;
  digitableLine?: string | null;
  barcode?: string | null;
  amount?: number | string | null;
  status?: string | null;
  rawPayloadJson?: string | null;
};

export type DownloadSicoobDdaResult = {
  accountNumber: number;
  scope: string | null;
  rawCount: number;
  openCount: number;
  pulledAt: string;
  items: SicoobDdaBoleto[];
};

export class SicoobDdaApiError extends Error {
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
export class SicoobDdaService {
  private async invokePowerShellDdaRequest(input: {
    clientId: string;
    certificateBase64: string;
    certificatePassword: string;
    accountNumber: number;
  }) {
    const scriptPath = join(process.cwd(), "scripts", "sicoob-download-dda.ps1");

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
            "Falha ao executar a integração PowerShell de DDA do Sicoob.",
        );
      }
    }
  }

  async downloadOpenDda(
    config: {
      clientId: string;
      certificateBase64: string;
      certificatePassword: string;
    },
    input: {
      accountNumber: number;
    },
  ): Promise<DownloadSicoobDdaResult> {
    const result = await this.invokePowerShellDdaRequest({
      clientId: config.clientId,
      certificateBase64: config.certificateBase64,
      certificatePassword: config.certificatePassword,
      accountNumber: input.accountNumber,
    });

    if (Number(result?.statusCode || 0) >= 400 || result?.kind !== "SUCCESS") {
      throw new SicoobDdaApiError(
        Number(result?.statusCode || 500),
        String(result?.kind || "DDA_ERROR"),
        String(result?.body || ""),
        String(
          result?.message ||
            "A consulta de DDA do Sicoob foi rejeitada. Verifique se a API de pagamentos/DDA esta liberada para esta aplicação.",
        ),
      );
    }

    return {
      accountNumber: Number(result?.accountNumber || input.accountNumber),
      scope: result?.scope ? String(result.scope) : null,
      rawCount: Number(result?.rawCount || 0),
      openCount: Number(result?.openCount || 0),
      pulledAt: String(result?.pulledAt || new Date().toISOString()),
      items: Array.isArray(result?.items)
        ? result.items.map((item: unknown) => ({ ...(item as object) }))
        : [],
    };
  }
}
