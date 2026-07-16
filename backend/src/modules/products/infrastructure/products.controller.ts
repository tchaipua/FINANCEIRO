import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProductsService } from "../application/products.service";
import {
  ChangeProductStatusDto,
  CreateManualStockMovementDto,
  GetProductDto,
  ListProductsDto,
  ListStockMovementsDto,
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

  @Get("stock-movements")
  @ApiOperation({
    summary: "Lista o histórico de movimentações de estoque",
  })
  listStockMovements(@Query() query: ListStockMovementsDto) {
    return this.productsService.listStockMovements(query);
  }

  @Get(":productId")
  @ApiOperation({
    summary: "Carrega o cadastro completo do produto informado",
  })
  get(@Param("productId") productId: string, @Query() query: GetProductDto) {
    return this.productsService.get(productId, query);
  }

  @Post(":productId/stock-movements")
  @ApiOperation({
    summary: "Registra uma entrada ou saída manual auditada no estoque",
  })
  createManualStockMovement(
    @Param("productId") productId: string,
    @Body() payload: CreateManualStockMovementDto,
  ) {
    return this.productsService.createManualStockMovement(productId, payload);
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
