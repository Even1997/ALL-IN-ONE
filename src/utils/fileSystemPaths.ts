const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;

const trimLeadingSeparators = (value: string) => value.replace(/^[\\/]+/, '');

const trimTrailingSeparators = (value: string) => value.replace(/[\\/]+$/, '');

const usesWindowsPathSemantics = (value: string) =>
  WINDOWS_DRIVE_PATH_PATTERN.test(value) || WINDOWS_UNC_PATH_PATTERN.test(value) || value.includes('\\');

export const isAbsoluteFilePath = (value: string) =>
  value.startsWith('/') || WINDOWS_DRIVE_PATH_PATTERN.test(value) || WINDOWS_UNC_PATH_PATTERN.test(value);

export const normalizeRelativeFileSystemPath = (value: string) =>
  trimTrailingSeparators(trimLeadingSeparators(value.replace(/[\\/]+/g, '/')));

export const joinFileSystemPath = (basePath: string, ...segments: string[]) => {
  const separator = usesWindowsPathSemantics(basePath) ? '\\' : '/';
  const normalizedBase = trimTrailingSeparators(basePath);
  const normalizedSegments = segments
    .map((segment) => segment.replace(/[\\/]+/g, separator))
    .map((segment) => trimLeadingSeparators(segment))
    .filter(Boolean);

  return [normalizedBase, ...normalizedSegments].join(separator);
};

export const getRelativePathFromRoot = (absolutePath: string, rootPath: string) => {
  const normalizedAbsolutePath = trimTrailingSeparators(absolutePath.replace(/[\\/]+/g, '/'));
  const normalizedRootPath = trimTrailingSeparators(rootPath.replace(/[\\/]+/g, '/'));

  if (!normalizedRootPath) {
    return null;
  }

  const useCaseInsensitiveComparison =
    usesWindowsPathSemantics(absolutePath) || usesWindowsPathSemantics(rootPath);
  const comparableAbsolutePath = useCaseInsensitiveComparison
    ? normalizedAbsolutePath.toLowerCase()
    : normalizedAbsolutePath;
  const comparableRootPath = useCaseInsensitiveComparison ? normalizedRootPath.toLowerCase() : normalizedRootPath;

  if (comparableAbsolutePath === comparableRootPath) {
    return '';
  }

  const prefix = `${comparableRootPath}/`;
  if (!comparableAbsolutePath.startsWith(prefix)) {
    return null;
  }

  return normalizedAbsolutePath.slice(normalizedRootPath.length + 1);
};

export const getDirectoryPath = (filePath: string) => {
  const normalizedPath = trimTrailingSeparators(filePath);
  const lastSeparatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return lastSeparatorIndex >= 0 ? normalizedPath.slice(0, lastSeparatorIndex) : '';
};
