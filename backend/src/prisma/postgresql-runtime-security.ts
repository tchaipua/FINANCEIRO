type PostgresqlRoleAuditRow = {
  current_user_name: string;
  is_superuser: boolean;
  can_create_database: boolean;
  can_create_role: boolean;
  can_replicate: boolean;
  can_bypass_rls: boolean;
  owns_database: boolean;
  can_create_in_database: boolean;
  owns_current_schema: boolean;
  can_create_in_schema: boolean;
  owns_application_objects: boolean;
  inherits_privileged_role: boolean;
};

type QueryClient = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

function isPostgresqlUrl(value: string | undefined) {
  return /^postgres(?:ql)?:\/\//i.test(String(value || "").trim());
}

export function shouldVerifyPostgresqlRuntimeRole() {
  if (!isPostgresqlUrl(process.env.DATABASE_URL)) {
    return false;
  }

  return (
    String(process.env.NODE_ENV || "").trim().toLowerCase() === "production" ||
    String(
      process.env.FINANCEIRO_DATABASE_REQUIRE_LEAST_PRIVILEGE || "",
    ).trim() === "true"
  );
}

export async function assertPostgresqlRuntimeRoleIsLeastPrivileged(
  client: QueryClient,
) {
  const rows = await client.$queryRawUnsafe<PostgresqlRoleAuditRow[]>(`
    SELECT
      current_user::text AS current_user_name,
      role.rolsuper AS is_superuser,
      role.rolcreatedb AS can_create_database,
      role.rolcreaterole AS can_create_role,
      role.rolreplication AS can_replicate,
      role.rolbypassrls AS can_bypass_rls,
      (
        SELECT database_entry.datdba = role.oid
        FROM pg_catalog.pg_database AS database_entry
        WHERE database_entry.datname = current_database()
      ) AS owns_database,
      has_database_privilege(current_user, current_database(), 'CREATE')
        AS can_create_in_database,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace_entry
        WHERE namespace_entry.nspname = current_schema()
          AND namespace_entry.nspowner = role.oid
      ) AS owns_current_schema,
      has_schema_privilege(current_user, current_schema(), 'CREATE')
        AS can_create_in_schema,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS object_entry
        INNER JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = object_entry.relnamespace
        WHERE namespace_entry.nspname = current_schema()
          AND object_entry.relkind IN ('r', 'p', 'S', 'v', 'm')
          AND object_entry.relowner = role.oid
          AND object_entry.relname <> '_prisma_migrations'
      ) AS owns_application_objects,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS inherited_role
        WHERE inherited_role.oid <> role.oid
          AND pg_has_role(current_user, inherited_role.oid, 'MEMBER')
          AND (
            inherited_role.rolsuper
            OR inherited_role.rolcreatedb
            OR inherited_role.rolcreaterole
            OR inherited_role.rolreplication
            OR inherited_role.rolbypassrls
            OR EXISTS (
              SELECT 1
              FROM pg_catalog.pg_database AS owned_database
              WHERE owned_database.datname = current_database()
                AND owned_database.datdba = inherited_role.oid
            )
            OR EXISTS (
              SELECT 1
              FROM pg_catalog.pg_namespace AS owned_schema
              WHERE owned_schema.nspname = current_schema()
                AND owned_schema.nspowner = inherited_role.oid
            )
          )
      ) AS inherits_privileged_role
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = current_user
  `);

  const role = rows[0];
  const expectedRole = String(
    process.env.FINANCEIRO_DATABASE_RUNTIME_ROLE || "financeiro_runtime",
  ).trim();
  const unsafe =
    !role ||
    !expectedRole ||
    role.current_user_name !== expectedRole ||
    role.is_superuser ||
    role.can_create_database ||
    role.can_create_role ||
    role.can_replicate ||
    role.can_bypass_rls ||
    role.owns_database ||
    role.can_create_in_database ||
    role.owns_current_schema ||
    role.can_create_in_schema ||
    role.owns_application_objects ||
    role.inherits_privileged_role;

  if (unsafe) {
    throw new Error(
      "A conexão PostgreSQL do runtime não usa o papel de menor privilégio esperado. " +
        "A credencial proprietária/migradora é proibida na aplicação.",
    );
  }
}
