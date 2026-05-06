import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProductsService } from "../application/products.service";
import {
  ChangeProductStatusDto,
  GetProductDto,
  ListProductsDto,
  SaveProductDto,
} from "../application/dto/products.dto";

@ApiTags("Products")
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: "Lista os produtos cadastrados para a empresa financeira informada",
  })
  list(@Query() query: ListProductsDto) {
    return this.productsService.list(query);
  }

  @Get(":productId")
  @ApiOperation({
    summary: "Carrega o cadastro completo do produto informado",
  })
  get(@Param("productId") productId: string, @Query() query: GetProductDto) {
    return this.productsService.get(productId, query);
  }

  @Post()
  @ApiOperation({
    summary: "Cria um novo cadastro de produto no Financeiro",
  })
  create(@Body() payload: SaveProductDto) {
    return this.productsService.create(payload);
  }

  @Patch(":productId")
  @ApiOperation({
    summary: "Atualiza o cadastro de produto informado",
  })
  update(@Param("productId") productId: string, @Body() payload: SaveProductDto) {
    return this.productsService.update(productId, payload);
  }

  @Post(":productId/activate")
  @ApiOperation({
    summary: "Reativa um cadastro de produto inativo",
  })
  activate(
    @Param("productId") productId: string,
    @Body() payload: ChangeProductStatusDto,
  ) {
    return this.productsService.activate(productId, payload);
  }

  @Post(":productId/inactivate")
  @ApiOperation({
    summary: "Inativa um cadastro de produto no Financeiro",
  })
  inactivate(
    @Param("productId") productId: string,
    @Body() payload: ChangeProductStatusDto,
  ) {
    return this.productsService.inactivate(productId, payload);
  }
}
