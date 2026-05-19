import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { branchMiddleware } from "./prisma.middleware";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    this.$use(branchMiddleware());
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
