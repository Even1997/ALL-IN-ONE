import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop runtime discovers repo-local project skills from .agents/skills', async () => {
  const source = await readFile('src-tauri/src/lib.rs', 'utf8');

  assert.match(source, /get_project_skill_root/);
  assert.match(source, /\.join\("\.agents"\)\.join\("skills"\)/);
  assert.match(source, /collect_skill_discovery_entries\(&app_data_dir,\s*project_root\.as_deref\(\)\)/);
  assert.match(source, /"Project skill"/);
});

test('skill library treats discovered project skills as project-scoped runtime skills', async () => {
  const source = await readFile('src/modules/ai/skills/skillLibrary.ts', 'utf8');

  assert.match(source, /const hasProjectSkillSource =/);
  assert.match(source, /return isProjectSkillEntry\(skill,\s*projectRoot\);/);
  assert.match(source, /source: isProjectSkillEntry\(skill,\s*projectRoot\) \? 'project' : 'local'/);
});
