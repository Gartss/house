#!/bin/sh
set -eu
npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to /data --command "CREATE TABLE IF NOT EXISTS house_state (owner TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, version INTEGER DEFAULT 0 NOT NULL, request_id TEXT DEFAULT '' NOT NULL); CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS account_sessions (token_hash TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL);" >/tmp/house-db-init.log
exec npx wrangler dev --config dist/server/wrangler.json --ip 0.0.0.0 --port 3000 --persist-to /data
