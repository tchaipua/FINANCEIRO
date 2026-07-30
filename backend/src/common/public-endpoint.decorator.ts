import { SetMetadata } from "@nestjs/common";

export const PUBLIC_ENDPOINT_METADATA = "financeiro:public-endpoint";

export const PublicEndpoint = () =>
  SetMetadata(PUBLIC_ENDPOINT_METADATA, true);
