// Handwritten, runtime-verified subset. See api-surface.json for build and evidence.
// Object interfaces describe engine-owned values; no constructors are implied.
declare module 'ue' {
    export interface Object {
        GetName(): string;
        GetClass(): Class;
        GetOuter(): Object | null | undefined;
    }
    /** Compatibility name used by the original minimum template. */
    export type UObject = Object;
    export interface Class extends Object {}
    export interface World extends Object {}

    export interface GameInstance extends Object {
        /** Reacquire after map changes; the world can be unavailable during transitions. */
        GetWorld(): World | null | undefined;
    }

    export interface Vector { X: number; Y: number; Z: number; }
    export interface Rotator { Pitch: number; Yaw: number; Roll: number; }
    export interface IntPoint { X: number; Y: number; }

    export interface Actor extends Object {
        K2_GetActorLocation(): Vector;
        K2_GetActorRotation(): Rotator;
        GetActorScale3D(): Vector;
        GetVelocity(): Vector;
    }
    export interface Pawn extends Actor {
        GetController(): Controller | null | undefined;
    }
    export interface Character extends Pawn {}
    export interface Controller extends Actor {}
    export interface PlayerController extends Controller {}
    export interface PlayerCameraManager extends Actor {}
    export interface GameModeBase extends Actor {}
    export interface GameStateBase extends Actor {}

    export namespace GameplayStatics {
        function GetCurrentLevelName(worldContextObject: Object, removePrefix: boolean): string;
        function GetGameInstance(worldContextObject: Object): GameInstance | null | undefined;
        function GetGameMode(worldContextObject: Object): GameModeBase | null | undefined;
        function GetGameState(worldContextObject: Object): GameStateBase | null | undefined;
        function GetPlayerController(worldContextObject: Object, playerIndex: number): PlayerController | null | undefined;
        function GetPlayerPawn(worldContextObject: Object, playerIndex: number): Pawn | null | undefined;
        /** May be null even when a player controller exists (for example, the main menu). */
        function GetPlayerCharacter(worldContextObject: Object, playerIndex: number): Character | null | undefined;
        function GetPlayerCameraManager(worldContextObject: Object, playerIndex: number): PlayerCameraManager | null | undefined;
        function GetTimeSeconds(worldContextObject: Object): number;
        function GetRealTimeSeconds(worldContextObject: Object): number;
        function GetWorldDeltaSeconds(worldContextObject: Object): number;
        function IsGamePaused(worldContextObject: Object): boolean;
    }

    export namespace KismetSystemLibrary {
        function GetObjectName(object: Object): string;
        function GetPathName(object: Object): string;
        function GetDisplayName(object: Object): string;
        /** Checks engine lifetime as well as null; a non-null JS wrapper can be invalid. */
        function IsValid(object: Object | null | undefined): object is Object;
        function GetEngineVersion(): string;
        function GetGameName(): string;
    }

    export interface GameUserSettings extends Object {
        GetScreenResolution(): IntPoint;
        /** Numeric engine value; the verified windowed mode is 2. */
        GetFullscreenMode(): number;
    }
    export namespace GameUserSettings {
        function GetGameUserSettings(): GameUserSettings | null | undefined;
    }
}
