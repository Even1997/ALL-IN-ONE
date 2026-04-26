import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  AIExperienceMode,
  AIWorkflowRun,
  AIWorkflowStage,
  HTMLPrototypeDoc,
  StyleProfile,
} from '../../../types';

export interface WorkflowProjectState {
  runs: AIWorkflowRun[];
  styleProfiles: StyleProfile[];
  selectedStyleProfileId: string | null;
  executionMode: AIExperienceMode;
  htmlPrototypes: HTMLPrototypeDoc[];
}

interface WorkflowStoreState {
  projects: Record<string, WorkflowProjectState>;
  ensureProjectState: (projectId: string) => void;
  setExecutionMode: (projectId: string, mode: AIExperienceMode) => void;
  upsertRun: (projectId: string, run: AIWorkflowRun) => void;
  confirmStage: (projectId: string, runId: string, stage: AIWorkflowStage) => void;
  setStyleProfiles: (projectId: string, profiles: StyleProfile[]) => void;
  selectStyleProfile: (projectId: string, styleProfileId: string) => void;
  saveHTMLPrototype: (projectId: string, prototype: HTMLPrototypeDoc) => void;
  replaceProjectState: (projectId: string, state: WorkflowProjectState) => void;
  clearProjectState: (projectId: string) => void;
}

const createProjectState = (): WorkflowProjectState => ({
  runs: [],
  styleProfiles: [],
  selectedStyleProfileId: null,
  executionMode: 'standard',
  htmlPrototypes: [],
});

const normalizeStyleProfile = (value: unknown): StyleProfile | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const profile = value as Partial<StyleProfile>;
  if (typeof profile.id !== 'string' || typeof profile.name !== 'string') {
    return null;
  }

  return {
    id: profile.id,
    name: profile.name,
    summary: typeof profile.summary === 'string' ? profile.summary : '',
    industry: typeof profile.industry === 'string' ? profile.industry : '',
    direction: typeof profile.direction === 'string' ? profile.direction : '',
    colorMood: typeof profile.colorMood === 'string' ? profile.colorMood : '',
    referenceBrand: typeof profile.referenceBrand === 'string' ? profile.referenceBrand : undefined,
    appType:
      profile.appType === 'mobile' ||
      profile.appType === 'mini_program' ||
      profile.appType === 'desktop' ||
      profile.appType === 'backend' ||
      profile.appType === 'api'
        ? profile.appType
        : 'web',
    palette: Array.isArray(profile.palette) ? profile.palette.filter((item): item is string => typeof item === 'string') : [],
    typography:
      profile.typography && typeof profile.typography === 'object'
        ? {
            heading:
              typeof (profile.typography as StyleProfile['typography']).heading === 'string'
                ? (profile.typography as StyleProfile['typography']).heading
                : '',
            body:
              typeof (profile.typography as StyleProfile['typography']).body === 'string'
                ? (profile.typography as StyleProfile['typography']).body
                : '',
          }
        : { heading: '', body: '' },
    radius: typeof profile.radius === 'string' ? profile.radius : '18px',
    notes: Array.isArray(profile.notes) ? profile.notes.filter((item): item is string => typeof item === 'string') : [],
    status: profile.status === 'ready' ? 'ready' : 'draft',
    updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : new Date().toISOString(),
  };
};

const normalizeRun = (value: unknown): AIWorkflowRun | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const run = value as Partial<AIWorkflowRun>;
  if (typeof run.id !== 'string' || typeof run.projectId !== 'string') {
    return null;
  }

  return {
    id: run.id,
    projectId: run.projectId,
    targetPackage: run.targetPackage === 'prototype' || run.targetPackage === 'page' ? run.targetPackage : 'requirements',
    mode:
      run.mode === 'high_quality_docs' || run.mode === 'high_quality_execution'
        ? run.mode
        : 'standard',
    status:
      run.status === 'running' || run.status === 'awaiting_confirmation' || run.status === 'completed' || run.status === 'error'
        ? run.status
        : 'idle',
    currentStage:
      run.currentStage === 'requirements_spec' ||
      run.currentStage === 'feature_tree' ||
      run.currentStage === 'page_structure' ||
      run.currentStage === 'wireframes' ||
      run.currentStage === 'html_prototype'
        ? run.currentStage
        : 'project_brief',
    completedStages: Array.isArray(run.completedStages)
      ? run.completedStages.filter((item): item is AIWorkflowStage => typeof item === 'string')
      : [],
    confirmedStages: Array.isArray(run.confirmedStages)
      ? run.confirmedStages.filter((item): item is AIWorkflowStage => typeof item === 'string')
      : [],
    skillExecutions: Array.isArray(run.skillExecutions) ? run.skillExecutions.filter(Boolean) as AIWorkflowRun['skillExecutions'] : [],
    inputSummary: typeof run.inputSummary === 'string' ? run.inputSummary : '',
    stageSummaries: run.stageSummaries && typeof run.stageSummaries === 'object' ? run.stageSummaries : {},
    error: typeof run.error === 'string' ? run.error : undefined,
    startedAt: typeof run.startedAt === 'string' ? run.startedAt : new Date().toISOString(),
    updatedAt: typeof run.updatedAt === 'string' ? run.updatedAt : new Date().toISOString(),
  };
};

