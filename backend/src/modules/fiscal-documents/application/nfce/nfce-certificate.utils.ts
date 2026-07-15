import { BadRequestException } from "@nestjs/common";
import forge from "node-forge";
import { normalizePfxBase64ForNodeTls } from "../../../fiscal-certificates/application/fiscal-certificate-metadata";
import { NfceCertificateMaterial } from "./nfce.types";

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function assertNfceCertificateMatchesIssuer(
  certificate: NfceCertificateMaterial,
  issuerCnpj: string,
) {
  if (certificate.holderCnpj !== digits(issuerCnpj)) {
    throw new BadRequestException(
      "O CNPJ do certificado A1 não corresponde ao CNPJ da empresa emitente.",
    );
  }
}

export function loadNfceCertificateMaterial(
  pfxBase64: string,
  passphrase: string,
): NfceCertificateMaterial {
  const tlsCompatibleBase64 = normalizePfxBase64ForNodeTls(pfxBase64, passphrase);
  const pfxBuffer = Buffer.from(tlsCompatibleBase64, "base64");
  try {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);
    const certificateBags =
      p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
    const keyBags =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] || [];
    const certificate = certificateBags.find((bag) => bag.cert)?.cert;
    const privateKey = keyBags.find((bag) => bag.key)?.key;
    if (!certificate || !privateKey) {
      throw new Error("Certificado ou chave privada ausente.");
    }
    const subjectAttributes = certificate.subject.attributes || [];
    const serialNumber = subjectAttributes.find((attribute) =>
      [attribute.name, attribute.shortName]
        .map((value) => String(value || "").toLowerCase())
        .includes("serialnumber"),
    );
    const commonName = subjectAttributes.find((attribute) =>
      [attribute.name, attribute.shortName]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value === "commonname" || value === "cn"),
    );
    const holderCnpj = [serialNumber, commonName, ...subjectAttributes]
      .map((attribute) => digits(attribute?.value))
      .map((value) => value.match(/\d{14}$/)?.[0] || value)
      .find((value) => value.length === 14);
    if (!holderCnpj) {
      throw new Error("CNPJ do titular ausente no certificado.");
    }
    return {
      pfxBuffer,
      passphrase,
      privateKeyPem: forge.pki.privateKeyToPem(privateKey),
      certificatePem: forge.pki.certificateToPem(certificate),
      holderCnpj,
    };
  } catch {
    throw new BadRequestException(
      "Não foi possível preparar o certificado A1 para assinar a NFC-e.",
    );
  }
}
