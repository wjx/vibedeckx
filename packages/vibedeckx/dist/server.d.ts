import type { Storage } from "./storage/types.js";
export declare const createServer: (opts: {
    storage: Storage;
}) => {
    start: (port: number) => Promise<string>;
    close: () => Promise<void>;
};
