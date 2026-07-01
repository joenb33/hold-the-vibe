'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vscodeStub = require('../test-support/vscode-stub.js');
const { getIdeKind, isCursor, isVsCode, getIdeDisplayName } = require('../out/ideKind.js');

beforeEach(() => {
  vscodeStub.__reset();
});

test('detects Cursor', () => {
  vscodeStub.__setAppName('Cursor');
  assert.equal(getIdeKind(), 'cursor');
  assert.equal(isCursor(), true);
  assert.equal(isVsCode(), false);
  assert.equal(getIdeDisplayName(), 'Cursor');
});

test('detects VS Code', () => {
  vscodeStub.__setAppName('Visual Studio Code');
  assert.equal(getIdeKind(), 'vscode');
  assert.equal(isVsCode(), true);
  assert.equal(getIdeDisplayName(), 'VS Code');
});

test('falls back to unknown for other forks, using the raw app name as the display name', () => {
  vscodeStub.__setAppName('VSCodium');
  assert.equal(getIdeKind(), 'unknown');
  assert.equal(isCursor(), false);
  assert.equal(isVsCode(), false);
  assert.equal(getIdeDisplayName(), 'VSCodium');
});
