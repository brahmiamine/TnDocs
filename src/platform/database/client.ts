import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

const databaseUrl = process.env.DATABASE_URL;

/** Lazy connection pool: public pages can render without opening a DB connection. */
export const database = databaseUrl
  ? drizzle(mysql.createPool({ uri: databaseUrl, connectionLimit: 10, enableKeepAlive: true }))
  : null;
