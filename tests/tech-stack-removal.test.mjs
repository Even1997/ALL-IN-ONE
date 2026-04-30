import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('project model and app shell no longer carry tech stack metadata', async () => {
  const typesSource = await readFile(new URL('../src/types/index.ts', import.meta.url), 'utf8');
  const storeSource = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(typesSource, /frontendFramework:\s*string;/);
  assert.doesNotMatch(typesSource, /backendFramework:\s*string;/);
  assert.doesNotMatch(typesSource, /database:\s*string;/);
  assert.doesNotMatch(typesSource, /uiFramework:\s*string;/);
  assert.doesNotMatch(typesSource, /deployment:\s*string;/);
  assert.doesNotMatch(typesSource, /techStack:\s*Record<string,\s*string>;/);

  assert.doesNotMatch(storeSource, /frontendFramework:\s*defaults\.frontendFramework/);
  assert.doesNotMatch(storeSource, /backendFramework:\s*defaults\.backendFramework/);
  assert.doesNotMatch(storeSource, /database:\s*defaults\.database/);
  assert.doesNotMatch(storeSource, /uiFramework:\s*defaults\.uiFramework/);
  assert.doesNotMatch(storeSource, /deployment:\s*defaults\.deployment/);
  assert.doesNotMatch(storeSource, /techStack:\s*\{/);
  assert.doesNotMatch(storeSource, /技术栈：/);

  assert.doesNotMatch(appSource, /Object\.keys\(memory\?\.techStack \|\| \{\}\)\.length/);
  assert.doesNotMatch(appSource, /currentProject\?\.deployment/);
  assert.doesNotMatch(appSource, /currentProject\.frontendFramework/);
  assert.doesNotMatch(appSource, /currentProject\.backendFramework/);
});
