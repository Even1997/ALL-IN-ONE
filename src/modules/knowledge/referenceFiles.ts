import type { GeneratedFile, PageStructureNode, RequirementDoc, WireframeDocument } from '../../types';
import { toGeneratedKnowledgeId } from './knowledgeEntries.ts';
import { buildSketchPageContent, buildSketchPagePath } from './sketchPageFiles.ts';

export type ReferenceFileType = 'md' | 'html' | 'json' | 'txt';
export type ReferenceFileGroup = 'project' | 'sketch' | 'design';
export type ReferenceFileSource = 'user' | 'ai' | 'derived';

export type ReferenceFile = {
  id: string;
  path: string;
  title: string;
  content: string;
  type: ReferenceFileType;
  group: ReferenceFileGroup;
  source: ReferenceFileSource;
  updatedAt: string;
  readableByAI: boolean;
  summary: string;
  relatedIds: string[];
  tags: string[];
};

export type DesignStyleReferenceNode = {
  id: string;
  title: string;
  summary: string;
  keywords: string[];
  palette: string[];
  prompt: string;
  filePath?: string;
};

const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '');

const summarizeText = (value: string, maxLength = 120) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
};

const getFileTitle = (filePath: string) => normalizePath(filePath).split('/').pop() || filePath;

export const slugifyReferencePart = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

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

const escapeYamlString = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const indentYamlBlock = (lines: string[], spaces = 2) => lines.map((line) => `${' '.repeat(spaces)}${line}`);

const buildTypographyTokens = (keywords: string[], prompt: string) => {
  const combined = `${keywords.join(' ')} ${prompt}`.toLowerCase();
  const isEditorial = /editorial|serif|luxury|magazine|art direction/.test(combined);
  const isTechnical = /developer|console|terminal|command|system|dashboard|tool/.test(combined);
  const headingFamily = isEditorial ? 'Fraunces' : isTechnical ? 'Space Grotesk' : 'Spline Sans';
  const bodyFamily = isEditorial ? 'Source Sans 3' : isTechnical ? 'IBM Plex Sans' : 'Be Vietnam Pro';

  return {
    headingFamily,
    bodyFamily,
  };
};

const inferDensity = (keywords: string[], prompt: string) => {
  const combined = `${keywords.join(' ')} ${prompt}`.toLowerCase();
  if (/editorial|whitespace|luxury|soft|calm|spacious/.test(combined)) {
    return 'spacious';
  }

  if (/dashboard|console|command|dense|workspace|tool|data/.test(combined)) {
    return 'compact';
  }

  return 'balanced';
};

const inferContrast = (palette: string[]) => {
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
  const theme = isDarkColor(background) ? 'dark' : 'light';
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
      onBackground,
      surface,
      surfaceDim: mixHexColor(surface, background, theme === 'dark' ? 0.35 : 0.18),
      surfaceBright: mixHexColor(surface, onBackground, theme === 'dark' ? 0.18 : 0.08),
      surfaceContainerLowest: mixHexColor(background, theme === 'dark' ? '#000000' : '#ffffff', theme === 'dark' ? 0.22 : 0.3),
      surfaceContainerLow: mixHexColor(surface, background, theme === 'dark' ? 0.2 : 0.08),
      surfaceContainer: mixHexColor(surface, onBackground, theme === 'dark' ? 0.08 : 0.03),
      surfaceContainerHigh: mixHexColor(surface, onBackground, theme === 'dark' ? 0.14 : 0.06),
      surfaceContainerHighest: mixHexColor(surface, onBackground, theme === 'dark' ? 0.22 : 0.1),
      surfaceVariant: mixHexColor(surface, onBackground, theme === 'dark' ? 0.2 : 0.12),
      onSurface: getReadableForeground(surface),
      onSurfaceVariant: mixHexColor(getReadableForeground(surface), surface, theme === 'dark' ? 0.38 : 0.52),
      inverseSurface: onBackground,
      inverseOnSurface: background,
      outline: mixHexColor(surface, onBackground, theme === 'dark' ? 0.4 : 0.34),
      outlineVariant: mixHexColor(surface, background, theme === 'dark' ? 0.42 : 0.22),
      surfaceTint: primary,
      primary,
      onPrimary: getReadableForeground(primary),
      primaryContainer: mixHexColor(primary, background, theme === 'dark' ? 0.4 : 0.68),
      onPrimaryContainer: getReadableForeground(mixHexColor(primary, background, theme === 'dark' ? 0.4 : 0.68)),
      inversePrimary: mixHexColor(primary, onBackground, theme === 'dark' ? 0.2 : 0.12),
      secondary,
      onSecondary: getReadableForeground(secondary),
      secondaryContainer: mixHexColor(secondary, background, theme === 'dark' ? 0.4 : 0.68),
      onSecondaryContainer: getReadableForeground(mixHexColor(secondary, background, theme === 'dark' ? 0.4 : 0.68)),
      tertiary,
      onTertiary: getReadableForeground(tertiary),
      tertiaryContainer: mixHexColor(tertiary, background, theme === 'dark' ? 0.4 : 0.68),
      onTertiaryContainer: getReadableForeground(mixHexColor(tertiary, background, theme === 'dark' ? 0.4 : 0.68)),
      error,
      onError: getReadableForeground(error),
      errorContainer: theme === 'dark' ? '#93000a' : '#ffdad6',
      onErrorContainer: theme === 'dark' ? '#ffdad6' : '#93000a',
    },
  };
};

