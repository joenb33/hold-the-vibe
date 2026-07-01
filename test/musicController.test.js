'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vscodeStub = require('../test-support/vscode-stub.js');
const { DingCoordinator } = require('../out/dingCoordinator.js');
const { MusicController } = require('../out/musicController.js');

function makeController() {
  const calls = [];
  let loopRunning = false;
  const soundPlayer = {
    startHoldLoop: () => {
      calls.push('loop:start');
      loopRunning = true;
    },
    stopHoldLoop: () => {
      calls.push('loop:stop');
      loopRunning = false;
    },
    isLoopRunning: () => loopRunning,
    playDing: () => calls.push('ding'),
  };
  const diagnostics = {
    recordDingPlayed: (s) => calls.push(`ding-played:${s}`),
    recordDingSuppressed: (r) => calls.push(`ding-suppressed:${r}`),
    recordHoldStart: (s) => calls.push(`hold-start:${s}`),
    recordHoldStop: (s) => calls.push(`hold-stop:${s}`),
  };
  const dingCoordinator = new DingCoordinator(soundPlayer, diagnostics);
  const controller = new MusicController(soundPlayer, dingCoordinator, diagnostics);
  return { calls, controller };
}

beforeEach(() => {
  vscodeStub.__reset();
});

test('Notify Mode: start then stop plays the loop once and dings once', () => {
  vscodeStub.__setConfig({ enabled: true, advancedMode: false, dingCooldownMs: 2500 });
  const { calls, controller } = makeController();

  controller.requestActivityStart('tool');
  controller.requestActivityStop('tool');

  assert.equal(controller.isPlaying(), false);
  assert.deepEqual(calls, ['hold-start:tool', 'loop:start', 'hold-stop:tool', 'loop:stop', 'ding', 'ding-played:tool']);
});

test('Notify Mode: a stop with no matching start still dings (ding-only turn)', () => {
  vscodeStub.__setConfig({ enabled: true, advancedMode: false, dingCooldownMs: 2500 });
  const { calls, controller } = makeController();

  controller.requestActivityStop('tool');

  assert.deepEqual(calls, ['ding', 'ding-played:tool']);
});

test('Advanced Mode: hold music ref-counts and only stops (and dings) at zero', () => {
  vscodeStub.__setConfig({ enabled: true, advancedMode: true, dingCooldownMs: 2500 });
  const { calls, controller } = makeController();

  controller.requestActivityStart('hook'); // 0 -> 1, starts loop
  controller.requestActivityStart('hook'); // 1 -> 2, subagent, no extra loop start
  assert.equal(controller.getRefCount(), 2);
  assert.equal(controller.isPlaying(), true);

  controller.requestActivityStop('hook'); // 2 -> 1, still playing, no ding yet
  assert.equal(controller.isPlaying(), true);
  assert.ok(!calls.includes('ding'));

  controller.requestActivityStop('hook'); // 1 -> 0, stop + ding
  assert.equal(controller.isPlaying(), false);
  assert.ok(calls.includes('ding'));

  const loopStarts = calls.filter((c) => c === 'loop:start').length;
  const loopStops = calls.filter((c) => c === 'loop:stop').length;
  assert.equal(loopStarts, 1, 'loop should only start once across the two nested start calls');
  assert.equal(loopStops, 1, 'loop should only stop once the ref count actually reaches zero');
});

test('Advanced Mode: notify-tier sources (tool/terminal) are ignored entirely', () => {
  vscodeStub.__setConfig({ enabled: true, advancedMode: true, dingCooldownMs: 2500 });
  const { calls, controller } = makeController();

  controller.requestActivityStart('tool');
  controller.requestActivityStop('terminal');

  assert.deepEqual(calls, []);
  assert.equal(controller.getRefCount(), 0);
});

test('Advanced Mode: force stop tears down music even when ref-count is still above zero', () => {
  vscodeStub.__setConfig({ enabled: true, advancedMode: true, dingCooldownMs: 2500 });
  const { calls, controller } = makeController();

  controller.requestActivityStart('hook');
  controller.requestActivityStart('hook');
  controller.requestActivityForceStop('hook');

  assert.equal(controller.getRefCount(), 0);
  assert.equal(controller.isPlaying(), false);
  assert.ok(calls.includes('loop:stop'));
  assert.ok(calls.includes('ding'));
});

test('emergencyStop kills playback without a ding and resets state', () => {
  vscodeStub.__setConfig({ enabled: true, advancedMode: true, dingCooldownMs: 2500 });
  const { calls, controller } = makeController();

  controller.requestActivityStart('hook');
  const stopped = controller.emergencyStop();

  assert.equal(stopped, true);
  assert.equal(controller.getRefCount(), 0);
  assert.equal(controller.isPlaying(), false);
  assert.ok(calls.includes('loop:stop'));
  assert.ok(!calls.includes('ding'));
});
