export type StylePackSourceType = 'builtin' | 'user-text' | 'user-image' | 'hybrid';
export type StylePackTheme = 'dark' | 'light';
export type StylePackDensity = 'compact' | 'balanced' | 'spacious';
export type StylePackContrast = 'low' | 'medium' | 'high';

export type DesignStyleSeed = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  palette: string[];
  prompt: string;
  filePath?: string;
};

export type StylePackMarkdownOptions = {
  sourceType?: StylePackSourceType;
  sourceDescription?: string;
  confidence?: number;
};

export type BuiltInStylePackFile = {
  id: string;
  title: string;
  path: string;
  content: string;
  seed: DesignStyleSeed;
};

const DEFAULT_DARK_BACKGROUND = '#131315';
const DEFAULT_LIGHT_FOREGROUND = '#1d1a17';
const DEFAULT_DARK_FOREGROUND = '#e5e1e4';
const DEFAULT_LIGHT_ACCENT = '#8c4b2f';
const DEFAULT_DARK_ACCENT = '#79c0ff';

const normalizeHexColor = (value: string) => {
  const normalized = value.trim();
  const shortMatch = /^#([\da-f]{3})$/i.exec(normalized);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split('')
      .map((channel) => `${channel}${channel}`)
      .join('')
      .toLowerCase()}`;
  }

  const longMatch = /^#([\da-f]{6})$/i.exec(normalized);
  return longMatch ? `#${longMatch[1].toLowerCase()}` : null;
};

const parseHexColor = (value: string): [number, number, number] | null => {
  const normalized = normalizeHexColor(value);
  if (!normalized) {
    return null;
  }

  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
};

