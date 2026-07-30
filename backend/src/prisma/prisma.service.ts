import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { branchMiddleware } from "./prisma.middleware";
import {
  assertPostgresqlRuntimeRoleIsLeastPrivileged,
  shouldVerifyPostgresqlRuntimeRole,
} from "./postgresql-runtime-security";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    this.$use(branchMiddleware());
    await this.$connect();
    if (shouldVerifyPostgresqlRuntimeRole()) {
      await assertPostgresqlRuntimeRoleIsLeastPrivileged(this);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
