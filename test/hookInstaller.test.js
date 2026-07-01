'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vscodeStub = require('../test-support/vscode-stub.js');
const {
  resolveHookInstallTargets,
  resolveHookUninstallTargets,
  isElevatorMusicHook,
} = require('../out/hookInstaller.js');

beforeEach(() => {
  vscodeStub.__reset();
});

test('installs only Cursor hooks when running in Cursor with installHooksForAllEditors off', () => {
  vscodeStub.__setAppName('Cursor');
  vscodeStub.__setConfig({ installHooksForAllEditors: false });
  assert.deepEqual(resolveHookInstallTargets(), ['cursor']);
});

test('installs only VS Code hooks when running in VS Code with installHooksForAllEditors off', () => {
  vscodeStub.__setAppName('Visual Studio Code');
  vscodeStub.__setConfig({ installHooksForAllEditors: false });
  assert.deepEqual(resolveHookInstallTargets(), ['vscode']);
});

test('installs both when installHooksForAllEditors is on, regardless of current IDE', () => {
  vscodeStub.__setAppName('Cursor');
  vscodeStub.__setConfig({ installHooksForAllEditors: true });
  assert.deepEqual(resolveHookInstallTargets().sort(), ['cursor', 'vscode']);
});

test('uninstall targets always mirror install targets (symmetric cleanup)', () => {
  for (const appName of ['Cursor', 'Visual Studio Code']) {
    for (const installHooksForAllEditors of [true, false]) {
      vscodeStub.__setAppName(appName);
      vscodeStub.__setConfig({ installHooksForAllEditors });
      assert.deepEqual(
        resolveHookUninstallTargets(),
        resolveHookInstallTargets(),
        `mismatch for appName=${appName} installHooksForAllEditors=${installHooksForAllEditors}`,
      );
    }
  }
});

test('detects our own hook command on POSIX-style paths', () => {
  assert.equal(isElevatorMusicHook('/home/user/.cursor/hooks/elevator-music/notify-agent.sh start'), true);
});

test('detects our own hook command on Windows-style backslash paths', () => {
  assert.equal(
    isElevatorMusicHook('powershell -File "C:\\Users\\me\\.cursor\\hooks\\elevator-music\\notify-agent.ps1" start'),
    true,
  );
});

test('does not match unrelated hook commands', () => {
  assert.equal(isElevatorMusicHook('./scripts/some-other-hook.sh'), false);
  assert.equal(isElevatorMusicHook(undefined), false);
});