const toHexColor = ([red, green, blue]: [number, number, number]) =>
  `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;

const mixHexColor = (base: string, target: string, amount: number) => {
  const baseRgb = parseHexColor(base);
  const targetRgb = parseHexColor(target);
  if (!baseRgb || !targetRgb) {
    return normalizeHexColor(base) || normalizeHexColor(target) || '#000000';
  }

  return toHexColor([
    baseRgb[0] + (targetRgb[0] - baseRgb[0]) * amount,
    baseRgb[1] + (targetRgb[1] - baseRgb[1]) * amount,
    baseRgb[2] + (targetRgb[2] - baseRgb[2]) * amount,
  ]);
};

const getRelativeLuminance = (value: string) => {
  const rgb = parseHexColor(value);
  if (!rgb) {
    return 0;
  }

  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const isDarkColor = (value: string) => getRelativeLuminance(value) < 0.42;

const getReadableForeground = (background: string) => (isDarkColor(background) ? '#f8fafc' : '#111827');

const summarizeText = (value: string, maxLength = 96) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const escapeYamlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const indentYamlBlock = (lines: string[], spaces = 2) => lines.map((line) => `${' '.repeat(spaces)}${line}`);

const slugifyStylePackId = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'style-pack';

export const toStylePackPath = (id: string) => `design/styles/${slugifyStylePackId(id)}.md`;

const buildTypographyTokens = (keywords: string[], prompt: string) => {
  const combined = `${keywords.join(' ')} ${prompt}`.toLowerCase();
  const isEditorial = /editorial|serif|luxury|magazine|art direction/.test(combined);
  const isTechnical = /developer|console|terminal|command|system|dashboard|tool/.test(combined);
  const isPlayful = /playful|pop|young|fun|anime|brutal/.test(combined);

  return {
    headingFamily: isEditorial ? 'Fraunces' : isTechnical ? 'Space Grotesk' : isPlayful ? 'Spline Sans' : 'Manrope',
    bodyFamily: isEditorial ? 'Source Sans 3' : isTechnical ? 'IBM Plex Sans' : 'Inter',
  };
};

const inferDensity = (keywords: string[], prompt: string): StylePackDensity => {
  const combined = `${keywords.join(' ')} ${prompt}`.toLowerCase();
  if (/editorial|whitespace|luxury|soft|calm|spacious/.test(combined)) {
    return 'spacious';
  }

  if (/dashboard|console|command|dense|workspace|tool|data/.test(combined)) {
    return 'compact';
  }

  return 'balanced';
};

const inferContrast = (palette: string[]): StylePackContrast => {
  const luminances = palette
    .map((color) => normalizeHexColor(color))
    .filter((color): color is string => Boolean(color))
    .map((color) => getRelativeLuminance(color));

  if (luminances.length < 2) {
    return 'medium';
  }

  const contrastRange = Math.max(...luminances) - Math.min(...luminances);
  if (contrastRange >= 0.6) {
    return 'high';
  }
  if (contrastRange >= 0.28) {
    return 'medium';
  }

  return 'low';
};

const buildStylePackColors = (palette: string[]) => {
  const normalizedPalette = palette
    .map((color) => normalizeHexColor(color))
    .filter((color): color is string => Boolean(color));
  const background = normalizedPalette[0] || DEFAULT_DARK_BACKGROUND;
  const theme: StylePackTheme = isDarkColor(background) ? 'dark' : 'light';
  const fallbackForeground = theme === 'dark' ? DEFAULT_DARK_FOREGROUND : DEFAULT_LIGHT_FOREGROUND;
  const onBackground = getReadableForeground(background) || fallbackForeground;
  const surface = normalizedPalette[1] || mixHexColor(background, onBackground, theme === 'dark' ? 0.12 : 0.06);
  const primary = normalizedPalette[2] || (theme === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT);
  const secondary = normalizedPalette[3] || mixHexColor(primary, background, 0.35);
  const tertiary = normalizedPalette[4] || mixHexColor(secondary, onBackground, 0.18);
  const error = '#ba1a1a';

  return {
    theme,
    values: {
      background,
      'on-background': onBackground,
      surface,
      'surface-dim': mixHexColor(surface, background, theme === 'dark' ? 0.35 : 0.18),
      'surface-bright': mixHexColor(surface, onBackground, theme === 'dark' ? 0.18 : 0.08),
      'surface-container-lowest': theme === 'dark' ? mixHexColor(background, '#000000', 0.22) : mixHexColor(background, '#ffffff', 0.3),
      'surface-container-low': mixHexColor(surface, background, theme === 'dark' ? 0.2 : 0.08),
      'surface-container': mixHexColor(surface, onBackground, theme === 'dark' ? 0.08 : 0.03),
      'surface-container-high': mixHexColor(surface, onBackground, theme === 'dark' ? 0.14 : 0.06),
      'surface-container-highest': mixHexColor(surface, onBackground, theme === 'dark' ? 0.22 : 0.1),
      'surface-variant': mixHexColor(surface, onBackground, theme === 'dark' ? 0.2 : 0.12),
      'on-surface': getReadableForeground(surface),
      'on-surface-variant': mixHexColor(getReadableForeground(surface), surface, theme === 'dark' ? 0.38 : 0.52),
      'inverse-surface': onBackground,
      'inverse-on-surface': background,
      outline: mixHexColor(surface, onBackground, theme === 'dark' ? 0.4 : 0.34),
      'outline-variant': mixHexColor(surface, background, theme === 'dark' ? 0.42 : 0.22),
      'surface-tint': primary,
      primary,
      'on-primary': getReadableForeground(primary),
      'primary-container': mixHexColor(primary, background, theme === 'dark' ? 0.4 : 0.68),
      'on-primary-container': getReadableForeground(mixHexColor(primary, background, theme === 'dark' ? 0.4 : 0.68)),
      'inverse-primary': mixHexColor(primary, onBackground, theme === 'dark' ? 0.2 : 0.12),
      secondary,
      'on-secondary': getReadableForeground(secondary),
      'secondary-container': mixHexColor(secondary, background, theme === 'dark' ? 0.4 : 0.68),
      'on-secondary-container': getReadableForeground(mixHexColor(secondary, background, theme === 'dark' ? 0.4 : 0.68)),
      tertiary,
      'on-tertiary': getReadableForeground(tertiary),
      'tertiary-container': mixHexColor(tertiary, background, theme === 'dark' ? 0.4 : 0.68),
      'on-tertiary-container': getReadableForeground(mixHexColor(tertiary, background, theme === 'dark' ? 0.4 : 0.68)),
      error,
      'on-error': getReadableForeground(error),
      'error-container': theme === 'dark' ? '#93000a' : '#ffdad6',
      'on-error-container': theme === 'dark' ? '#ffdad6' : '#93000a',
    },
  };
};

export const buildDesignStyleMarkdown = (
  node: Pick<DesignStyleSeed, 'id' | 'title' | 'summary' | 'keywords' | 'palette' | 'prompt'>,
  options: StylePackMarkdownOptions = {}
) => {
  const colors = buildStylePackColors(node.palette);
  const typography = buildTypographyTokens(node.keywords, node.prompt);
  const density = inferDensity(node.keywords, node.prompt);
  const contrast = inferContrast(node.palette);
  const combined = `${node.keywords.join(' ')} ${node.prompt}`.toLowerCase();
  const hasGlass = /glass|aurora|glow|floating|premium/.test(combined);
  const playful = /playful|anime|young|pop|shonen|brutal/.test(combined);
  const borderVisible = !/minimal|editorial|soft/.test(combined);
  const sourceType = options.sourceType || 'builtin';
  const confidence = typeof options.confidence === 'number' ? options.confidence : sourceType === 'builtin' ? 1 : 0.82;
  const tags = (node.keywords.length > 0 ? node.keywords : ['custom-style']).slice(0, 8);
  const sourceDescription =
    options.sourceDescription || summarizeText(node.prompt || node.summary || node.title, 88) || 'Generated style pack';

  return [
    '---',
    `id: ${slugifyStylePackId(node.id || node.title)}`,
    `name: "${escapeYamlString(node.title || 'Untitled Style')}"`,
    'version: 1',
    `sourceType: ${sourceType}`,
    `sourceDescription: "${escapeYamlString(sourceDescription)}"`,
    `theme: ${colors.theme}`,
    `density: ${density}`,
    `contrast: ${contrast}`,
    'tags:',
    ...indentYamlBlock(tags.map((tag) => `- "${escapeYamlString(tag)}"`)),
    `confidence: ${confidence}`,
    'colors:',
    ...indentYamlBlock(Object.entries(colors.values).map(([key, value]) => `${key}: '${value}'`)),
    'typography:',
    ...indentYamlBlock([
      'display-lg:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.headingFamily}"`,
          'fontSize: 40px',
          "fontWeight: '700'",
          'lineHeight: 48px',
          'letterSpacing: -0.02em',
        ],
        4
      ),
      'headline-lg:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.headingFamily}"`,
          'fontSize: 32px',
          "fontWeight: '700'",
          'lineHeight: 40px',
          'letterSpacing: -0.01em',
        ],
        4
      ),
      'headline-md:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.headingFamily}"`,
          'fontSize: 24px',
          "fontWeight: '600'",
          'lineHeight: 32px',
        ],
        4
      ),
      'body-lg:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.bodyFamily}"`,
          'fontSize: 18px',
          "fontWeight: '400'",
          'lineHeight: 28px',
        ],
        4
      ),
      'body-md:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.bodyFamily}"`,
          'fontSize: 16px',
          "fontWeight: '400'",
          'lineHeight: 24px',
        ],
        4
      ),
      'body-sm:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.bodyFamily}"`,
          'fontSize: 14px',
          "fontWeight: '400'",
          'lineHeight: 20px',
        ],
        4
      ),
      'label-md:',
      ...indentYamlBlock(
        [
          `fontFamily: "${typography.bodyFamily}"`,
          'fontSize: 12px',
          "fontWeight: '700'",
          'lineHeight: 16px',
        ],
        4
      ),
    ]),
    'rounded:',
    ...indentYamlBlock([
      playful ? 'sm: 0.5rem' : 'sm: 0.25rem',
      density === 'spacious' ? 'DEFAULT: 1rem' : playful ? 'DEFAULT: 0.875rem' : 'DEFAULT: 0.75rem',
      density === 'spacious' ? 'md: 1.25rem' : 'md: 0.75rem',
      density === 'spacious' ? 'lg: 1.75rem' : 'lg: 1rem',
      density === 'spacious' ? 'xl: 2.5rem' : 'xl: 1.5rem',
      'full: 9999px',
    ]),
    'spacing:',
    ...indentYamlBlock([
      'unit: 4px',
      'xs: 4px',
      'sm: 8px',
      'md: 16px',
      'lg: 24px',
      'xl: 32px',
      density === 'compact' ? 'gutter: 16px' : density === 'spacious' ? 'gutter: 24px' : 'gutter: 20px',
      'margin-mobile: 20px',
      density === 'spacious' ? 'margin-desktop: 48px' : 'margin-desktop: 40px',
    ]),
    'effects:',
    ...indentYamlBlock([
      borderVisible ? 'border-width: 1px' : 'border-width: 0px',
      'focus-ring-width: 2px',
      `shadow-color: '${colors.values.primary}'`,
      hasGlass ? 'shadow-opacity: 0.18' : 'shadow-opacity: 0.1',
      hasGlass ? 'shadow-blur: 22px' : 'shadow-blur: 16px',
      hasGlass ? 'glass-blur: 18px' : 'glass-blur: 0px',
      hasGlass ? 'glass-opacity: 0.72' : 'glass-opacity: 1',
    ]),
    'motion:',
    ...indentYamlBlock([
      'duration-fast: 150ms',
      'duration-normal: 220ms',
      density === 'spacious' ? 'duration-slow: 340ms' : 'duration-slow: 300ms',
      'easing-standard: ease-out',
      'easing-emphasized: cubic-bezier(0.2, 0, 0, 1)',
      playful ? 'press-scale: 1.04' : 'press-scale: 1.02',
    ]),
    'components:',
    ...indentYamlBlock([
      'button:',
      ...indentYamlBlock(
        [
          playful ? 'shape: pill' : 'shape: rounded-rect',
          `primaryStyle: ${hasGlass ? 'solid-glow' : 'solid'}`,
          hasGlass ? 'secondaryStyle: glass-tint' : 'secondaryStyle: muted',
        ],
        4
      ),
      'card:',
      ...indentYamlBlock(['imageScrim: false', `borderVisible: ${borderVisible ? 'true' : 'false'}`], 4),
      'chip:',
      ...indentYamlBlock([playful ? 'style: solid-soft' : 'style: subtle-fill'], 4),
      'input:',
      ...indentYamlBlock(
        [
          colors.theme === 'dark' ? 'style: low-contrast-filled' : 'style: quiet-outline',
          hasGlass ? 'focusStyle: glow-outline' : 'focusStyle: ring',
        ],
        4
      ),
      'nav:',
      ...indentYamlBlock([`style: ${hasGlass ? 'glass' : colors.theme === 'dark' ? 'tonal' : 'minimal'}`], 4),
    ]),
    '---',
    '',
    '## Brand & Style',
    node.summary || summarizeText(node.prompt, 160) || 'No summary provided.',
    '',
    `Keywords: ${node.keywords.length > 0 ? node.keywords.join(', ') : 'none'}.`,
    '',
    '## Colors',
    `Reference palette: ${node.palette.length > 0 ? node.palette.join(', ') : 'none'}`,
    '',
    '## Typography',
    `Prompt seed: ${node.prompt || 'No prompt seed provided.'}`,
    '',
    '## Layout & Spacing',
    'Use the density and spacing tokens from the frontmatter as the source of truth for page rhythm and content grouping.',
    '',
    '## Elevation & Depth',
    'Use the effects tokens to decide whether the interface should feel glassy, tonal, or softly shadowed. Keep elevation consistent across cards, sheets, and floating controls.',
    '',
    '## Shapes',
    'Use the radius tokens as the default shape system. Increase curvature for playful or friendly interfaces, and stay more restrained for editorial or tool-like layouts.',
    '',
    '## Motion',
    'Use the motion tokens for transitions and press feedback. Motion should reinforce the chosen style direction rather than behave like a generic default.',
    '',
    '## Components',
    `Primary components should follow this prompt guidance: ${node.prompt || 'No prompt guidance provided.'}`,
    '',
    '## Accessibility',
    'Do not rely on palette or glow alone to express state. Keep focus indicators visible and verify readable contrast on the generated background and surface colors.',
    '',
    "## Do / Don't",
    "Do preserve the core mood described by the keywords and prompt. Don't drop back to a generic UI if the style already expresses a clear visual direction.",
  ].join('\n');
};

