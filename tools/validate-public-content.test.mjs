import assert from 'node:assert/strict';
import test from 'node:test';

import { findPersonalPaths } from './validate-public-content.mjs';

test('finds Windows, macOS, and Linux personal home paths', () => {
  const windows = ['C:', 'Users', 'alice', 'repo'].join('\\');
  const mac = ['', 'Users', 'bob', 'repo'].join('/');
  const linux = ['', 'home', 'carol', 'repo'].join('/');
  const linuxRoot = ['', 'root', 'private-project'].join('/');
  assert.deepEqual(findPersonalPaths(`${windows} ${mac} ${linux} ${linuxRoot}`), [
    ['', 'Users', 'bob'].join('/'),
    ['', 'home', 'carol'].join('/'),
    ['', 'root', 'private-project'].join('/'),
    ['C:', 'Users', 'alice'].join('\\'),
  ]);
});

test('allows public placeholders and repository-relative paths', () => {
  assert.deepEqual(findPersonalPaths('C:/Users/<name>/repo /home/<user>/repo /root/<project>/repo docs/file.md'), []);
});
