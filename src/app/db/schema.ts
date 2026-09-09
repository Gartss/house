import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const houseState = sqliteTable('house_state', {
 owner: text('owner').primaryKey(),
 payload: text('payload').notNull(),
 version: integer('version').notNull().default(0),
 requestId: text('request_id').notNull().default(''),
});