const getSectionText = (markdown: string, sectionName: string) => {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const target = `## ${sectionName}`.toLowerCase();
  const startIndex = lines.findIndex((line) => line.trim().toLowerCase() === target);
  if (startIndex < 0) {
    return '';
  }

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines.join('\n').trim();
};

const readFrontmatterValue = (markdown: string, key: string) => {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/m.exec(markdown.replace(/\r/g, ''));
  if (!frontmatterMatch) {
    return '';
  }

  const match = new RegExp(`^${key}:\\s*(.+)$`, 'im').exec(frontmatterMatch[1]);
  return match?.[1]?.trim().replace(/^"|"$/g, '') || '';
};

const readFrontmatterList = (markdown: string, key: string) => {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/m.exec(markdown.replace(/\r/g, ''));
  if (!frontmatterMatch) {
    return [];
  }

  const lines = frontmatterMatch[1].split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  if (startIndex < 0) {
    return [];
  }

  const values: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^\s+-\s+/.test(line)) {
      break;
    }
    values.push(line.replace(/^\s+-\s+/, '').trim().replace(/^"|"$/g, ''));
  }
  return values;
};

export const parseDesignStyleMarkdown = (
  markdown: string,
  fallback: Pick<DesignStyleSeed, 'title' | 'summary' | 'keywords' | 'palette' | 'prompt'>
) => {
  const normalized = markdown.replace(/\r/g, '');
  const title =
    readFrontmatterValue(normalized, 'name') ||
    /^#\s+(.+)$/m.exec(normalized)?.[1]?.trim() ||
    fallback.title;

  const brandText = getSectionText(normalized, 'Brand & Style') || getSectionText(normalized, 'Summary');
  const summaryLine =
    brandText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !/^keywords:/i.test(line)) || fallback.summary;

  const keywordLine =
    brandText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^keywords:/i.test(line)) || '';
  const keywords =
    readFrontmatterList(normalized, 'tags').length > 0
      ? readFrontmatterList(normalized, 'tags')
      : keywordLine
          .replace(/^keywords:\s*/i, '')
          .split(',')
          .map((item) => item.trim().replace(/\.$/, ''))
          .filter(Boolean);

  const colorsText = getSectionText(normalized, 'Colors') || getSectionText(normalized, 'Palette');
  const paletteLine =
    colorsText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^reference palette:/i.test(line)) || '';
  const palette =
    paletteLine
      .replace(/^reference palette:\s*/i, '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^#([\da-f]{3}|[\da-f]{6})$/i.test(item)) ||
    [];

  const promptText = getSectionText(normalized, 'Typography');
  const promptLine =
    promptText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^prompt seed:/i.test(line)) ||
    getSectionText(normalized, 'Prompt') ||
    '';
  const prompt = promptLine.replace(/^prompt seed:\s*/i, '').trim() || fallback.prompt;

  return {
    title,
    summary: summaryLine || fallback.summary,
    keywords: keywords.length > 0 ? keywords : fallback.keywords,
    palette: palette.length > 0 ? palette : fallback.palette,
    prompt,
  };
};

