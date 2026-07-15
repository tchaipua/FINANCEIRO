export type NfceEnvironment = "PRODUCTION" | "HOMOLOGATION";

export type NfceIssuer = {
  stateCode: string;
  cityCode: string;
  cnpj: string;
  stateRegistration: string;
  legalName: string;
  tradeName?: string | null;
  taxRegimeCode: "1" | "2" | "3";
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string | null;
};

export type NfceItem = {
  code: string;
  description: string;
  ncmCode: string;
  cestCode?: string | null;
  cfopCode: string;
  unitCode: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  originCode: string;
  icmsCst: string;
  icmsRate?: number;
  pisCst: string;
  cofinsCst: string;
  ibsCbsCst?: string;
  ibsCbsClassCode?: string;
  ibsStateRate?: number;
  ibsMunicipalRate?: number;
  cbsRate?: number;
};

export type NfceRecipient = {
  name: string;
  document: string;
};

export type NfcePayment = {
  methodCode: string;
  amount: number;
  cardIntegrationType?: "1" | "2";
};

export type BuildNfceOptions = {
  environment: NfceEnvironment;
  issuer: NfceIssuer;
  recipient?: NfceRecipient | null;
  series: number;
  number: number;
  issuedAt: Date;
  randomCode?: string;
  items: NfceItem[];
  payments: NfcePayment[];
  additionalInformation?: string | null;
  softwareVersion?: string | null;
};

export type BuiltNfce = {
  accessKey: string;
  checkDigit: string;
  randomCode: string;
  unsignedXml: string;
  qrCodeUrl: string;
  publicConsultationUrl: string;
  totals: {
    products: number;
    discount: number;
    icmsBase: number;
    icms: number;
    invoice: number;
  };
};

export type NfceCertificateMaterial = {
  pfxBuffer: Buffer;
  passphrase: string;
  privateKeyPem: string;
  certificatePem: string;
  holderCnpj: string;
};

export type NfceAuthorizationResult = {
  authorized: boolean;
  environment: NfceEnvironment;
  statusCode: string;
  statusMessage: string;
  protocol: string | null;
  receivedAt: string | null;
  responseXml: string;
  processedXml: string | null;
};
