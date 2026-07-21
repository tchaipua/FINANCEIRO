import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { DOMParser } from "@xmldom/xmldom";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import {
  buildNfseDpsId,
  buildNfseDpsXml,
  signNfseDpsXml,
} from "../src/modules/fiscal-documents/application/nfse/nfse-xml.builder";
import {
  buildNfseMunicipalParameterPath,
  encodeNfseDpsPayload,
} from "../src/modules/fiscal-documents/application/nfse/nfse-national.client";
import { resolveNfseEmailRecipient } from "../src/modules/fiscal-documents/application/nfse/nfse-email.service";
import {
  getVisibleBranchCodes,
  SHARED_BRANCH_CODE,
} from "../src/common/branch.constants";
import {
  NfseService,
  normalizeNfseServiceDescriptions,
} from "../src/modules/fiscal-documents/application/nfse/nfse.service";

assert.equal(SHARED_BRANCH_CODE, 0);
assert.deepEqual(getVisibleBranchCodes(4), [SHARED_BRANCH_CODE, 4]);
assert.deepEqual(
  normalizeNfseServiceDescriptions("PADRÃO", [
    " primeira descrição ",
    "SEGUNDA DESCRIÇÃO",
    "PRIMEIRA DESCRIÇÃO",
  ]),
  ["PRIMEIRA DESCRIÇÃO", "SEGUNDA DESCRIÇÃO"],
);

const dpsId = buildNfseDpsId({
  municipalityCode: "3521309",
  issuerDocument: "69342038000149",
  series: 1,
  number: 1,
});
assert.equal(dpsId, "DPS352130926934203800014900001000000000000001");
assert.equal(dpsId.length, 45);

const built = buildNfseDpsXml({
  environment: "HOMOLOGATION",
  schemaVersion: "1.01",
  softwareVersion: "MSINFOR FIN 1.0",
  series: 1,
  number: 1,
  issuedAt: new Date("2026-07-18T12:00:00-03:00"),
  competenceDate: new Date("2026-07-18T12:00:00-03:00"),
  issuer: {
    document: "69342038000149",
    municipalRegistration: "12345",
    legalName: "EMITENTE DE TESTE",
    address: {
      cityCode: "3521309",
      postalCode: "14612048",
      street: "R REGENTE FEIJO",
      number: "520",
      neighborhood: "CENTRO",
    },
    simpleNationalOption: 3,
    simpleNationalTaxRegime: 1,
    specialTaxRegime: 0,
  },
  taker: {
    document: "52998224725",
    name: "TOMADOR DE TESTE",
    email: "TOMADOR@EXAMPLE.COM",
    address: {
      cityCode: "3521309",
      postalCode: "14612048",
      street: "RUA TESTE",
      number: "100",
      neighborhood: "CENTRO",
    },
  },
  service: {
    internalCode: "SUPORTETI",
    nationalTaxCode: "010701",
    nbsCode: "115013000",
    description: "SERVICO DE SUPORTE TECNICO EM INFORMATICA",
    serviceCityCode: "3521309",
    issTaxationCode: "1",
    issWithholdingCode: "1",
  },
  grossAmount: 10,
});

assert.equal(built.dpsId, dpsId);
assert.match(built.xml, /<DPS xmlns="http:\/\/www\.sped\.fazenda\.gov\.br\/nfse" versao="1\.01">/);
assert.match(built.xml, /<tpAmb>2<\/tpAmb>/);
assert.match(built.xml, /<dCompet>2026-07-18<\/dCompet>/);
assert.match(built.xml, /<opSimpNac>3<\/opSimpNac>/);
assert.match(built.xml, /<regApTribSN>1<\/regApTribSN>/);
assert.match(built.xml, /<cTribNac>010701<\/cTribNac>/);
assert.match(built.xml, /<cNBS>115013000<\/cNBS>/);
assert.match(built.xml, /<vServ>10\.00<\/vServ>/);
assert.match(built.xml, /<indTotTrib>0<\/indTotTrib>/);
assert.doesNotMatch(built.xml, /<pAliq>/);
assert.ok(built.xml.indexOf("<prest>") < built.xml.indexOf("<toma>"));
assert.ok(built.xml.indexOf("<toma>") < built.xml.indexOf("<serv>"));
assert.ok(built.xml.indexOf("<serv>") < built.xml.indexOf("<valores>"));