export const BUILTIN_DESIGN_STYLE_PRESETS: DesignStyleSeed[] = [
  {
    id: 'aurora-glass',
    title: 'Aurora Glass',
    summary: '高级感玻璃拟态，适合数据面板、AI 工作台、控制中心。',
    keywords: ['glassmorphism', 'aurora gradient', 'soft glow', 'floating panel', 'premium dashboard'],
    palette: ['#08111f', '#123456', '#7dd3fc', '#8b5cf6', '#f8fafc'],
    prompt: '使用通透玻璃卡片、极暗背景、蓝青到紫色极光高光、柔和发光描边、悬浮面板层级和精细数据组件。',
  },
  {
    id: 'bento-spotlight',
    title: 'Bento Spotlight',
    summary: 'Bento Grid 信息编排，适合首页、概览页、产品能力总览。',
    keywords: ['bento grid', 'editorial cards', 'modular layout', 'feature spotlight', 'clean metrics'],
    palette: ['#0f172a', '#1e293b', '#38bdf8', '#f59e0b', '#f8fafc'],
    prompt: '采用 bento grid 模块化布局，大卡片突出核心数据与 CTA，小卡片承载状态、能力点和摘要，整体克制但信息密度高。',
  },
  {
    id: 'neo-brutal-pop',
    title: 'Neo Brutal Pop',
    summary: '粗边框高对比风格，适合营销页、创意工具、年轻化产品。',
    keywords: ['neo brutalism', 'bold outline', 'high contrast', 'playful blocks', 'statement UI'],
    palette: ['#111111', '#fef08a', '#fb7185', '#60a5fa', '#ffffff'],
    prompt: '使用粗黑边框、强对比撞色、硬阴影、块状按钮和夸张标题，强调辨识度与年轻感，但保持层级清晰。',
  },
  {
    id: 'editorial-minimal',
    title: 'Editorial Minimal',
    summary: '杂志感极简界面，适合内容产品、品牌官网、作品集。',
    keywords: ['editorial minimal', 'luxury whitespace', 'serif headline', 'clean composition', 'art direction'],
    palette: ['#f6f1e8', '#d6c3a5', '#33261d', '#8c6a43', '#ffffff'],
    prompt: '大量留白、强排版、衬线标题与无衬线正文组合，弱化边框，用版式、节奏和材质感取胜。',
  },
  {
    id: 'warm-commerce',
    title: 'Warm Commerce',
    summary: '温暖电商体验，适合商品推荐、生活方式、内容导购。',
    keywords: ['warm commerce', 'lifestyle card', 'soft gradient', 'friendly CTA', 'trustful retail'],
    palette: ['#fff7ed', '#fed7aa', '#fb923c', '#7c2d12', '#1f2937'],
    prompt: '暖米色背景搭配橙棕色点缀，卡片圆角偏大，营造可信、柔和、带生活方式质感的购买氛围。',
  },
  {
    id: 'midnight-terminal',
    title: 'Midnight Terminal',
    summary: '深色科技控制台，适合开发者平台、运维面板、Agent 系统。',
    keywords: ['dark console', 'developer platform', 'cyan accent', 'command center', 'system status'],
    palette: ['#020617', '#0f172a', '#22d3ee', '#10b981', '#e2e8f0'],
    prompt: '深色主界面，青绿色强调色，卡片像终端模块一样严谨排列，突出状态、日志、执行流与技术感。',
  },
];

export const getBuiltInStylePackFiles = (): BuiltInStylePackFile[] =>
  BUILTIN_DESIGN_STYLE_PRESETS.map((preset) => ({
    id: preset.id,
    title: preset.title,
    path: toStylePackPath(preset.id),
    content: buildDesignStyleMarkdown(preset, { sourceType: 'builtin', confidence: 1 }),
    seed: {
      ...preset,
      filePath: toStylePackPath(preset.id),
    },
  }));
