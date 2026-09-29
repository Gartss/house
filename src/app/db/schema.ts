import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const houseState = sqliteTable('house_state', {
 owner: text('owner').primaryKey(),
 payload: text('payload').notNull(),
 version: integer('version').notNull().default(0),
 requestId: text('request_id').notNull().default(''),
});

export const wechatUsers = sqliteTable('wechat_users', {
  id: text('id').primaryKey(),
  openid: text('openid').notNull().unique(),
  unionid: text('unionid'),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at').notNull(),
});

export const miniSessions = sqliteTable('mini_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
