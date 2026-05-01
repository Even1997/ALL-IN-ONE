import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../src/App.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');
const iconPath = path.resolve(__dirname, '../public/branding/goodnight-icon.svg');

test('desktop brand chip uses the GoodNight icon asset', async () => {
  await access(iconPath);
  const source = await readFile(appPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /className="desktop-brand-chip"[\s\S]*src="\/branding\/goodnight-icon\.svg"/);
  assert.doesNotMatch(source, /className="desktop-brand-chip"[\s\S]*<span>GN<\/span>/);
  assert.match(source, /className="app-brand-logo"\s+src="\/branding\/goodnight-logo-horizontal\.svg"/);
  assert.match(css, /\.desktop-brand-chip img\s*\{[^}]*width:\s*40px;/s);
  assert.match(css, /\.desktop-brand-chip img\s*\{[^}]*height:\s*40px;/s);
});
