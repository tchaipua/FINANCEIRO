import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { normalizeTaxId } from "./brazil-tax-id.utils";
import {
  normalizeEmail,
  normalizePhone,
  normalizeText,
} from "./finance-core.utils";

export const PARTY_ROLE = {
  CUSTOMER: "CUSTOMER",
  PAYER: "PAYER",
  RECIPIENT: "RECIPIENT",
  TAKER: "TAKER",
  SUPPLIER: "SUPPLIER",
} as const;

type PartyRegistryData = {
  name: string;
  document?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  stateRegistrationIndicator?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  cityCode?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
};

export type UpsertPartyIdentityParams = {
  companyId: string;
  branchCode: number;
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  externalEntityType: string;
  externalEntityId: string;
  registeredPersonId?: string | null;
  registeredPersonSourceType?: string | null;
  roles?: string[];
  data: PartyRegistryData;
  requestedBy?: string | null;
};

function normalizeExternalValue(value?: string | null) {
  return normalizeText(value) || "";
}

function normalizedPartyData(data: PartyRegistryData) {
  const name = normalizeText(data.name);
  if (!name) {
    throw new BadRequestException("Informe o nome da pessoa.");
  }

  const documentNormalized = normalizeTaxId(data.document);
  return {
    name,
    document: documentNormalized,
    documentNormalized,
    stateRegistration: normalizeText(data.stateRegistration),
    municipalRegistration: normalizeText(data.municipalRegistration),
    stateRegistrationIndicator:
      normalizeText(data.stateRegistrationIndicator) || "9",
    email: normalizeEmail(data.email),
    phone: normalizePhone(data.phone),
    addressLine1: normalizeText(data.addressLine1),
    street: normalizeText(data.street),
    addressNumber: normalizeText(data.addressNumber),
    addressComplement: normalizeText(data.addressComplement),
    neighborhood: normalizeText(data.neighborhood),
    city: normalizeText(data.city),
    cityCode: normalizeText(data.cityCode),
    state: normalizeText(data.state),
    postalCode: normalizeText(data.postalCode),
    countryCode: normalizeText(data.countryCode) || "1058",
    countryName: normalizeText(data.countryName) || "BRASIL",
  };
}

function buildNonNullUpdateData(data: ReturnType<typeof normalizedPartyData>) {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => key === "name" || (value !== null && value !== ""),
    ),
  );
}

function auditSnapshot(party: any) {
  if (!party) return null;
  return {
    id: party.id,
    branchCode: party.branchCode,
    name: party.name,
    document: party.document,
    documentNormalized: party.documentNormalized,
    email: party.email,
    phone: party.phone,
    canceledAt: party.canceledAt,
    mergedIntoPartyId: party.mergedIntoPartyId,
  };
}

async function resolveCanonicalParty(client: any, party: any) {
  if (!party?.mergedIntoPartyId) return party;
  return (
    (await client.party.findFirst({
      where: {
        id: party.mergedIntoPartyId,
        companyId: party.companyId,
      },
    })) || party
  );
}

async function findReference(
  client: any,
  params: {
    companyId: string;
    sourceSystem: string;
    sourceTenantId: string;
    externalEntityType: string;
    externalEntityId: string;
  },
) {
  return client.partyExternalReference.findFirst({
    where: {
      companyId: params.companyId,
      sourceSystem: params.sourceSystem,
      sourceTenantId: params.sourceTenantId,
      externalEntityType: params.externalEntityType,
      externalEntityId: params.externalEntityId,
    },
    include: { party: true },
  });
}

async function ensureExternalReference(
  client: any,
  params: {
    companyId: string;
    partyId: string;
    branchCode: number;
    sourceSystem: string;
    sourceTenantId: string;
    externalEntityType: string;
    externalEntityId: string;
    requestedBy?: string | null;
  },
) {
  const existing = await findReference(client, params);
  if (existing) {
    return client.partyExternalReference.update({
      where: { id: existing.id },
      data: {
        partyId: params.partyId,
        branchCode: params.branchCode,
        canceledAt: null,
        canceledBy: null,
        updatedBy: params.requestedBy || null,
      },
    });
  }

  return client.partyExternalReference.create({
    data: {
      companyId: params.companyId,
      partyId: params.partyId,
      branchCode: params.branchCode,
      sourceSystem: params.sourceSystem,
      sourceTenantId: params.sourceTenantId,
      externalEntityType: params.externalEntityType,
      externalEntityId: params.externalEntityId,
      createdBy: params.requestedBy || null,
      updatedBy: params.requestedBy || null,
    },
  });
}

