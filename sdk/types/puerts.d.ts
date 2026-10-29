declare module 'puerts' {
    /** Opaque wrapper passed to native out/ref parameters; use $unref and $set. */
    export interface $Ref<T> { readonly __doNoAccess: T; }
    export function $ref<T>(value: T): $Ref<T>;
    export function $ref<T>(): $Ref<T | undefined>;
    export function $unref<T>(value: $Ref<T>): T;
    export function $set<T>(ref: $Ref<T>, value: NoInfer<T>): void;

    export const argv: {
        getByName(name: 'GameInstance'): import('ue').GameInstance | null | undefined;
        // Only index 0 has been verified for this game's MainStart environment.
        getByIndex(index: 0): import('ue').GameInstance | null | undefined;
    };
}
