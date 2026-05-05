import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRelativePathFromRoot,
  joinFileSystemPath,
  normalizeComparableFileSystemPath,
  normalizeRelativeFileSystemPath,
  stripWindowsExtendedLengthPathPrefix,
} from '../src/utils/fileSystemPaths.ts';

test('file system path helpers strip windows extended-length prefixes for display and comparison', () => {
  assert.equal(
    stripWindowsExtendedLengthPathPrefix('\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE'),
    'C:\\Users\\Even\\Documents\\ALL-IN-ONE'
  );
  assert.equal(
    stripWindowsExtendedLengthPathPrefix('\\\\?\\UNC\\server\\share\\workspace'),
    '\\\\server\\share\\workspace'
  );
  assert.equal(
    stripWindowsExtendedLengthPathPrefix('///?/C:/Users/Even/Documents/ALL-IN-ONE'),
    'C:/Users/Even/Documents/ALL-IN-ONE'
  );
  assert.equal(
    normalizeComparableFileSystemPath('\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE\\'),
    'c:/users/even/documents/all-in-one'
  );
});

test('file system path helpers normalize explorer-friendly paths from extended windows roots', () => {
  assert.equal(
    joinFileSystemPath('\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE', 'sketch/pages/home.md'),
    'C:\\Users\\Even\\Documents\\ALL-IN-ONE\\sketch\\pages\\home.md'
  );
  assert.equal(
    normalizeRelativeFileSystemPath('\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE'),
    'C:/Users/Even/Documents/ALL-IN-ONE'
  );
  assert.equal(
    getRelativePathFromRoot(
      '\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE\\sketch\\pages\\home.md',
      '\\\\?\\C:\\Users\\Even\\Documents\\ALL-IN-ONE'
    ),
    'sketch/pages/home.md'
  );
});
