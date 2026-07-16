import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CustomersService } from "../application/customers.service";
import {
  ChangeCustomerStatusDto,
  ListCustomersDto,
  SaveCustomerDto,
  SyncCustomersDto,
} from "../application/dto/customers.dto";

@ApiTags("Customers")
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: "Lista clientes da empresa financeira atual" })
  list(@Query() query: ListCustomersDto) {
    return this.customersService.list(query);
  }

  @Post("sync")
  @ApiOperation({
    summary: "Sincroniza clientes pagadores vindos do sistema Escola",
  })
  sync(@Body() payload: SyncCustomersDto) {
    return this.customersService.sync(payload);
  }

  @Post()
  @ApiOperation({ summary: "Cadastra um cliente diretamente no Financeiro" })
  create(@Body() payload: SaveCustomerDto) {
    return this.customersService.create(payload);
  }

  @Patch(":customerId")
  @ApiOperation({ summary: "Atualiza um cliente cadastrado no Financeiro" })
  update(
    @Param("customerId") customerId: string,
    @Body() payload: SaveCustomerDto,
  ) {
    return this.customersService.update(customerId, payload);
  }

  @Post(":customerId/activate")
  @ApiOperation({ summary: "Reativa um cliente cadastrado no Financeiro" })
  activate(
    @Param("customerId") customerId: string,
    @Body() payload: ChangeCustomerStatusDto,
  ) {
    return this.customersService.activate(customerId, payload);
  }

  @Post(":customerId/inactivate")
  @ApiOperation({ summary: "Inativa logicamente um cliente" })
  inactivate(
    @Param("customerId") customerId: string,
    @Body() payload: ChangeCustomerStatusDto,
  ) {
    return this.customersService.inactivate(customerId, payload);
  }
}
