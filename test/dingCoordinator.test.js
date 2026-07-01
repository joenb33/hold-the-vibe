'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vscodeStub = require('../test-support/vscode-stub.js');
const { DingCoordinator } = require('../out/dingCoordinator.js');

function makeFakes() {
  const calls = [];
  const soundPlayer = { playDing: () => calls.push('ding') };
  const diagnostics = {
    recordDingPlayed: (source) => calls.push(`played:${source}`),
    recordDingSuppressed: (reason) => calls.push(`suppressed:${reason}`),
    recordHoldStart: () => {},
    recordHoldStop: () => {},
  };
  return { calls, soundPlayer, diagnostics };
}

beforeEach(() => {
  vscodeStub.__reset();
});

test('plays a ding and records it', () => {
  const { calls, soundPlayer, diagnostics } = makeFakes();
  vscodeStub.__setConfig({ enabled: true, advancedMode: false, dingCooldownMs: 2500 });
  const coordinator = new DingCoordinator(soundPlayer, diagnostics);

  const result = coordinator.requestDing('tool');

  assert.equal(result, 'played');
  assert.deepEqual(calls, ['ding', 'played:tool']);
});

test('suppresses a second ding from any source within the cooldown window', async () => {
  const { calls, soundPlayer, diagnostics } = makeFakes();
  vscodeStub.__setConfig({ enabled: true, advancedMode: false, dingCooldownMs: 50 });
  const coordinator = new DingCoordinator(soundPlayer, diagnostics);

  assert.equal(coordinator.requestDing('tool'), 'played');
  assert.equal(coordinator.requestDing('terminal'), 'cooldown');

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(coordinator.requestDing('terminal'), 'played');
});

test('gates non-hook sources when Advanced Mode is on', () => {
  const { soundPlayer, diagnostics } = makeFakes();
  vscodeStub.__setConfig({ enabled: true, advancedMode: true, dingCooldownMs: 2500 });
  const coordinator = new DingCoordinator(soundPlayer, diagnostics);

  assert.equal(coordinator.requestDing('tool'), 'gated');
  assert.equal(coordinator.requestDing('terminal'), 'gated');
  assert.equal(coordinator.requestDing('hook'), 'played');
});

test('does nothing when the extension is disabled, regardless of source', () => {
  const { calls, soundPlayer, diagnostics } = makeFakes();
  vscodeStub.__setConfig({ enabled: false, advancedMode: false, dingCooldownMs: 2500 });
  const coordinator = new DingCoordinator(soundPlayer, diagnostics);

  assert.equal(coordinator.requestDing('hook'), 'disabled');
  assert.deepEqual(calls, ['suppressed:disabled']);
});
