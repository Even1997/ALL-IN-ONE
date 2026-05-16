// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\[^\\]+\\[^\\]+/;
const WINDOWS_EXTENDED_PATH_PATTERN = /^\\\\\?\\/;
const WINDOWS_EXTENDED_UNC_PATH_PATTERN = /^\\\\\?\\UNC\\/i;
const SLASHED_EXTENDED_PATH_PATTERN = /^\/{2,}\?\//;
const SLASHED_EXTENDED_UNC_PATH_PATTERN = /^\/{2,}\?\/UNC\//i;

const trimLeadingSeparators = (value: string) => value.replace(/^[\\/]+/, '');

const trimTrailingSeparators = (value: string) => value.replace(/[\\/]+$/, '');

export const stripWindowsExtendedLengthPathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (WINDOWS_EXTENDED_UNC_PATH_PATTERN.test(trimmed)) {
    return `\\\\${trimmed.slice(8)}`;
  }

  if (WINDOWS_EXTENDED_PATH_PATTERN.test(trimmed)) {
    return trimmed.slice(4);
  }

  if (SLASHED_EXTENDED_UNC_PATH_PATTERN.test(trimmed)) {
    return `//${trimmed.replace(SLASHED_EXTENDED_UNC_PATH_PATTERN, '')}`;
  }

  if (SLASHED_EXTENDED_PATH_PATTERN.test(trimmed)) {
    return trimmed.replace(SLASHED_EXTENDED_PATH_PATTERN, '');
  }

  return trimmed;
};

export const normalizeComparableFileSystemPath = (value: string | null | undefined) =>
  stripWindowsExtendedLengthPathPrefix(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();

const usesWindowsPathSemantics = (value: string) =>
  WINDOWS_DRIVE_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value)) ||
  WINDOWS_UNC_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value)) ||
  stripWindowsExtendedLengthPathPrefix(value).includes('\\');

export const isAbsoluteFilePath = (value: string) =>
  stripWindowsExtendedLengthPathPrefix(value).startsWith('/') ||
  WINDOWS_DRIVE_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value)) ||
  WINDOWS_UNC_PATH_PATTERN.test(stripWindowsExtendedLengthPathPrefix(value));

export const normalizeRelativeFileSystemPath = (value: string) =>
  trimTrailingSeparators(
    trimLeadingSeparators(stripWindowsExtendedLengthPathPrefix(value).replace(/[\\/]+/g, '/'))
  );

export const joinFileSystemPath = (basePath: string, ...segments: string[]) => {
  const normalizedBasePath = stripWindowsExtendedLengthPathPrefix(basePath);
  const separator = usesWindowsPathSemantics(normalizedBasePath) ? '\\' : '/';
  const normalizedBase = trimTrailingSeparators(normalizedBasePath);
  const normalizedSegments = segments
    .map((segment) => stripWindowsExtendedLengthPathPrefix(segment).replace(/[\\/]+/g, separator))
    .map((segment) => trimLeadingSeparators(segment))
    .filter(Boolean);

  return [normalizedBase, ...normalizedSegments].join(separator);
};

export const getRelativePathFromRoot = (absolutePath: string, rootPath: string) => {
  const normalizedAbsolutePath = trimTrailingSeparators(
    stripWindowsExtendedLengthPathPrefix(absolutePath).replace(/[\\/]+/g, '/')
  );
  const normalizedRootPath = trimTrailingSeparators(
    stripWindowsExtendedLengthPathPrefix(rootPath).replace(/[\\/]+/g, '/')
  );

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
  const normalizedPath = trimTrailingSeparators(stripWindowsExtendedLengthPathPrefix(filePath));
  const lastSeparatorIndex = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  return lastSeparatorIndex >= 0 ? normalizedPath.slice(0, lastSeparatorIndex) : '';
};
