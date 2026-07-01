'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vscodeStub = require('../test-support/vscode-stub.js');
const { isAdvancedModeSupported } = require('../out/advancedMode.js');

beforeEach(() => {
  vscodeStub.__reset();
});

test('Cursor is always supported, regardless of reported version', () => {
  vscodeStub.__setAppName('Cursor');
  vscodeStub.__setVersion('1.50.0');
  assert.equal(isAdvancedModeSupported(), true);
});

test('VS Code below the hooks floor is not supported', () => {
  vscodeStub.__setAppName('Visual Studio Code');
  vscodeStub.__setVersion('1.108.9');
  assert.equal(isAdvancedModeSupported(), false);
});

test('VS Code at or above the hooks floor is supported', () => {
  vscodeStub.__setAppName('Visual Studio Code');
  vscodeStub.__setVersion('1.109.0');
  assert.equal(isAdvancedModeSupported(), true);

  vscodeStub.__setVersion('1.111.2');
  assert.equal(isAdvancedModeSupported(), true);
});
