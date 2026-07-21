export type NfseEnvironment = "HOMOLOGATION" | "PRODUCTION";

export type NfseAddress = {
  cityCode: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
};

export type NfseIssuer = {
  document: string;
  municipalRegistration?: string | null;
  legalName: string;
  address: NfseAddress;
  phone?: string | null;
  email?: string | null;
  simpleNationalOption: 1 | 2 | 3;
  simpleNationalTaxRegime?: 1 | 2 | 3 | null;
  specialTaxRegime: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 9;
};

export type NfseTaker = {
  document: string;
  municipalRegistration?: string | null;
  name: string;
  address: NfseAddress;
  phone?: string | null;
  email?: string | null;
};

export type NfseServiceDefinition = {
  internalCode: string;
  nationalTaxCode: string;
  municipalTaxCode?: string | null;
  description: string;
  nbsCode?: string | null;
  serviceCityCode: string;
  issTaxationCode: "1" | "2" | "3" | "4";
  issWithholdingCode: "1" | "2" | "3";
  issRate?: number | null;
  pisCofinsCst?: string | null;
  pisRate?: number | null;
  cofinsRate?: number | null;
  simpleNationalTotalTaxRate?: number | null;
  ibsCbsEnabled?: boolean;
};

export type NfseDpsBuildInput = {
  environment: NfseEnvironment;
  schemaVersion: "1.01";
  softwareVersion: string;
  series: number;
  number: number;
  issuedAt: Date;
  competenceDate: Date;
  issuer: NfseIssuer;
  taker: NfseTaker;
  service: NfseServiceDefinition;
  grossAmount: number;
  discountAmount?: number;
  deductionAmount?: number;
};

export type NfseNationalResponse = {
  httpStatus: number;
  body: unknown;
  rawBody: string;
};
