import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReferenceFiles } from '../../src/modules/knowledge/referenceFiles.ts';

test('buildReferenceFiles includes generated markdown and html outputs', () => {
  const result = buildReferenceFiles({
    requirementDocs: [],
    generatedFiles: [
      {
        path: 'src/generated/planning/wireframes.md',
        content: '# Wireframes',
        language: 'md',
        category: 'design',
        summary: 'Wireframe summary',
        sourceTaskIds: [],
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        path: 'prototype/login.html',
        content: '<html><body>Login</body></html>',
        language: 'html',
        category: 'design',
        summary: 'Login prototype',
        sourceTaskIds: [],
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
    designPages: [],
    wireframes: {},
    designStyleNodes: [],
  });

  assert.ok(result.some((file) => file.path === 'src/generated/planning/wireframes.md'));
  assert.ok(result.some((file) => file.path === 'prototype/login.html'));
});

test('buildReferenceFiles derives sketch and style markdown files with stable paths', () => {
  const result = buildReferenceFiles({
    requirementDocs: [],
    generatedFiles: [],
    designPages: [
      {
        id: 'page-1',
        name: 'Login Page',
        kind: 'page',
        description: 'Login entry',
        featureIds: [],
        metadata: {
          route: '/login',
          title: 'Login',
          goal: 'Sign in',
          template: 'custom',
          ownerRole: 'UI设计',
          notes: '',
          status: 'draft',
        },
        children: [],
      },
    ],
    wireframes: {
      'page-1': {
        id: 'wf-1',
        pageId: 'page-1',
        pageName: 'Login Page',
        updatedAt: '2026-04-25T00:00:00.000Z',
        status: 'ready',
        elements: [],
      },
    },
    designStyleNodes: [
      {
        id: 'style-1',
        title: 'Default Style',
        summary: 'Minimal and clean',
        keywords: ['clean'],
        palette: ['#111111', '#ffffff'],
        prompt: 'Use a clean visual style.',
        filePath: 'design/styles/default-style.md',
      },
    ],
  });

  assert.ok(result.some((file) => file.path === 'sketch/pages/page-1-login-page.md'));
  const sketchFile = result.find((file) => file.path === 'sketch/pages/page-1-login-page.md');
  assert.ok(sketchFile);
  assert.match(sketchFile.content, /^# Login Page/m);
  assert.match(sketchFile.content, /- route: \/login/);
  assert.match(sketchFile.content, /- goal: Sign in/);
  assert.match(sketchFile.content, /- modules:/);
  const styleFile = result.find((file) => file.path === 'design/styles/default-style.md');
  assert.ok(styleFile);
  assert.match(styleFile.content, /^---\n/);
  assert.match(styleFile.content, /id: style-1/);
  assert.match(styleFile.content, /sourceType: user-text/);
  assert.match(styleFile.content, /## Brand & Style/);
  assert.match(styleFile.content, /## Colors/);
  assert.match(styleFile.content, /## Do \/ Don't/);
});
