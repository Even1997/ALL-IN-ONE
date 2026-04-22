import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { CanvasElement, PreviewState } from '../types';

interface PreviewStore extends PreviewState {
  // Canvas elements
  elements: CanvasElement[];
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  panX: number;
  panY: number;

  // Actions
  setCanvasSize: (width: number, height: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;

  addElement: (type: string, x: number, y: number, props?: Record<string, unknown>) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  moveElement: (id: string, x: number, y: number) => void;
  resizeElement: (id: string, width: number, height: number) => void;
  selectElement: (id: string | null) => void;
  duplicateElement: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  reorderElements: (sourceId: string, targetId: string) => void;

  // Preview mode
  setDirty: (isDirty: boolean) => void;
  clearChanges: () => void;
  confirmChanges: () => CanvasElement[];
  cancelChanges: () => void;

  // Batch operations
  addMultipleElements: (elements: CanvasElement[]) => void;
  clearCanvas: () => void;
  loadFromCode: (elements: CanvasElement[]) => void;
}

const DEFAULT_ELEMENT_PROPS: Record<string, Partial<CanvasElement>> = {
  'wireframe-block': { width: 280, height: 86, props: { name: '模块', content: '' } },
  button: { width: 88, height: 36, props: { text: 'Button', variant: 'primary' } },
  input: { width: 176, height: 36, props: { placeholder: 'Enter text...', type: 'text' } },
  text: { width: 180, height: 28, props: { text: 'Text', fontSize: 14 } },
  image: { width: 180, height: 132, props: { src: '', alt: 'Image' } },
  card: { width: 248, height: 168, props: { title: 'Card Title', content: 'Card content' } },
  container: { width: 320, height: 240, props: { title: 'Container' } },
  list: { width: 260, height: 180, props: { items: ['Item 1', 'Item 2'] } },
  form: { width: 320, height: 240, props: { title: 'Form', fields: [] } },
  table: { width: 420, height: 240, props: { columns: [], data: [] } },
  modal: { width: 320, height: 240, props: { title: 'Modal', isOpen: false } },
  navbar: { width: 720, height: 52, props: { title: 'Navigation', links: [] } },
  footer: { width: 720, height: 64, props: { copyright: '© 2024' } },
  sidebar: { width: 200, height: 420, props: { items: [] } },
  header: { width: 720, height: 52, props: { title: 'Header', subtitle: '' } },
  avatar: { width: 44, height: 44, props: { src: '', name: 'User' } },
  badge: { width: 68, height: 22, props: { text: 'Badge', variant: 'default' } },
  checkbox: { width: 88, height: 22, props: { label: 'Checkbox', checked: false } },
  radio: { width: 88, height: 22, props: { label: 'Radio', checked: false } },
  switch: { width: 44, height: 24, props: { label: 'Switch', checked: false } },
  select: { width: 176, height: 36, props: { options: ['Option 1', 'Option 2'], value: '' } },
  textarea: { width: 260, height: 88, props: { placeholder: 'Enter text...', value: '' } },
  slider: { width: 176, height: 22, props: { min: 0, max: 100, value: 50 } },
  progress: { width: 200, height: 8, props: { value: 50, max: 100 } },
  tooltip: { width: 100, height: 30, props: { text: 'Tooltip', position: 'top' } },
  alert: { width: 260, height: 52, props: { message: 'Alert message', variant: 'info' } },
};

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  // Initial state
  elements: [],
  canvasWidth: 800,
  canvasHeight: 600,
  zoom: 1,
  panX: 0,
  panY: 0,
  isDirty: false,
  pendingChanges: [],
  selectedElementId: null,

