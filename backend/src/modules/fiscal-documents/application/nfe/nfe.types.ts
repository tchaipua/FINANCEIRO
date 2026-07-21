export type NfeEnvironment = "PRODUCTION" | "HOMOLOGATION";

export type NfeIssuer = {
  stateCode: string;
  cityCode: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration?: string | null;
  legalName: string;
  tradeName?: string | null;
  taxRegimeCode: "1" | "2" | "3" | "4";
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode?: string | null;
  countryName?: string | null;
  phone?: string | null;
};

export type NfeRecipient = {
  name: string;
  document: string;
  stateRegistrationIndicator: "1" | "2" | "9";
  stateRegistration?: string | null;
  email?: string | null;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  cityCode: string;
  state: string;
  postalCode: string;
  countryCode?: string | null;
  countryName?: string | null;
  phone?: string | null;
};

export type NfeItem = {
  productId?: string | null;
  code: string;
  description: string;
  gtinCode?: string | null;
  taxableGtinCode?: string | null;
  ncmCode: string;
  cestCode?: string | null;
  fiscalBenefitCode?: string | null;
  cfopCode: string;
  unitCode: string;
  taxableUnitCode?: string | null;
  taxableConversionFactor?: number;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  originCode: string;
  icmsCsosnCode?: string | null;
  icmsCstCode?: string | null;
  icmsRate?: number;
  pisCstCode: string;
  pisRate?: number;
  cofinsCstCode: string;
  cofinsRate?: number;
  ipiCstCode?: string | null;
  ipiFrameworkCode?: string | null;
  ipiRate?: number;
  ibsCbsEnabled?: boolean;
  ibsCbsCstCode?: string | null;
  ibsCbsClassCode?: string | null;
  ibsStateRate?: number;
  ibsMunicipalRate?: number;
  cbsRate?: number;
};

export type NfePayment = {
  indicator: "0" | "1";
  methodCode: string;
  amount: number;
  cardIntegrationType?: "1" | "2";
  paymentDate?: string | null;
};

export type NfeInstallment = {
  number: string;
  dueDate: string;
  amount: number;
};

export type NfeTechnicalResponsible = {
  cnpj: string;
  contact: string;
  email: string;
  phone: string;
  csrtId?: string | null;
  csrtHash?: string | null;
};

export type BuildNfeOptions = {
  environment: NfeEnvironment;
  issuer: NfeIssuer;
  recipient: NfeRecipient;
  operationNature: string;
  operationType?: "0" | "1";
  destinationType: "1" | "2" | "3";
  purposeCode?: string;
  finalConsumer?: boolean;
  presenceIndicator?: string;
  intermediaryIndicator?: string | null;
  freightMode?: string;
  series: number;
  number: number;
  issuedAt: Date;
  randomCode?: string;
  items: NfeItem[];
  payments: NfePayment[];
  installments?: NfeInstallment[];
  invoiceReference?: string | null;
  additionalInformation?: string | null;
  softwareVersion?: string | null;
  technicalResponsible?: NfeTechnicalResponsible | null;
};

export type BuiltNfeItem = NfeItem & {
  lineNumber: number;
  grossAmount: number;
  discountAmount: number;
  totalAmount: number;
  icmsAmount: number;
  pisAmount: number;
  cofinsAmount: number;
  ipiAmount: number;
  taxDetails: Record<string, unknown>;
};

export type BuiltNfe = {
  accessKey: string;
  checkDigit: string;
  randomCode: string;
  unsignedXml: string;
  consultationUrl: string;
  items: BuiltNfeItem[];
  totals: {
    products: number;
    discount: number;
    icmsBase: number;
    icms: number;
    pis: number;
    cofins: number;
    ipi: number;
    invoice: number;
  };
};

export type NfeAuthorizationResult = {
  authorized: boolean;
  environment: NfeEnvironment;
  statusCode: string;
  statusMessage: string;
  protocol: string | null;
  receivedAt: string | null;
  responseXml: string;
  processedXml: string | null;
};
