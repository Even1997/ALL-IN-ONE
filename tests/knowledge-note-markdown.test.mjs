import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../src/features/knowledge/workspace/knowledgeNoteMarkdown.ts');

const loadModule = async () => {
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('extractKnowledgeNoteEditorBody removes a duplicated leading H1 title', async () => {
  const { extractKnowledgeNoteEditorBody } = await loadModule();

  assert.equal(
    extractKnowledgeNoteEditorBody('\u9879\u76ee\u6982\u89c8', '# \u9879\u76ee\u6982\u89c8\n\n\u8fd9\u91cc\u662f\u6b63\u6587\u3002'),
    '\u8fd9\u91cc\u662f\u6b63\u6587\u3002'
  );
});

test('extractKnowledgeNoteEditorBody keeps the markdown when the first heading is not the note title', async () => {
  const { extractKnowledgeNoteEditorBody } = await loadModule();

  assert.equal(
    extractKnowledgeNoteEditorBody('\u9879\u76ee\u6982\u89c8', '# \u53e6\u4e00\u6bb5\u6807\u9898\n\n\u8fd9\u91cc\u662f\u6b63\u6587\u3002'),
    '# \u53e6\u4e00\u6bb5\u6807\u9898\n\n\u8fd9\u91cc\u662f\u6b63\u6587\u3002'
  );
});

test('serializeKnowledgeNoteMarkdown writes a single canonical title heading', async () => {
  const { serializeKnowledgeNoteMarkdown } = await loadModule();

  assert.equal(
    serializeKnowledgeNoteMarkdown('\u9879\u76ee\u6982\u89c8', '\u8fd9\u91cc\u662f\u6b63\u6587\u3002'),
    '# \u9879\u76ee\u6982\u89c8\n\n\u8fd9\u91cc\u662f\u6b63\u6587\u3002'
  );
});

test('serializeKnowledgeNoteMarkdown does not duplicate an existing matching title heading', async () => {
  const { serializeKnowledgeNoteMarkdown } = await loadModule();

  assert.equal(
    serializeKnowledgeNoteMarkdown('\u9879\u76ee\u6982\u89c8', '# \u9879\u76ee\u6982\u89c8\n\n\u8fd9\u91cc\u662f\u6b63\u6587\u3002'),
    '# \u9879\u76ee\u6982\u89c8\n\n\u8fd9\u91cc\u662f\u6b63\u6587\u3002'
  );
});

test('upsertKnowledgeReferenceSection appends a canonical reference-title section', async () => {
  const { upsertKnowledgeReferenceSection, parseKnowledgeReferenceTitles } = await loadModule();

  const markdown = upsertKnowledgeReferenceSection(
    '# \u9879\u76ee\u6982\u89c8\n\n## \u7d22\u5f15\n- A',
    ['\u5f00\u653e\u95ee\u9898', '\u672f\u8bed\u8868', '\u5f00\u653e\u95ee\u9898']
  );

  assert.match(markdown, /^## \u5f15\u7528\u6765\u6e90$/m);
  assert.match(markdown, /- \u5f00\u653e\u95ee\u9898/);
  assert.match(markdown, /- \u672f\u8bed\u8868/);
  assert.deepEqual(parseKnowledgeReferenceTitles(markdown), ['\u5f00\u653e\u95ee\u9898', '\u672f\u8bed\u8868']);
});

test('upsertKnowledgeReferenceSection replaces an existing reference section instead of duplicating it', async () => {
  const { upsertKnowledgeReferenceSection, parseKnowledgeReferenceTitles } = await loadModule();

  const markdown = upsertKnowledgeReferenceSection(
    '# \u9879\u76ee\u6982\u89c8\n\n\u6b63\u6587\n\n## \u5f15\u7528\u6765\u6e90\n- \u65e7\u6587\u6863',
    ['\u65b0\u6587\u6863']
  );

  assert.equal((markdown.match(/## \u5f15\u7528\u6765\u6e90/g) || []).length, 1);
  assert.deepEqual(parseKnowledgeReferenceTitles(markdown), ['\u65b0\u6587\u6863']);
});

test('upsertKnowledgeRelatedNotesSection appends Obsidian wiki links instead of a legacy source-title list', async () => {
  const { upsertKnowledgeRelatedNotesSection, parseKnowledgeReferenceTitles } = await loadModule();

  const markdown = upsertKnowledgeRelatedNotesSection(
    '# Project overview\n\nBody',
    ['Open questions', 'Terminology', 'Open questions']
  );

  assert.doesNotMatch(markdown, /^## \u5f15\u7528\u6765\u6e90$/m);
  assert.match(markdown, /^## Related notes$/m);
  assert.match(markdown, /- \[\[Open questions\]\]/);
  assert.match(markdown, /- \[\[Terminology\]\]/);
  assert.deepEqual(parseKnowledgeReferenceTitles(markdown), ['Open questions', 'Terminology']);
});

test('parseKnowledgeReferenceTitles also discovers inline Obsidian wiki links with headings and aliases', async () => {
  const { parseKnowledgeReferenceTitles } = await loadModule();

  assert.deepEqual(
    parseKnowledgeReferenceTitles(
      '# Project overview\n\nSee [[Login flow#Errors|error handling]] and [[Terminology]].'
    ),
    ['Login flow', 'Terminology']
  );
});
