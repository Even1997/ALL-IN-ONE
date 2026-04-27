import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runKnowledgeOrganizeLane } from '../../src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const projectPersistencePath = path.resolve(__dirname, '../../src/utils/projectPersistence.ts');

test('knowledge organize lane returns derived wiki docs with explicit typing', async () => {
  const docs = await runKnowledgeOrganizeLane({
    project: { id: 'project-1', name: 'GN Agent' },
    requirementDocs: [
      {
        id: 'req-1',
        title: '产品目标.md',
        content: '做一个产品经理可用的桌面端 AI 工作台。',
        summary: '产品目标',
        authorRole: '产品',
        sourceType: 'manual',
        updatedAt: '2026-04-27T00:00:00.000Z',
        status: 'ready',
      },
    ],
    generatedFiles: [],
    executeText: async () =>
      JSON.stringify({
        'project-overview': { summary: '项目总览', content: '# 项目总览' },
        'feature-inventory': { summary: '功能清单', content: '# 功能清单' },
        'page-inventory': { summary: '页面清单', content: '# 页面清单' },
        terminology: { summary: '术语表', content: '# 术语表' },
        'open-questions': { summary: '待确认问题', content: '# 待确认问题' },
      }),
  });

  assert.equal(docs.length, 5);
  assert.equal(docs.some((doc) => doc.docType === 'wiki-index' && doc.title === '项目总览.md'), true);
  assert.equal(docs.some((doc) => doc.docType === 'wiki-index' && doc.title === '功能清单.md'), true);
  assert.equal(docs.some((doc) => doc.docType === 'wiki-index' && doc.title === '页面清单.md'), true);
  assert.equal(docs.some((doc) => doc.docType === 'ai-summary' && doc.title === '术语表.md'), true);
});

test('knowledge organize persists generated wiki docs into the project knowledge directory before merging', async () => {
  const chatSource = await readFile(aiChatPath, 'utf8');
  const persistenceSource = await readFile(projectPersistencePath, 'utf8');

  assert.match(chatSource, /saveKnowledgeDocsToProjectDir/);
  assert.match(chatSource, /const persistedDocs = await saveKnowledgeDocsToProjectDir\(currentProject\.id,\s*docs\);/);
  assert.match(chatSource, /const mergedDocs = mergeRequirementDocsByTitle\(requirementDocs,\s*persistedDocs\);/);

  assert.match(persistenceSource, /export const saveKnowledgeDocsToProjectDir = async/);
  assert.match(persistenceSource, /joinProjectRelativePath\(projectDir,\s*`project\/\$\{doc\.title\}`\)/);
  assert.match(persistenceSource, /filePath:\s*filePath/);
});
