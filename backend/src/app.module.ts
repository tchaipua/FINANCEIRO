import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ReceivablesModule } from "./modules/receivables/receivables.module";
import { CashSessionsModule } from "./modules/cash-sessions/cash-sessions.module";
import { BanksModule } from "./modules/banks/banks.module";
import { ProductsModule } from "./modules/products/products.module";
import { PayablesModule } from "./modules/payables/payables.module";
import { FiscalCertificatesModule } from "./modules/fiscal-certificates/fiscal-certificates.module";

@Module({
  imports: [
    PrismaModule,
    CompaniesModule,
    DashboardModule,
    ReceivablesModule,
    CashSessionsModule,
    BanksModule,
    ProductsModule,
    PayablesModule,
    FiscalCertificatesModule,
  ],
})
export class AppModule {}