const compressed = encodeNfseDpsPayload(built.xml);
assert.equal(gunzipSync(Buffer.from(compressed, "base64")).toString("utf8"), built.xml);

const keys = forge.pki.rsa.generateKeyPair(2048);
const certificate = forge.pki.createCertificate();
certificate.publicKey = keys.publicKey;
certificate.serialNumber = "01";
certificate.validity.notBefore = new Date("2026-01-01T00:00:00Z");
certificate.validity.notAfter = new Date("2027-01-01T00:00:00Z");
certificate.setSubject([{ name: "commonName", value: "TESTE" }]);
certificate.setIssuer([{ name: "commonName", value: "TESTE" }]);
certificate.sign(keys.privateKey, forge.md.sha256.create());
const certificatePem = forge.pki.certificateToPem(certificate);
const signed = signNfseDpsXml(built.xml, {
  pfxBuffer: Buffer.alloc(0),
  passphrase: "",
  privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  certificatePem,
  holderCnpj: "69342038000149",
});
assert.match(signed, /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/);
assert.match(signed, new RegExp(`<Reference URI="#${dpsId}">`));
const signedDocument = new DOMParser().parseFromString(signed, "text/xml");
const signatureNode = signedDocument.getElementsByTagNameNS(
  "http://www.w3.org/2000/09/xmldsig#",
  "Signature",
)[0];
const verifier = new SignedXml({ publicCert: certificatePem });
verifier.loadSignature(signatureNode as any);
assert.equal(verifier.checkSignature(signed), true);

assert.equal(
  buildNfseMunicipalParameterPath({
    type: "RATE",
    municipalityCode: "3521309",
    nationalTaxCode: "010701000",
    competence: "2026-07-18",
  }),
  "/3521309/010701000/2026-07-18/aliquota",
);
assert.equal(
  resolveNfseEmailRecipient({
    environment: "HOMOLOGATION",
    homologationEmail: "teste@example.com",
    takerEmail: "tomador@example.com",
  }),
  "TESTE@EXAMPLE.COM",
);

