import { ChangeScope, CanvasElement } from '../../types';

interface ScopeDetectorConfig {
  maxRelatedFiles: number;
  contextLines: number;
  maxTokenBudget: number;
}

const DEFAULT_CONFIG: ScopeDetectorConfig = {
  maxRelatedFiles: 3,
  contextLines: 10,
  maxTokenBudget: 500,
};

export class ChangeScopeDetector {
  private config: ScopeDetectorConfig;

  constructor(config: Partial<ScopeDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  detectElementChange(
    element: CanvasElement,
    changeType: 'style' | 'props' | 'structure' | 'logic',
    beforeSnippet?: string
  ): ChangeScope {
    return {
      target: {
        type: 'component',
        id: element.id,
        filePath: this.getElementFilePath(element),
      },
      change: {
        type: this.mapChangeType(changeType),
        before: beforeSnippet,
        after: this.describeElementChange(element, changeType),
      },
      related: {
        files: this.getRelatedFiles(element),
        elements: this.getRelatedElements(element),
      },
      tokenBudget: this.config.maxTokenBudget,
    };
  }

  detectStyleChange(
    element: CanvasElement,
    oldStyle: Partial<CanvasElement>,
    newStyle: Partial<CanvasElement>
  ): ChangeScope {
    const changedProps = Object.keys(newStyle).filter(
      key => oldStyle[key as keyof CanvasElement] !== newStyle[key as keyof CanvasElement]
    );

    return {
      target: {
        type: 'style',
        id: element.id,
        filePath: this.getStyleFilePath(element),
      },
      change: {
        type: 'modify',
        before: this.extractStyleSnippet(element, changedProps),
        after: this.describeStyleChange(changedProps, oldStyle, newStyle),
      },
      related: {
        files: [],
        elements: [element.id],
      },
      tokenBudget: 200,
    };
  }

  detectPropsChange(
    element: CanvasElement,
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>
  ): ChangeScope {
    const changedKeys = Object.keys(newProps).filter(
      key => oldProps[key] !== newProps[key]
    );

    return {
      target: {
        type: 'component',
        id: element.id,
        filePath: this.getElementFilePath(element),
      },
      change: {
        type: 'modify',
        before: this.extractPropsSnippet(element, changedKeys),
        after: this.describePropsChange(changedKeys, oldProps, newProps),
      },
      related: {
        files: [],
        elements: [element.id],
      },
      tokenBudget: 300,
    };
  }

  detectStructureChange(
    parentId: string,
    operation: 'add' | 'remove' | 'reorder',
    elementId?: string,
    newPosition?: number
  ): ChangeScope {
    return {
      target: {
        type: 'component',
        id: parentId,
        filePath: this.getParentFilePath(parentId),
      },
      change: {
        type: operation === 'remove' ? 'delete' : operation === 'add' ? 'add' : 'modify',
        after: this.describeStructureChange(operation, elementId, newPosition),
      },
      related: {
        files: [],
        elements: elementId ? [elementId] : [],
      },
      tokenBudget: 150,
    };
  }

  detectComponentAddition(
    type: string,
    position: { x: number; y: number },
    props: Record<string, unknown>
  ): ChangeScope {
    return {
      target: {
        type: 'component',
        id: `new_${type}_${Date.now()}`,
        filePath: this.getNewElementFilePath(type),
      },
      change: {
        type: 'add',
        after: this.describeNewComponent(type, position, props),
      },
      related: {
        files: [],
        elements: [],
      },
      tokenBudget: 400,
    };
  }

  private getElementFilePath(element: CanvasElement): string {
    return `src/components/${element.type}/${element.id}.tsx`;
  }

  private getStyleFilePath(element: CanvasElement): string {
    return `src/components/${element.type}/${element.id}.styles.css`;
  }

  private getParentFilePath(parentId: string): string {
    return `src/components/${parentId}/index.tsx`;
  }

  private getNewElementFilePath(type: string): string {
    return `src/components/${type}/`;
  }

  private mapChangeType(type: string): 'modify' | 'add' | 'delete' | 'replace' {
    switch (type) {
      case 'style':
      case 'props':
        return 'modify';
      case 'structure':
        return 'replace';
      default:
        return 'modify';
    }
  }

  private getRelatedFiles(element: CanvasElement): string[] {
    const related: string[] = [];

    if (element.children && element.children.length > 0) {
      related.push(`src/components/${element.type}/children.ts`);
    }

    related.push(`src/pages/${element.type}/index.tsx`);

    return related.slice(0, this.config.maxRelatedFiles);
  }

  private getRelatedElements(element: CanvasElement): string[] {
    return element.children?.slice(0, 5) || [];
  }

  private extractStyleSnippet(element: CanvasElement, changedProps: string[]): string {
    const lines = changedProps.map(prop => {
      const value = (element.props as Record<string, unknown>)[prop] ?? 'default';
      return `${prop}: ${JSON.stringify(value)};`;
    });
    return `/* ${element.type}:${element.id} */\n.${element.type} {\n  ${lines.join('\n  ')}\n}`;
  }

  private extractPropsSnippet(element: CanvasElement, changedKeys: string[]): string {
    const props = changedKeys.reduce((acc, key) => {
      acc[key] = element.props[key];
      return acc;
    }, {} as Record<string, unknown>);

    return `<${element.type}\n  ${Object.entries(props).map(([k, v]) => `${k}="${v}"`).join('\n  ')}\n/>`;
  }

  private describeElementChange(element: CanvasElement, changeType: string): string {
    return `Modify ${element.type} component (id: ${element.id}): ${changeType} change at position (${element.x}, ${element.y})`;
  }

  private describeStyleChange(
    changedProps: string[],
    _oldStyle: Partial<CanvasElement>,
    _newStyle: Partial<CanvasElement>
  ): string {
    if (changedProps.length === 1) {
      return `Change CSS property "${changedProps[0]}" for component ${changedProps[0]}`;
    }
    return `Change CSS properties: ${changedProps.join(', ')}`;
  }

  private describePropsChange(
    changedKeys: string[],
    oldProps: Record<string, unknown>,
    newProps: Record<string, unknown>
  ): string {
    const changes = changedKeys.map(key => {
      const oldVal = oldProps[key];
      const newVal = newProps[key];
      return `${key}: "${oldVal}" → "${newVal}"`;
    });
    return `Update component props:\n${changes.join('\n')}`;
  }

  private describeStructureChange(
    operation: string,
    elementId?: string,
    newPosition?: number
  ): string {
    switch (operation) {
      case 'add':
        return `Add new component as child of current element${newPosition !== undefined ? ` at position ${newPosition}` : ''}`;
      case 'remove':
        return `Remove child component ${elementId || 'unknown'}`;
      case 'reorder':
        return `Reorder child component ${elementId || 'unknown'} to position ${newPosition ?? 0}`;
      default:
        return `Structure change: ${operation}`;
    }
  }

  private describeNewComponent(
    type: string,
    position: { x: number; y: number },
    props: Record<string, unknown>
  ): string {
    return `Create new ${type} component at position (${position.x}, ${position.y}) with props:\n${JSON.stringify(props, null, 2)}`;
  }

  buildMinimalPrompt(scope: ChangeScope): string {
    const { target, change, related } = scope;

    let prompt = `## Target\n`;
    prompt += `File: ${target.filePath}\n`;
    prompt += `Type: ${target.type}\n`;
    prompt += `ID: ${target.id}\n\n`;

    prompt += `## Change\n`;
    prompt += `Operation: ${change.type}\n`;
    if (change.before) {
      prompt += `Before:\n\`\`\`\n${change.before}\n\`\`\`\n`;
    }
    prompt += `Description:\n${change.after}\n\n`;

    if (related.files.length > 0) {
      prompt += `## Related Files\n${related.files.join('\n')}\n\n`;
    }

    if (related.elements.length > 0) {
      prompt += `## Related Elements\n${related.elements.join(', ')}\n`;
    }

    return prompt;
  }
}

export const scopeDetector = new ChangeScopeDetector();
