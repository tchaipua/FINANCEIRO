import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { DEFAULT_BRANCH_CODE } from "../../../common/branch.constants";
import { getFinanceContext, hasAuthenticatedFinanceScope } from "../../../common/finance-context";
import { normalizeText } from "../../../common/finance-core.utils";
import {
  ChangeProductClassificationStatusDto,
  ListProductClassificationsDto,
  SaveProductGroupDto,
  SaveProductSubgroupDto,
} from "./dto/product-classifications.dto";

@Injectable()
export class ProductClassificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertFinanceAdmin() {
    if (!hasAuthenticatedFinanceScope("FINANCE_ADMIN")) {
      throw new ForbiddenException(
        "O cadastro de grupos e subgrupos exige o escopo FINANCE_ADMIN.",
      );
    }
  }

  private currentBranchCode() {
    const branchCode = Number(getFinanceContext()?.branchCode);
    return Number.isInteger(branchCode) && branchCode >= 1
      ? branchCode
      : DEFAULT_BRANCH_CODE;
  }

  private async resolveCompany(sourceSystem: string, sourceTenantId: string) {
    const context = getFinanceContext();
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedTenant = normalizeText(sourceTenantId);
    if (!normalizedSourceSystem || !normalizedTenant) {
      throw new BadRequestException("Informe o sistema e o tenant de origem.");
    }

    const company = context?.companyId
      ? await this.prisma.company.findFirst({
          where: {
            id: context.companyId,
            sourceSystem: normalizedSourceSystem,
            sourceTenantId: normalizedTenant,
            canceledAt: null,
          },
        })
      : await this.prisma.company.findFirst({
          where: {
            sourceSystem: normalizedSourceSystem,
            sourceTenantId: normalizedTenant,
            canceledAt: null,
          },
        });

    if (!company) {
      throw new NotFoundException("Empresa financeira não encontrada para o tenant informado.");
    }

    return { companyId: company.id, branchCode: this.currentBranchCode() };
  }

  private normalizeStatus(value?: string | null) {
    return normalizeText(value) === "INACTIVE" ? "INACTIVE" : "ACTIVE";
  }

  private normalizeCode(value?: string | null) {
    return normalizeText(value);
  }

  private normalizeDescription(value?: string | null) {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  private mapGroup(group: any) {
    return {
      id: group.id,
      type: "GROUP",
      companyId: group.companyId,
      branchCode: group.branchCode,
      code: group.code || null,
      name: group.name,
      description: group.description || null,
      status: group.status,
      subgroupCount: group._count?.subgroups ?? 0,
      productCount: group._count?.products ?? 0,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }

  private mapSubgroup(subgroup: any) {
    return {
      id: subgroup.id,
      type: "SUBGROUP",
      companyId: subgroup.companyId,
      branchCode: subgroup.branchCode,
      groupId: subgroup.groupId,
      groupName: subgroup.group?.name || "---",
      code: subgroup.code || null,
      name: subgroup.name,
      description: subgroup.description || null,
      status: subgroup.status,
      subgroupCount: 0,
      productCount: subgroup._count?.products ?? 0,
      createdAt: subgroup.createdAt.toISOString(),
      updatedAt: subgroup.updatedAt.toISOString(),
    };
  }

  async list(query: ListProductClassificationsDto) {
    const scope = await this.resolveCompany(query.sourceSystem, query.sourceTenantId);
    const status = normalizeText(query.status);
    const search = normalizeText(query.search);
    const statusFilter = status === "ALL" ? {} : { status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE" };
    const searchFilter = search
      ? {
          OR: [
            { name: { contains: search } },
            { code: { contains: search } },
          ],
        }
      : {};

    const [groups, subgroups] = await Promise.all([
      this.prisma.productGroup.findMany({
        where: {
          companyId: scope.companyId,
          branchCode: scope.branchCode,
          canceledAt: null,
          ...statusFilter,
          ...searchFilter,
        },
        include: { _count: { select: { subgroups: true, products: true } } },
        orderBy: [{ name: "asc" }],
      }),
      this.prisma.productSubgroup.findMany({
        where: {
          companyId: scope.companyId,
          branchCode: scope.branchCode,
          canceledAt: null,
          ...statusFilter,
          ...searchFilter,
        },
        include: { group: true, _count: { select: { products: true } } },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    return {
      branchCode: scope.branchCode,
      groups: groups.map((group) => this.mapGroup(group)),
      subgroups: subgroups.map((subgroup) => this.mapSubgroup(subgroup)),
    };
  }

  private async ensureUniqueGroup(companyId: string, branchCode: number, name: string, id?: string) {
    const duplicate = await this.prisma.productGroup.findFirst({
      where: { companyId, branchCode, name, canceledAt: null, ...(id ? { NOT: { id } } : {}) },
    });
    if (duplicate) throw new ConflictException("Já existe um grupo com este nome nesta filial.");
  }

  private async ensureUniqueSubgroup(companyId: string, branchCode: number, groupId: string, name: string, id?: string) {
    const duplicate = await this.prisma.productSubgroup.findFirst({
      where: { companyId, branchCode, groupId, name, canceledAt: null, ...(id ? { NOT: { id } } : {}) },
    });
    if (duplicate) throw new ConflictException("Já existe um subgrupo com este nome neste grupo.");
  }

  async createGroup(payload: SaveProductGroupDto) {
    this.assertFinanceAdmin();
    const scope = await this.resolveCompany(payload.sourceSystem, payload.sourceTenantId);
    const name = normalizeText(payload.name);
    if (!name) throw new BadRequestException("Informe o nome do grupo.");
    await this.ensureUniqueGroup(scope.companyId, scope.branchCode, name);
    const group = await this.prisma.productGroup.create({
      data: {
        companyId: scope.companyId,
        branchCode: scope.branchCode,
        code: this.normalizeCode(payload.code),
        name,
        description: this.normalizeDescription(payload.description),
        status: this.normalizeStatus(payload.status),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: { _count: { select: { subgroups: true, products: true } } },
    });
    return this.mapGroup(group);
  }

  async updateGroup(id: string, payload: SaveProductGroupDto) {
    this.assertFinanceAdmin();
    const scope = await this.resolveCompany(payload.sourceSystem, payload.sourceTenantId);
    const current = await this.prisma.productGroup.findFirst({
      where: { id, companyId: scope.companyId, branchCode: scope.branchCode, canceledAt: null },
    });
    if (!current) throw new NotFoundException("Grupo não encontrado nesta filial.");
    const name = normalizeText(payload.name);
    if (!name) throw new BadRequestException("Informe o nome do grupo.");
    await this.ensureUniqueGroup(scope.companyId, scope.branchCode, name, current.id);
    const group = await this.prisma.productGroup.update({
      where: { id: current.id },
      data: {
        code: this.normalizeCode(payload.code),
        name,
        description: this.normalizeDescription(payload.description),
        status: this.normalizeStatus(payload.status || current.status),
        updatedBy: payload.requestedBy || null,
        canceledAt: null,
        canceledBy: null,
      },
      include: { _count: { select: { subgroups: true, products: true } } },
    });
    return this.mapGroup(group);
  }

  async createSubgroup(payload: SaveProductSubgroupDto) {
    this.assertFinanceAdmin();
    const scope = await this.resolveCompany(payload.sourceSystem, payload.sourceTenantId);
    const name = normalizeText(payload.name);
    if (!name) throw new BadRequestException("Informe o nome do subgrupo.");
    const group = await this.prisma.productGroup.findFirst({
      where: { id: payload.groupId, companyId: scope.companyId, branchCode: scope.branchCode, canceledAt: null },
    });
    if (!group) throw new BadRequestException("Selecione um grupo válido para o subgrupo.");
    await this.ensureUniqueSubgroup(scope.companyId, scope.branchCode, group.id, name);
    const subgroup = await this.prisma.productSubgroup.create({
      data: {
        companyId: scope.companyId,
        branchCode: scope.branchCode,
        groupId: group.id,
        code: this.normalizeCode(payload.code),
        name,
        description: this.normalizeDescription(payload.description),
        status: this.normalizeStatus(payload.status),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: { group: true, _count: { select: { products: true } } },
    });
    return this.mapSubgroup(subgroup);
  }

  async updateSubgroup(id: string, payload: SaveProductSubgroupDto) {
    this.assertFinanceAdmin();
    const scope = await this.resolveCompany(payload.sourceSystem, payload.sourceTenantId);
    const current = await this.prisma.productSubgroup.findFirst({
      where: { id, companyId: scope.companyId, branchCode: scope.branchCode, canceledAt: null },
    });
    if (!current) throw new NotFoundException("Subgrupo não encontrado nesta filial.");
    const group = await this.prisma.productGroup.findFirst({
      where: { id: payload.groupId, companyId: scope.companyId, branchCode: scope.branchCode, canceledAt: null },
    });
    if (!group) throw new BadRequestException("Selecione um grupo válido para o subgrupo.");
    const name = normalizeText(payload.name);
    if (!name) throw new BadRequestException("Informe o nome do subgrupo.");
    await this.ensureUniqueSubgroup(scope.companyId, scope.branchCode, group.id, name, current.id);
    const subgroup = await this.prisma.productSubgroup.update({
      where: { id: current.id },
      data: {
        groupId: group.id,
        code: this.normalizeCode(payload.code),
        name,
        description: this.normalizeDescription(payload.description),
        status: this.normalizeStatus(payload.status || current.status),
        updatedBy: payload.requestedBy || null,
        canceledAt: null,
        canceledBy: null,
      },
      include: { group: true, _count: { select: { products: true } } },
    });
    return this.mapSubgroup(subgroup);
  }

  async changeStatus(type: "GROUP" | "SUBGROUP", id: string, payload: ChangeProductClassificationStatusDto) {
    this.assertFinanceAdmin();
    const scope = await this.resolveCompany(payload.sourceSystem, payload.sourceTenantId);
    const status = this.normalizeStatus(payload.status);
    if (type === "GROUP") {
      const current = await this.prisma.productGroup.findFirst({ where: { id, companyId: scope.companyId, branchCode: scope.branchCode, canceledAt: null } });
      if (!current) throw new NotFoundException("Grupo não encontrado nesta filial.");
      const group = await this.prisma.productGroup.update({ where: { id }, data: { status, canceledAt: null, canceledBy: null, updatedBy: payload.requestedBy || null }, include: { _count: { select: { subgroups: true, products: true } } } });
      return this.mapGroup(group);
    }
    const current = await this.prisma.productSubgroup.findFirst({ where: { id, companyId: scope.companyId, branchCode: scope.branchCode, canceledAt: null } });
    if (!current) throw new NotFoundException("Subgrupo não encontrado nesta filial.");
    const subgroup = await this.prisma.productSubgroup.update({ where: { id }, data: { status, canceledAt: null, canceledBy: null, updatedBy: payload.requestedBy || null }, include: { group: true, _count: { select: { products: true } } } });
    return this.mapSubgroup(subgroup);
  }
}
