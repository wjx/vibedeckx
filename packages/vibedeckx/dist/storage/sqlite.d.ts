import type { Storage } from "./types.js";
export declare const createSqliteStorage: (dbPath: string) => Promise<Storage>;
