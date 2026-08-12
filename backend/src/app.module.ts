import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ReceivablesModule } from "./modules/receivables/receivables.module";
import { CashSessionsModule } from "./modules/cash-sessions/cash-sessions.module";
import { BanksModule } from "./modules/banks/banks.module";
import { ProductsModule } from "./modules/products/products.module";
import { ProductClassificationsModule } from "./modules/product-classifications/product-classifications.module";
import { PayablesModule } from "./modules/payables/payables.module";
import { FiscalCertificatesModule } from "./modules/fiscal-certificates/fiscal-certificates.module";
import { SalesModule } from "./modules/sales/sales.module";
import { FinanceContextMiddleware } from "./common/finance-context.middleware";
import { FiscalDocumentsModule } from "./modules/fiscal-documents/fiscal-documents.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { SuperTefModule } from "./modules/supertef/supertef.module";
import { S3ControlModule } from "./modules/s3-control/s3-control.module";
import { PrintingModule } from "./modules/printing/printing.module";
import { getRateLimitConfig } from "./common/security-config";
import { InternalApiAuthGuard } from "./common/internal-api-auth.guard";
import { InternalReplayCacheService } from "./common/internal-replay-cache.service";
import { HealthController } from "./common/health.controller";
import { MultipartBodyMiddleware } from "./common/multipart-body.middleware";

@Module({
  imports: [
    ThrottlerModule.forRoot([getRateLimitConfig()]),
    PrismaModule,
    CompaniesModule,
    DashboardModule,
    ReceivablesModule,
    CashSessionsModule,
    BanksModule,
    ProductsModule,
    ProductClassificationsModule,
    PayablesModule,
    FiscalCertificatesModule,
    FiscalDocumentsModule,
    SalesModule,
    CustomersModule,
    SuperTefModule,
    S3ControlModule,
    PrintingModule,
  ],
  controllers: [HealthController],
  providers: [
    InternalReplayCacheService,
    {
      provide: APP_GUARD,
      useClass: InternalApiAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MultipartBodyMiddleware, FinanceContextMiddleware)
      .forRoutes("*");
  }
}
