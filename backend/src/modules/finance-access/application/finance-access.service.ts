import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { getFinanceContext, hasAuthenticatedFinanceScope } from "../../../common/finance-context";
import {
  FINANCE_PROFILES,
  getFinanceProfile,
  normalizeFinancePermissionCodes,
} from "../../../common/finance-access-policy";
import {
  resolveSourceSystemPerson,
  updateSourceSystemUserConfirmationPin,
  updateSourceSystemUserPassword,
  upsertSourceSystemUser,
} from "../../../common/source-system-users.client";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  CreateFinanceSystemUserDto,
  ResolveFinanceSystemPersonDto,
  SaveFinanceAccessAssignmentDto,
  SynchronizeFinanceAccessSubjectsDto,
  UpdateFinanceSystemUserPasswordDto,
  UpdateFinanceSystemUserPinDto,
} from "./dto/finance-access.dto";

function requiredContext() {
  const context = getFinanceContext();
  if (!context?.authenticated || !context.companyId || !context.sourceSystem ||
      !context.sourceTenantId || !context.sourceUserId) {
    throw new ForbiddenException("CONTEXTO FINANCEIRO AUTENTICADO É OBRIGATÓRIO.");
  }
  return context as Required<Pick<typeof context, "companyId" | "sourceSystem" |
    "sourceTenantId" | "sourceUserId" | "sourceBranchCode">> & typeof context;
}

function assertFinanceAdmin() {
  if (!hasAuthenticatedFinanceScope("FINANCE_ADMIN")) {
    throw new ForbiddenException("PERFIL ADMINISTRADOR FINANCEIRO É OBRIGATÓRIO.");
  }
}

