#!/bin/sh
set -eu
umask 077
node <<'NODE'
const fs = require('node:fs');
const names = [
  'WECHAT_MINIPROGRAM_APP_ID',
  'WECHAT_MINIPROGRAM_APP_SECRET',
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
];
const contents = names
  .filter((name) => process.env[name])
  .map((name) => `${name}=${JSON.stringify(process.env[name])}`)
  .join('\n');
fs.writeFileSync('dist/server/.dev.vars', contents ? `${contents}\n` : '', { mode: 0o600 });
NODE
npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to /data --command "CREATE TABLE IF NOT EXISTS house_state (owner TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, version INTEGER DEFAULT 0 NOT NULL, request_id TEXT DEFAULT '' NOT NULL); CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS account_sessions (token_hash TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS wechat_users (id TEXT PRIMARY KEY NOT NULL, openid TEXT NOT NULL UNIQUE, unionid TEXT, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS mini_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS mini_sessions_user_id_idx ON mini_sessions (user_id); CREATE INDEX IF NOT EXISTS mini_sessions_expires_at_idx ON mini_sessions (expires_at); CREATE TABLE IF NOT EXISTS mini_ocr_usage (user_id TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, window_start)); CREATE TABLE IF NOT EXISTS anonymous_visitors (visitor_id TEXT PRIMARY KEY NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL); CREATE TABLE IF NOT EXISTS anonymous_visitor_days (visitor_id TEXT NOT NULL, active_day TEXT NOT NULL, PRIMARY KEY (visitor_id, active_day));" >/tmp/house-db-init.log
exec npx wrangler dev --config dist/server/wrangler.json --ip 0.0.0.0 --port 3000 --persist-to /data
