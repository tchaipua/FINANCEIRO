import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ReceivablesModule } from "./modules/receivables/receivables.module";
import { CashSessionsModule } from "./modules/cash-sessions/cash-sessions.module";

@Module({
  imports: [
    PrismaModule,
    CompaniesModule,
    DashboardModule,
    ReceivablesModule,
    CashSessionsModule,
  ],
})
export class AppModule {}
