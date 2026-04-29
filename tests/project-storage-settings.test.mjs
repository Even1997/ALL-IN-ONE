import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('tauri project storage commands resolve defaults from documents and persist overrides', async () => {
  const source = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

  assert.match(source, /struct ProjectStorageSettings/);
  assert.match(source, /struct ProjectStorageSettingsPayload/);
  assert.match(source, /document_dir\(\)/);
  assert.match(source, /join\("GoodNight"\)\.join\("projects"\)/);
  assert.match(source, /app_config_dir\(\)/);
  assert.match(source, /fn get_project_storage_settings\(\s*app_handle: tauri::AppHandle,/);
  assert.match(source, /fn set_project_storage_root\(\s*app_handle: tauri::AppHandle,\s*root_path: Option<String>,/);
  assert.match(source, /fn get_project_dir\(app_handle: tauri::AppHandle,\s*project_id: String\)/);
  assert.match(source, /get_projects_root_path\(&app_handle\)/);
});

test('tauri dialog plugin is registered for directory selection and default capability access', async () => {
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const cargoSource = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const capabilitySource = await readFile(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8');

  assert.match(cargoSource, /tauri-plugin-dialog\s*=\s*"2"/);
  assert.match(libSource, /plugin\(tauri_plugin_dialog::init\(\)\)/);
  assert.match(capabilitySource, /"dialog:default"/);
});

test('project persistence exposes project storage settings commands to the frontend', async () => {
  const source = await readFile(new URL('../src/utils/projectPersistence.ts', import.meta.url), 'utf8');

  assert.match(source, /export interface ProjectStorageSettings/);
  assert.match(source, /export const getProjectStorageSettings = async \(\)/);
  assert.match(source, /invokeTauri<ProjectStorageSettings>\('get_project_storage_settings'\)/);
  assert.match(source, /export const setProjectStorageRoot = async \(rootPath: string\)/);
  assert.match(source, /invokeTauri<ProjectStorageSettings>\('set_project_storage_root', \{ rootPath \}\)/);
  assert.match(source, /export const resetProjectStorageRoot = async \(\)/);
  assert.match(source, /invokeTauri<ProjectStorageSettings>\('set_project_storage_root', \{ rootPath: null \}\)/);
});

test('project setup shows project storage settings with picker and editable path controls', async () => {
  const source = await readFile(new URL('../src/components/project/ProjectSetup.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectStorageSettings/);
  assert.match(source, /projectStorageDraftOverride/);
  assert.match(source, /onSaveProjectStoragePath/);
  assert.match(source, /onPickProjectStoragePath/);
  assert.match(source, /onResetProjectStoragePath/);
  assert.match(source, /项目存储位置/);
  assert.match(source, /value=\{projectStorageDraft\}/);
  assert.match(source, /placeholder=\{projectStorageSettings\.defaultPath\}/);
  assert.match(source, /选择文件夹/);
  assert.match(source, /保存路径/);
  assert.match(source, /恢复默认/);
});

test('app loads project storage settings and wires folder picker into the project setup view', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const setupSource = await readFile(new URL('../src/components/project/ProjectSetup.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /from '@tauri-apps\/plugin-dialog'/);
  assert.match(appSource, /getProjectStorageSettings/);
  assert.match(appSource, /setProjectStorageRoot/);
  assert.match(appSource, /resetProjectStorageRoot/);
  assert.match(appSource, /const \[projectStorageSettings, setProjectStorageSettings\] = useState/);
  assert.match(appSource, /const \[projectStorageDraftOverride, setProjectStorageDraftOverride\] = useState/);
  assert.match(appSource, /void getProjectStorageSettings\(\)/);
  assert.match(appSource, /const handlePickProjectStoragePath = useCallback/);
  assert.match(appSource, /const selectedPath = await open\(\{/);
  assert.match(appSource, /directory: true/);
  assert.match(appSource, /defaultPath: projectStorageSettings\?\.rootPath \|\| projectStorageSettings\?\.defaultPath/);
  assert.match(appSource, /setProjectStorageDraftOverride\(selectedPath\)/);
  assert.match(appSource, /onSaveProjectStoragePath=\{handleSaveProjectStoragePath\}/);
  assert.match(appSource, /onPickProjectStoragePath=\{handlePickProjectStoragePath\}/);
  assert.match(appSource, /onResetProjectStoragePath=\{handleResetProjectStoragePath\}/);
  assert.match(setupSource, /if \(projectStorageDraftOverride !== null\)/);
});

test('windows packaging exposes a single npm entry and a powershell script with toolchain checks', async () => {
  const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const scriptSource = await readFile(new URL('../scripts/package-win.ps1', import.meta.url), 'utf8');

  assert.match(packageSource, /"package:win"\s*:\s*"powershell -ExecutionPolicy Bypass -File \.\/scripts\/package-win\.ps1"/);
  assert.match(scriptSource, /\$cargoExe/);
  assert.match(scriptSource, /Get-Command npm/);
  assert.match(scriptSource, /link\.exe/);
  assert.match(scriptSource, /npm run build/);
  assert.match(scriptSource, /npx tauri build/);
  assert.match(scriptSource, /src-tauri\\target\\release\\bundle/);
});
