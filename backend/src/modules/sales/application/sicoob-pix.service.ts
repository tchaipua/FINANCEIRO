import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { join } from "path";
import { promisify } from "util";
import { normalizeText, roundMoney } from "../../../common/finance-core.utils";

const execFileAsync = promisify(execFile);
const PIX_BASE_URL = "https://api.sicoob.com.br/pix/api/v2";

type SicoobPixConfig = {
  clientId: string;
  certificateBase64: string;
  certificatePassword: string;
  pixKey: string;
};

@Injectable()
export class SicoobPixService {
  private async request(input: {
    config: SicoobPixConfig;
    scope: string;
    method: "PUT" | "GET" | "PATCH";
    url: string;
    body?: Record<string, unknown>;
  }) {
    const scriptPath = join(process.cwd(), "scripts", "sicoob-pix-request.ps1");
    const args = [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
      "-ClientId", input.config.clientId,
      "-CertificateBase64", input.config.certificateBase64,
      "-CertificatePassword", input.config.certificatePassword,
      "-Scope", input.scope,
      "-Url", input.url,
      "-Method", input.method,
    ];
    if (input.body) {
      args.push("-BodyBase64", Buffer.from(JSON.stringify(input.body), "utf8").toString("base64"));
    }
    let stdout = "";
    try {
      ({ stdout } = await execFileAsync("powershell", args, {
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      }));
    } catch (error: any) {
      const rawOutput = String(error?.stdout || error?.stderr || "").trim();
      try {
        const response = JSON.parse(rawOutput);
        throw new Error(this.getApiMessage(response?.body, "Não foi possível autenticar a cobrança PIX no Sicoob."));
      } catch (parsedError) {
        if (parsedError instanceof Error && parsedError.message !== rawOutput) {
          throw parsedError;
        }
        throw new Error("Não foi possível comunicar com o Sicoob para emitir o PIX.");
      }
    }
    let response: { statusCode?: number; body?: string };
    try {
      response = JSON.parse(String(stdout || "").trim());
    } catch {
      throw new Error("O Sicoob retornou uma resposta inválida ao emitir o PIX.");
    }
    if (Number(response.statusCode || 0) < 200 || Number(response.statusCode || 0) >= 300) {
      if (Number(response.statusCode || 0) === 401 || Number(response.statusCode || 0) === 403) {
        throw new Error("O Sicoob recusou o acesso ao PIX. Confira os escopos cob.write e cob.read do Client ID.");
      }
      throw new Error(this.getApiMessage(response.body, "O Sicoob rejeitou a cobrança PIX."));
    }
    return response;
  }

  private getApiMessage(raw: unknown, fallback: string) {
    try {
      const parsed = JSON.parse(String(raw || ""));
      return String(parsed?.detail || parsed?.mensagens?.[0]?.mensagem || fallback);
    } catch {
      return fallback;
    }
  }

  async createImmediateCharge(config: SicoobPixConfig, input: { amount: number; description: string; txid: string }) {
    const pixKey = String(config.pixKey || "").trim();
    if (!pixKey) throw new Error("Informe a chave PIX da conta Sicoob no cadastro do banco.");
    const amount = roundMoney(input.amount);
    if (amount <= 0) throw new Error("Informe um valor PIX válido.");
    const txid = String(input.txid || randomUUID().replace(/-/g, "")).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 35);
    if (txid.length < 26) throw new Error("Não foi possível gerar o identificador da cobrança PIX.");
    const created = await this.request({
      config,
      scope: "cob.write",
      method: "PUT",
      url: `${PIX_BASE_URL}/cob/${txid}`,
      body: {
        calendario: { expiracao: 900 },
        valor: { original: amount.toFixed(2) },
        chave: pixKey,
        solicitacaoPagador: normalizeText(input.description)?.slice(0, 140) || "VENDA",
      },
    });
    const charge = JSON.parse(String(created.body || "{}"));
    const pixCopyPaste = String(charge?.brcode || charge?.pixCopiaECola || charge?.qrcode || "").trim();
    if (pixCopyPaste) {
      return {
        txid,
        locationId: null,
        pixCopyPaste,
        payloadJson: JSON.stringify(charge),
        responseJson: String(created.body || ""),
      };
    }
    const locationId = Number(charge?.loc?.id || 0);
    if (!locationId) throw new Error("O Sicoob não retornou a localização do QR Code PIX.");
    return { txid, locationId, pixCopyPaste: null, payloadJson: JSON.stringify(charge), responseJson: String(created.body || "") };
  }

  async getQrCode(config: SicoobPixConfig, locationId: number) {
    const qr = await this.request({
      config,
      scope: "cob.read",
      method: "GET",
      url: `${PIX_BASE_URL}/loc/${locationId}/qrcode`,
    });
    const qrPayload = JSON.parse(String(qr.body || "{}"));
    const pixCopyPaste = String(qrPayload?.qrcode || "").trim();
    if (!pixCopyPaste) throw new Error("O Sicoob não retornou o código PIX copia e cola.");
    return { pixCopyPaste, responseJson: String(qr.body || "") };
  }

  async getImmediateCharge(config: SicoobPixConfig, txid: string) {
    const response = await this.request({
      config,
      scope: "cob.read",
      method: "GET",
      url: `${PIX_BASE_URL}/cob/${encodeURIComponent(txid)}`,
    });
    const charge = JSON.parse(String(response.body || "{}"));
    return {
      status: String(charge?.status || "").trim().toUpperCase(),
      pixCopyPaste: String(charge?.brcode || charge?.pixCopiaECola || charge?.qrcode || "").trim() || null,
      responseJson: String(response.body || ""),
    };
  }

  async cancelImmediateCharge(config: SicoobPixConfig, txid: string) {
    const response = await this.request({
      config,
      scope: "cob.write",
      method: "PATCH",
      url: `${PIX_BASE_URL}/cob/${encodeURIComponent(txid)}`,
      body: { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" },
    });
    return JSON.parse(String(response.body || "{}"));
  }
}
