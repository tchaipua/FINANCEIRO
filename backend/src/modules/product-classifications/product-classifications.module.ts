import { Module } from "@nestjs/common";
import { ProductClassificationsController } from "./infrastructure/product-classifications.controller";
import { ProductClassificationsService } from "./application/product-classifications.service";

@Module({
  controllers: [ProductClassificationsController],
  providers: [ProductClassificationsService],
  exports: [ProductClassificationsService],
})
export class ProductClassificationsModule {}
