import { Module } from "@nestjs/common";
import { CustomersService } from "./application/customers.service";
import { CustomersController } from "./infrastructure/customers.controller";

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
