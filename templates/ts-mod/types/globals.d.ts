// Minimal game globals; intentionally excludes browser DOM and Node.js types.
declare const console: {
    log(...values: unknown[]): void;
    warn(...values: unknown[]): void;
    error(...values: unknown[]): void;
};

declare function setInterval(callback: () => void, milliseconds: number): number;
declare function clearInterval(handle: number): void;
