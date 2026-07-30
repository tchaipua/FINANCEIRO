import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PublicEndpoint } from "./public-endpoint.decorator";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @PublicEndpoint()
  getHealth() {
    return { status: "ok" };
  }

  @Get("ready")
  @PublicEndpoint()
  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready", database: "ok" };
    } catch {
      throw new ServiceUnavailableException({
        status: "unavailable",
      });
    }
  }
}
