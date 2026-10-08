import { expect, it } from "vitest";
import { History } from "../src/model/history";
import { bracketDocument, emptyDocument } from "../src/model/document";
it("isolates recovered history from later mutations to the loaded object", () => {
  const loaded = bracketDocument(),
    history = new History(loaded);
  loaded.features.length = 0;
  expect(history.current.features).toHaveLength(6);
});
it("isolates committed history from later mutations to an operation candidate", () => {
  const history = new History(emptyDocument()),
    candidate = bracketDocument();
  history.commit(candidate);
  candidate.features.length = 0;
  expect(history.current.features).toHaveLength(6);
  history.undo();
  expect(history.redo().features).toHaveLength(6);
});
