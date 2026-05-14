import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const legacyBridgeCssPath = path.resolve(__dirname, '../src/styles/workbench/legacy-bridge.css');
const tauriLibPath = path.resolve(__dirname, '../src-tauri/src/lib.rs');

test('desktop drag shell keeps a solid topbar and avoids macOS translucent window material', async () => {
  const [legacyBridgeCss, tauriLib] = await Promise.all([
    readFile(legacyBridgeCssPath, 'utf8'),
    readFile(tauriLibPath, 'utf8'),
  ]);

  const topbarBridgeBlock = legacyBridgeCss.match(
    /\.desktop-active \.desktop-workbench-topbar\.mac-toolbar\.mac-panel\s*{([^}]*)}/
  );

  assert.ok(topbarBridgeBlock, 'expected desktop-active topbar bridge block');
  assert.match(topbarBridgeBlock[1], /background:\s*var\(--wb-toolbar-background\)\s*!important;/);
  assert.doesNotMatch(topbarBridgeBlock[1], /background:\s*transparent\s*!important;/);
  assert.doesNotMatch(tauriLib, /WindowEffect::WindowBackground/);
  assert.doesNotMatch(
    tauriLib,
    /set_background_color\(Some\(tauri::utils::config::Color\(0,\s*0,\s*0,\s*0\)\)\)/
  );
});