export async function ensurePartyRole(
  client: any,
  params: {
    companyId: string;
    partyId: string;
    branchCode: number;
    roleType: string;
    requestedBy?: string | null;
  },
) {
  const roleType = normalizeExternalValue(params.roleType);
  if (!roleType) return null;

  const existing = await client.partyRole.findFirst({
    where: {
      companyId: params.companyId,
      partyId: params.partyId,
      branchCode: params.branchCode,
      roleType,
    },
  });
  if (existing) {
    return client.partyRole.update({
      where: { id: existing.id },
      data: {
        canceledAt: null,
        canceledBy: null,
        updatedBy: params.requestedBy || null,
      },
    });
  }

  return client.partyRole.create({
    data: {
      companyId: params.companyId,
      partyId: params.partyId,
      branchCode: params.branchCode,
      roleType,
      createdBy: params.requestedBy || null,
      updatedBy: params.requestedBy || null,
    },
  });
}

export function activePartyRoleWhere(
  branchCode: number,
  roleTypes: string[],
) {
  return {
    roles: {
      some: {
        branchCode: { in: [0, branchCode] },
        roleType: {
          in: Array.from(
            new Set(roleTypes.map((role) => normalizeExternalValue(role))),
          ),
        },
        canceledAt: null,
      },
    },
  };
}

