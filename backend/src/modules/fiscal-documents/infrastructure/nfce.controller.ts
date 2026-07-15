import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IssueSaleNfceDto, NfceContextDto, SaveNfceProfileDto } from "../application/dto/nfce.dto";
import { NfceService } from "../application/nfce/nfce.service";

@ApiTags("Fiscal Documents - NFC-e")
@Controller("fiscal-documents/nfce")
export class NfceController {
  constructor(private readonly nfceService: NfceService) {}

  @Get("profile")
  @ApiOperation({ summary: "Consulta o perfil NFC-e da empresa e filial" })
  getProfile(@Query() query: NfceContextDto) {
    return this.nfceService.getProfile(query);
  }

  @Put("profile")
  @ApiOperation({ summary: "Configura o perfil NFC-e da empresa e filial" })
  saveProfile(@Body() payload: SaveNfceProfileDto) {
    return this.nfceService.saveProfile(payload);
  }

  @Get("sales/:saleId")
  @ApiOperation({ summary: "Consulta a NFC-e e as tentativas fiscais da venda" })
  getSaleDocument(@Param("saleId") saleId: string, @Query() query: NfceContextDto) {
    return this.nfceService.getSaleDocument(saleId, query);
  }

  @Post("sales/:saleId/issue")
  @ApiOperation({ summary: "Emite ou reprocessa de forma idempotente a NFC-e da venda" })
  issueSale(@Param("saleId") saleId: string, @Body() payload: IssueSaleNfceDto) {
    return this.nfceService.issueSale(saleId, payload);
  }
}
