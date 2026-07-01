import { getConfig, shouldGateNotifySource } from './config';
import type { DingCoordinator } from './dingCoordinator';
import type { Diagnostics } from './diagnostics';
import type { SoundPlayer } from './soundPlayer';
import type { SignalSource } from './types';

export class MusicController {
  private hookRefCount = 0;
  private notifyPlaying = false;
  private holdLoopStartedAt: number | undefined;

  constructor(
    private readonly soundPlayer: SoundPlayer,
    private readonly dingCoordinator: DingCoordinator,
    private readonly diagnostics: Diagnostics,
  ) {}

  isPlaying(): boolean {
    if (this.soundPlayer.isLoopRunning()) {
      return true;
    }
    const config = getConfig();
    if (config.advancedMode) {
      return this.hookRefCount > 0;
    }
    return this.notifyPlaying;
  }

  getRefCount(): number {
    return this.hookRefCount;
  }

  requestActivityStart(source: SignalSource): void {
    const config = getConfig();

    if (!config.enabled) {
      return;
    }

    if (shouldGateNotifySource(config.advancedMode, source)) {
      return;
    }

    if (config.advancedMode) {
      this.hookRefCount++;
      this.diagnostics.recordHoldStart(source);
      if (this.hookRefCount === 1) {
        this.soundPlayer.startHoldLoop();
        this.markHoldLoopStarted();
      }
      return;
    }

    if (this.notifyPlaying) {
      return;
    }

    this.notifyPlaying = true;
    this.diagnostics.recordHoldStart(source);
    this.soundPlayer.startHoldLoop();
    this.markHoldLoopStarted();
  }

  requestActivityStop(source: SignalSource): void {
    const config = getConfig();

    if (!config.enabled) {
      return;
    }

    if (shouldGateNotifySource(config.advancedMode, source)) {
      return;
    }

    if (config.advancedMode) {
      if (this.hookRefCount <= 0) {
        return;
      }
      this.hookRefCount--;
      this.diagnostics.recordHoldStop(source);
      if (this.hookRefCount === 0) {
        this.clearHoldLoopStarted();
        this.soundPlayer.stopHoldLoop();
        this.dingCoordinator.requestDing(source);
      }
      return;
    }

    if (!this.notifyPlaying) {
      this.dingCoordinator.requestDing(source);
      return;
    }

    this.notifyPlaying = false;
    this.clearHoldLoopStarted();
    this.diagnostics.recordHoldStop(source);
    this.soundPlayer.stopHoldLoop();
    this.dingCoordinator.requestDing(source);
  }

  /** Main agent `stop` hook — always tears down music even if subagent ref-count leaked. */
  requestActivityForceStop(source: SignalSource): void {
    const config = getConfig();

    if (!config.enabled) {
      return;
    }

    if (shouldGateNotifySource(config.advancedMode, source)) {
      return;
    }

    if (config.advancedMode) {
      const wasActive = this.hookRefCount > 0 || this.soundPlayer.isLoopRunning();
      this.hookRefCount = 0;
      this.clearHoldLoopStarted();
      this.soundPlayer.stopHoldLoop();
      if (wasActive) {
        this.diagnostics.recordHoldStop(source);
        this.dingCoordinator.requestDing(source);
      }
      return;
    }

    this.requestActivityStop(source);
  }

  /** Manual / failsafe stop — always kills playback and resets state; no ding. */
  emergencyStop(): boolean {
    const wasActive = this.hookRefCount > 0 || this.notifyPlaying || this.soundPlayer.isLoopRunning();
    this.hookRefCount = 0;
    this.notifyPlaying = false;
    this.clearHoldLoopStarted();
    this.soundPlayer.stopHoldLoop();
    return wasActive;
  }

  /** Auto-stop if hold music exceeds maxHoldMinutes (0 = disabled). Returns true when triggered. */
  checkHoldWatchdog(): boolean {
    const maxMin = getConfig().maxHoldMinutes;
    if (maxMin <= 0 || this.holdLoopStartedAt === undefined) {
      return false;
    }
    if (!this.soundPlayer.isLoopRunning() && !this.isPlaying()) {
      this.clearHoldLoopStarted();
      return false;
    }
    const elapsedMs = Date.now() - this.holdLoopStartedAt;
    if (elapsedMs < maxMin * 60 * 1000) {
      return false;
    }
    this.emergencyStop();
    return true;
  }

  /** Extension shutdown — stop audio without a ding. */
  forceStopAll(): void {
    this.emergencyStop();
  }

  private markHoldLoopStarted(): void {
    this.holdLoopStartedAt = Date.now();
  }

  private clearHoldLoopStarted(): void {
    this.holdLoopStartedAt = undefined;
  }
}
