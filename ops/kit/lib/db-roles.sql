-- @file   ops/lib/db-roles.sql
-- @module ops
-- @brief  A game's two database roles: the owner that migrates, the app that only reads and writes
--         rows (K90).
--
-- Responsibility: run as the PostgreSQL superuser by ./db-roles.sh (install, the conversion of an
--                 older install, after a restore): creates or updates the owner and app roles (no
--                 superuser, no CREATEROLE, no CREATEDB) with their passwords, gives the schema and
--                 everything in it, except what belongs to an extension, to the owner (an install
--                 made before the roles had it all owned by the superuser), and lets only the owner
--                 create in the database, temporary tables included (since v0.34.0). The app's rights on the tables are granted by the owner
--                 after every migration (grantAppRole, @seasonal/kit/server). Idempotent. The
--                 words __SCHEMA__, __OWNER__, __APP__ and the two passwords are put in by the
--                 caller and arrive on standard input, never on a command line; psql runs it with
--                 ON_ERROR_STOP.
-- Source:         seasonal-bingo-royale ops/lib/db-roles.sql at d7d841e; its role and schema names
--                 became the placeholders.
-- Spec:           kit DECISIONS K90; docs/OPERATIONS.md "Database roles"
SET client_min_messages = warning;
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '__OWNER__') THEN
    CREATE ROLE __OWNER__ LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '__APP__') THEN
    CREATE ROLE __APP__ LOGIN;
  END IF;
END $$;
ALTER ROLE __OWNER__ WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '__OWNER_PASSWORD__';
ALTER ROLE __APP__ WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '__APP_PASSWORD__';
-- Unqualified names find the game's schema first, then public (an extension's types).
ALTER ROLE __OWNER__ SET search_path = __SCHEMA__, public;
ALTER ROLE __APP__ SET search_path = __SCHEMA__, public;

-- Only the owner creates in this database (schemas, trusted extensions, and the temporary tables
-- a migration may work with); nobody else gets CREATE or TEMPORARY from PUBLIC.
DO $$
BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO __OWNER__, __APP__', current_database());
  EXECUTE format('GRANT CREATE, TEMPORARY ON DATABASE %I TO __OWNER__', current_database());
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS __SCHEMA__ AUTHORIZATION __OWNER__;
ALTER SCHEMA __SCHEMA__ OWNER TO __OWNER__;
REVOKE CREATE ON SCHEMA __SCHEMA__ FROM PUBLIC;

-- Everything in the schema to the owner, except what belongs to an extension; a sequence that
-- belongs to a column follows its table.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS name, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = '__SCHEMA__'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                          AND d.deptype IN ('e', 'a', 'i'))
  LOOP
    EXECUTE format(
      CASE r.relkind
        WHEN 'v' THEN 'ALTER VIEW %s OWNER TO __OWNER__'
        WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %s OWNER TO __OWNER__'
        WHEN 'S' THEN 'ALTER SEQUENCE %s OWNER TO __OWNER__'
        WHEN 'f' THEN 'ALTER FOREIGN TABLE %s OWNER TO __OWNER__'
        ELSE 'ALTER TABLE %s OWNER TO __OWNER__'
      END, r.name);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '__SCHEMA__'
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO __OWNER__', r.name);
  END LOOP;
  FOR r IN
    SELECT t.oid::regtype AS name, t.typtype
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = '__SCHEMA__'
       AND t.typtype IN ('e', 'd', 'r')
       AND NOT EXISTS (SELECT FROM pg_depend d
                        WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid
                          AND d.deptype = 'e')
  LOOP
    EXECUTE format(
      CASE WHEN r.typtype = 'd' THEN 'ALTER DOMAIN %s OWNER TO __OWNER__'
           ELSE 'ALTER TYPE %s OWNER TO __OWNER__' END, r.name);
  END LOOP;
END $$;

COMMIT;
