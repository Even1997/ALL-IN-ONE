import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  loadProjectStylePackPresets,
  saveProjectStylePackFile,
} from '../../utils/projectPersistence';

const FALLBACK_DESIGN_STYLE_PRESET = {
  title: '默认样式包',
  summary: '轻量默认样式，用于在设计样式包尚未异步加载时保持编辑器可用。',
  keywords: ['default', 'balanced', 'workbench'],
  palette: ['#131315', '#1f2937', '#79c0ff', '#8c4b2f', '#f8fafc'],
  prompt: 'Balanced desktop workbench style with clear information hierarchy.',
  styleFilePath: 'design/styles/default-style-pack.md',
};

export type BuiltInStylePackSeedFile = {
  path: string;
  seed: {
    title: string;
    summary: string;
    keywords: string[];
    palette: string[];
    prompt: string;
  };
};

let stylePackModulePromise: Promise<typeof import('../../modules/design/stylePack')> | null = null;

export const loadStylePackModule = () => (stylePackModulePromise ??= import('../../modules/design/stylePack'));

const slugifyStylePackId = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'style-pack';

const buildStylePackPath = (id: string) => `design/styles/${slugifyStylePackId(id)}.md`;

const buildDefaultDesignStylePresets = (files: BuiltInStylePackSeedFile[]) =>
  files.map((file) => ({
    title: file.seed.title,
    summary: file.seed.summary,
    keywords: file.seed.keywords,
    palette: file.seed.palette,
    prompt: file.seed.prompt,
    styleFilePath: file.path,
  }));

export const getFallbackDesignStylePreset = (presets: Array<{ palette: string[] }>) =>
  presets[0] || FALLBACK_DESIGN_STYLE_PRESET;

export const resolveStyleNodeFilePath = (
  node: Pick<{ id: string; title: string; styleFilePath?: string }, 'id' | 'title' | 'styleFilePath'>,
  presets: Array<Pick<{ title: string; styleFilePath?: string }, 'title' | 'styleFilePath'>>
) => {
  if (node.styleFilePath) {
    return node.styleFilePath;
  }

  const matchingPreset = presets.find((preset) => preset.title === node.title && preset.styleFilePath);
  if (matchingPreset?.styleFilePath) {
    return matchingPreset.styleFilePath;
  }

  return buildStylePackPath(node.title || node.id);
};

type UseDesignStylePackStateParams = {
  currentProjectDir: string | null;
  currentProjectId: string | null;
  selectedStyleNode: any;
  setDesignStyleNodes: Dispatch<SetStateAction<any[]>>;
};

