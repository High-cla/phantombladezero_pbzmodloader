// PuerTS bridge shapes. Representative runtime evidence: api-surface.json.
declare module 'ue' {
    import * as UE from 'ue';
    /** A known property whose binding representation has not been established. */
    export interface $Unresolved<Path extends string> {
        readonly __unresolvedDoNotAccess: unique symbol;
        readonly __pathDoNotAccess: Path;
    }
    /** Native localized text. Use KismetTextLibrary conversions; this is not a JS string or a runtime constructor. */
    export interface $FText {
        readonly __ftextDoNotAccess: unique symbol;
    }
    export interface $TypedClass<K extends keyof ReflectedClasses> extends Class {
        readonly __classDoNotAccess: unique symbol;
        readonly __typePathDoNotAccess: K;
    }
    export interface $ClassType<T> {
        StaticClass(): Class;
        Load(name: string): T | null | undefined;
    }
    /** Verified one-argument UObject factory. Does not imply that every class can be constructed. */
    export function NewObject<K extends keyof ReflectedClasses>(type: $TypedClass<K>): ReflectedClasses[K] | null | undefined;
    export function NewObject(type: Class): Object | null | undefined;
    export interface $StructType<T> { StaticClass(): ScriptStruct; }
    export namespace $Static {
        interface Class {
            Load<K extends keyof ReflectedClasses>(name: K): $TypedClass<K> | null | undefined;
        }
        interface Vector { new(X: number, Y: number, Z: number): UE.Vector; }
    }
    export interface FixSizeArray<T> {
        Num(): number;
        Get(index: number): T;
        GetRef(index: number): T;
        Set(index: number, value: T): void;
    }
    export interface TArray<T> extends FixSizeArray<T> {
        Add(...values: T[]): void;
        Contains(value: T): boolean;
        FindIndex(value: T): number;
        RemoveAt(index: number): void;
        IsValidIndex(index: number): boolean;
        Empty(): void;
    }
    export interface TSet<T> {
        Num(): number;
        Add(value: T): void;
        Get(index: number): T;
        GetRef(index: number): T;
        Contains(value: T): boolean;
        FindIndex(value: T): number;
        RemoveAt(index: number): void;
        GetMaxIndex(): number;
        IsValidIndex(index: number): boolean;
        Empty(): void;
    }
    export interface TMap<K,V> {
        Num(): number;
        Add(key: K, value: V): void;
        Get(key: K): V | undefined;
        GetRef(key: K): V | undefined;
        Set(key: K, value: V): void;
        Remove(key: K): void;
        GetMaxIndex(): number;
        IsValidIndex(index: number): boolean;
        GetKey(index: number): K;
        Empty(): void;
    }
    export const BuiltinBool: 0;
    export const BuiltinByte: 1;
    export const BuiltinInt: 2;
    export const BuiltinFloat: 3;
    export const BuiltinDouble: 4;
    export const BuiltinInt64: 5;
    export const BuiltinString: 6;
    export const BuiltinText: 7;
    export const BuiltinName: 8;
    export type $ContainerToken = 0|1|2|3|4|5|6|7|8;
    export type $ContainerElement<T extends $ContainerToken> = T extends 0 ? boolean : T extends 5 ? bigint : T extends 7 ? $FText : T extends 6|8 ? string : number;
    export function NewArray<T extends $ContainerToken>(type: T): TArray<$ContainerElement<T>>;
    export function NewSet<T extends $ContainerToken>(type: T): TSet<$ContainerElement<T>>;
    export function NewMap<K extends $ContainerToken,V extends $ContainerToken>(key: K, value: V): TMap<$ContainerElement<K>,$ContainerElement<V>>;
    export interface TSoftObjectPtr<T> {
        Get(): T | null | undefined;
        LoadSynchronous(): T | null | undefined;
    }
    export interface TSoftClassPtr<T> {
        Get(): Class | null | undefined;
        LoadSynchronous(): Class | null | undefined;
    }
    export interface $Delegate<F extends (...args: never[]) => unknown> {
        Bind(callback: F): void;
        Bind(target: Object, methodName: string): void;
        Unbind(): void;
        IsBound(): boolean;
        Execute(...args: Parameters<F>): ReturnType<F>;
    }
    export interface $MulticastDelegate<F extends (...args: never[]) => unknown> {
        Add(callback: F): void;
        Add(target: Object, methodName: string): void;
        Remove(callback: F): void;
        Clear(): void;
        Broadcast(...args: Parameters<F>): ReturnType<F>;
    }
}
declare module 'puerts' {
    import * as UE from 'ue';
    export namespace blueprint {
        function tojs<K extends keyof UE.ReflectedClasses>(type: UE.$TypedClass<K>): UE.ReflectedClassStatics[K] & UE.$ClassType<UE.ReflectedClasses[K]>;
        function tojs(type: UE.Class): UE.$ClassType<UE.Object>;
    }
}