const buildStylePackFrontmatter = (node: DesignStyleReferenceNode) => {
  const colors = buildStylePackColors(node.palette);
  const typography = buildTypographyTokens(node.keywords, node.prompt);
  const density = inferDensity(node.keywords, node.prompt);
  const contrast = inferContrast(node.palette);
  const combined = `${node.keywords.join(' ')} ${node.prompt}`.toLowerCase();
  const hasGlass = /glass|aurora|glow|floating|premium/.test(combined);
  const playful = /playful|anime|young|pop|bold|shonen/.test(combined);
  const borderVisible = !/minimal|editorial|soft/.test(combined);
  const roundedDefault =
    density === 'spacious' ? '1rem' : playful ? '0.875rem' : colors.theme === 'dark' ? '0.75rem' : '0.5rem';
  const primaryStyle = hasGlass ? 'solid-glow' : playful ? 'solid' : 'solid';
  const navStyle = hasGlass ? 'glass' : colors.theme === 'dark' ? 'tonal' : 'minimal';
  const confidence = node.palette.length > 0 && node.keywords.length > 0 ? '0.82' : '0.72';
  const tags = (node.keywords.length > 0 ? node.keywords : ['custom-style']).slice(0, 8);
  const promptSummary = summarizeText(node.prompt || node.summary || node.title, 88);

  return [
    '---',
    `id: ${slugifyReferencePart(node.id)}`,
    `name: "${escapeYamlString(node.title || 'Untitled Style')}"`,
    'version: 1',
    'sourceType: user-text',
    `sourceDescription: "${escapeYamlString(promptSummary || 'Generated from style node prompt')}"`,
    `theme: ${colors.theme}`,
    `density: ${density}`,
    `contrast: ${contrast}`,
    'tags:',
    ...indentYamlBlock(tags.map((tag) => `- "${escapeYamlString(tag)}"`)),
    `confidence: ${confidence}`,
    'colors:',
    ...indentYamlBlock(
      Object.entries(colors.values).map(([key, value]) => `${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}: '${value}'`)
    ),
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
      `DEFAULT: ${roundedDefault}`,
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
          `primaryStyle: ${primaryStyle}`,
          hasGlass ? 'secondaryStyle: glass-tint' : 'secondaryStyle: muted',
        ],
        4
      ),
      'card:',
      ...indentYamlBlock(
        [
          'imageScrim: false',
          `borderVisible: ${borderVisible ? 'true' : 'false'}`,
        ],
        4
      ),
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
      ...indentYamlBlock([`style: ${navStyle}`], 4),
    ]),
    '---',
  ].join('\n');
};

const inferGeneratedGroup = (file: GeneratedFile): ReferenceFileGroup => {
  const normalizedPath = normalizePath(file.path).toLowerCase();
  if (file.language === 'html') {
    return 'design';
  }

  if (normalizedPath.includes('sketch') || normalizedPath.includes('wireframe')) {
    return 'sketch';
  }

  if (file.category === 'design') {
    return 'design';
  }

  return 'project';
};

