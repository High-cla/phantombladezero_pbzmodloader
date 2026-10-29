// Handwritten subset matching the loader's hello/world-watch examples.
// Interfaces describe existing objects; they do not expose constructors.
declare module 'ue' {
    export interface UObject {
        GetName(): string;
    }

    export interface GameInstance extends UObject {}

    export namespace GameplayStatics {
        function GetCurrentLevelName(worldContextObject: UObject, removePrefix: boolean): string;
    }
}
