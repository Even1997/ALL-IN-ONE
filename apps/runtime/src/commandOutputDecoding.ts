import { execFileSync } from 'node:child_process';

const WINDOWS_CODE_PAGE_LABELS = new Map<number, string>([
  [65001, 'utf-8'],
  [936, 'gbk'],
  [950, 'big5'],
  [932, 'shift_jis'],
  [949, 'euc-kr'],
  [874, 'windows-874'],
  [1250, 'windows-1250'],
  [1251, 'windows-1251'],
  [1252, 'windows-1252'],
  [1253, 'windows-1253'],
  [1254, 'windows-1254'],
  [1255, 'windows-1255'],
  [1256, 'windows-1256'],
  [1257, 'windows-1257'],
  [1258, 'windows-1258'],
]);

let cachedWindowsConsoleCodePage: number | null | undefined;

const tryDecode = (bytes: Buffer, encoding: string) => {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

const getWindowsConsoleCodePage = () => {
  if (process.platform !== 'win32') {
    return null;
  }
  if (cachedWindowsConsoleCodePage !== undefined) {
    return cachedWindowsConsoleCodePage;
  }

  try {
    const output = execFileSync('chcp.com', [], {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    });
    const match = output.match(/(\d+)/);
    cachedWindowsConsoleCodePage = match ? Number.parseInt(match[1] || '', 10) : null;
  } catch {
    cachedWindowsConsoleCodePage = null;
  }

  return cachedWindowsConsoleCodePage;
};

export const decodeCommandOutput = (value: Buffer | string) => {
  if (typeof value === 'string') {
    return value;
  }
  if (value.length === 0) {
    return '';
  }

  const utf8 = tryDecode(value, 'utf-8');
  if (utf8 !== null) {
    return utf8;
  }

  if (process.platform === 'win32') {
    const codePage = getWindowsConsoleCodePage();
    const preferredEncoding = codePage === null ? null : WINDOWS_CODE_PAGE_LABELS.get(codePage) || null;
    if (preferredEncoding) {
      const decoded = tryDecode(value, preferredEncoding);
      if (decoded !== null) {
        return decoded;
      }
    }

    for (const fallbackEncoding of ['gb18030', 'gbk', 'big5', 'shift_jis', 'euc-kr']) {
      if (fallbackEncoding === preferredEncoding) {
        continue;
      }
      const decoded = tryDecode(value, fallbackEncoding);
      if (decoded !== null) {
        return decoded;
      }
    }
  }

  return value.toString('utf8');
};