  // Canvas actions
  setCanvasSize: (width, height) => set((state) => (
    state.canvasWidth === width && state.canvasHeight === height
      ? state
      : { canvasWidth: width, canvasHeight: height }
  )),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(3, zoom)) }),

  setPan: (x, y) => set({ panX: x, panY: y }),

  // Element actions
  addElement: (type, x, y, extraProps = {}) => {
    const defaults = DEFAULT_ELEMENT_PROPS[type] || { width: 100, height: 100, props: {} };
    const newElement: CanvasElement = {
      id: uuidv4(),
      type,
      x,
      y,
      width: defaults.width || 100,
      height: defaults.height || 100,
      props: { ...defaults.props, ...extraProps },
      children: [],
    };

    set(state => ({
      elements: [...state.elements, newElement],
      isDirty: true,
      pendingChanges: [...state.pendingChanges, newElement],
    }));
  },

  updateElement: (id, updates) => set(state => {
    const targetIndex = state.elements.findIndex((el) => el.id === id);
    if (targetIndex === -1) {
      return state;
    }

    const currentElement = state.elements[targetIndex];
    const updateEntries = Object.entries(updates);
    if (updateEntries.length === 0 || updateEntries.every(([key, value]) => Object.is(currentElement[key as keyof CanvasElement], value))) {
      return state;
    }

    const nextElement = { ...currentElement, ...updates };

    const elements = [...state.elements];
    elements[targetIndex] = nextElement;

    return {
      elements,
      isDirty: true,
      pendingChanges: elements,
    };
  }),

  deleteElement: (id) => set(state => {
    if (!state.elements.some((el) => el.id === id)) {
      return state;
    }

    return {
      elements: state.elements.filter(el => el.id !== id),
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
      isDirty: true,
    };
  }),

  moveElement: (id, x, y) => set(state => {
    const targetIndex = state.elements.findIndex((el) => el.id === id);
    if (targetIndex === -1) {
      return state;
    }

    const currentElement = state.elements[targetIndex];
    if (currentElement.x === x && currentElement.y === y) {
      return state;
    }

    const elements = [...state.elements];
    elements[targetIndex] = { ...currentElement, x, y };

    return {
      elements,
      isDirty: true,
    };
  }),

  resizeElement: (id, width, height) => set(state => ({
    elements: state.elements.map(el =>
      el.id === id ? { ...el, width, height } : el
    ),
    isDirty: true,
  })),

  selectElement: (id) => set((state) => (
    state.selectedElementId === id ? state : { selectedElementId: id }
  )),

  duplicateElement: (id) => set(state => {
    const element = state.elements.find(el => el.id === id);
    if (!element) return state;

    const newElement: CanvasElement = {
      ...element,
      id: uuidv4(),
      x: element.x + 20,
      y: element.y + 20,
    };

    return {
      elements: [...state.elements, newElement],
      selectedElementId: newElement.id,
      isDirty: true,
    };
  }),

  bringToFront: (id) => set(state => {
    const element = state.elements.find(el => el.id === id);
    if (!element) return state;
    return {
      elements: [...state.elements.filter(el => el.id !== id), element],
    };
  }),

  sendToBack: (id) => set(state => {
    const element = state.elements.find(el => el.id === id);
    if (!element) return state;
    return {
      elements: [element, ...state.elements.filter(el => el.id !== id)],
    };
  }),

  reorderElements: (sourceId, targetId) => set(state => {
    if (sourceId === targetId) {
      return state;
    }

    const sourceIndex = state.elements.findIndex((element) => element.id === sourceId);
    const targetIndex = state.elements.findIndex((element) => element.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return state;
    }

    const nextElements = [...state.elements];
    const [sourceElement] = nextElements.splice(sourceIndex, 1);
    nextElements.splice(targetIndex, 0, sourceElement);

    return {
      elements: nextElements,
      isDirty: true,
      pendingChanges: nextElements,
    };
  }),

  // Preview mode
  setDirty: (isDirty) => set({ isDirty }),

  clearChanges: () => set({
    isDirty: false,
    pendingChanges: [],
  }),

  confirmChanges: () => {
    const { pendingChanges } = get();
    set({ isDirty: false, pendingChanges: [] });
    return pendingChanges;
  },

  cancelChanges: () => set(state => ({
    elements: state.pendingChanges.length > 0
      ? state.pendingChanges.filter(el =>
          state.elements.some(e => e.id === el.id)
        )
      : state.elements,
    isDirty: false,
    pendingChanges: [],
  })),

  // Batch operations
  addMultipleElements: (elements) => set(state => ({
    elements: [...state.elements, ...elements],
    isDirty: true,
  })),

  clearCanvas: () => set({
    elements: [],
    selectedElementId: null,
    isDirty: false,
    pendingChanges: [],
  }),

  loadFromCode: (elements) => set({
    elements,
    selectedElementId: null,
    isDirty: false,
    pendingChanges: [],
  }),
}));
