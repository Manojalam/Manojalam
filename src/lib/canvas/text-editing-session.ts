/** Keep layout work outside a live keyboard/IME editing session. */
export class TextEditingSessions {
  private active = new Map<string, number>();
  private deferred = new Map<string, { nodeIds: Set<string>; resume: () => void }>();

  begin(nodeId: string): () => void {
    this.active.set(nodeId, (this.active.get(nodeId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.active.get(nodeId) ?? 1) - 1;
      if (remaining) this.active.set(nodeId, remaining);
      else this.active.delete(nodeId);
      for (const [key, work] of this.deferred) {
        if ([...work.nodeIds].some((id) => this.active.has(id))) continue;
        this.deferred.delete(key);
        work.resume();
      }
    };
  }

  defer(key: string, nodeIds: string[], resume: () => void): boolean {
    if (!nodeIds.some((id) => this.active.has(id))) return false;
    this.deferred.set(key, { nodeIds: new Set(nodeIds), resume });
    return true;
  }
}

export const textEditingSessions = new TextEditingSessions();

/** Parent echoes must never replace newer editor content or an IME draft. */
export class RichTextContentSync {
  private incoming: string;
  private echoes: string[] = [];

  constructor(initialContent: string) {
    this.incoming = initialContent;
  }

  emitted(html: string): void {
    this.echoes.push(html);
  }

  shouldApply(html: string, currentHtml: string, composing: boolean): boolean {
    if (composing) return false;
    if (html === this.incoming) return false;
    this.incoming = html;
    const echo = this.echoes.lastIndexOf(html);
    if (echo >= 0) {
      this.echoes.splice(0, echo + 1);
      return false;
    }
    this.echoes = [];
    return html !== currentHtml;
  }
}
