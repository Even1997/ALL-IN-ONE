import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const interopPath = new URL('../src/features/knowledge/workspace/wordDocumentInterop.ts', import.meta.url);
const projectionPath = new URL('../src/features/knowledge/workspace/documentProjection.ts', import.meta.url);
const pagPanePath = new URL('../src/components/product/ProductPageWorkspacePane.tsx', import.meta.url);

test('word document interop uses desktop Word commands before browser-side docx fallback', async () => {
  const source = await readFile(interopPath, 'utf8');

  assert.match(source, /invoke<string>\('extract_word_document_text', \{ filePath \}\)/);
  assert.match(source, /mammoth\.extractRawText/);
  assert.match(source, /invoke\('save_word_document_text',/);
  assert.match(source, /Packer\.toArrayBuffer/);
  assert.doesNotMatch(source, /Packer\.toBuffer/);
});

test('legacy doc preview stays on the original path and does not create docx side files', async () => {
  const source = await readFile(interopPath, 'utf8');
  const projectionSource = await readFile(projectionPath, 'utf8');

  assert.match(source, /export const migrateLegacyDocToDocx = async \(filePath: string\): Promise<string> => \{\s*return filePath;\s*\};/s);
  assert.match(source, /if \(extension === 'doc'\) \{\s*return '';\s*\}/s);
  assert.match(source, /export const createEmptyWordDocument = async \(filePath: string\) => \{\s*await saveWordTextToDocx\(filePath, ''\);\s*\};/s);
  assert.doesNotMatch(source, /resolveUniqueDocxPath/);
  assert.match(projectionSource, /buildTextProjection\(editablePath, title, extension, source\)/);
});

test('word save command can create a missing or invalid doc file in place before writing text', async () => {
  const libSource = await readFile(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');

  assert.match(libSource, /Failed to prepare parent directory .* for Word save/s);
  assert.match(libSource, /let open_or_create_command = format!\(/);
  assert.match(libSource, /\$word\.Documents\.Open\('\{source\}', \$false, \$false\)/);
  assert.match(libSource, /\$word\.Documents\.Add\(\)/);
  assert.match(libSource, /\$sourceDocument\.SaveAs\(\[ref\]'\{source\}', \[ref\]\{format_code\}\);/);
});

test('pag document workbench routes doc and docx through the shared editable word model', async () => {
  const projectionSource = await readFile(projectionPath, 'utf8');
  const pagSource = await readFile(pagPanePath, 'utf8');

  assert.match(projectionSource, /extension === 'doc' \|\| extension === 'docx'/);
  assert.match(projectionSource, /migrateLegacyDocToDocx\(filePath\)/);
  assert.match(projectionSource, /loadWordDocumentTextContent\(editablePath\)/);
  assert.match(projectionSource, /projection\.capabilities = \['preview', 'reference', 'system-open'\];/);
  assert.match(pagSource, /filePreview\.kind === 'word'/);
  assert.match(pagSource, /文档没有可提取的文字内容。请使用右上角系统打开查看或编辑。/);
  assert.doesNotMatch(pagSource, /saveWordTextToDocx/);
});
