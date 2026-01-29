import { db } from "../db";
import { sql } from "drizzle-orm";

export { db, sql };

export interface BaseRepository {
  healthCheck(): Promise<void>;
}

export class BaseRepositoryImpl implements BaseRepository {
  async healthCheck(): Promise<void> {
    await db.execute(sql`SELECT 1`);
  }
}

export const baseRepository = new BaseRepositoryImpl();
