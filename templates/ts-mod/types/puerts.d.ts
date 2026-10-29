// Handwritten subset used by this example, not a complete PuerTS SDK.
declare module 'puerts' {
    export const argv: {
        getByName(name: 'GameInstance'): import('ue').GameInstance | null | undefined;
    };
}
