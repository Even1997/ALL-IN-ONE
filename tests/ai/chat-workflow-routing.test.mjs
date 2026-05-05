import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bundledSkillsPath = path.resolve(
  __dirname,
  '../../src/modules/ai/skills/bundledSkillDefinitions.ts',
);
const skillRoutingPath = path.resolve(__dirname, '../../src/modules/ai/workflow/skillRouting.ts');

test('slash skills stay in the default chat chain while removed workflow bundles stay absent', async () => {
  const [bundledSkillsSource, routingSource] = await Promise.all([
    readFile(bundledSkillsPath, 'utf8'),
    readFile(skillRoutingPath, 'utf8'),
  ]);

  assert.match(bundledSkillsSource, /buildSystemSkillDefinition\(wikiSkillMarkdown,\s*'wiki'\)/);
  assert.match(bundledSkillsSource, /buildSystemSkillDefinition\(sketchSkillMarkdown,\s*'sketch'\)/);
  assert.match(bundledSkillsSource, /buildSystemSkillDefinition\(uiDesignSkillMarkdown,\s*'ui-design'\)/);
  assert.match(bundledSkillsSource, /source:\s*'system'/);
  assert.doesNotMatch(bundledSkillsSource, /requirementsSkillMarkdown/);
  assert.doesNotMatch(bundledSkillsSource, /knowledgeOrganizeSkillMarkdown/);
  assert.doesNotMatch(bundledSkillsSource, /changeSyncSkillMarkdown/);
  assert.doesNotMatch(routingSource, /packageId/);
  assert.match(routingSource, /userTagInvocable/);
});
