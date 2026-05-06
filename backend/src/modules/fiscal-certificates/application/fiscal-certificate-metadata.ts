import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import forge from "node-forge";
import { createSecureContext } from "tls";
import { normalizeDigits, normalizeText } from "../../../common/finance-core.utils";

export type ParsedPfxMetadata = {
  holderName: string;
  holderDocument: string;
  serialNumber: string | null;
  thumbprint: string;
  validFrom: Date | null;
  validTo: Date | null;
};

type ParsedPkcs12Certificate = {
  certificate: forge.pki.Certificate;
  privateKey: any | null;
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

function decodePfxBuffer(base64Value: string) {
  try {
    return Buffer.from(String(base64Value || "").trim(), "base64");
  } catch {
    throw new BadRequestException(
      "O certificado digital informado não está em Base64 válido.",
    );
  }
}

function readPkcs12Certificate(
  pfxBuffer: Buffer,
  password: string,
): ParsedPkcs12Certificate {
  try {
    const p12Asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(pfxBuffer.toString("binary")),
    );
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    const certBags =
      p12.getBags({ bagType: forge.pki.oids.certBag })[
        forge.pki.oids.certBag
      ] || [];
    const certificateBag = certBags.find(
      (bag: forge.pkcs12.Bag) => Boolean(bag.cert),
    );

    if (!certificateBag?.cert) {
      throw new Error("Certificado não encontrado no PFX.");
    }

    const keyBags =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] || [];
    const privateKeyBag = keyBags.find(
      (bag: forge.pkcs12.Bag) => Boolean(bag.key),
    );

    return {
      certificate: certificateBag.cert,
      privateKey: privateKeyBag?.key || null,
    };
  } catch {
    throw new BadRequestException(
      "Não foi possível abrir o certificado digital. Verifique o PFX e a senha.",
    );
  }
}

function canBeUsedByNodeTls(pfxBuffer: Buffer, password: string) {
  try {
    createSecureContext({
      pfx: pfxBuffer,
      passphrase: password,
    });
    return true;
  } catch {
    return false;
  }
}

export function normalizePfxBase64ForNodeTls(
  base64Value: string,
  password: string,
) {
  const normalizedBase64 = String(base64Value || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedBase64) {
    throw new BadRequestException("Informe o conteúdo do certificado digital.");
  }

  if (!normalizedPassword) {
    throw new BadRequestException("Informe a senha do certificado digital.");
  }

  const originalBuffer = decodePfxBuffer(normalizedBase64);
  if (canBeUsedByNodeTls(originalBuffer, normalizedPassword)) {
    return normalizedBase64;
  }

  const { certificate, privateKey } = readPkcs12Certificate(
    originalBuffer,
    normalizedPassword,
  );

  if (!privateKey) {
    throw new BadRequestException(
      "O certificado digital não possui chave privada utilizável para a consulta da SEFAZ.",
    );
  }

  const repackedAsn1 = forge.pkcs12.toPkcs12Asn1(
    privateKey,
    [certificate],
    normalizedPassword,
    {
      algorithm: "aes256",
    },
  );
  const repackedBuffer = Buffer.from(
    forge.asn1.toDer(repackedAsn1).getBytes(),
    "binary",
  );

  if (!canBeUsedByNodeTls(repackedBuffer, normalizedPassword)) {
    throw new BadRequestException(
      "Não foi possível converter o certificado digital para um formato compatível com a SEFAZ.",
    );
  }

  return repackedBuffer.toString("base64");
}

export function parsePfxMetadata(
  base64Value: string,
  password: string,
): ParsedPfxMetadata {
  const normalizedBase64 = String(base64Value || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedBase64) {
    throw new BadRequestException("Informe o conteúdo do certificado digital.");
  }

  if (!normalizedPassword) {
    throw new BadRequestException("Informe a senha do certificado digital.");
  }

  const pfxBuffer = decodePfxBuffer(normalizedBase64);
  const { certificate } = readPkcs12Certificate(pfxBuffer, normalizedPassword);
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