const normalizeHTMLPrototype = (value: unknown): HTMLPrototypeDoc | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const doc = value as Partial<HTMLPrototypeDoc>;
  if (typeof doc.id !== 'string' || typeof doc.projectId !== 'string') {
    return null;
  }

  return {
    id: doc.id,
    projectId: doc.projectId,
    styleProfileId: typeof doc.styleProfileId === 'string' ? doc.styleProfileId : undefined,
    summary: typeof doc.summary === 'string' ? doc.summary : '',
    pages: Array.isArray(doc.pages)
      ? doc.pages
          .filter((item) => Boolean(item) && typeof item === 'object')
          .map((page) => ({
            id: typeof page.id === 'string' ? page.id : `${doc.id}-page`,
            pageId: typeof page.pageId === 'string' ? page.pageId : '',
            pageName: typeof page.pageName === 'string' ? page.pageName : 'Prototype Page',
            path: typeof page.path === 'string' ? page.path : 'index.html',
            title: typeof page.title === 'string' ? page.title : 'Prototype Page',
            html: typeof page.html === 'string' ? page.html : '',
            cssTokensUsed: Array.isArray(page.cssTokensUsed)
              ? page.cssTokensUsed.filter((token): token is string => typeof token === 'string')
              : [],
          }))
      : [],
    manifest: typeof doc.manifest === 'string' ? doc.manifest : '{}',
    status: doc.status === 'ready' ? 'ready' : 'draft',
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : new Date().toISOString(),
  };
};

const normalizeProjectState = (value: unknown): WorkflowProjectState => {
  if (!value || typeof value !== 'object') {
    return createProjectState();
  }

  const project = value as Partial<WorkflowProjectState>;

  return {
    runs: Array.isArray(project.runs) ? project.runs.map(normalizeRun).filter((item): item is AIWorkflowRun => Boolean(item)) : [],
    styleProfiles: Array.isArray(project.styleProfiles)
      ? project.styleProfiles.map(normalizeStyleProfile).filter((item): item is StyleProfile => Boolean(item))
      : [],
    selectedStyleProfileId: typeof project.selectedStyleProfileId === 'string' ? project.selectedStyleProfileId : null,
    executionMode:
      project.executionMode === 'high_quality_docs' || project.executionMode === 'high_quality_execution'
        ? project.executionMode
        : 'standard',
    htmlPrototypes: Array.isArray(project.htmlPrototypes)
      ? project.htmlPrototypes.map(normalizeHTMLPrototype).filter((item): item is HTMLPrototypeDoc => Boolean(item))
      : [],
  };
};

export const useAIWorkflowStore = create<WorkflowStoreState>()(
  persist(
    (set) => ({
      projects: {},

      ensureProjectState: (projectId) =>
        set((state) => ({
          projects: state.projects[projectId]
            ? state.projects
            : { ...state.projects, [projectId]: createProjectState() },
        })),

      setExecutionMode: (projectId, mode) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...(state.projects[projectId] || createProjectState()),
              executionMode: mode,
            },
          },
        })),

      upsertRun: (projectId, run) =>
        set((state) => {
          const current = state.projects[projectId] || createProjectState();
          const nextRuns = [run, ...current.runs.filter((item) => item.id !== run.id)].sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...current,
                runs: nextRuns,
              },
            },
          };
        }),

      confirmStage: (projectId, runId, stage) =>
        set((state) => {
          const current = state.projects[projectId] || createProjectState();

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...current,
                runs: current.runs.map((run) =>
                  run.id === runId
                    ? {
                        ...run,
                        status: run.status === 'error' ? run.status : 'completed',
                        confirmedStages: run.confirmedStages.includes(stage)
                          ? run.confirmedStages
                          : [...run.confirmedStages, stage],
                        updatedAt: new Date().toISOString(),
                      }
                    : run
                ),
              },
            },
          };
        }),

      setStyleProfiles: (projectId, profiles) =>
        set((state) => {
          const current = state.projects[projectId] || createProjectState();
          const selectedStyleProfileId =
            current.selectedStyleProfileId && profiles.some((profile) => profile.id === current.selectedStyleProfileId)
              ? current.selectedStyleProfileId
              : profiles[0]?.id || null;

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...current,
                styleProfiles: profiles,
                selectedStyleProfileId,
              },
            },
          };
        }),

      selectStyleProfile: (projectId, styleProfileId) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...(state.projects[projectId] || createProjectState()),
              selectedStyleProfileId: styleProfileId,
            },
          },
        })),

      saveHTMLPrototype: (projectId, prototype) =>
        set((state) => {
          const current = state.projects[projectId] || createProjectState();
          const nextPrototypes = [prototype, ...current.htmlPrototypes.filter((item) => item.id !== prototype.id)].sort(
            (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
          );

          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...current,
                htmlPrototypes: nextPrototypes,
              },
            },
          };
        }),

      replaceProjectState: (projectId, projectState) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: normalizeProjectState(projectState),
          },
        })),

      clearProjectState: (projectId) =>
        set((state) => {
          const nextProjects = { ...state.projects };
          delete nextProjects[projectId];
          return { projects: nextProjects };
        }),
    }),
    {
      name: 'goodnight-ai-workflow-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const typedState = persistedState as Partial<WorkflowStoreState>;
        const persistedProjects = typedState.projects && typeof typedState.projects === 'object' ? typedState.projects : {};

        return {
          ...currentState,
          ...typedState,
          projects: Object.fromEntries(
            Object.entries(persistedProjects).map(([projectId, projectState]) => [projectId, normalizeProjectState(projectState)])
          ),
        };
      },
    }
  )
);
