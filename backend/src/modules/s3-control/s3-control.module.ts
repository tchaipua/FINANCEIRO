import { Module } from "@nestjs/common";
import { S3ControlService } from "./application/s3-control.service";
import { S3ControlController } from "./infrastructure/s3-control.controller";

@Module({
  controllers: [S3ControlController],
  providers: [S3ControlService],
})
export class S3ControlModule {}
