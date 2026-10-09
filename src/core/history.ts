import { parseDocument, type CadDocument } from "./model";

/** Only successfully regenerated candidates enter history. Revisions never move backwards. */
export class History {
  private past: CadDocument[] = [];
  private future: CadDocument[] = [];
  constructor(public current: CadDocument) {}
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  candidate(doc: CadDocument) {
    return parseDocument({ ...doc, revision: this.current.revision + 1 });
  }
  commit(doc: CadDocument) {
    this.past.push(this.current);
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.current = doc;
  }
  undoCandidate() {
    return this.past.length ? this.candidate(this.past.at(-1)!) : null;
  }
  redoCandidate() {
    return this.future.length ? this.candidate(this.future.at(-1)!) : null;
  }
  acceptUndo(doc: CadDocument) {
    this.future.push(this.current);
    this.past.pop();
    this.current = doc;
  }
  acceptRedo(doc: CadDocument) {
    this.past.push(this.current);
    this.future.pop();
    this.current = doc;
  }
}
