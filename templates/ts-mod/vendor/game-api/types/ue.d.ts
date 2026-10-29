// Handwritten, runtime-verified subset. See api-surface.json for build and evidence.
// Object interfaces describe engine-owned values; no constructors are implied.
declare module 'ue' {
    import * as UE from 'ue';
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

    export namespace $Static {
    export interface GameplayStatics {
        GetCurrentLevelName(worldContextObject: UE.Object, removePrefix: boolean): string;
        GetGameInstance(worldContextObject: UE.Object): UE.GameInstance | null | undefined;
        GetGameMode(worldContextObject: UE.Object): UE.GameModeBase | null | undefined;
        GetGameState(worldContextObject: UE.Object): UE.GameStateBase | null | undefined;
        GetPlayerController(worldContextObject: UE.Object, playerIndex: number): UE.PlayerController | null | undefined;
        GetPlayerPawn(worldContextObject: UE.Object, playerIndex: number): UE.Pawn | null | undefined;
        /** May be null even when a player controller exists (for example, the main menu). */
        GetPlayerCharacter(worldContextObject: UE.Object, playerIndex: number): UE.Character | null | undefined;
        GetPlayerCameraManager(worldContextObject: UE.Object, playerIndex: number): UE.PlayerCameraManager | null | undefined;
        GetTimeSeconds(worldContextObject: UE.Object): number;
        GetRealTimeSeconds(worldContextObject: UE.Object): number;
        GetWorldDeltaSeconds(worldContextObject: UE.Object): number;
        IsGamePaused(worldContextObject: UE.Object): boolean;
    }
    }

    export namespace $Static {
    export interface KismetSystemLibrary {
        GetObjectName(object: UE.Object): string;
        GetPathName(object: UE.Object): string;
        GetDisplayName(object: UE.Object): string;
        /** Checks engine lifetime as well as null; a non-null JS wrapper can be invalid. */
        IsValid(object: UE.Object | null | undefined): object is UE.Object;
        GetEngineVersion(): string;
        GetGameName(): string;
    }
    }

    export interface GameUserSettings extends Object {
        GetScreenResolution(): IntPoint;
        /** Numeric engine value; the verified windowed mode is 2. */
        GetFullscreenMode(): number;
    }
    export namespace $Static {
    export interface GameUserSettings {
        GetGameUserSettings(): UE.GameUserSettings | null | undefined;
    }
    }
}