export const useDesignStylePackState = ({
  currentProjectDir,
  currentProjectId,
  selectedStyleNode,
  setDesignStyleNodes,
}: UseDesignStylePackStateParams) => {
  const [defaultStylePresets, setDefaultStylePresets] = useState<any[]>([]);
  const [builtinStylePackPaths, setBuiltinStylePackPaths] = useState<Set<string>>(() => new Set());
  const [stylePresets, setStylePresets] = useState<any[]>([]);
  const [styleInspectorMode, setStyleInspectorMode] = useState<'fields' | 'markdown'>('fields');
  const [styleMarkdownDraft, setStyleMarkdownDraft] = useState('');
  const lastSelectedStyleNodeIdRef = useRef<string | null>(null);
  const lastSyncedStyleMarkdownRef = useRef('');
  const lastSavedStyleFileSnapshotsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (defaultStylePresets.length > 0) {
      return;
    }

    let isMounted = true;

    void loadStylePackModule()
      .then(({ getBuiltInStylePackFiles }) => {
        if (!isMounted) {
          return;
        }

        const builtInFiles = getBuiltInStylePackFiles() as BuiltInStylePackSeedFile[];
        const presets = buildDefaultDesignStylePresets(builtInFiles);
        setDefaultStylePresets(presets);
        setBuiltinStylePackPaths(new Set(builtInFiles.map((file) => file.path)));
        setStylePresets((current) => (current.length > 0 ? current : presets));
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [defaultStylePresets.length]);

  useEffect(() => {
    if (!currentProjectId) {
      setStylePresets(defaultStylePresets);
      return;
    }

    let isMounted = true;

    void loadProjectStylePackPresets(currentProjectId)
      .then((presets) => {
        if (!isMounted) {
          return;
        }

        setStylePresets(
          presets.length > 0
            ? presets.map((preset) => ({
                title: preset.title,
                summary: preset.summary,
                keywords: preset.keywords,
                palette: preset.palette,
                prompt: preset.prompt,
                styleFilePath: preset.filePath,
              }))
            : defaultStylePresets
        );
      })
      .catch(() => {
        if (isMounted) {
          setStylePresets(defaultStylePresets);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId, defaultStylePresets]);

  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    setDesignStyleNodes((current) => {
      let changed = false;
      const next = current.map((node) => {
        const resolvedFilePath = resolveStyleNodeFilePath(node, stylePresets);
        if (node.styleFilePath === resolvedFilePath) {
          return node;
        }

        changed = true;
        return {
          ...node,
          styleFilePath: resolvedFilePath,
        };
      });

      return changed ? next : current;
    });
  }, [currentProjectId, setDesignStyleNodes, stylePresets]);

  useEffect(() => {
    if (!selectedStyleNode) {
      lastSelectedStyleNodeIdRef.current = null;
      lastSyncedStyleMarkdownRef.current = '';
      setStyleMarkdownDraft('');
      setStyleInspectorMode('fields');
      return;
    }

    let isMounted = true;

    void loadStylePackModule()
      .then(({ buildDesignStyleMarkdown }) => {
        if (!isMounted) {
          return;
        }

        const nextMarkdown = buildDesignStyleMarkdown(selectedStyleNode);
        if (lastSelectedStyleNodeIdRef.current !== selectedStyleNode.id) {
          lastSelectedStyleNodeIdRef.current = selectedStyleNode.id;
          lastSyncedStyleMarkdownRef.current = nextMarkdown;
          setStyleMarkdownDraft(nextMarkdown);
          setStyleInspectorMode('fields');
          return;
        }

        if (
          styleInspectorMode !== 'markdown' ||
          styleMarkdownDraft === lastSyncedStyleMarkdownRef.current ||
          nextMarkdown === styleMarkdownDraft
        ) {
          lastSyncedStyleMarkdownRef.current = nextMarkdown;
          setStyleMarkdownDraft(nextMarkdown);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [selectedStyleNode, styleInspectorMode, styleMarkdownDraft]);

  useEffect(() => {
    if (!currentProjectId || !currentProjectDir || !selectedStyleNode) {
      return;
    }

    const resolvedFilePath = resolveStyleNodeFilePath(selectedStyleNode, stylePresets);
    const persistTimer = window.setTimeout(() => {
      void loadStylePackModule()
        .then(({ buildDesignStyleMarkdown }) => {
          const sourceType = builtinStylePackPaths.has(resolvedFilePath) ? 'builtin' : 'user-text';
          const markdown = buildDesignStyleMarkdown(selectedStyleNode, {
            sourceType,
            confidence: sourceType === 'builtin' ? 1 : 0.82,
          });

          if (lastSavedStyleFileSnapshotsRef.current[resolvedFilePath] === markdown) {
            return;
          }

          return saveProjectStylePackFile(currentProjectId, resolvedFilePath, markdown)
            .then(() => {
              lastSavedStyleFileSnapshotsRef.current[resolvedFilePath] = markdown;
              setDesignStyleNodes((current) =>
                current.map((node) =>
                  node.id === selectedStyleNode.id && node.styleFilePath !== resolvedFilePath
                    ? { ...node, styleFilePath: resolvedFilePath }
                    : node
                )
              );
              setStylePresets((current) =>
                current.map((preset) =>
                  preset.title === selectedStyleNode.title
                    ? {
                        ...preset,
                        title: selectedStyleNode.title,
                        summary: selectedStyleNode.summary,
                        keywords: selectedStyleNode.keywords,
                        palette: selectedStyleNode.palette,
                        prompt: selectedStyleNode.prompt,
                        styleFilePath: resolvedFilePath,
                      }
                    : preset
                )
              );
            });
        })
        .catch(() => undefined);
    }, 160);

    return () => {
      window.clearTimeout(persistTimer);
    };
  }, [builtinStylePackPaths, currentProjectDir, currentProjectId, selectedStyleNode, setDesignStyleNodes, stylePresets]);

  return {
    builtinStylePackPaths,
    defaultStylePresets,
    lastSyncedStyleMarkdownRef,
    setStyleInspectorMode,
    setStyleMarkdownDraft,
    styleInspectorMode,
    styleMarkdownDraft,
    stylePresets,
  };
};
