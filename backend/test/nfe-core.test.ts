import assert from "assert";
import { buildNfeXml } from "../src/modules/fiscal-documents/application/nfe/nfe-xml.builder";
import { resolveNfeEmailRecipient } from "../src/modules/fiscal-documents/application/nfe/nfe-email.service";
import { normalizeManualFiscalReceivablePlan } from "../src/modules/fiscal-documents/application/manual-fiscal-receivable.service";

const built = buildNfeXml({
  environment: "HOMOLOGATION",
  issuer: {
    stateCode: "35",
    cityCode: "3521309",
    cnpj: "69342038000149",
    stateRegistration: "361070303111",
    legalName: "MARCAL ROCHA SACCARDO LTDA",
    tradeName: "MSINFOR",
    taxRegimeCode: "1",
    street: "R REGENTE FEIJO",
    number: "520",
    neighborhood: "CENTRO",
    city: "IPUA",
    state: "SP",
    postalCode: "14612048",
  },
  recipient: {
    name: "CLIENTE DE TESTE",
    document: "52998224725",
    stateRegistrationIndicator: "9",
    email: "CLIENTE@EXAMPLE.COM",
    street: "RUA DE TESTE",
    number: "100",
    neighborhood: "CENTRO",
    city: "IPUA",
    cityCode: "3521309",
    state: "SP",
    postalCode: "14612048",
  },
  operationNature: "VENDA DE MERCADORIA ADQUIRIDA DE TERCEIROS",
  destinationType: "1",
  series: 1,
  number: 1,
  issuedAt: new Date("2026-07-18T12:00:00-03:00"),
  randomCode: "12345678",
  items: [
    {
      code: "1",
      description: "TECLADO USB PARA COMPUTADOR",
      gtinCode: "SEM GTIN",
      ncmCode: "84716052",
      cfopCode: "5102",
      unitCode: "UN",
      quantity: 1,
      unitPrice: 10,
      originCode: "0",
      icmsCsosnCode: "102",
      pisCstCode: "49",
      pisRate: 0,
      cofinsCstCode: "49",
      cofinsRate: 0,
      ibsCbsEnabled: false,
    },
  ],
  payments: [{ indicator: "1", methodCode: "14", amount: 10 }],
  installments: [{ number: "001", dueDate: "2026-10-10", amount: 10 }],
  invoiceReference: "TESTE-NFE",
  additionalInformation:
    "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL.",
});

assert.equal(built.accessKey.length, 44);
assert.equal(built.totals.invoice, 10);
assert.match(built.unsignedXml, /<mod>55<\/mod>/);
assert.match(built.unsignedXml, /<ICMSSN102>/);
assert.match(built.unsignedXml, /<CSOSN>102<\/CSOSN>/);
assert.match(built.unsignedXml, /<tPag>14<\/tPag>/);
assert.match(built.unsignedXml, /<dVenc>2026-10-10<\/dVenc>/);
assert.doesNotMatch(built.unsignedXml, /<cBenef>/);
assert.doesNotMatch(built.unsignedXml, /<IBSCBS>/);
assert.match(
  built.unsignedXml,
  /NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL/,
);

assert.throws(
  () =>
    buildNfeXml({
      ...({
        environment: "HOMOLOGATION",
        issuer: {
          stateCode: "35",
          cityCode: "3521309",
          cnpj: "69342038000149",
          stateRegistration: "361070303111",
          legalName: "EMITENTE",
          taxRegimeCode: "1",
          street: "RUA TESTE",
          number: "1",
          neighborhood: "CENTRO",
          city: "IPUA",
          state: "SP",
          postalCode: "14612048",
        },
        recipient: {
          name: "CLIENTE",
          document: "52998224725",
          stateRegistrationIndicator: "9",
          street: "RUA TESTE",
          number: "1",
          neighborhood: "CENTRO",
          city: "IPUA",
          cityCode: "3521309",
          state: "SP",
          postalCode: "14612048",
        },
        operationNature: "VENDA",
        destinationType: "1",
        series: 1,
        number: 2,
        issuedAt: new Date("2026-07-18T12:00:00-03:00"),
        items: [
          {
            code: "1",
            description: "PRODUTO",
            ncmCode: "84716052",
            fiscalBenefitCode: "SEM CBENEF",
            cfopCode: "5102",
            unitCode: "UN",
            quantity: 1,
            unitPrice: 10,
            originCode: "0",
            icmsCsosnCode: "102",
            pisCstCode: "49",
            cofinsCstCode: "49",
          },
        ],
        payments: [{ indicator: "1", methodCode: "14", amount: 10 }],
      } as const),
    }),
  /SEM CBENEF/,
);

assert.equal(
  resolveNfeEmailRecipient({
    environment: "HOMOLOGATION",
    homologationEmail: "homologacao@example.com",
    recipientEmail: "cliente@example.com",
  }),
  "HOMOLOGACAO@EXAMPLE.COM",
);
assert.equal(
  resolveNfeEmailRecipient({
    environment: "PRODUCTION",
    homologationEmail: "homologacao@example.com",
    recipientEmail: "cliente@example.com",
  }),
  "CLIENTE@EXAMPLE.COM",
);
assert.equal(
  resolveNfeEmailRecipient({
    explicitEmail: "reenvio@example.com",
    environment: "HOMOLOGATION",
    homologationEmail: "homologacao@example.com",
    recipientEmail: "cliente@example.com",
  }),
  "REENVIO@EXAMPLE.COM",
);

const receivablePlan = normalizeManualFiscalReceivablePlan(true, 10, [
  { dueDate: "2026-10-10", amount: 4 },
  { dueDate: "2026-11-10", amount: 6 },
]);
assert.equal(receivablePlan?.installments.length, 2);
assert.equal(receivablePlan?.installments[1].installmentNumber, 2);
assert.equal(receivablePlan?.totalAmount, 10);
assert.throws(
  () =>
    normalizeManualFiscalReceivablePlan(true, 10, [
      { dueDate: "2026-10-10", amount: 9 },
    ]),
  /SOMA DAS PARCELAS/,
);

console.log("nfe-core.test.ts: OK");
