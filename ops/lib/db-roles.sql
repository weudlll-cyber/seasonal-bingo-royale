-- @file   ops/lib/db-roles.sql
-- @module ops
-- @brief  The game's two database roles: the owner that migrates, the app that only reads and writes rows.
--
-- Responsibility: run by `sbr` as the PostgreSQL superuser over the container's local socket
--                 (install, the one-time conversion in `sbr update`, after a restore): create
--                 or update `sbr_owner` and `sbr_app` (no superuser, no CREATEROLE, no CREATEDB)
--                 with the passwords from the env file, give the schema `sbr` and everything in
--                 it to `sbr_owner` (an install made before the roles had it all owned by the
--                 superuser), and let only the owner create in the database. The app's grants
--                 on the tables are made by the owner after every migration
--                 (apps/server/src/db/roles.ts). Idempotent: running it again changes nothing.
--                 The two passwords arrive in place of __OWNER_PASSWORD__ / __APP_PASSWORD__ on
--                 standard input, never on a command line; psql runs it with ON_ERROR_STOP.
-- Used by:        ops/lib/config.sh (apply_db_roles), apps/server/test/dbRoles.integration.test.ts
-- Spec:           docs/spec/03-security-architecture.md §9; docs/spec/04-database-design.md §1;
--                 docs/spec/09-deployment-architecture.md
SET client_min_messages = warning;
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sbr_owner') THEN
    CREATE ROLE sbr_owner LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sbr_app') THEN
    CREATE ROLE sbr_app LOGIN;
  END IF;
END $$;
ALTER ROLE sbr_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '__OWNER_PASSWORD__';
ALTER ROLE sbr_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '__APP_PASSWORD__';
-- Unqualified names find the game's schema first, as they did for the superuser `sbr`
-- ("$user"): the citext type of 0002 lives there.
ALTER ROLE sbr_owner SET search_path = sbr, public;
ALTER ROLE sbr_app SET search_path = sbr, public;

-- Only the owner creates in this database (schemas, the trusted extension citext); nobody
-- else gets CREATE or TEMPORARY from PUBLIC.
DO $$
BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO sbr_owner, sbr_app', current_database());
  EXECUTE format('GRANT CREATE ON DATABASE %I TO sbr_owner', current_database());
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS sbr AUTHORIZATION sbr_owner;
ALTER SCHEMA sbr OWNER TO sbr_owner;
REVOKE CREATE ON SCHEMA sbr FROM PUBLIC;

-- Everything in the schema to the owner, except what belongs to an extension; a sequence
-- that belongs to a column follows its table.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS name, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'sbr'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                          AND d.deptype IN ('e', 'a', 'i'))
  LOOP
    EXECUTE format(
      CASE r.relkind
        WHEN 'v' THEN 'ALTER VIEW %s OWNER TO sbr_owner'
        WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %s OWNER TO sbr_owner'
        WHEN 'S' THEN 'ALTER SEQUENCE %s OWNER TO sbr_owner'
        WHEN 'f' THEN 'ALTER FOREIGN TABLE %s OWNER TO sbr_owner'
        ELSE 'ALTER TABLE %s OWNER TO sbr_owner'
      END, r.name);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'sbr'
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO sbr_owner', r.name);
  END LOOP;
  FOR r IN
    SELECT t.oid::regtype AS name, t.typtype
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'sbr'
       AND t.typtype IN ('e', 'd', 'r')
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format(
      CASE WHEN r.typtype = 'd' THEN 'ALTER DOMAIN %s OWNER TO sbr_owner'
           ELSE 'ALTER TYPE %s OWNER TO sbr_owner' END, r.name);
  END LOOP;
END $$;

COMMIT;