async function assertSharedServiceScope() {
  const sharedService = {
    id: "SHARED-SERVICE",
    companyId: "COMPANY-A",
    branchCode: SHARED_BRANCH_CODE,
    status: "ACTIVE",
    internalCode: "COMPARTILHADO",
    name: "SERVIÇO COMPARTILHADO",
    description: "SERVIÇO DISPONÍVEL PARA TODAS AS FILIAIS",
    cnaeCode: "6209100",
    nationalTaxCode: "010701",
    municipalTaxCode: null,
    nbsCode: "115013000",
    serviceCityCode: "3521309",
    issTaxationCode: "1",
    issWithholdingCode: "1",
    issRate: null,
    pisCofinsCst: "00",
    pisRate: null,
    cofinsRate: null,
    simpleNationalTotalTaxRate: null,
    ibsCbsEnabled: false,
    ibsCbsCst: null,
    ibsCbsClassCode: null,
    isDefault: false,
    descriptions: [
      {
        id: "SHARED-DESCRIPTION-1",
        status: "ACTIVE",
        text: "SERVIÇO DISPONÍVEL PARA TODAS AS FILIAIS",
        sortOrder: 0,
        canceledAt: null,
      },
      {
        id: "SHARED-DESCRIPTION-2",
        status: "ACTIVE",
        text: "SEGUNDA DESCRIÇÃO COMPARTILHADA",
        sortOrder: 1,
        canceledAt: null,
      },
    ],
    updatedAt: new Date("2026-07-19T12:00:00-03:00"),
  };
  const localService = {
    ...sharedService,
    id: "LOCAL-SERVICE",
    branchCode: 4,
    internalCode: "LOCAL",
    name: "SERVIÇO DA FILIAL 4",
  };
  const fakePrisma = {
    company: {
      findUnique: async () => ({
        id: "COMPANY-A",
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-A",
        name: "EMPRESA A",
        canceledAt: null,
      }),
    },
    companyBranch: {
      findFirst: async ({ where }: any) => ({
        id: "BRANCH-4",
        companyId: where.companyId,
        branchCode: where.branchCode,
        name: "FILIAL 4",
        isActive: true,
        canceledAt: null,
      }),
    },
    nfseProfile: { findFirst: async () => null },
    nfseServiceItem: {
      findMany: async ({ where }: any) => {
        assert.equal(where.companyId, "COMPANY-A");
        assert.deepEqual(where.branchCode.in, [SHARED_BRANCH_CODE, 4]);
        return [sharedService, localService];
      },
    },
    party: { findMany: async () => [] },
    nfseDocument: { findMany: async () => [] },
    nfseMunicipalParameter: { findFirst: async () => null },
  };
  const service = new NfseService(
    fakePrisma as any,
    {} as any,
    {} as any,
  );
  const overview = await service.getManualOverview({
    sourceSystem: "ESCOLA",
    sourceTenantId: "TENANT-A",
    sourceBranchCode: 4,
    environment: "HOMOLOGATION",
    userRole: "ADMIN",
  });
  assert.deepEqual(
    overview.services.map((item) => item.id),
    [sharedService.id, localService.id],
  );
  assert.equal(overview.services[0].availableToAllBranches, true);
  assert.equal(overview.services[1].availableToAllBranches, false);
  assert.deepEqual(
    overview.services[0].descriptions.map((item: any) => item.text),
    [
      "SERVIÇO DISPONÍVEL PARA TODAS AS FILIAIS",
      "SEGUNDA DESCRIÇÃO COMPARTILHADA",
    ],
  );

  let createdServiceData: any = null;
  let createdServiceRecord: any = null;
  const createdDescriptions: any[] = [];
  const saveFakePrisma = {
    company: fakePrisma.company,
    companyBranch: fakePrisma.companyBranch,
    nfseServiceItem: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.companyId, "COMPANY-A");
        assert.equal(where.internalCode, "NOVOSERVICO");
        assert.equal(where.branchCode, undefined);
        return null;
      },
    },
    $transaction: async (operation: (tx: any) => Promise<any>) =>
      operation({
        nfseServiceItem: {
          create: async ({ data }: any) => {
            createdServiceData = data;
            createdServiceRecord = {
              ...sharedService,
              ...data,
              id: "NEW-SHARED-SERVICE",
              descriptions: [],
              updatedAt: new Date("2026-07-19T12:30:00-03:00"),
            };
            return createdServiceRecord;
          },
          findUnique: async () => ({
            ...createdServiceRecord,
            descriptions: createdDescriptions,
          }),
        },
        nfseServiceDescription: {
          create: async ({ data }: any) => {
            const created = {
              ...data,
              id: `NEW-DESCRIPTION-${createdDescriptions.length + 1}`,
              canceledAt: null,
            };
            createdDescriptions.push(created);
            return created;
          },
          updateMany: async () => ({ count: 0 }),
        },
        fiscalAuditEvent: {
          create: async () => ({ id: "AUDIT-SHARED-SERVICE" }),
        },
      }),
  };
  const saveService = new NfseService(
    saveFakePrisma as any,
    {} as any,
    {} as any,
  );
  const saved = await saveService.saveServiceItem({
    sourceSystem: "ESCOLA",
    sourceTenantId: "TENANT-A",
    sourceBranchCode: 4,
    userRole: "ADMIN",
    internalCode: "NOVOSERVICO",
    name: "NOVO SERVIÇO",
    description: "NOVO SERVIÇO COMPARTILHADO",
    descriptions: [
      "NOVO SERVIÇO COMPARTILHADO",
      "SEGUNDA FORMA DE DESCREVER O SERVIÇO",
    ],
    nationalTaxCode: "010701",
    serviceCityCode: "3521309",
    issTaxationCode: "1",
    issWithholdingCode: "1",
    isDefault: false,
    availableToAllBranches: true,
  });
  assert.equal(createdServiceData.companyId, "COMPANY-A");
  assert.equal(createdServiceData.branchCode, SHARED_BRANCH_CODE);
  assert.equal(saved.branchCode, SHARED_BRANCH_CODE);
  assert.equal(saved.availableToAllBranches, true);
  assert.deepEqual(
    saved.descriptions.map((item: any) => item.text),
    [
      "NOVO SERVIÇO COMPARTILHADO",
      "SEGUNDA FORMA DE DESCREVER O SERVIÇO",
    ],
  );
}

assertSharedServiceScope()
  .then(() => process.stdout.write("NFS-e Nacional core: OK\n"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
