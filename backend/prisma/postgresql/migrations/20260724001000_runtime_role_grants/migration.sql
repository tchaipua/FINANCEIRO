-- The cluster bootstrap creates this fixed, non-owner application role.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'financeiro_runtime'
    ) THEN
        RAISE EXCEPTION
            'Role financeiro_runtime is missing; run bootstrap-roles.sql first';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles
        WHERE rolname = 'financeiro_provisioner'
    ) THEN
        RAISE EXCEPTION
            'Role financeiro_provisioner is missing; run the production database bootstrap first';
    END IF;
END
$$;

REVOKE CONNECT, TEMPORARY ON DATABASE financeiro_01 FROM PUBLIC;
GRANT CONNECT ON DATABASE financeiro_01
    TO financeiro_runtime, financeiro_provisioner;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO financeiro_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public TO financeiro_runtime;
GRANT USAGE, SELECT, UPDATE
    ON ALL SEQUENCES IN SCHEMA public TO financeiro_runtime;

-- Runtime does not need to inspect or mutate Prisma's migration ledger.
REVOKE ALL ON TABLE "_prisma_migrations" FROM financeiro_runtime;

-- Manual control-plane job: it may create mappings, but cannot mutate or
-- delete existing mappings and has no access to operational finance tables.
REVOKE ALL ON TABLE "companies", "company_branches"
    FROM financeiro_provisioner;
GRANT SELECT, INSERT ON TABLE "companies", "company_branches"
    TO financeiro_provisioner;
