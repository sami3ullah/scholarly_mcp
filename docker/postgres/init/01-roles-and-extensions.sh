#!/bin/sh
# Runs once, on an empty data volume (ADR 0034 decision 7). Creates the database, owned by
# the ingest's writer role, and the server's role, which may only connect; `ingest migrate`
# grants it the rest. The extensions need a superuser, so they are created here and the
# migration that also creates them is then a no-op.
set -eu

psql --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set ingest_password="$PG_INGEST_PASSWORD" \
  --set server_password="$PG_SERVER_PASSWORD" <<'SQL'
CREATE ROLE scholarly_ingest LOGIN PASSWORD :'ingest_password';
CREATE ROLE scholarly_server LOGIN PASSWORD :'server_password';
CREATE DATABASE scholarly OWNER scholarly_ingest;
REVOKE ALL ON DATABASE scholarly FROM PUBLIC;
GRANT CONNECT ON DATABASE scholarly TO scholarly_server;
\connect scholarly
CREATE EXTENSION vector;
CREATE EXTENSION pg_trgm;
SQL
