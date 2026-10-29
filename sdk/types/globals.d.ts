// The game's embedded JS environment, without Node.js or browser globals.
declare const console: {
    log(...values: unknown[]): void;
    warn(...values: unknown[]): void;
    error(...values: unknown[]): void;
};

declare function setInterval(callback: () => void, milliseconds: number): number;
declare function clearInterval(handle: number): void;
