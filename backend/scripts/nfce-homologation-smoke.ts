import "dotenv/config";
import { mkdir, readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { authorizeNfce } from "../src/modules/fiscal-documents/application/nfce/nfce-sefaz.client";
import {
  assertNfceCertificateMatchesIssuer,
  loadNfceCertificateMaterial,
} from "../src/modules/fiscal-documents/application/nfce/nfce-certificate.utils";
import { buildNfceXml } from "../src/modules/fiscal-documents/application/nfce/nfce-xml.builder";

function required(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}.`);
  }
  return value;
}

async function main() {
  const pfxPath = required("NFCE_PFX_PATH");
  const password = required("NFCE_PFX_PASSWORD");
  const number = Number(required("NFCE_NUMBER"));
  const issuerCnpj = String(process.env.NFCE_ISSUER_CNPJ || "51007652000199");
  const issuerStateRegistration = String(process.env.NFCE_ISSUER_IE || "361027063110");
  const issuerLegalName = String(
    process.env.NFCE_ISSUER_LEGAL_NAME || "SACCARDO E MONTANHER ADMINISTRACAO DE BENS LTDA",
  );
  const pfxBase64 = (await readFile(pfxPath)).toString("base64");
  const certificate = loadNfceCertificateMaterial(pfxBase64, password);
  const built = buildNfceXml({
    environment: "HOMOLOGATION",
    issuer: {
      stateCode: "35",
      cityCode: "3521309",
      cnpj: issuerCnpj,
      stateRegistration: issuerStateRegistration,
      legalName: issuerLegalName,
      taxRegimeCode: "3",
      street: "RUA AMERICO BRASILIENSE",
      number: "472",
      complement: "SALA 01",
      neighborhood: "CENTRO",
      city: "IPUA",
      state: "SP",
      postalCode: "14610000",
    },
    series: Number(process.env.NFCE_SERIES || 1),
    number,
    issuedAt: new Date(),
    items: [
      {
        code: "HOMOLOGACAO",
        description: "ITEM DE TESTE",
        ncmCode: "00000000",
        cfopCode: "5102",
        unitCode: "UN",
        quantity: 1,
        unitPrice: 1,
        originCode: "0",
        icmsCst: "00",
        icmsRate: 18,
        pisCst: "08",
        cofinsCst: "08",
      },
    ],
    payments: [{ methodCode: "01", amount: 1 }],
    additionalInformation: "TESTE TECNICO DO EMISSOR MSINFOR",
  });
  assertNfceCertificateMatchesIssuer(certificate, issuerCnpj);
  const result = await authorizeNfce({
    environment: "HOMOLOGATION",
    accessKey: built.accessKey,
    unsignedXml: built.unsignedXml,
    certificate,
  });
  const outputDir = resolve(process.env.NFCE_OUTPUT_DIR || "output/nfce");
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, `${built.accessKey}-signed.xml`), result.signedXml, "utf8");
  await writeFile(resolve(outputDir, `${built.accessKey}-response.xml`), result.responseXml, "utf8");
  if (result.processedXml) {
    await writeFile(resolve(outputDir, `${built.accessKey}-procNFe.xml`), result.processedXml, "utf8");
  }
  process.stdout.write(
    `${JSON.stringify({
      accessKey: built.accessKey,
      authorized: result.authorized,
      statusCode: result.statusCode,
      statusMessage: result.statusMessage,
      protocol: result.protocol,
      receivedAt: result.receivedAt,
      outputDir,
    }, null, 2)}\n`,
  );
  if (!result.authorized) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
