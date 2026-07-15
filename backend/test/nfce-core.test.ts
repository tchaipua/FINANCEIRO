import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { assertNfceCertificateMatchesIssuer } from "../src/modules/fiscal-documents/application/nfce/nfce-certificate.utils";
import { buildNfceXml } from "../src/modules/fiscal-documents/application/nfce/nfce-xml.builder";
import { mapSalePaymentToNfceCode } from "../src/modules/fiscal-documents/application/nfce/nfce.service";

const built = buildNfceXml({
  environment: "HOMOLOGATION",
  issuer: {
    stateCode: "35",
    cityCode: "3521309",
    cnpj: "51007652000199",
    stateRegistration: "361027063110",
    legalName: "EMITENTE DE TESTE",
    taxRegimeCode: "3",
    street: "RUA TESTE",
    number: "1",
    neighborhood: "CENTRO",
    city: "IPUA",
    state: "SP",
    postalCode: "14610000",
  },
  series: 1,
  number: 1,
  issuedAt: new Date("2026-07-14T12:00:00-03:00"),
  randomCode: "12345678",
  softwareVersion: "VERSAO COM MAIS DE VINTE CARACTERES",
  items: [{
    code: "1",
    description: "ITEM",
    ncmCode: "00000000",
    cfopCode: "5102",
    unitCode: "UN",
    quantity: 1,
    unitPrice: 10,
    originCode: "0",
    icmsCst: "00",
    icmsRate: 18,
    pisCst: "08",
    cofinsCst: "08",
  }],
  payments: [{ methodCode: "01", amount: 10 }],
});

assert.equal(built.accessKey.length, 44);
assert.match(built.qrCodeUrl, /\|3\|2$/);
assert.match(built.unsignedXml, /<IBSCBS>/);
assert.match(built.unsignedXml, /<IBSCBSTot>/);
assert.equal(built.unsignedXml.match(/<verProc>(.*?)<\/verProc>/)?.[1].length, 20);

const certificate = {
  pfxBuffer: Buffer.alloc(0),
  passphrase: "",
  privateKeyPem: "",
  certificatePem: "",
  holderCnpj: "51007652000199",
};
assert.doesNotThrow(() => assertNfceCertificateMatchesIssuer(certificate, "51.007.652/0001-99"));
assert.throws(
  () => assertNfceCertificateMatchesIssuer(certificate, "69.342.038/0001-49"),
  BadRequestException,
);

assert.deepEqual(
  ["CASH", "CREDIT_CARD", "DEBIT_CARD", "TERM", "INSTALLMENT", "BOLETO", "PIX"].map(
    (method) => [method, mapSalePaymentToNfceCode(method)],
  ),
  [
    ["CASH", "01"],
    ["CREDIT_CARD", "03"],
    ["DEBIT_CARD", "04"],
    ["TERM", "05"],
    ["INSTALLMENT", "05"],
    ["BOLETO", "15"],
    ["PIX", "17"],
  ],
);
assert.equal(mapSalePaymentToNfceCode("UNSUPPORTED"), null);

process.stdout.write("NFC-e core: OK\n");
