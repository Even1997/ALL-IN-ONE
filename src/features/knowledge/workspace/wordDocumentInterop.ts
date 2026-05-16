import { invoke } from '@tauri-apps/api/core';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').replace(/\u0000/g, '');
const getFileExtension = (filePath: string) =>
  filePath.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

const createPlainDocxBuffer = async (content: string) => {
  const normalized = normalizeText(content);
  const paragraphs = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const document = new Document({
    sections: [
      {
        properties: {},
        children:
          paragraphs.length > 0
            ? paragraphs.map(
                (paragraph) =>
                  new Paragraph({
                    children: [new TextRun(paragraph)],
                  })
              )
            : [new Paragraph({ children: [new TextRun('')] })],
      },
    ],
  });
  return Packer.toArrayBuffer(document);
};

export const loadWordDocumentTextContent = async (filePath: string) => {
  try {
    const extractedText = await invoke<string>('extract_word_document_text', { filePath });
    return normalizeText(extractedText || '').trim();
  } catch (error) {
    const extension = getFileExtension(filePath);
    if (extension === 'doc') {
      return '';
    }
    if (extension !== 'docx') {
      throw error;
    }

    const bytes = await invoke<number[]>('read_binary_file', { filePath });
    const buffer = new Uint8Array(bytes).buffer;
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return normalizeText(result.value || '').trim();
  }
};

export const migrateLegacyDocToDocx = async (filePath: string): Promise<string> => {
  return filePath;
};

export const createEmptyWordDocument = async (filePath: string) => {
  await saveWordTextToDocx(filePath, '');
};

export const saveWordTextToDocx = async (filePath: string, content: string) => {
  try {
    await invoke('save_word_document_text', {
      params: {
        filePath,
        content: normalizeText(content),
      },
    });
    return;
  } catch (error) {
    if (getFileExtension(filePath) !== 'docx') {
      throw error;
    }
  }

  const buffer = await createPlainDocxBuffer(content);
  await invoke('write_binary_file', {
    params: {
      filePath,
      bytes: Array.from(new Uint8Array(buffer)),
    },
  });
};
