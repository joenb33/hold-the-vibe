import { getConfig, shouldGateNotifySource } from './config';
import type { DingCoordinator } from './dingCoordinator';
import type { Diagnostics } from './diagnostics';
import type { SoundPlayer } from './soundPlayer';
import type { SignalSource } from './types';

export class MusicController {
  private hookRefCount = 0;
  private notifyPlaying = false;

  constructor(
    private readonly soundPlayer: SoundPlayer,
    private readonly dingCoordinator: DingCoordinator,
    private readonly diagnostics: Diagnostics,
  ) {}

  isPlaying(): boolean {
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
      }
      return;
    }

    if (this.notifyPlaying) {
      return;
    }

    this.notifyPlaying = true;
    this.diagnostics.recordHoldStart(source);
    this.soundPlayer.startHoldLoop();
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
    this.diagnostics.recordHoldStop(source);
    this.soundPlayer.stopHoldLoop();
    this.dingCoordinator.requestDing(source);
  }
}
