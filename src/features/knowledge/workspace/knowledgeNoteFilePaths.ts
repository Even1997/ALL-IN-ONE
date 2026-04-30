const WINDOWS_INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const trimLeadingSeparators = (value: string) => value.replace(/^[\\/]+/, '');
const trimTrailingSeparators = (value: string) => value.replace(/[\\/]+$/, '');

const joinKnowledgeRootPath = (basePath: string, fileName: string) => {
  const separator = basePath.includes('\\') ? '\\' : '/';
  return `${trimTrailingSeparators(basePath)}${separator}${trimLeadingSeparators(fileName)}`;
};

export const normalizeKnowledgeNoteTitle = (value: string) => value.trim() || '未命名笔记';

export const buildKnowledgeNoteMarkdownFileName = (title: string) => {
  const normalized = normalizeKnowledgeNoteTitle(title)
    .replace(WINDOWS_INVALID_FILENAME_CHARS, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '');
  const safeTitle = normalized || '未命名笔记';

  return /\.(md|markdown)$/i.test(safeTitle) ? safeTitle : `${safeTitle}.md`;
};

export const appendKnowledgeNoteFileNameSuffix = (fileName: string, suffix: number) => {
  if (suffix <= 1) {
    return fileName;
  }

  return fileName.replace(/(\.(md|markdown))$/i, `-${suffix}$1`);
};

export const buildKnowledgeNoteRootMirrorPath = (projectRootDir: string, title: string, suffix = 1) =>
  joinKnowledgeRootPath(
    projectRootDir,
    appendKnowledgeNoteFileNameSuffix(buildKnowledgeNoteMarkdownFileName(title), suffix)
  );
