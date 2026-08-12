import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProductClassificationsService } from "../application/product-classifications.service";
import {
  ChangeProductClassificationStatusDto,
  ListProductClassificationsDto,
  SaveProductGroupDto,
  SaveProductSubgroupDto,
} from "../application/dto/product-classifications.dto";

@ApiTags("Product classifications")
@Controller("product-classifications")
export class ProductClassificationsController {
  constructor(private readonly service: ProductClassificationsService) {}

  @Get()
  @ApiOperation({ summary: "Lista grupos e subgrupos de estoque da filial" })
  list(@Query() query: ListProductClassificationsDto) {
    return this.service.list(query);
  }

  @Post("groups")
  createGroup(@Body() payload: SaveProductGroupDto) {
    return this.service.createGroup(payload);
  }

  @Patch("groups/:id")
  updateGroup(@Param("id") id: string, @Body() payload: SaveProductGroupDto) {
    return this.service.updateGroup(id, payload);
  }

  @Post("groups/:id/status")
  changeGroupStatus(@Param("id") id: string, @Body() payload: ChangeProductClassificationStatusDto) {
    return this.service.changeStatus("GROUP", id, payload);
  }

  @Post("subgroups")
  createSubgroup(@Body() payload: SaveProductSubgroupDto) {
    return this.service.createSubgroup(payload);
  }

  @Patch("subgroups/:id")
  updateSubgroup(@Param("id") id: string, @Body() payload: SaveProductSubgroupDto) {
    return this.service.updateSubgroup(id, payload);
  }

  @Post("subgroups/:id/status")
  changeSubgroupStatus(@Param("id") id: string, @Body() payload: ChangeProductClassificationStatusDto) {
    return this.service.changeStatus("SUBGROUP", id, payload);
  }
}
