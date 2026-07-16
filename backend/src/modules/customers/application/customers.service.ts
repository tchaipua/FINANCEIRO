import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { DEFAULT_BRANCH_CODE } from "../../../common/branch.constants";
import {
  normalizeDigits,
  normalizeEmail,
  normalizePhone,
  normalizeText,
} from "../../../common/finance-core.utils";
import { getFinanceContext } from "../../../common/finance-context";
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
    const companyDocument = normalizeDigits(payload.companyDocument);

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
      document: normalizeDigits(payload.document),
      email: normalizeEmail(payload.email),
      phone: normalizePhone(payload.phone),
      addressLine1: normalizeText(payload.addressLine1),
      neighborhood: normalizeText(payload.neighborhood),
      city: normalizeText(payload.city),
      state: normalizeText(payload.state),
      postalCode: normalizeDigits(payload.postalCode),
    };
  }

  private mapCustomer(
    party: {
      id: string;
      externalEntityType: string;
      externalEntityId: string;
      name: string;
      document: string | null;
      email: string | null;
      phone: string | null;
      addressLine1: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      createdAt: Date;
      createdBy: string | null;
      updatedAt: Date;
      updatedBy: string | null;
      canceledAt: Date | null;
      canceledBy: string | null;
    },
    sourceSystem: string,
  ) {
    const isSchool = normalizeText(sourceSystem) === SCHOOL_SOURCE_SYSTEM;
    return {
      id: party.id,
      status: party.canceledAt ? "INACTIVE" : "ACTIVE",
      origin: isSchool ? SCHOOL_SOURCE_SYSTEM : "FINANCEIRO",
      canManageLocally: !isSchool,
      externalEntityType: party.externalEntityType,
      externalEntityId: party.externalEntityId,
      name: party.name,
      document: party.document,
      email: party.email,
      phone: party.phone,
      addressLine1: party.addressLine1,
      neighborhood: party.neighborhood,
      city: party.city,
      state: party.state,
      postalCode: party.postalCode,
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
    const normalizedDocument = normalizeDigits(document);
    if (!normalizedDocument) return;

    const duplicate = await this.prisma.party.findFirst({
      where: {
        companyId,
        branchCode: this.branchCode(),
        document: normalizedDocument,
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
        branchCode: this.branchCode(),
      },
    });

    if (!customer) {
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
    const isSchool = normalizeText(company.sourceSystem) === SCHOOL_SOURCE_SYSTEM;
    const items = await this.prisma.party.findMany({
      where: {
        companyId: company.id,
        branchCode: this.branchCode(),
        ...(isSchool
          ? {
              OR: [
                { externalEntityType: { in: ["ALUNO", "RESPONSAVEL"] } },
                {
                  receivableTitles: {
                    some: { canceledAt: null },
                  },
                },
              ],
            }
          : {}),
        ...(status === "ACTIVE"
          ? { canceledAt: null }
          : status === "INACTIVE"
            ? { canceledAt: { not: null } }
            : {}),
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: search } },
                    { document: { contains: searchDigits || search } },
                    { email: { contains: search } },
                    { phone: { contains: searchDigits || search } },
                    { city: { contains: search } },
                  ],
                },
              ],
            }
          : {}),
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

    const customer = await this.prisma.party.create({
      data: {
        companyId: company.id,
        branchCode: this.branchCode(),
        externalEntityType: LOCAL_CUSTOMER_TYPE,
        externalEntityId: randomUUID(),
        ...data,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return this.mapCustomer(customer, company.sourceSystem);
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

    const updated = await this.prisma.party.update({
      where: { id: customer.id },
      data: {
        ...data,
        updatedBy: payload.requestedBy || null,
      },
    });

    return this.mapCustomer(updated, company.sourceSystem);
  }

  async activate(customerId: string, payload: ChangeCustomerStatusDto) {
    const { company, customer } = await this.loadScopedCustomer(
      customerId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    this.assertLocalRegistrationAllowed(company);
    await this.ensureDocumentAvailable(company.id, customer.document, customer.id);

    const updated = await this.prisma.party.update({
      where: { id: customer.id },
      data: {
        canceledAt: null,
        canceledBy: null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return this.mapCustomer(updated, company.sourceSystem);
  }

  async inactivate(customerId: string, payload: ChangeCustomerStatusDto) {
    const { company, customer } = await this.loadScopedCustomer(
      customerId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    this.assertLocalRegistrationAllowed(company);

    const updated = await this.prisma.party.update({
      where: { id: customer.id },
      data: {
        canceledAt: new Date(),
        canceledBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return this.mapCustomer(updated, company.sourceSystem);
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
    const activeKeys = new Set<string>();

    for (const item of payload.customers) {
      const externalEntityType = normalizeText(item.externalEntityType);
      const externalEntityId = normalizeText(item.externalEntityId);
      if (!externalEntityType || !externalEntityId) {
        throw new BadRequestException("Cliente externo inválido na sincronização.");
      }

      const data = this.normalizedData(item);
      activeKeys.add(`${externalEntityType}|${externalEntityId}`);
      await this.prisma.party.upsert({
        where: {
          companyId_branchCode_externalEntityType_externalEntityId: {
            companyId: company.id,
            branchCode,
            externalEntityType,
            externalEntityId,
          },
        },
        create: {
          companyId: company.id,
          branchCode,
          externalEntityType,
          externalEntityId,
          ...data,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
        update: {
          ...data,
          canceledAt: null,
          canceledBy: null,
          updatedBy: requestedBy,
        },
      });
    }

    const integratedCustomers = await this.prisma.party.findMany({
      where: {
        companyId: company.id,
        branchCode,
        externalEntityType: { in: ["ALUNO", "RESPONSAVEL"] },
        canceledAt: null,
      },
      select: {
        id: true,
        externalEntityType: true,
        externalEntityId: true,
      },
    });
    const staleIds = integratedCustomers
      .filter(
        (item) =>
          !activeKeys.has(`${item.externalEntityType}|${item.externalEntityId}`),
      )
      .map((item) => item.id);

    if (staleIds.length) {
      await this.prisma.party.updateMany({
        where: { id: { in: staleIds }, companyId: company.id, branchCode },
        data: {
          canceledAt: new Date(),
          canceledBy: requestedBy,
          updatedBy: requestedBy,
        },
      });
    }

    return {
      synchronizedCustomers: payload.customers.length,
      inactivatedCustomers: staleIds.length,
      message: `${payload.customers.length} cliente(s) sincronizado(s) com o Financeiro.`,
    };
  }
}
