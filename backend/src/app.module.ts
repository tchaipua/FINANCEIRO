import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ReceivablesModule } from "./modules/receivables/receivables.module";
import { CashSessionsModule } from "./modules/cash-sessions/cash-sessions.module";
import { BanksModule } from "./modules/banks/banks.module";
import { ProductsModule } from "./modules/products/products.module";
import { PayablesModule } from "./modules/payables/payables.module";
import { FiscalCertificatesModule } from "./modules/fiscal-certificates/fiscal-certificates.module";
import { SalesModule } from "./modules/sales/sales.module";
import { FinanceContextMiddleware } from "./common/finance-context.middleware";
import { FiscalDocumentsModule } from "./modules/fiscal-documents/fiscal-documents.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { SuperTefModule } from "./modules/supertef/supertef.module";
import { S3ControlModule } from "./modules/s3-control/s3-control.module";
import { PrintingModule } from "./modules/printing/printing.module";

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
    FiscalDocumentsModule,
    SalesModule,
    CustomersModule,
    SuperTefModule,
    S3ControlModule,
    PrintingModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FinanceContextMiddleware).forRoutes("*");
  }
}
