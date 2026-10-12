export const all = async <T>(db: D1Database, sql: string, ...args: unknown[]) => (await db.prepare(sql).bind(...args).all<T>()).results;
export const first = <T>(db: D1Database, sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).first<T>();
export const run = (db: D1Database, sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args).run();
export const stmt = (db: D1Database, sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);
