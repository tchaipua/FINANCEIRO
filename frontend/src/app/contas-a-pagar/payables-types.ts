export type PayableInvoiceImportSummary = {
  id: string;
  companyId: string;
  companyName?: string | null;
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  status: string;
  statusLabel: string;
  semaphore: 'GREEN' | 'YELLOW';
  importType: string;
  documentModel: string;
  accessKey: string;
  fiscalCertificateId?: string | null;
  distributionNsu?: string | null;
  invoiceNumber: string;
  series?: string | null;
  operationNature?: string | null;
  issueDate: string;
  entryDate?: string | null;
  totalProductsAmount: number;
  totalInvoiceAmount: number;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierDocument?: string | null;
  itemsCount: number;
  installmentsCount: number;
  payableInstallmentsCount: number;
  stockMovementCount: number;
  approvedAt?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  message?: string;
  alreadyImported?: boolean;
};

export type PayableInvoiceImportItem = {
  id: string;
  lineNumber: number;
  approvalAction?: 'LINK_EXISTING' | 'CREATE_PRODUCT' | 'IGNORE_STOCK' | null;
  productId?: string | null;
  productName?: string | null;
  productTracksInventory?: boolean | null;
  recommendedAction: 'LINK_EXISTING' | 'CREATE_PRODUCT';
  supplierItemCode?: string | null;
  barcode?: string | null;
  description: string;
  ncmCode?: string | null;
  cfopCode?: string | null;
  unitCode?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  tracksInventory: boolean;
};

export type PayableInvoiceImportInstallment = {
  id: string;
  installmentLabel?: string | null;
  installmentNumber: number;
  dueDate: string;
  originalAmount: number;
  additionAmount: number;
  discountAmount: number;
  finalAmount: number;
  amount: number;
  status: string;
  paymentMethod?: string | null;
  settledAt?: string | null;
  notes?: string | null;
};

export type PayableTitleInstallment = {
  id: string;
  installmentNumber: number;
  installmentCount: number;
  dueDate: string;
  originalAmount?: number;
  additionAmount?: number;
  discountAmount?: number;
  finalAmount?: number;
  amount: number;
  openAmount: number;
  paidAmount?: number;
  status: string;
  paymentMethod?: string | null;
  settledAt?: string | null;
  notes?: string | null;
};

export type PayableTitleSnapshot = {
  id: string;
  status: string;
  documentNumber: string;
  description: string;
  installments: PayableTitleInstallment[];
};

export type StockMovementSnapshot = {
  id: string;
  productId: string;
  productName?: string | null;
  quantity: number;
  previousStock: number;
  resultingStock: number;
  occurredAt: string;
};

export type PayableInvoiceImportDetail = PayableInvoiceImportSummary & {
  approvalNotes?: string | null;
  items: PayableInvoiceImportItem[];
  installments: PayableInvoiceImportInstallment[];
  payableTitle?: PayableTitleSnapshot | null;
  stockMovements: StockMovementSnapshot[];
};

export type ProductOption = {
  id: string;
  name: string;
  internalCode?: string | null;
  barcode?: string | null;
  unitCode: string;
  tracksInventory: boolean;
  status: string;
};

export type FiscalCertificateItem = {
  id: string;
  companyId: string;
  companyName?: string | null;
  sourceSystem?: string | null;
  sourceTenantId?: string | null;
  status: string;
  certificateType: string;
  environment: 'PRODUCTION' | 'HOMOLOGATION';
  purpose: string;
  isDefault: boolean;
  aliasName: string;
  authorStateCode: string;
  holderName: string;
  holderDocument: string;
  serialNumber?: string | null;
  thumbprint?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  expired: boolean;
  hasStoredCertificate: boolean;
  lastNsu?: string | null;
  lastMaxNsu?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  canceledAt?: string | null;
  certificatePassword?: string;
};

export type ApprovalItemState = {
  action: 'LINK_EXISTING' | 'CREATE_PRODUCT' | 'IGNORE_STOCK';
  productId: string;
  productName: string;
  internalCode: string;
  sku: string;
  barcode: string;
  unitCode: string;
  productType: string;
  tracksInventory: boolean;
  allowFraction: boolean;
  minimumStock: string;
  notes: string;
};
