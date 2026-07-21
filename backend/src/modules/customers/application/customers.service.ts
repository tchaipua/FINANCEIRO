import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DEFAULT_BRANCH_CODE } from "../../../common/branch.constants";
import {
  normalizeDigits,
  normalizeEmail,
  normalizePhone,
  normalizeText,
} from "../../../common/finance-core.utils";
import { getFinanceContext } from "../../../common/finance-context";
import {
  assertValidBrazilTaxId,
  normalizeTaxId,
} from "../../../common/brazil-tax-id.utils";
import {
  createLocalExternalEntityId,
  PARTY_ROLE,
  setPartyRoleActive,
  upsertPartyIdentity,
} from "../../../common/party-registry";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  ChangeCustomerStatusDto,
  ListCustomersDto,
  SaveCustomerDto,
  SyncCustomersDto,
  SyncedCustomerDto,
} from "./dto/customers.dto";

const SCHOOL_SOURCE_SYSTEM = "ESCOLA";
const LOCAL_CUSTOMER_TYPE = "FINANCEIRO_CLIENTE";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private branchCode() {
    return getFinanceContext()?.branchCode ?? DEFAULT_BRANCH_CODE;
  }

  private async findCompany(sourceSystem?: string | null, sourceTenantId?: string | null) {
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      return null;
    }

    return this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
    });
  }

  private async resolveOrCreateCompany(payload: {
    sourceSystem?: string | null;
    sourceTenantId?: string | null;
    companyName?: string | null;
    companyDocument?: string | null;
    requestedBy?: string | null;
  }) {
    const sourceSystem = normalizeText(payload.sourceSystem);
    const sourceTenantId = normalizeText(payload.sourceTenantId);

    if (!sourceSystem || !sourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para operar clientes.",
      );
    }

    const existing = await this.findCompany(sourceSystem, sourceTenantId);
    const companyName = normalizeText(payload.companyName);
    const companyDocument = normalizeTaxId(payload.companyDocument);

    if (existing) {
      if (!companyName && !companyDocument) {
        return existing;
      }

      return this.prisma.company.update({
        where: { id: existing.id },
        data: {
          ...(companyName ? { name: companyName } : {}),
          ...(companyDocument ? { document: companyDocument } : {}),
          updatedBy: payload.requestedBy || null,
        },
      });
    }

    return this.prisma.company.create({
      data: {
        sourceSystem,
        sourceTenantId,
        name: companyName || `${sourceSystem} ${sourceTenantId}`,
        document: companyDocument,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  private assertLocalRegistrationAllowed(company: { sourceSystem: string }) {
    if (normalizeText(company.sourceSystem) === SCHOOL_SOURCE_SYSTEM) {
      throw new BadRequestException(
        "Clientes da Escola devem ser cadastrados e alterados exclusivamente no sistema Escola.",
      );
    }
  }

  private normalizedData(payload: SaveCustomerDto | SyncedCustomerDto) {
    const name = normalizeText(payload.name);
    if (!name) {
      throw new BadRequestException("Informe o nome do cliente.");
    }

    return {
      name,
      document: payload.document
        ? assertValidBrazilTaxId(payload.document, "CPF/CNPJ do cliente")
        : null,
      stateRegistration: normalizeDigits(payload.stateRegistration),
      municipalRegistration: normalizeDigits(payload.municipalRegistration),
      stateRegistrationIndicator:
        normalizeDigits(payload.stateRegistrationIndicator) || "9",
      email: normalizeEmail(payload.email),
      phone: normalizePhone(payload.phone),
      addressLine1: normalizeText(payload.addressLine1),
      street: normalizeText(payload.street),
      addressNumber: normalizeText(payload.addressNumber),
      addressComplement: normalizeText(payload.addressComplement),
      neighborhood: normalizeText(payload.neighborhood),
      city: normalizeText(payload.city),
      cityCode: normalizeDigits(payload.cityCode),
      state: normalizeText(payload.state),
      postalCode: normalizeDigits(payload.postalCode),
      countryCode: normalizeDigits(payload.countryCode) || "1058",
      countryName: normalizeText(payload.countryName) || "BRASIL",
    };
  }

  private mapCustomer(
    party: any,
    sourceSystem: string,
  ) {
    const isSchool = normalizeText(sourceSystem) === SCHOOL_SOURCE_SYSTEM;
    const branchCode = this.branchCode();
    const customerRole = (party.roles || []).find(
      (role: any) =>
        role.roleType === PARTY_ROLE.CUSTOMER &&
        [0, branchCode].includes(role.branchCode),
    );
    const preferredReference = (party.externalReferences || []).find(
      (reference: any) =>
        !reference.canceledAt &&
        [0, branchCode].includes(reference.branchCode) &&
        (isSchool
          ? ["ALUNO", "RESPONSAVEL", "PERSON"].includes(
              reference.externalEntityType,
            )
          : true),
    );
    return {
      id: party.id,
      status:
        party.canceledAt || customerRole?.canceledAt ? "INACTIVE" : "ACTIVE",
      origin: isSchool ? SCHOOL_SOURCE_SYSTEM : "FINANCEIRO",
      canManageLocally: !isSchool,
      externalEntityType:
        preferredReference?.externalEntityType || party.externalEntityType,
      externalEntityId:
        preferredReference?.externalEntityId || party.externalEntityId,
      name: party.name,
      document: party.document,
      stateRegistration: party.stateRegistration,
      municipalRegistration: party.municipalRegistration,
      stateRegistrationIndicator: party.stateRegistrationIndicator || "9",
      email: party.email,
      phone: party.phone,
      addressLine1: party.addressLine1,
      street: party.street,
      addressNumber: party.addressNumber,
      addressComplement: party.addressComplement,
      neighborhood: party.neighborhood,
      city: party.city,
      cityCode: party.cityCode,
      state: party.state,
      postalCode: party.postalCode,
      countryCode: party.countryCode || "1058",
      countryName: party.countryName || "BRASIL",
      createdAt: party.createdAt.toISOString(),
      createdBy: party.createdBy,
      updatedAt: party.updatedAt.toISOString(),
      updatedBy: party.updatedBy,
      canceledAt: party.canceledAt?.toISOString() || null,
      canceledBy: party.canceledBy,
    };
  }

  private async ensureDocumentAvailable(
    companyId: string,
    document?: string | null,
    ignoredPartyId?: string,
  ) {
    const normalizedDocument = normalizeTaxId(document);
    if (!normalizedDocument) return;

    const duplicate = await this.prisma.party.findFirst({
      where: {
        companyId,
        documentNormalized: normalizedDocument,
        ...(ignoredPartyId ? { id: { not: ignoredPartyId } } : {}),
      },
    });

    if (duplicate) {
      throw new BadRequestException(
        duplicate.canceledAt
          ? "Já existe um cliente inativo com este CPF/CNPJ. Reative o cadastro existente."
          : "Já existe um cliente com este CPF/CNPJ.",
      );
    }
  }

  private async loadScopedCustomer(
    customerId: string,
    sourceSystem?: string | null,
    sourceTenantId?: string | null,
  ) {
    const company = await this.findCompany(sourceSystem, sourceTenantId);
    if (!company) {
      throw new NotFoundException("Empresa financeira não encontrada.");
    }

    const customer = await this.prisma.party.findFirst({
      where: {
        id: String(customerId || "").trim(),
        companyId: company.id,
      },
      include: {
        roles: true,
        externalReferences: {
          where: { canceledAt: null },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    const hasCustomerRole = customer?.roles.some(
      (role) =>
        role.roleType === PARTY_ROLE.CUSTOMER &&
        [0, this.branchCode()].includes(role.branchCode),
    );
    if (!customer || !hasCustomerRole) {
      throw new NotFoundException("Cliente não encontrado.");
    }

    return { company, customer };
  }

  async list(query: ListCustomersDto) {
    const company = await this.findCompany(query.sourceSystem, query.sourceTenantId);
    const sourceSystem = normalizeText(query.sourceSystem) || "FINANCEIRO";
    const canCreateLocally = sourceSystem !== SCHOOL_SOURCE_SYSTEM;

    if (!company) {
      return {
        sourceSystem,
        registrationMode: canCreateLocally ? "LOCAL" : "INTEGRATED_ONLY",
        canCreateLocally,
        items: [],
      };
    }

    const status = normalizeText(query.status) || "ACTIVE";
    const search = normalizeText(query.search);
    const searchDigits = normalizeDigits(query.search);
    const searchTaxId = normalizeTaxId(query.search);
    const branchCode = this.branchCode();
    const customerRoleFilter = {
      roles: {
        some: {
          branchCode: { in: [0, branchCode] },
          roleType: PARTY_ROLE.CUSTOMER,
          ...(status === "ACTIVE"
            ? { canceledAt: null }
            : status === "INACTIVE"
              ? { canceledAt: { not: null } }
              : {}),
        },
      },
    };
    const items = await this.prisma.party.findMany({
      where: {
        companyId: company.id,
        ...customerRoleFilter,
        ...(status === "ACTIVE"
          ? { canceledAt: null }
          : {}),
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: search } },
                    { document: { contains: searchTaxId || search } },
                    { email: { contains: search } },
                    { phone: { contains: searchDigits || search } },
                    { city: { contains: search } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: {
        roles: true,
        externalReferences: {
          where: { canceledAt: null },
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
    });

    return {
      sourceSystem: company.sourceSystem,
      registrationMode: canCreateLocally ? "LOCAL" : "INTEGRATED_ONLY",
      canCreateLocally,
      items: items.map((item) => this.mapCustomer(item, company.sourceSystem)),
    };
  }

  async create(payload: SaveCustomerDto) {
    const company = await this.resolveOrCreateCompany(payload);
    this.assertLocalRegistrationAllowed(company);
    const data = this.normalizedData(payload);
    await this.ensureDocumentAvailable(company.id, data.document);

    const customer = await upsertPartyIdentity(this.prisma, {
      companyId: company.id,
      branchCode: this.branchCode(),
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      externalEntityType: LOCAL_CUSTOMER_TYPE,
      externalEntityId: createLocalExternalEntityId(),
      roles: [PARTY_ROLE.CUSTOMER, PARTY_ROLE.PAYER],
      data,
      requestedBy: payload.requestedBy,
    });

    return this.mapCustomer(
      {
        ...customer,
        roles: await this.prisma.partyRole.findMany({
          where: { partyId: customer.id },
        }),
        externalReferences: await this.prisma.partyExternalReference.findMany({
          where: { partyId: customer.id, canceledAt: null },
        }),
      },
      company.sourceSystem,
    );
  }

  async update(customerId: string, payload: SaveCustomerDto) {
    const { company, customer } = await this.loadScopedCustomer(
      customerId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    this.assertLocalRegistrationAllowed(company);
    const data = this.normalizedData(payload);
    await this.ensureDocumentAvailable(company.id, data.document, customer.id);

    const updated = await upsertPartyIdentity(this.prisma, {
      companyId: company.id,
      branchCode: this.branchCode(),
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      externalEntityType: customer.externalEntityType,
      externalEntityId: customer.externalEntityId,
      roles: [PARTY_ROLE.CUSTOMER, PARTY_ROLE.PAYER],
      data,
      requestedBy: payload.requestedBy,
    });

    return this.mapCustomer(
      await this.prisma.party.findUnique({
        where: { id: updated.id },
        include: { roles: true, externalReferences: true },
      }),
      company.sourceSystem,
    );
  }

  async activate(customerId: string, payload: ChangeCustomerStatusDto) {
    const { company, customer } = await this.loadScopedCustomer(
      customerId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    this.assertLocalRegistrationAllowed(company);
    await this.ensureDocumentAvailable(company.id, customer.document, customer.id);

    await setPartyRoleActive(this.prisma, {
      companyId: company.id,
      partyId: customer.id,
      branchCode: this.branchCode(),
      roleType: PARTY_ROLE.CUSTOMER,
      active: true,
      requestedBy: payload.requestedBy,
    });

    return this.mapCustomer(
      await this.prisma.party.findUnique({
        where: { id: customer.id },
        include: { roles: true, externalReferences: true },
      }),
      company.sourceSystem,
    );
  }

  async inactivate(customerId: string, payload: ChangeCustomerStatusDto) {
    const { company, customer } = await this.loadScopedCustomer(
      customerId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    this.assertLocalRegistrationAllowed(company);

    await setPartyRoleActive(this.prisma, {
      companyId: company.id,
      partyId: customer.id,
      branchCode: this.branchCode(),
      roleType: PARTY_ROLE.CUSTOMER,
      active: false,
      requestedBy: payload.requestedBy,
    });

    return this.mapCustomer(
      await this.prisma.party.findUnique({
        where: { id: customer.id },
        include: { roles: true, externalReferences: true },
      }),
      company.sourceSystem,
    );
  }

  async sync(payload: SyncCustomersDto) {
    const sourceSystem = normalizeText(payload.sourceSystem);
    if (sourceSystem !== SCHOOL_SOURCE_SYSTEM) {
      throw new BadRequestException(
        "A sincronização externa de clientes está habilitada somente para o sistema Escola.",
      );
    }

    const company = await this.resolveOrCreateCompany(payload);
    const branchCode = this.branchCode();
    const requestedBy = payload.requestedBy || "INTEGRACAO_ESCOLA";
    const sourceTenantId = normalizeText(payload.sourceTenantId)!;
    const activeKeys = new Set<string>();

    for (const item of payload.customers) {
      const externalEntityType = normalizeText(item.externalEntityType);
      const externalEntityId = normalizeText(item.externalEntityId);
      if (!externalEntityType || !externalEntityId) {
        throw new BadRequestException("Cliente externo inválido na sincronização.");
      }

      const data = this.normalizedData(item);
      activeKeys.add(`${externalEntityType}|${externalEntityId}`);
      await upsertPartyIdentity(this.prisma, {
        companyId: company.id,
        branchCode,
        sourceSystem,
        sourceTenantId,
        externalEntityType,
        externalEntityId,
        registeredPersonId: item.registeredPersonId,
        registeredPersonSourceType: item.registeredPersonSourceType,
        roles: [
          externalEntityType,
          PARTY_ROLE.CUSTOMER,
          PARTY_ROLE.PAYER,
        ],
        data,
        requestedBy,
      });
    }

    const integratedReferences =
      await this.prisma.partyExternalReference.findMany({
      where: {
        companyId: company.id,
        branchCode,
        sourceSystem,
        sourceTenantId,
        externalEntityType: { in: ["ALUNO", "RESPONSAVEL"] },
        canceledAt: null,
      },
      select: { id: true, partyId: true, externalEntityType: true, externalEntityId: true },
    });
    const staleReferences = integratedReferences
      .filter(
        (item) =>
          !activeKeys.has(`${item.externalEntityType}|${item.externalEntityId}`),
      );
    const staleIds = staleReferences.map((item) => item.id);

    if (staleIds.length) {
      await this.prisma.partyExternalReference.updateMany({
        where: { id: { in: staleIds }, companyId: company.id, branchCode },
        data: {
          canceledAt: new Date(),
          canceledBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      for (const reference of staleReferences) {
        const hasAnotherActiveReference =
          await this.prisma.partyExternalReference.findFirst({
            where: {
              companyId: company.id,
              partyId: reference.partyId,
              branchCode,
              externalEntityType: reference.externalEntityType,
              canceledAt: null,
            },
            select: { id: true },
          });
        if (!hasAnotherActiveReference) {
          await setPartyRoleActive(this.prisma, {
            companyId: company.id,
            partyId: reference.partyId,
            branchCode,
            roleType: reference.externalEntityType,
            active: false,
            requestedBy,
          });
        }
      }
    }

    return {
      synchronizedCustomers: payload.customers.length,
      inactivatedCustomers: staleIds.length,
      message: `${payload.customers.length} cliente(s) sincronizado(s) com o Financeiro.`,
    };
  }
}
