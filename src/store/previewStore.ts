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
  button: { width: 100, height: 40, props: { text: 'Button', variant: 'primary' } },
  input: { width: 200, height: 40, props: { placeholder: 'Enter text...', type: 'text' } },
  text: { width: 200, height: 30, props: { text: 'Text', fontSize: 16 } },
  image: { width: 200, height: 150, props: { src: '', alt: 'Image' } },
  card: { width: 300, height: 200, props: { title: 'Card Title', content: 'Card content' } },
  container: { width: 400, height: 300, props: { title: 'Container' } },
  list: { width: 300, height: 200, props: { items: ['Item 1', 'Item 2'] } },
  form: { width: 400, height: 300, props: { title: 'Form', fields: [] } },
  table: { width: 500, height: 300, props: { columns: [], data: [] } },
  modal: { width: 400, height: 300, props: { title: 'Modal', isOpen: false } },
  navbar: { width: 800, height: 60, props: { title: 'Navigation', links: [] } },
  footer: { width: 800, height: 80, props: { copyright: '© 2024' } },
  sidebar: { width: 250, height: 600, props: { items: [] } },
  header: { width: 800, height: 60, props: { title: 'Header', subtitle: '' } },
  avatar: { width: 50, height: 50, props: { src: '', name: 'User' } },
  badge: { width: 80, height: 24, props: { text: 'Badge', variant: 'default' } },
  checkbox: { width: 100, height: 24, props: { label: 'Checkbox', checked: false } },
  radio: { width: 100, height: 24, props: { label: 'Radio', checked: false } },
  switch: { width: 50, height: 26, props: { label: 'Switch', checked: false } },
  select: { width: 200, height: 40, props: { options: ['Option 1', 'Option 2'], value: '' } },
  textarea: { width: 300, height: 100, props: { placeholder: 'Enter text...', value: '' } },
  slider: { width: 200, height: 24, props: { min: 0, max: 100, value: 50 } },
  progress: { width: 200, height: 8, props: { value: 50, max: 100 } },
  tooltip: { width: 100, height: 30, props: { text: 'Tooltip', position: 'top' } },
  alert: { width: 300, height: 60, props: { message: 'Alert message', variant: 'info' } },
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
  setCanvasSize: (width, height) => set({ canvasWidth: width, canvasHeight: height }),

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
    const elements = state.elements.map(el =>
      el.id === id ? { ...el, ...updates } : el
    );
    return {
      elements,
      isDirty: true,
      pendingChanges: elements,
    };
  }),

  deleteElement: (id) => set(state => ({
    elements: state.elements.filter(el => el.id !== id),
    selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
    isDirty: true,
  })),

  moveElement: (id, x, y) => set(state => ({
    elements: state.elements.map(el =>
      el.id === id ? { ...el, x, y } : el
    ),
    isDirty: true,
  })),

  resizeElement: (id, width, height) => set(state => ({
    elements: state.elements.map(el =>
      el.id === id ? { ...el, width, height } : el
    ),
    isDirty: true,
  })),

  selectElement: (id) => set({ selectedElementId: id }),

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
