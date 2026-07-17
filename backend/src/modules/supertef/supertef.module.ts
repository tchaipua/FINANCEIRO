import { Module } from "@nestjs/common";
import { SuperTefService } from "./application/supertef.service";
import { SuperTefClient } from "./application/supertef.client";
import { SuperTefController } from "./infrastructure/supertef.controller";

@Module({
  controllers: [SuperTefController],
  providers: [SuperTefService, SuperTefClient],
  exports: [SuperTefService],
})
export class SuperTefModule {}
