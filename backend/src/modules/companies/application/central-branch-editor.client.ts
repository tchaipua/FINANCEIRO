import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, createHmac, randomBytes } from "node:crypto";

const SIGNATURE_VERSION = "v1";
const SYSTEM_ID = "FINANCEIRO";

export type CentralCommerceConfiguration = {
  stockControlMode: string;
  stockIntegerQuantityMode: string;
  stockLotControlMode: string;
  stockExpirationControlMode: string;
  stockGridControlMode: string;
  stockNegativeControlMode: string;
  stockClassificationMode: string;
  notifyMinimumStockOnMovement: boolean;
  allowSaleUnitPriceEdit: boolean;
  allowSaleItemDiscount: boolean;
  groupSameProduct: boolean;
  allowProductImageEdit: boolean;
  requirePasswordToRemoveSaleItems: boolean;
  defaultSalesScreenId?: string;
  businessType: string;
};

export type CentralBranchConfiguration = {
  tenant: {
    id: string;
    displayName: string;
    company: CentralCompanyData;
  };
  branch: {
    id: string;
    tenantId: string;
    branchCode: number;
    displayName: string;
    status: string;
    company: CentralCompanyData;
  } | null;
  effective: { commerce: CentralCommerceConfiguration | null };
};

type CentralCompanyData = {
  legalName?: string;
  tradeName?: string;
  documentNumber?: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  address?: {
    postalCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  contacts?: {
    phone?: string;
    mobile?: string;
    whatsapp?: string;
    email?: string;
  };
};

@Injectable()
export class CentralBranchEditorClient {
  private baseUrl() {
    const configured = String(
      process.env.MSINFOR_CENTRAL_API_URL || "",
    ).trim();
    if (!configured && process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException(
        "ENDEREÇO DA CENTRAL MSINFOR NÃO CONFIGURADO.",
      );
    }
    let base: URL;
    try {
      base = new URL(configured || "http://127.0.0.1:3201/api/v1");
    } catch {
      throw new ServiceUnavailableException(
        "ENDEREÇO DA CENTRAL MSINFOR INVÁLIDO.",
      );
    }
    if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
      throw new ServiceUnavailableException(
        "A CENTRAL MSINFOR DEVE USAR HTTPS EM PRODUÇÃO.",
      );
    }
    base.pathname = base.pathname.replace(/\/+$/, "") + "/";
    base.search = "";
    base.hash = "";
    return base;
  }

  private target(path: string) {
    const base = this.baseUrl();
    const target = new URL(path.replace(/^\/+/, ""), base);
    if (
      target.origin !== base.origin ||
      !target.pathname.startsWith(base.pathname)
    ) {
      throw new ServiceUnavailableException(
        "DESTINO DA CENTRAL MSINFOR INVÁLIDO.",
      );
    }
    return target;
  }

  private async request<T>(path: string, method = "GET", body?: unknown) {
    const secret = String(
      process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "",
    ).trim();
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new ServiceUnavailableException(
        "CREDENCIAL TÉCNICA DA CENTRAL NÃO CONFIGURADA.",
      );
    }
    const target = this.target(path);
    const rawBody = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    const timestamp = Date.now().toString();
    const nonce = randomBytes(24).toString("base64url");
    const bodyHash = createHash("sha256").update(rawBody).digest("hex");
    const signaturePayload = [
      SIGNATURE_VERSION,
      SYSTEM_ID,
      method,
      `${target.pathname}${target.search}`,
      timestamp,
      nonce,
      bodyHash,
    ].join("\n");
    const signature = createHmac("sha256", secret)
      .update(signaturePayload)
      .digest("hex");

    let response: Response;
    try {
      response = await fetch(target, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "x-msinfor-signature-version": SIGNATURE_VERSION,
          "x-msinfor-system-id": SYSTEM_ID,
          "x-msinfor-timestamp": timestamp,
          "x-msinfor-nonce": nonce,
          "x-msinfor-content-sha256": bodyHash,
          "x-msinfor-signature": signature,
        },
        ...(body === undefined ? {} : { body: rawBody }),
      });
    } catch {
      throw new BadGatewayException("A CENTRAL MSINFOR ESTÁ INDISPONÍVEL.");
    }
    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!response.ok || !payload) {
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : "A CENTRAL MSINFOR NÃO CONCLUIU A SOLICITAÇÃO.";
      throw new BadGatewayException(message);
    }
    return payload as T;
  }

  async createLaunch(input: {
    tenantId: string;
    branchCode: number;
    requestedBy: string;
  }) {
    const payload = await this.request<{
      editorUrl: string;
      expiresAt: string;
    }>("/branch-editor/launch", "POST", input);
    let editor: URL;
    try {
      editor = new URL(payload.editorUrl);
    } catch {
      throw new BadGatewayException(
        "A CENTRAL RETORNOU UM ENDEREÇO DE EDIÇÃO INVÁLIDO.",
      );
    }
    const allowed = String(
      process.env.MSINFOR_CENTRAL_FRONTEND_URL ||
        (process.env.NODE_ENV === "production" ? "" : "http://localhost:3200"),
    ).trim();
    if (
      !allowed ||
      editor.origin !== new URL(allowed).origin ||
      editor.pathname !== "/branch-editor" ||
      !editor.hash.startsWith("#launch=")
    ) {
      throw new BadGatewayException(
        "A CENTRAL RETORNOU UM ENDEREÇO DE EDIÇÃO NÃO AUTORIZADO.",
      );
    }
    return payload;
  }

  findConfiguration(tenantId: string, branchCode: number) {
    return this.request<CentralBranchConfiguration>(
      `/control-plane/technical/tenants/${encodeURIComponent(tenantId)}/configuration?branchCode=${branchCode}`,
    );
  }
}