function parsePermissionCodes(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeFinancePermissionCodes(parsed) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class FinanceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  listProfiles() {
    assertFinanceAdmin();
    return FINANCE_PROFILES;
  }

  listSourceProfiles() {
    assertFinanceAdmin();
    return [
      { code: "ADMIN_TOTAL", role: "ADMIN", name: "ADMINISTRADOR TOTAL" },
      { code: "SECRETARIA_PADRAO", role: "SECRETARIA", name: "SECRETARIA" },
      {
        code: "COORDENACAO_PEDAGOGICA",
        role: "COORDENACAO",
        name: "COORDENAÇÃO",
      },
    ];
  }

  async resolvePerson(payload: ResolveFinanceSystemPersonDto) {
    assertFinanceAdmin();
    requiredContext();
    return resolveSourceSystemPerson(payload.document);
  }

  async createSystemUser(payload: CreateFinanceSystemUserDto) {
    assertFinanceAdmin();
    const context = requiredContext();
    const profile = getFinanceProfile(payload.financeProfileCode);
    if (!profile) throw new BadRequestException("PERFIL FINANCEIRO INVÁLIDO.");
    const permissionCodes = normalizeFinancePermissionCodes(
      payload.financePermissionCodes,
    );
    if (!permissionCodes.includes("VIEW_FINANCIAL")) {
      throw new BadRequestException(
        "TODO USUÁRIO DO SISTEMA DEVE POSSUIR VIEW_FINANCIAL.",
      );
    }
    if (
      permissionCodes.some(
        (permissionCode) => !profile.permissionCodes.includes(permissionCode),
      )
    ) {
      throw new BadRequestException(
        "A PERMISSÃO INFORMADA NÃO PERTENCE AO PERFIL FINANCEIRO.",
      );
    }

    const sourceUser = await upsertSourceSystemUser({
      document: payload.document,
      name: payload.name,
      email: payload.email,
      login: payload.login,
      password: payload.password,
      confirmationPin: payload.confirmationPin,
      sourceRole: payload.sourceRole,
      sourceAccessProfile: payload.sourceAccessProfile,
      phone: payload.phone,
      whatsapp: payload.whatsapp,
      zipCode: payload.zipCode,
      street: payload.street,
      number: payload.number,
      neighborhood: payload.neighborhood,
      complement: payload.complement,
      city: payload.city,
      state: payload.state,
      branchCodes: [context.sourceBranchCode],
    });
    const confirmedSourcePerson = sourceUser.centralIdentityAccountId
      ? null
      : await resolveSourceSystemPerson(payload.document);
    const centralIdentityAccountId =
      sourceUser.centralIdentityAccountId?.trim() ||
      confirmedSourcePerson?.centralIdentityAccountId?.trim() ||
      null;
    const document = payload.document.trim();
    const actor = context.sourceUserId;
    const now = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const subject = await transaction.financeAccessSubject.upsert({
        where: {
          companyId_sourceSystem_sourceTenantId_sourceUserId: {
            companyId: context.companyId,
            sourceSystem: context.sourceSystem,
            sourceTenantId: context.sourceTenantId,
            sourceUserId: sourceUser.sourceUserId,
          },
        },
        create: {
          companyId: context.companyId,
          sourceSystem: context.sourceSystem,
          sourceTenantId: context.sourceTenantId,
          sourceUserId: sourceUser.sourceUserId,
          centralIdentityAccountId,
          registeredPersonId: sourceUser.registeredPersonId?.trim() || null,
          document,
          displayName: sourceUser.displayName.trim().toUpperCase(),
          email: sourceUser.email?.trim().toUpperCase() || null,
          sourceRole: sourceUser.sourceRole.trim().toUpperCase(),
          sourceBranchCodesJson: JSON.stringify(sourceUser.branchCodes),
          subjectType: "SYSTEM_USER",
          sourceActive: sourceUser.active,
          lastSynchronizedAt: now,
          createdBy: actor,
          updatedBy: actor,
        },
        update: {
          centralIdentityAccountId,
          registeredPersonId: sourceUser.registeredPersonId?.trim() || null,
          document,
          displayName: sourceUser.displayName.trim().toUpperCase(),
          email: sourceUser.email?.trim().toUpperCase() || null,
          sourceRole: sourceUser.sourceRole.trim().toUpperCase(),
          sourceBranchCodesJson: JSON.stringify(sourceUser.branchCodes),
          subjectType: "SYSTEM_USER",
          sourceActive: sourceUser.active,
          lastSynchronizedAt: now,
          updatedBy: actor,
          canceledAt: null,
          canceledBy: null,
        },
      });
      const assignment = await transaction.financeAccessAssignment.upsert({
        where: {
          companyId_subjectId_branchCode: {
            companyId: context.companyId,
            subjectId: subject.id,
            branchCode: context.sourceBranchCode,
          },
        },
        create: {
          companyId: context.companyId,
          subjectId: subject.id,
          branchCode: context.sourceBranchCode,
          profileCode: profile.code,
          permissionCodesJson: JSON.stringify(permissionCodes),
          active: true,
          createdBy: actor,
          updatedBy: actor,
        },
        update: {
          profileCode: profile.code,
          permissionCodesJson: JSON.stringify(permissionCodes),
          active: true,
          updatedBy: actor,
          canceledAt: null,
          canceledBy: null,
        },
      });
      await transaction.financeAccessAuditEvent.create({
        data: {
          companyId: context.companyId,
          branchCode: context.sourceBranchCode,
          subjectId: subject.id,
          action: "SYSTEM_USER_CREATED_OR_LINKED",
          summary: `USUÁRIO DO SISTEMA ${subject.displayName} CRIADO OU VINCULADO.`,
          metadataJson: JSON.stringify({
            sourceSystem: context.sourceSystem,
            sourceRole: sourceUser.sourceRole,
            sourceAccessProfile: payload.sourceAccessProfile,
            financeProfileCode: profile.code,
            reusedPerson: Boolean(sourceUser.registeredPersonId),
          }),
          performedBy: actor,
          createdBy: actor,
        },
      });
      return {
        ...subject,
        login: sourceUser.login,
        assignment: { ...assignment, permissionCodes },
      };
    });
  }

  async updateSystemUserConfirmationPin(
    subjectId: string,
    payload: UpdateFinanceSystemUserPinDto,
  ) {
    assertFinanceAdmin();
    const context = requiredContext();
    const subject = await this.prisma.financeAccessSubject.findFirst({
      where: {
        id: subjectId,
        companyId: context.companyId,
        sourceSystem: context.sourceSystem,
        sourceTenantId: context.sourceTenantId,
        canceledAt: null,
      },
    });
    if (!subject) throw new NotFoundException("USUÁRIO FINANCEIRO NÃO ENCONTRADO.");
    let sourceBranchCodes: number[] = [];
    try {
      const parsed = JSON.parse(subject.sourceBranchCodesJson);
      sourceBranchCodes = Array.isArray(parsed) ? parsed : [];
    } catch {
      sourceBranchCodes = [];
    }
    if (!sourceBranchCodes.includes(context.sourceBranchCode)) {
      throw new ForbiddenException("USUÁRIO SEM VÍNCULO COM A FILIAL AUTENTICADA.");
    }
    if (!subject.sourceActive) {
      throw new BadRequestException("USUÁRIO INATIVO NA ORIGEM NÃO PODE ALTERAR O PIN.");
    }
    await updateSourceSystemUserConfirmationPin(
      subject.sourceUserId,
      payload.confirmationPin,
    );
    await this.prisma.financeAccessAuditEvent.create({
      data: {
        companyId: context.companyId,
        branchCode: context.sourceBranchCode,
        subjectId: subject.id,
        action: "SYSTEM_USER_CONFIRMATION_PIN_UPDATED",
        summary: `PIN DE CONFIRMAÇÃO DE ${subject.displayName} ATUALIZADO.`,
        metadataJson: JSON.stringify({ sourceSystem: context.sourceSystem }),
        performedBy: context.sourceUserId,
        createdBy: context.sourceUserId,
      },
    });
    return { updated: true };
  }

  async updateSystemUserPassword(
    subjectId: string,
    payload: UpdateFinanceSystemUserPasswordDto,
  ) {
    assertFinanceAdmin();
    const context = requiredContext();
    const subject = await this.prisma.financeAccessSubject.findFirst({
      where: {
        id: subjectId,
        companyId: context.companyId,
        sourceSystem: context.sourceSystem,
        sourceTenantId: context.sourceTenantId,
        canceledAt: null,
      },
    });
    if (!subject) throw new NotFoundException("USUÁRIO FINANCEIRO NÃO ENCONTRADO.");
    let sourceBranchCodes: number[] = [];
    try {
      const parsed = JSON.parse(subject.sourceBranchCodesJson);
      sourceBranchCodes = Array.isArray(parsed) ? parsed : [];
    } catch {
      sourceBranchCodes = [];
    }
    if (!sourceBranchCodes.includes(context.sourceBranchCode)) {
      throw new ForbiddenException("USUÁRIO SEM VÍNCULO COM A FILIAL AUTENTICADA.");
    }
    if (!subject.sourceActive) {
      throw new BadRequestException("USUÁRIO INATIVO NA ORIGEM NÃO PODE ALTERAR A SENHA.");
    }
    await updateSourceSystemUserPassword(subject.sourceUserId, payload.password);
    await this.prisma.financeAccessAuditEvent.create({
      data: {
        companyId: context.companyId,
        branchCode: context.sourceBranchCode,
        subjectId: subject.id,
        action: "SYSTEM_USER_PASSWORD_UPDATED",
        summary: `SENHA DE ACESSO DE ${subject.displayName} REDEFINIDA.`,
        metadataJson: JSON.stringify({ sourceSystem: context.sourceSystem }),
        performedBy: context.sourceUserId,
        createdBy: context.sourceUserId,
      },
    });
    return { updated: true };
  }

  async listSubjects() {
    assertFinanceAdmin();
    const context = requiredContext();
    const subjects = await this.prisma.financeAccessSubject.findMany({
      where: {
        companyId: context.companyId,
        sourceSystem: context.sourceSystem,
        sourceTenantId: context.sourceTenantId,
        canceledAt: null,
      },
      include: {
        assignments: {
          where: { branchCode: context.sourceBranchCode, canceledAt: null },
        },
      },
      orderBy: [{ sourceActive: "desc" }, { displayName: "asc" }],
    });

    return subjects
      .filter((subject) => {
        try {
          const branchCodes = JSON.parse(subject.sourceBranchCodesJson);
          return Array.isArray(branchCodes) && branchCodes.includes(context.sourceBranchCode);
        } catch {
          return false;
        }
      })
      .map(({ assignments, sourceBranchCodesJson: _sourceBranchCodesJson, ...subject }) => ({
        ...subject,
        assignment: assignments[0]
          ? {
              ...assignments[0],
              permissionCodes: parsePermissionCodes(assignments[0].permissionCodesJson),
            }
          : null,
      }));
  }

  async synchronize(payload: SynchronizeFinanceAccessSubjectsDto) {
    assertFinanceAdmin();
    const context = requiredContext();
    const actor = context.sourceUserId;
    const now = new Date();
    const inputIds = new Set(payload.subjects.map((subject) => subject.externalUserId.trim()));

    const result = await this.prisma.$transaction(async (transaction) => {
      for (const subject of payload.subjects) {
        const sourceUserId = subject.externalUserId.trim();
        const sourceBranchCodes = [...new Set(subject.branchCodes)].sort(
          (left, right) => left - right,
        );
        const data = {
          centralIdentityAccountId: subject.centralIdentityAccountId?.trim() || null,
          registeredPersonId: subject.registeredPersonId?.trim() || null,
          document: subject.document?.trim() || null,
          displayName: subject.displayName.trim().toUpperCase(),
          email: subject.email?.trim().toUpperCase() || null,
          sourceRole: subject.sourceRole?.trim().toUpperCase() || null,
          sourceBranchCodesJson: JSON.stringify(sourceBranchCodes),
          sourceActive: subject.active,
          lastSynchronizedAt: now,
          updatedBy: actor,
          canceledAt: null,
          canceledBy: null,
        };
        const synchronizedSubject = await transaction.financeAccessSubject.upsert({
          where: {
            companyId_sourceSystem_sourceTenantId_sourceUserId: {
              companyId: context.companyId,
              sourceSystem: context.sourceSystem,
              sourceTenantId: context.sourceTenantId,
              sourceUserId,
            },
          },
          create: {
            companyId: context.companyId,
            sourceSystem: context.sourceSystem,
            sourceTenantId: context.sourceTenantId,
            sourceUserId,
            ...data,
            createdBy: actor,
          },
          update: data,
        });
        await transaction.financeAccessAssignment.updateMany({
          where: {
            companyId: context.companyId,
            subjectId: synchronizedSubject.id,
            branchCode: { notIn: sourceBranchCodes },
            canceledAt: null,
          },
          data: { active: false, updatedBy: actor },
        });
      }

      const currentSubjects = await transaction.financeAccessSubject.findMany({
        where: {
          companyId: context.companyId,
          sourceSystem: context.sourceSystem,
          sourceTenantId: context.sourceTenantId,
          canceledAt: null,
        },
        select: { id: true, sourceUserId: true },
      });
      const staleIds = currentSubjects
        .filter((subject) => !inputIds.has(subject.sourceUserId))
        .map((subject) => subject.id);
      if (staleIds.length) {
        await transaction.financeAccessSubject.updateMany({
          where: { id: { in: staleIds }, companyId: context.companyId },
          data: { sourceActive: false, updatedBy: actor },
        });
        await transaction.financeAccessAssignment.updateMany({
          where: { subjectId: { in: staleIds }, companyId: context.companyId, canceledAt: null },
          data: { active: false, updatedBy: actor },
        });
      }

      const assignmentCount = await transaction.financeAccessAssignment.count({
        where: { companyId: context.companyId, branchCode: context.sourceBranchCode, canceledAt: null },
      });
      if (assignmentCount === 0) {
        const actorSubject = await transaction.financeAccessSubject.findUnique({
          where: {
            companyId_sourceSystem_sourceTenantId_sourceUserId: {
              companyId: context.companyId,
              sourceSystem: context.sourceSystem,
              sourceTenantId: context.sourceTenantId,
              sourceUserId: actor,
            },
          },
        });
        if (!actorSubject?.sourceActive) {
          throw new ForbiddenException("O ADMINISTRADOR AUTENTICADO NÃO FOI RECEBIDO NA SINCRONIZAÇÃO.");
        }
        const adminProfile = getFinanceProfile("ADMIN_FINANCEIRO")!;
        await transaction.financeAccessAssignment.create({
          data: {
            companyId: context.companyId,
            subjectId: actorSubject.id,
            branchCode: context.sourceBranchCode,
            profileCode: adminProfile.code,
            permissionCodesJson: JSON.stringify(adminProfile.permissionCodes),
            active: true,
            createdBy: actor,
            updatedBy: actor,
          },
        });
      }

      await transaction.financeAccessAuditEvent.create({
        data: {
          companyId: context.companyId,
          branchCode: context.sourceBranchCode,
          action: "SOURCE_SUBJECTS_SYNCHRONIZED",
          summary: `${payload.subjects.length} USUÁRIO(S) SINCRONIZADO(S) DA ORIGEM.`,
          metadataJson: JSON.stringify({ synchronized: payload.subjects.length, deactivated: staleIds.length }),
          performedBy: actor,
          createdBy: actor,
        },
      });
      return { synchronized: payload.subjects.length, deactivated: staleIds.length };
    });

    return result;
  }

  async saveAssignment(subjectId: string, payload: SaveFinanceAccessAssignmentDto) {
    assertFinanceAdmin();
    const context = requiredContext();
    const profile = getFinanceProfile(payload.profileCode);
    if (!profile) throw new BadRequestException("PERFIL FINANCEIRO INVÁLIDO.");
    const permissionCodes = normalizeFinancePermissionCodes(payload.permissionCodes);
    if (!permissionCodes.includes("VIEW_FINANCIAL")) {
      throw new BadRequestException("TODO PERFIL ATIVO DEVE POSSUIR VIEW_FINANCIAL.");
    }
    if (permissionCodes.some((code) => !profile.permissionCodes.includes(code))) {
      throw new BadRequestException("A PERMISSÃO INFORMADA NÃO PERTENCE AO PERFIL SELECIONADO.");
    }

    return this.prisma.$transaction(async (transaction) => {
      const subject = await transaction.financeAccessSubject.findFirst({
        where: { id: subjectId, companyId: context.companyId, canceledAt: null },
      });
      if (!subject) throw new NotFoundException("USUÁRIO FINANCEIRO NÃO ENCONTRADO.");
      let sourceBranchCodes: number[] = [];
      try {
        const parsed = JSON.parse(subject.sourceBranchCodesJson);
        sourceBranchCodes = Array.isArray(parsed) ? parsed : [];
      } catch {
        sourceBranchCodes = [];
      }
      if (!sourceBranchCodes.includes(context.sourceBranchCode)) {
        throw new ForbiddenException("USUÁRIO SEM VÍNCULO COM A FILIAL AUTENTICADA.");
      }
      if (!subject.sourceActive && payload.active) {
        throw new BadRequestException("USUÁRIO INATIVO NA ORIGEM NÃO PODE RECEBER ACESSO.");
      }

      const previous = await transaction.financeAccessAssignment.findUnique({
        where: {
          companyId_subjectId_branchCode: {
            companyId: context.companyId,
            subjectId,
            branchCode: context.sourceBranchCode,
          },
        },
      });
      const removesAdmin = previous?.active && previous.profileCode === "ADMIN_FINANCEIRO" &&
        (!payload.active || !permissionCodes.includes("FINANCE_ADMIN"));
      if (removesAdmin) {
        const activeAdmins = await transaction.financeAccessAssignment.count({
          where: {
            companyId: context.companyId,
            branchCode: context.sourceBranchCode,
            active: true,
            profileCode: "ADMIN_FINANCEIRO",
            canceledAt: null,
          },
        });
        if (activeAdmins <= 1) {
          throw new BadRequestException("A FILIAL DEVE MANTER AO MENOS UM ADMINISTRADOR FINANCEIRO ATIVO.");
        }
      }

      const assignment = await transaction.financeAccessAssignment.upsert({
        where: {
          companyId_subjectId_branchCode: {
            companyId: context.companyId,
            subjectId,
            branchCode: context.sourceBranchCode,
          },
        },
        create: {
          companyId: context.companyId,
          subjectId,
          branchCode: context.sourceBranchCode,
          profileCode: profile.code,
          permissionCodesJson: JSON.stringify(permissionCodes),
          active: payload.active,
          createdBy: context.sourceUserId,
          updatedBy: context.sourceUserId,
        },
        update: {
          profileCode: profile.code,
          permissionCodesJson: JSON.stringify(permissionCodes),
          active: payload.active,
          updatedBy: context.sourceUserId,
          canceledAt: null,
          canceledBy: null,
        },
      });
      await transaction.financeAccessAuditEvent.create({
        data: {
          companyId: context.companyId,
          branchCode: context.sourceBranchCode,
          subjectId,
          action: previous ? "ASSIGNMENT_UPDATED" : "ASSIGNMENT_CREATED",
          summary: `ACESSO FINANCEIRO DE ${subject.displayName} ATUALIZADO.`,
          metadataJson: JSON.stringify({ before: previous, after: assignment }),
          performedBy: context.sourceUserId,
          createdBy: context.sourceUserId,
        },
      });
      return { ...assignment, permissionCodes };
    });
  }
}