const buildDesignStyleMarkdown = (node: DesignStyleReferenceNode) => {
  const frontmatter = buildStylePackFrontmatter(node);
  const palette = node.palette.length > 0 ? node.palette.join(', ') : 'No explicit palette provided.';
  const keywordText = node.keywords.length > 0 ? node.keywords.join(', ') : 'No explicit keywords provided.';
  const promptText = node.prompt || 'No prompt guidance provided.';
  const summaryText = node.summary || summarizeText(promptText, 160) || 'No summary provided.';

  return [
    frontmatter,
    '',
    '## Brand & Style',
    summaryText,
    '',
    `Style cues: ${keywordText}.`,
    '',
    '## Colors',
    `Reference palette: ${palette}`,
    '',
    '## Typography',
    `Typography should follow the overall direction implied by the node prompt: ${promptText}`,
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
    `Primary components should follow this prompt guidance: ${promptText}`,
    '',
    '## Accessibility',
    'Do not rely on palette or glow alone to express state. Keep focus indicators visible and verify readable contrast on the generated background and surface colors.',
    '',
    "## Do / Don't",
    `Do preserve the core mood described by the keywords and prompt. Don't drop back to a generic UI if the node already expresses a clear visual direction.`,
  ].join('\n');
};

export const buildSketchMarkdown = (
  page: Pick<PageStructureNode, 'name'> & Partial<PageStructureNode>,
  wireframe: WireframeDocument | null | undefined
) => buildSketchPageContent(page, wireframe);

export const buildSketchReferencePath = (page: Pick<PageStructureNode, 'id' | 'name'>) =>
  buildSketchPagePath(page);

export const buildSketchReferenceFile = (
  page: Pick<PageStructureNode, 'id' | 'name'> & Partial<PageStructureNode>,
  wireframe: WireframeDocument | null | undefined
) => ({
  path: buildSketchReferencePath(page),
  content: buildSketchMarkdown(page, wireframe),
});

export const buildDesignStyleReferencePath = (node: Pick<DesignStyleReferenceNode, 'id' | 'title' | 'filePath'>) =>
  normalizePath(node.filePath || `design/styles/${node.id}-${slugifyReferencePart(node.title)}.md`);

export const buildReferenceFiles = (options: {
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  designPages: PageStructureNode[];
  wireframes: Record<string, WireframeDocument>;
  designStyleNodes: DesignStyleReferenceNode[];
}): ReferenceFile[] => {
  const requirementFiles: ReferenceFile[] = options.requirementDocs.map((doc) => ({
    id: doc.id,
    path: normalizePath(doc.filePath || doc.title),
    title: doc.title,
    content: doc.content,
    type: 'md',
    group: doc.kind === 'sketch' ? 'sketch' : 'project',
    source: doc.sourceType === 'ai' ? 'ai' : 'user',
    updatedAt: doc.updatedAt,
    readableByAI: true,
    summary: doc.summary || summarizeText(doc.content),
    relatedIds: (doc.relatedIds || []).slice(),
    tags: (doc.tags || []).slice(),
  }));

  const generatedFiles: ReferenceFile[] = options.generatedFiles
    .filter((file) => file.language === 'md' || file.language === 'html')
    .map((file) => ({
      id: toGeneratedKnowledgeId(normalizePath(file.path)),
      path: normalizePath(file.path),
      title: getFileTitle(file.path),
      content: file.content,
      type: file.language === 'html' ? 'html' : 'md',
      group: inferGeneratedGroup(file),
      source: 'ai',
      updatedAt: file.updatedAt,
      readableByAI: true,
      summary: file.summary || summarizeText(file.content),
      relatedIds: file.relatedRequirementIds?.slice() || (file.sourceRequirementId ? [file.sourceRequirementId] : []),
      tags: file.tags?.slice() || [],
    }));

  const derivedSketchFiles: ReferenceFile[] = options.designPages.map((page) => {
    const { path, content } = buildSketchReferenceFile(page, options.wireframes[page.id]);
    return {
      id: path,
      path,
      title: `${page.name}.md`,
      content,
      type: 'md',
      group: 'sketch',
      source: 'derived',
      updatedAt: options.wireframes[page.id]?.updatedAt || new Date().toISOString(),
      readableByAI: true,
      summary: summarizeText(`${page.metadata.goal || page.description} ${page.metadata.route || ''}`),
      relatedIds: [],
      tags: ['page', page.metadata.template, page.metadata.ownerRole].filter(Boolean),
    };
  });

  const derivedStyleFiles: ReferenceFile[] = options.designStyleNodes.map((node) => {
    const path = buildDesignStyleReferencePath(node);
    const content = buildDesignStyleMarkdown(node);
    return {
      id: path,
      path,
      title: `${node.title}.md`,
      content,
      type: 'md',
      group: 'design',
      source: 'derived',
      updatedAt: new Date().toISOString(),
      readableByAI: true,
      summary: node.summary || summarizeText(node.prompt),
      relatedIds: [],
      tags: node.keywords.slice(),
    };
  });

  return [...requirementFiles, ...generatedFiles, ...derivedSketchFiles, ...derivedStyleFiles].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
};
