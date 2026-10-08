import { validateDocument, type Document } from "./document";
/** Revisions increase even when navigating backwards, so stale worker results cannot match. */
export class History {
  private past: Document[] = [];
  private future: Document[] = [];
  public current: Document;
  constructor(initial: Document) {
    this.current = validateDocument(initial);
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  peekUndo() {
    const next = this.past.at(-1);
    return next ? { ...next, revision: this.current.revision + 1 } : null;
  }
  peekRedo() {
    const next = this.future.at(-1);
    return next ? { ...next, revision: this.current.revision + 1 } : null;
  }
  commit(next: Document) {
    const validated = validateDocument(next);
    this.past.push(this.current);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.current = { ...validated, revision: this.current.revision + 1 };
    return this.current;
  }
  undo() {
    const next = this.past.pop();
    if (next) {
      this.future.push(this.current);
      this.current = { ...next, revision: this.current.revision + 1 };
    }
    return this.current;
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.current);
      this.current = { ...next, revision: this.current.revision + 1 };
    }
    return this.current;
  }
}
