import { homedir } from "os";
import path from "path";

export const VIBEDECKX_HOME = path.join(homedir(), ".vibedeckx");
export const DB_PATH = path.join(VIBEDECKX_HOME, "data.sqlite");
export const DEFAULT_PORT = 5173;