export async function upsertPartyIdentity(
  client: any,
  params: UpsertPartyIdentityParams,
) {
  const companyId = String(params.companyId || "").trim();
  const branchCode = Number(params.branchCode);
  const sourceSystem =
    normalizeExternalValue(params.sourceSystem) || "FINANCEIRO";
  const sourceTenantId =
    normalizeExternalValue(params.sourceTenantId) ||
    normalizeExternalValue(params.companyId);
  const externalEntityType = normalizeExternalValue(
    params.externalEntityType,
  );
  const externalEntityId = normalizeExternalValue(params.externalEntityId);
  const registeredPersonId = normalizeExternalValue(params.registeredPersonId);
  const registeredPersonSourceType =
    normalizeExternalValue(params.registeredPersonSourceType) || sourceSystem;
  const data = normalizedPartyData(params.data);

  if (
    !companyId ||
    !Number.isInteger(branchCode) ||
    branchCode < 0 ||
    !externalEntityType ||
    !externalEntityId
  ) {
    throw new BadRequestException("Identidade externa da pessoa inválida.");
  }

  const [externalReference, registeredReference, documentParty, legacyParty] =
    await Promise.all([
      findReference(client, {
        companyId,
        sourceSystem,
        sourceTenantId,
        externalEntityType,
        externalEntityId,
      }),
      registeredPersonId
        ? findReference(client, {
            companyId,
            sourceSystem: registeredPersonSourceType,
            sourceTenantId,
            externalEntityType: "PERSON",
            externalEntityId: registeredPersonId,
          })
        : null,
      data.documentNormalized
        ? client.party.findFirst({
            where: {
              companyId,
              documentNormalized: data.documentNormalized,
            },
            orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
          })
        : null,
      client.party.findFirst({
        where: {
          companyId,
          externalEntityType,
          externalEntityId,
        },
        orderBy: [{ canceledAt: "asc" }, { updatedAt: "desc" }],
      }),
    ]);

  const referencedParty = await resolveCanonicalParty(
    client,
    externalReference?.party || registeredReference?.party || null,
  );
  const normalizedDocumentParty = await resolveCanonicalParty(
    client,
    documentParty,
  );
  const normalizedLegacyParty = await resolveCanonicalParty(client, legacyParty);
  const party =
    normalizedDocumentParty || referencedParty || normalizedLegacyParty || null;

  if (
    normalizedDocumentParty &&
    referencedParty &&
    normalizedDocumentParty.id !== referencedParty.id
  ) {
    throw new BadRequestException(
      "A referência externa informada pertence a outra pessoa. Revise o CPF/CNPJ antes de continuar.",
    );
  }

  const requestedBy = params.requestedBy || null;
  const before = auditSnapshot(party);
  const savedParty = party
    ? await client.party.update({
        where: { id: party.id },
        data: {
          ...buildNonNullUpdateData(data),
          canceledAt: null,
          canceledBy: null,
          updatedBy: requestedBy,
        },
      })
    : await client.party.create({
        data: {
          companyId,
          branchCode,
          externalEntityType: registeredPersonId
            ? "PERSON"
            : externalEntityType,
          externalEntityId: registeredPersonId || externalEntityId,
          ...data,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

  const roleTypes = Array.from(
    new Set([
      externalEntityType,
      ...(params.roles || []),
    ]),
  );
  for (const roleType of roleTypes) {
    await ensurePartyRole(client, {
      companyId,
      partyId: savedParty.id,
      branchCode,
      roleType,
      requestedBy,
    });
  }

  await ensureExternalReference(client, {
    companyId,
    partyId: savedParty.id,
    branchCode,
    sourceSystem,
    sourceTenantId,
    externalEntityType,
    externalEntityId,
    requestedBy,
  });
  if (registeredPersonId) {
    await ensureExternalReference(client, {
      companyId,
      partyId: savedParty.id,
      branchCode,
      sourceSystem: registeredPersonSourceType,
      sourceTenantId,
      externalEntityType: "PERSON",
      externalEntityId: registeredPersonId,
      requestedBy,
    });
  }

  await client.partyAuditEvent.create({
    data: {
      companyId,
      partyId: savedParty.id,
      branchCode,
      action: party ? "IDENTITY_SYNCHRONIZED" : "IDENTITY_CREATED",
      summary: party
        ? "DADOS DA PESSOA E SEUS PAPÉIS FORAM SINCRONIZADOS."
        : "PESSOA CRIADA NO CADASTRO MESTRE.",
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: JSON.stringify(auditSnapshot(savedParty)),
      metadataJson: JSON.stringify({
        sourceSystem,
        sourceTenantId,
        externalEntityType,
        externalEntityId,
        registeredPersonId: registeredPersonId || null,
        roles: roleTypes,
      }),
      performedBy: requestedBy,
      createdBy: requestedBy,
    },
  });

  return savedParty;
}

export async function setPartyRoleActive(
  client: any,
  params: {
    companyId: string;
    partyId: string;
    branchCode: number;
    roleType: string;
    active: boolean;
    requestedBy?: string | null;
  },
) {
  const role = await client.partyRole.findFirst({
    where: {
      companyId: params.companyId,
      partyId: params.partyId,
      branchCode: params.branchCode,
      roleType: normalizeExternalValue(params.roleType),
    },
  });
  if (!role && params.active) {
    const createdRole = await ensurePartyRole(client, params);
    await client.partyAuditEvent.create({
      data: {
        companyId: params.companyId,
        partyId: params.partyId,
        branchCode: params.branchCode,
        action: "ROLE_ACTIVATED",
        summary: `PAPEL ${normalizeExternalValue(params.roleType)} ATIVADO.`,
        metadataJson: JSON.stringify({
          roleType: normalizeExternalValue(params.roleType),
        }),
        performedBy: params.requestedBy || null,
        createdBy: params.requestedBy || null,
      },
    });
    return createdRole;
  }
  if (!role) return null;
  if (
    (params.active && !role.canceledAt) ||
    (!params.active && Boolean(role.canceledAt))
  ) {
    return role;
  }

  const changedAt = params.active ? null : new Date();
  const updatedRole = await client.partyRole.update({
    where: { id: role.id },
    data: {
      canceledAt: changedAt,
      canceledBy: params.active ? null : params.requestedBy || null,
      updatedBy: params.requestedBy || null,
    },
  });
  await client.partyAuditEvent.create({
    data: {
      companyId: params.companyId,
      partyId: params.partyId,
      branchCode: params.branchCode,
      action: params.active ? "ROLE_ACTIVATED" : "ROLE_INACTIVATED",
      summary: `PAPEL ${normalizeExternalValue(params.roleType)} ${
        params.active ? "ATIVADO" : "INATIVADO"
      }.`,
      beforeJson: JSON.stringify({
        roleType: role.roleType,
        canceledAt: role.canceledAt,
      }),
      afterJson: JSON.stringify({
        roleType: updatedRole.roleType,
        canceledAt: updatedRole.canceledAt,
      }),
      performedBy: params.requestedBy || null,
      createdBy: params.requestedBy || null,
    },
  });
  return updatedRole;
}

export function createLocalExternalEntityId() {
  return randomUUID().toUpperCase();
}
