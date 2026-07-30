\set ON_ERROR_STOP on
\set ECHO none

-- Execute uma única vez com um administrador do cluster PostgreSQL.
-- As senhas são lidas pelo psql e nunca ficam gravadas neste arquivo:
--   FINANCEIRO_DB_OWNER_PASSWORD
--   FINANCEIRO_DB_RUNTIME_PASSWORD
\getenv financeiro_owner_password FINANCEIRO_DB_OWNER_PASSWORD
\getenv financeiro_runtime_password FINANCEIRO_DB_RUNTIME_PASSWORD

SELECT length(:'financeiro_owner_password') >= 32 AS owner_password_ok \gset
SELECT length(:'financeiro_runtime_password') >= 32 AS runtime_password_ok \gset
\if :owner_password_ok
\else
  \echo 'FINANCEIRO_DB_OWNER_PASSWORD deve ter ao menos 32 caracteres.'
  \quit
\endif
\if :runtime_password_ok
\else
  \echo 'FINANCEIRO_DB_RUNTIME_PASSWORD deve ter ao menos 32 caracteres.'
  \quit
\endif

SELECT format(
  'CREATE ROLE financeiro_owner LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'financeiro_owner_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'financeiro_owner'
)
\gexec

SELECT format(
  'ALTER ROLE financeiro_owner LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'financeiro_owner_password'
)
\gexec

SELECT format(
  'CREATE ROLE financeiro_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'financeiro_runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'financeiro_runtime'
)
\gexec

SELECT format(
  'ALTER ROLE financeiro_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
  :'financeiro_runtime_password'
)
\gexec

SELECT
  'CREATE DATABASE financeiro OWNER financeiro_owner ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'financeiro'
)
\gexec

ALTER DATABASE financeiro OWNER TO financeiro_owner;
REVOKE ALL ON DATABASE financeiro FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE financeiro FROM financeiro_runtime;
GRANT CONNECT ON DATABASE financeiro TO financeiro_owner, financeiro_runtime;

\connect financeiro

ALTER SCHEMA public OWNER TO financeiro_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO financeiro_owner;
GRANT USAGE ON SCHEMA public TO financeiro_runtime;

ALTER ROLE financeiro_owner IN DATABASE financeiro
  SET search_path = public, pg_catalog;
ALTER ROLE financeiro_runtime IN DATABASE financeiro
  SET search_path = public, pg_catalog;

ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_owner IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_owner IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO financeiro_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE financeiro_owner IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO financeiro_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO financeiro_runtime;
GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public TO financeiro_runtime;

\unset financeiro_owner_password
\unset financeiro_runtime_password
