import { getConfig, shouldGateNotifySource } from './config';
import type { Diagnostics } from './diagnostics';
import type { SoundPlayer } from './soundPlayer';
import type { DingResult, SignalSource } from './types';

export class DingCoordinator {
  private lastDingAt = 0;

  constructor(
    private readonly soundPlayer: SoundPlayer,
    private readonly diagnostics: Diagnostics,
  ) {}

  requestDing(source: SignalSource): DingResult {
    const config = getConfig();

    if (!config.enabled) {
      this.diagnostics.recordDingSuppressed('disabled');
      return 'disabled';
    }

    if (shouldGateNotifySource(config.advancedMode, source)) {
      this.diagnostics.recordDingSuppressed('gated');
      return 'gated';
    }

    const now = Date.now();
    if (now - this.lastDingAt < config.dingCooldownMs) {
      this.diagnostics.recordDingSuppressed('cooldown');
      return 'cooldown';
    }

    this.lastDingAt = now;
    this.soundPlayer.playDing();
    this.diagnostics.recordDingPlayed(source);
    return 'played';
  }
}
