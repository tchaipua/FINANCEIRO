import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import forge from "node-forge";
import { normalizeDigits, normalizeText } from "../../../common/finance-core.utils";

export type ParsedPfxMetadata = {
  holderName: string;
  holderDocument: string;
  serialNumber: string | null;
  thumbprint: string;
  validFrom: Date | null;
  validTo: Date | null;
};

function parseSubjectAttribute(
  certificate: forge.pki.Certificate,
  names: string[],
) {
  const loweredNames = names.map((name) => name.toLowerCase());
  const attributes = certificate.subject.attributes || [];

  for (const attribute of attributes) {
    const name = String(attribute.name || "").toLowerCase();
    const shortName = String(attribute.shortName || "").toLowerCase();
    if (loweredNames.includes(name) || loweredNames.includes(shortName)) {
      return String(attribute.value || "").trim();
    }
  }

  return null;
}

function getCertificateFromPfx(pfxBuffer: Buffer, password: string) {
  try {
    const p12Asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(pfxBuffer.toString("binary")),
    );
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    const bags =
      p12.getBags({ bagType: forge.pki.oids.certBag })[
        forge.pki.oids.certBag
      ] || [];

    const certificateBag = bags.find(
      (bag: forge.pkcs12.Bag) => Boolean(bag.cert),
    );
    if (!certificateBag?.cert) {
      throw new Error("Certificado não encontrado no PFX.");
    }

    return certificateBag.cert;
  } catch {
    throw new BadRequestException(
      "Não foi possível abrir o certificado digital. Verifique o PFX e a senha.",
    );
  }
}

export function parsePfxMetadata(base64Value: string, password: string): ParsedPfxMetadata {
  const normalizedBase64 = String(base64Value || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedBase64) {
    throw new BadRequestException("Informe o conteúdo do certificado digital.");
  }

  if (!normalizedPassword) {
    throw new BadRequestException("Informe a senha do certificado digital.");
  }

  let pfxBuffer: Buffer;

  try {
    pfxBuffer = Buffer.from(normalizedBase64, "base64");
  } catch {
    throw new BadRequestException("O certificado digital informado não está em Base64 válido.");
  }

  const certificate = getCertificateFromPfx(pfxBuffer, normalizedPassword);
  const pem = forge.pki.certificateToPem(certificate);
  const der = forge.asn1
    .toDer(forge.pki.certificateToAsn1(certificate))
    .getBytes();
  const derBuffer = Buffer.from(der, "binary");
  const thumbprint = createHash("sha1").update(derBuffer).digest("hex").toUpperCase();
  const holderName =
    normalizeText(parseSubjectAttribute(certificate, ["commonName", "cn"])) ||
    "CERTIFICADO DIGITAL";
  const holderDocument =
    normalizeDigits(
      parseSubjectAttribute(certificate, [
        "serialnumber",
        "serialNumber",
      ]),
    ) ||
    normalizeDigits(holderName) ||
    "";

  if (!holderDocument) {
    throw new BadRequestException(
      "Não foi possível identificar o CNPJ ou CPF do titular no certificado digital.",
    );
  }

  return {
    holderName,
    holderDocument,
    serialNumber: normalizeText(certificate.serialNumber) || null,
    thumbprint,
    validFrom: certificate.validity.notBefore || null,
    validTo: certificate.validity.notAfter || null,
  };
}
