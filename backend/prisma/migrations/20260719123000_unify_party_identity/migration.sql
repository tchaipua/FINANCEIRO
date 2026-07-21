-- Cadastro mestre de pessoas/empresas do Financeiro.
-- CPF/CNPJ identifica a Party em toda a empresa; filial, papel e origem ficam
-- em tabelas próprias. Nenhum registro de negócio é apagado nesta migração.

ALTER TABLE "parties" ADD COLUMN "documentNormalized" TEXT;
ALTER TABLE "parties" ADD COLUMN "mergedIntoPartyId" TEXT;
ALTER TABLE "parties" ADD COLUMN "mergedAt" DATETIME;
ALTER TABLE "parties" ADD COLUMN "mergedBy" TEXT;
ALTER TABLE "parties" ADD COLUMN "mergeReason" TEXT;

ALTER TABLE "suppliers"
  ADD COLUMN "partyId" TEXT REFERENCES "parties" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "party_roles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "roleType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "party_roles_identity_key"
    UNIQUE ("companyId", "partyId", "branchCode", "roleType"),
  CONSTRAINT "party_roles_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "party_roles_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "parties" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "party_external_references" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "sourceSystem" TEXT NOT NULL,
  "sourceTenantId" TEXT NOT NULL,
  "externalEntityType" TEXT NOT NULL,
  "externalEntityId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "party_external_references_identity_key"
    UNIQUE (
      "companyId",
      "sourceSystem",
      "sourceTenantId",
      "externalEntityType",
      "externalEntityId"
    ),
  CONSTRAINT "party_external_references_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "party_external_references_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "parties" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "party_audit_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "action" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "beforeJson" TEXT,
  "afterJson" TEXT,
  "metadataJson" TEXT,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performedBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "party_audit_events_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "party_audit_events_partyId_fkey"
    FOREIGN KEY ("partyId") REFERENCES "parties" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

UPDATE "parties"
SET "documentNormalized" = NULLIF(
  UPPER(
    REPLACE(
      REPLACE(
        REPLACE(
          REPLACE(TRIM(COALESCE("document", '')), '.', ''),
          '-',
          ''
        ),
        '/',
        ''
      ),
      ' ',
      ''
    )
  ),
  ''
);

CREATE TEMP TABLE "_party_identity_merge_map" AS
SELECT
  source."id" AS "sourcePartyId",
  (
    SELECT target."id"
    FROM "parties" target
    WHERE target."companyId" = source."companyId"
      AND target."documentNormalized" = source."documentNormalized"
    ORDER BY
      CASE WHEN target."canceledAt" IS NULL THEN 0 ELSE 1 END,
      target."createdAt" ASC,
      target."id" ASC
    LIMIT 1
  ) AS "canonicalPartyId"
FROM "parties" source
WHERE source."documentNormalized" IS NOT NULL;

-- Preserva toda chave externa antiga como alias da pessoa canônica.
INSERT OR IGNORE INTO "party_external_references" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "sourceSystem",
  "sourceTenantId",
  "externalEntityType",
  "externalEntityId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'LEGACY-REF-' || party."id",
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode",
  UPPER(company."sourceSystem"),
  UPPER(company."sourceTenantId"),
  UPPER(TRIM(party."externalEntityType")),
  UPPER(TRIM(party."externalEntityId")),
  party."createdAt",
  party."createdBy",
  party."updatedAt",
  COALESCE(party."updatedBy", 'MIGRACAO_IDENTIDADE_20260719')
FROM "parties" party
INNER JOIN "companies" company ON company."id" = party."companyId"
LEFT JOIN "_party_identity_merge_map" map
  ON map."sourcePartyId" = party."id";

