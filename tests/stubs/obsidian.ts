export class MarkdownRenderChild {
  constructor(public containerEl: HTMLElement) {}
}

export const MarkdownRenderer = {
  render: async (
    _app: unknown,
    _markdown: string,
    element: HTMLElement,
  ): Promise<void> => {
    // Obsidian's post-processor replaces a mermaid fence with .mermaid.
    // Leave it empty here so the test exercises our Pele fallback mount.
    const mermaid = element.ownerDocument.createElement('div');
    mermaid.className = 'mermaid';
    element.appendChild(mermaid);
  },
};

export function normalizePath(path: string): string {
  return path;
}

export type App = unknown;
export type TFile = unknown;
export type TAbstractFile = unknown;
