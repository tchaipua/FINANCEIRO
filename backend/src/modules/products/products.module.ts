import { Module } from "@nestjs/common";
import { ProductsController } from "./infrastructure/products.controller";
import { ProductsService } from "./application/products.service";

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