-- Mantém o papel de origem e adiciona os papéis financeiros já implícitos.
INSERT OR IGNORE INTO "party_roles" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "roleType",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'LEGACY-ROLE-' ||
    COALESCE(map."canonicalPartyId", party."id") || '-' ||
    CAST(party."branchCode" AS TEXT) || '-' ||
    UPPER(TRIM(party."externalEntityType")),
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode",
  UPPER(TRIM(party."externalEntityType")),
  MIN(party."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(party."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "parties" party
LEFT JOIN "_party_identity_merge_map" map
  ON map."sourcePartyId" = party."id"
WHERE UPPER(TRIM(party."externalEntityType")) NOT IN ('CUSTOMER', 'PAYER')
GROUP BY
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode",
  UPPER(TRIM(party."externalEntityType"));

INSERT OR IGNORE INTO "party_roles" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "roleType",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'CUSTOMER-ROLE-' ||
    COALESCE(map."canonicalPartyId", party."id") || '-' ||
    CAST(party."branchCode" AS TEXT),
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode",
  'CUSTOMER',
  MIN(party."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(party."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "parties" party
LEFT JOIN "_party_identity_merge_map" map
  ON map."sourcePartyId" = party."id"
GROUP BY
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode";

INSERT OR IGNORE INTO "party_roles" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "roleType",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'PAYER-ROLE-' ||
    COALESCE(map."canonicalPartyId", party."id") || '-' ||
    CAST(party."branchCode" AS TEXT),
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode",
  'PAYER',
  MIN(party."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(party."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "parties" party
LEFT JOIN "_party_identity_merge_map" map
  ON map."sourcePartyId" = party."id"
GROUP BY
  party."companyId",
  COALESCE(map."canonicalPartyId", party."id"),
  party."branchCode";

-- Completa a pessoa canônica com os dados disponíveis nos cadastros repetidos.
UPDATE "parties" AS canonical
SET
  "document" = canonical."documentNormalized",
  "email" = UPPER(COALESCE(
    canonical."email",
    (
      SELECT duplicate."email"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."email"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  )),
  "phone" = COALESCE(
    canonical."phone",
    (
      SELECT duplicate."phone"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."phone"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "addressLine1" = COALESCE(
    canonical."addressLine1",
    (
      SELECT duplicate."addressLine1"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."addressLine1"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "street" = COALESCE(
    canonical."street",
    (
      SELECT duplicate."street"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."street"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "addressNumber" = COALESCE(
    canonical."addressNumber",
    (
      SELECT duplicate."addressNumber"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."addressNumber"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "addressComplement" = COALESCE(
    canonical."addressComplement",
    (
      SELECT duplicate."addressComplement"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."addressComplement"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "neighborhood" = COALESCE(
    canonical."neighborhood",
    (
      SELECT duplicate."neighborhood"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."neighborhood"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "city" = COALESCE(
    canonical."city",
    (
      SELECT duplicate."city"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."city"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "cityCode" = COALESCE(
    canonical."cityCode",
    (
      SELECT duplicate."cityCode"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."cityCode"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "state" = COALESCE(
    canonical."state",
    (
      SELECT duplicate."state"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."state"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "postalCode" = COALESCE(
    canonical."postalCode",
    (
      SELECT duplicate."postalCode"
      FROM "parties" duplicate
      WHERE duplicate."companyId" = canonical."companyId"
        AND duplicate."documentNormalized" = canonical."documentNormalized"
        AND NULLIF(TRIM(duplicate."postalCode"), '') IS NOT NULL
      ORDER BY duplicate."updatedAt" DESC
      LIMIT 1
    )
  ),
  "updatedBy" = 'MIGRACAO_IDENTIDADE_20260719'
WHERE canonical."id" IN (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  GROUP BY map."canonicalPartyId"
);

-- Todos os vínculos vivos e históricos passam a apontar para a Party canônica.
UPDATE "receivable_titles"
SET "payerPartyId" = (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  WHERE map."sourcePartyId" = "receivable_titles"."payerPartyId"
)
WHERE "payerPartyId" IN (
  SELECT "sourcePartyId" FROM "_party_identity_merge_map"
);

UPDATE "sales"
SET "customerPartyId" = (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  WHERE map."sourcePartyId" = "sales"."customerPartyId"
)
WHERE "customerPartyId" IN (
  SELECT "sourcePartyId" FROM "_party_identity_merge_map"
);

UPDATE "fiscal_documents"
SET "recipientPartyId" = (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  WHERE map."sourcePartyId" = "fiscal_documents"."recipientPartyId"
)
WHERE "recipientPartyId" IN (
  SELECT "sourcePartyId" FROM "_party_identity_merge_map"
);

UPDATE "nfse_documents"
SET "takerPartyId" = (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  WHERE map."sourcePartyId" = "nfse_documents"."takerPartyId"
)
WHERE "takerPartyId" IN (
  SELECT "sourcePartyId" FROM "_party_identity_merge_map"
);

UPDATE "customer_credits"
SET "partyId" = (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  WHERE map."sourcePartyId" = "customer_credits"."partyId"
)
WHERE "partyId" IN (
  SELECT "sourcePartyId" FROM "_party_identity_merge_map"
);

-- Reconstitui os papéis efetivamente exercidos em cada filial.
INSERT INTO "party_roles" (
  "id", "companyId", "partyId", "branchCode", "roleType",
  "createdAt", "createdBy", "updatedAt", "updatedBy"
)
SELECT
  'TITLE-PAYER-ROLE-' || title."payerPartyId" || '-' ||
    CAST(title."branchCode" AS TEXT),
  title."companyId",
  title."payerPartyId",
  title."branchCode",
  'PAYER',
  MIN(title."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(title."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "receivable_titles" title
WHERE title."payerPartyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "party_roles" role
    WHERE role."companyId" = title."companyId"
      AND role."partyId" = title."payerPartyId"
      AND role."branchCode" = title."branchCode"
      AND role."roleType" = 'PAYER'
  )
GROUP BY title."companyId", title."payerPartyId", title."branchCode";

INSERT INTO "party_roles" (
  "id", "companyId", "partyId", "branchCode", "roleType",
  "createdAt", "createdBy", "updatedAt", "updatedBy"
)
SELECT
  'SALE-CUSTOMER-ROLE-' || sale."customerPartyId" || '-' ||
    CAST(sale."branchCode" AS TEXT),
  sale."companyId",
  sale."customerPartyId",
  sale."branchCode",
  'CUSTOMER',
  MIN(sale."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(sale."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "sales" sale
WHERE sale."customerPartyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "party_roles" role
    WHERE role."companyId" = sale."companyId"
      AND role."partyId" = sale."customerPartyId"
      AND role."branchCode" = sale."branchCode"
      AND role."roleType" = 'CUSTOMER'
  )
GROUP BY sale."companyId", sale."customerPartyId", sale."branchCode";

INSERT INTO "party_roles" (
  "id", "companyId", "partyId", "branchCode", "roleType",
  "createdAt", "createdBy", "updatedAt", "updatedBy"
)
SELECT
  'FISCAL-RECIPIENT-ROLE-' || document."recipientPartyId" || '-' ||
    CAST(document."branchCode" AS TEXT),
  document."companyId",
  document."recipientPartyId",
  document."branchCode",
  'RECIPIENT',
  MIN(document."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(document."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "fiscal_documents" document
WHERE document."recipientPartyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "party_roles" role
    WHERE role."companyId" = document."companyId"
      AND role."partyId" = document."recipientPartyId"
      AND role."branchCode" = document."branchCode"
      AND role."roleType" = 'RECIPIENT'
  )
GROUP BY
  document."companyId",
  document."recipientPartyId",
  document."branchCode";

INSERT INTO "party_roles" (
  "id", "companyId", "partyId", "branchCode", "roleType",
  "createdAt", "createdBy", "updatedAt", "updatedBy"
)
SELECT
  'NFSE-TAKER-ROLE-' || document."takerPartyId" || '-' ||
    CAST(document."branchCode" AS TEXT),
  document."companyId",
  document."takerPartyId",
  document."branchCode",
  'TAKER',
  MIN(document."createdAt"),
  'MIGRACAO_IDENTIDADE_20260719',
  MAX(document."updatedAt"),
  'MIGRACAO_IDENTIDADE_20260719'
FROM "nfse_documents" document
WHERE document."takerPartyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "party_roles" role
    WHERE role."companyId" = document."companyId"
      AND role."partyId" = document."takerPartyId"
      AND role."branchCode" = document."branchCode"
      AND role."roleType" = 'TAKER'
  )
GROUP BY
  document."companyId",
  document."takerPartyId",
  document."branchCode";

INSERT INTO "party_audit_events" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "action",
  "summary",
  "metadataJson",
  "performedBy",
  "createdBy"
)
SELECT
  'MERGE-CANONICAL-' || canonical."id",
  canonical."companyId",
  canonical."id",
  canonical."branchCode",
  'DUPLICATES_CONSOLIDATED',
  'CADASTROS DUPLICADOS CONSOLIDADOS NA PESSOA CANÔNICA.',
  '{"reason":"MESMO_CPF_CNPJ","migration":"20260719123000_unify_party_identity"}',
  'MIGRACAO_IDENTIDADE_20260719',
  'MIGRACAO_IDENTIDADE_20260719'
FROM "parties" canonical
WHERE canonical."id" IN (
  SELECT map."canonicalPartyId"
  FROM "_party_identity_merge_map" map
  GROUP BY map."canonicalPartyId"
  HAVING COUNT(*) > 1
);

INSERT INTO "party_audit_events" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "action",
  "summary",
  "metadataJson",
  "performedBy",
  "createdBy"
)
SELECT
  'MERGED-DUPLICATE-' || duplicate."id",
  duplicate."companyId",
  duplicate."id",
  duplicate."branchCode",
  'MERGED_INTO_CANONICAL',
  'CADASTRO PRESERVADO E INATIVADO APÓS CONSOLIDAÇÃO.',
  '{"reason":"MESMO_CPF_CNPJ","canonicalPartyId":"' ||
    map."canonicalPartyId" || '"}',
  'MIGRACAO_IDENTIDADE_20260719',
  'MIGRACAO_IDENTIDADE_20260719'
FROM "parties" duplicate
INNER JOIN "_party_identity_merge_map" map
  ON map."sourcePartyId" = duplicate."id"
WHERE map."sourcePartyId" <> map."canonicalPartyId";

UPDATE "parties"
SET
  "documentNormalized" = NULL,
  "mergedIntoPartyId" = (
    SELECT map."canonicalPartyId"
    FROM "_party_identity_merge_map" map
    WHERE map."sourcePartyId" = "parties"."id"
  ),
  "mergedAt" = CURRENT_TIMESTAMP,
  "mergedBy" = 'MIGRACAO_IDENTIDADE_20260719',
  "mergeReason" = 'MESMO_CPF_CNPJ',
  "canceledAt" = COALESCE("canceledAt", CURRENT_TIMESTAMP),
  "canceledBy" = COALESCE("canceledBy", 'MIGRACAO_IDENTIDADE_20260719'),
  "updatedBy" = 'MIGRACAO_IDENTIDADE_20260719'
WHERE "id" IN (
  SELECT map."sourcePartyId"
  FROM "_party_identity_merge_map" map
  WHERE map."sourcePartyId" <> map."canonicalPartyId"
);

CREATE UNIQUE INDEX "parties_companyId_documentNormalized_key"
  ON "parties" ("companyId", "documentNormalized");
CREATE INDEX "parties_companyId_documentNormalized_canceledAt_idx"
  ON "parties" ("companyId", "documentNormalized", "canceledAt");

-- Fornecedor vira papel/extensão da mesma pessoa, sem perder sua tabela
-- operacional nem os snapshots de contas a pagar.
INSERT INTO "parties" (
  "id",
  "companyId",
  "branchCode",
  "externalEntityType",
  "externalEntityId",
  "name",
  "document",
  "documentNormalized",
  "stateRegistration",
  "email",
  "phone",
  "countryCode",
  "countryName",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'PARTY-SUPPLIER-' || supplier."id",
  supplier."companyId",
  supplier."branchCode",
  'SUPPLIER',
  UPPER(supplier."id"),
  UPPER(supplier."legalName"),
  NULLIF(
    UPPER(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(TRIM(COALESCE(supplier."document", '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      )
    ),
    ''
  ),
  NULLIF(
    UPPER(
      REPLACE(
        REPLACE(
          REPLACE(
            REPLACE(TRIM(COALESCE(supplier."document", '')), '.', ''),
            '-',
            ''
          ),
          '/',
          ''
        ),
        ' ',
        ''
      )
    ),
    ''
  ),
  supplier."stateRegistration",
  UPPER(supplier."email"),
  supplier."phone",
  '1058',
  'BRASIL',
  supplier."createdAt",
  supplier."createdBy",
  supplier."updatedAt",
  COALESCE(supplier."updatedBy", 'MIGRACAO_IDENTIDADE_20260719')
FROM "suppliers" supplier
WHERE NOT EXISTS (
  SELECT 1
  FROM "parties" party
  WHERE party."companyId" = supplier."companyId"
    AND party."documentNormalized" = NULLIF(
      UPPER(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(TRIM(COALESCE(supplier."document", '')), '.', ''),
              '-',
              ''
            ),
            '/',
            ''
          ),
          ' ',
          ''
        )
      ),
      ''
    )
);

UPDATE "suppliers" AS supplier
SET "partyId" = COALESCE(
  (
    SELECT party."id"
    FROM "parties" party
    WHERE party."companyId" = supplier."companyId"
      AND party."documentNormalized" = NULLIF(
        UPPER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(TRIM(COALESCE(supplier."document", '')), '.', ''),
                '-',
                ''
              ),
              '/',
              ''
            ),
            ' ',
            ''
          )
        ),
        ''
      )
    ORDER BY
      CASE WHEN party."canceledAt" IS NULL THEN 0 ELSE 1 END,
      party."createdAt" ASC
    LIMIT 1
  ),
  'PARTY-SUPPLIER-' || supplier."id"
);

INSERT OR IGNORE INTO "party_roles" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "roleType",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'SUPPLIER-ROLE-' || supplier."id",
  supplier."companyId",
  supplier."partyId",
  supplier."branchCode",
  'SUPPLIER',
  supplier."createdAt",
  supplier."createdBy",
  supplier."updatedAt",
  COALESCE(supplier."updatedBy", 'MIGRACAO_IDENTIDADE_20260719')
FROM "suppliers" supplier
WHERE supplier."partyId" IS NOT NULL;

INSERT OR IGNORE INTO "party_external_references" (
  "id",
  "companyId",
  "partyId",
  "branchCode",
  "sourceSystem",
  "sourceTenantId",
  "externalEntityType",
  "externalEntityId",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy"
)
SELECT
  'SUPPLIER-REF-' || supplier."id",
  supplier."companyId",
  supplier."partyId",
  supplier."branchCode",
  'FINANCEIRO',
  UPPER(supplier."companyId"),
  'SUPPLIER',
  UPPER(supplier."id"),
  supplier."createdAt",
  supplier."createdBy",
  supplier."updatedAt",
  COALESCE(supplier."updatedBy", 'MIGRACAO_IDENTIDADE_20260719')
FROM "suppliers" supplier
WHERE supplier."partyId" IS NOT NULL;

CREATE UNIQUE INDEX "party_roles_companyId_partyId_branchCode_roleType_key"
  ON "party_roles" ("companyId", "partyId", "branchCode", "roleType");
CREATE INDEX "party_roles_companyId_branchCode_roleType_canceledAt_idx"
  ON "party_roles" ("companyId", "branchCode", "roleType", "canceledAt");
CREATE INDEX "party_roles_partyId_canceledAt_idx"
  ON "party_roles" ("partyId", "canceledAt");

CREATE UNIQUE INDEX "party_external_references_company_source_type_id_key"
  ON "party_external_references" (
    "companyId",
    "sourceSystem",
    "sourceTenantId",
    "externalEntityType",
    "externalEntityId"
  );
CREATE INDEX "party_external_references_company_branch_type_canceledAt_idx"
  ON "party_external_references" (
    "companyId",
    "branchCode",
    "externalEntityType",
    "canceledAt"
  );
CREATE INDEX "party_external_references_partyId_canceledAt_idx"
  ON "party_external_references" ("partyId", "canceledAt");

CREATE INDEX "party_audit_events_companyId_branchCode_occurredAt_idx"
  ON "party_audit_events" ("companyId", "branchCode", "occurredAt");
CREATE INDEX "party_audit_events_partyId_occurredAt_idx"
  ON "party_audit_events" ("partyId", "occurredAt");

CREATE UNIQUE INDEX "suppliers_companyId_branchCode_partyId_key"
  ON "suppliers" ("companyId", "branchCode", "partyId");
CREATE INDEX "suppliers_partyId_idx" ON "suppliers" ("partyId");

DROP TABLE "_party_identity_merge_map";
