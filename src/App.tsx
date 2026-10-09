import { useEffect, useRef, useState } from "react";
import {
  bracketDocument,
  emptyDocument,
  moveFeature,
  parseDocument,
  replaceFeature,
  type CadDocument,
  type Feature,
} from "./core/model";
import { History } from "./core/history";
import { Autosave } from "./core/persistence";
import { decodeProject, download, encodeProject } from "./core/project";
import { KernelClient } from "./kernel/client";
import type { ModelResult } from "./kernel/protocol";
import { Viewport } from "./components/Viewport";
import { FeatureEditor, newFeature } from "./components/FeatureEditor";

const EMPTY: ModelResult = { parts: [], sketches: {}, regenerated: 0 };
const icons: Record<Feature["type"], string> = {
  sketch: "▱",
  extrude: "↥",
  revolve: "⟳",
  fillet: "◜",
  chamfer: "◩",
};
export default function App() {
  const [doc, setDoc] = useState(emptyDocument),
    [model, setModel] = useState<ModelResult>(EMPTY),
    [preview, setPreview] = useState<{
      doc: CadDocument;
      model: ModelResult;
    } | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState<Feature | null>(null);
  const [busy, setBusy] = useState("Loading local geometry engines…"),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [saved, setSaved] = useState("Checking local recovery…"),
    [drawer, setDrawer] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const history = useRef(new History(doc)),
    kernel = useRef<KernelClient | null>(null),
    store = useRef<Autosave | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const working = useRef(true),
    generation = useRef(0),
    latestSave = useRef(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  void historyVersion;
  const save = async (document: CadDocument) => {
    const saveId = ++latestSave.current;
    setSaved("Saving to this device…");
    try {
      await store.current!.save(document);
      if (saveId === latestSave.current) setSaved("Saved on this device");
    } catch (e) {
      if (saveId === latestSave.current) {
        setSaved("Autosave failed · download recovery");
        setError(
          e instanceof Error
            ? e.message
            : "Local storage failed. Download a recovery copy.",
        );
      }
    }
  };
  useEffect(() => {
    const k = new KernelClient(),
      s = new Autosave();
    kernel.current = k;
    store.current = s;
    let mounted = true;
    (async () => {
      let restored: CadDocument = history.current.current;
      try {
        const recovery = await s.restore();
        if (recovery.document) restored = recovery.document;
        if (mounted)
          setSaved(
            recovery.recovered
              ? "Recovered previous snapshot"
              : "Saved on this device",
          );
      } catch (e) {
        if (mounted) {
          setError(
            e instanceof Error ? e.message : "Local storage unavailable.",
          );
          setSaved("Autosave unavailable · download recovery");
        }
      }
      history.current = new History(restored);
      if (mounted) setDoc(restored);
      try {
        const result = await k.regenerate(restored);
        if (!mounted) return;
        history.current = new History(restored);
        setDoc(restored);
        setModel(result);
        setReady(true);
      } catch (e) {
        if (mounted)
          setError(
            e instanceof Error ? e.message : "Could not initialize geometry.",
          );
      } finally {
        if (mounted) {
          working.current = false;
          setBusy("");
        }
      }
    })();
    if (!location.hash) historyReplaceHash();
    return () => {
      mounted = false;
      k.dispose();
      void s.close();
    };
  }, []);
  async function transact(
    candidate: CadDocument,
    mode: "commit" | "undo" | "redo" = "commit",
  ) {
    if (working.current) return;
    working.current = true;
    const token = ++generation.current;
    setBusy("Regenerating geometry…");
    setError("");
    setPreview(null);
    try {
      const next = history.current.candidate(candidate),
        result = await kernel.current!.regenerate(next);
      if (token !== generation.current) return;
      if (mode === "undo") history.current.acceptUndo(next);
      else if (mode === "redo") history.current.acceptRedo(next);
      else history.current.commit(next);
      setDoc(next);
      setModel(result);
      setDraft(null);
      setHistoryVersion((v) => v + 1);
      setReady(true);
      void save(next);
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusy("");
      }
    }
  }
  async function restart() {
    const token = ++generation.current;
    kernel.current!.reset();
    working.current = true;
    setBusy("Restoring committed geometry…");
    setPreview(null);
    setError("");
    try {
      const result = await kernel.current!.regenerate(history.current.current);
      if (token === generation.current) {
        setModel(result);
        setReady(true);
      }
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "Worker recovery failed.");
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusy("");
      }
    }
  }
  async function previewDraft() {
    if (!draft || working.current) return;
    working.current = true;
    setBusy("Calculating preview…");
    setError("");
    const token = ++generation.current;
    try {
      const candidate = history.current.candidate(replaceFeature(doc, draft));
      const result = await kernel.current!.request<ModelResult>(
        { kind: "preview", document: candidate },
        candidate.revision,
      );
      if (token === generation.current)
        setPreview({ doc: candidate, model: result });
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusy("");
      }
    }
  }
  function applyDraft() {
    if (!draft) return;
    try {
      void transact(replaceFeature(doc, draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid feature.");
    }
  }
  function begin(type: Feature["type"]) {
    setPreview(null);
    setError("");
    setDraft(newFeature(type, doc, selected, model));
    setDrawer(false);
  }
  function undo() {
    const next = history.current.undoCandidate();
    if (next) void transact(next, "undo");
  }
  function redo() {
    const next = history.current.redoCandidate();
    if (next) void transact(next, "redo");
  }
  function saveDownload() {
    try {
      download(
        encodeProject(history.current.current),
        `${history.current.current.name.replace(/[^a-zA-Z0-9 _-]/g, "_")}.notcad`,
      );
    } catch (e) {
      setError(String(e));
    }
  }
  const shortcuts = useRef({ undo, redo, saveDownload });
  shortcuts.current = { undo, redo, saveDownload };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        shortcuts.current.saveDownload();
        return;
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) shortcuts.current.redo();
        else shortcuts.current.undo();
      }
      if (e.key === "Escape" && !working.current) {
        setDraft(null);
        setPreview(null);
        setDrawer(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function openProject(file?: File) {
    if (!file || working.current) return;
    try {
      if (file.size > 16 * 1024 * 1024)
        throw new Error("Project exceeds the 16 MiB limit of this build.");
      const opened = decodeProject(new Uint8Array(await file.arrayBuffer()));
      await transact(opened);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open project.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function exportGeometry(format: "step" | "stl") {
    if (working.current) return;
    working.current = true;
    setBusy(`Exporting ${format.toUpperCase()}…`);
    setError("");
    setExportOpen(false);
    const token = ++generation.current;
    try {
      const blob = await kernel.current!.request<Blob>(
        { kind: "export", format },
        doc.revision,
      );
      if (token === generation.current) download(blob, `${doc.name}.${format}`);
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      if (token === generation.current) {
        working.current = false;
        setBusy("");
      }
    }
  }
  const currentFeature = doc.features.find((f) => f.id === selected),
    currentPart = model.parts.find((p) => p.id === selected);
  const active = doc.rollback ?? doc.features.length;
  const selectedReport = selected ? model.sketches[selected] : undefined;
  const units = doc.units,
    scale = units === "in" ? 25.4 : 1;
  function changeFeature(f: Feature) {
    try {
      void transact(replaceFeature(doc, f));
    } catch (e) {
      setError(String(e));
    }
  }
  function move(delta: number) {
    if (!selected) return;
    try {
      void transact(moveFeature(doc, selected, delta));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reorder feature.");
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="#/studio" className="brand" aria-label="notCAD home">
          <span className="brand-symbol">
            n<span>↗</span>
          </span>
          not<span>CAD</span>
        </a>
        <div className="document-title">
          <input
            aria-label="Document name"
            key={doc.name}
            defaultValue={doc.name}
            disabled={!!busy || !ready}
            maxLength={120}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== doc.name) void transact({ ...doc, name });
              else e.target.value = doc.name;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span className="local-tag">
            <i /> PRIVATE · ON YOUR DEVICE
          </span>
        </div>
        <div className="file-actions">
          <button
            disabled={!!busy || !ready}
            onClick={() => fileInput.current?.click()}
          >
            Open
          </button>
          <button onClick={saveDownload} className="save-button">
            ↓ <span>Save project</span>
          </button>
          <div className="export-wrap">
            <button
              disabled={!!busy || !ready || !model.parts.length}
              onClick={() => setExportOpen(!exportOpen)}
            >
              Export <span>⌄</span>
            </button>
            {exportOpen && (
              <div className="export-menu">
                <button onClick={() => void exportGeometry("step")}>
                  STEP · exact solids
                </button>
                <button onClick={() => void exportGeometry("stl")}>
                  STL · triangle mesh
                </button>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".notcad"
          aria-label="Open notCAD project"
          hidden
          onChange={(e) => void openProject(e.target.files?.[0])}
        />
      </header>
      <nav className="toolbar" aria-label="Modeling tools">
        <button
          className="mobile-history"
          onClick={() => setDrawer(!drawer)}
          aria-expanded={drawer}
        >
          ☰ History
        </button>
        <div className="undo-tools">
          <button
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            disabled={!!busy || !history.current.canUndo}
            onClick={undo}
          >
            ↶
          </button>
          <button
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            disabled={!!busy || !history.current.canRedo}
            onClick={redo}
          >
            ↷
          </button>
        </div>
        <span className="divider" />
        {(
          [
            "sketch",
            "extrude",
            "revolve",
            "fillet",
            "chamfer",
          ] as Feature["type"][]
        ).map((type) => (
          <button
            key={type}
            aria-label={type[0].toUpperCase() + type.slice(1)}
            disabled={
              !!busy ||
              !ready ||
              (type === "extrude" || type === "revolve"
                ? !doc.features.some(
                    (f) => f.type === "sketch" && !f.suppressed,
                  )
                : type !== "sketch" && !model.parts.length)
            }
            onClick={() => begin(type)}
            className={draft?.type === type ? "tool-active" : ""}
          >
            <span className="tool-icon">{icons[type]}</span>
            {type[0].toUpperCase() + type.slice(1)}
          </button>
        ))}
        <span className="toolbar-end">
          ENGINEERING BUILD <span>0.1</span>
        </span>
      </nav>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={saveDownload}>Download recovery copy</button>
          <button onClick={() => void restart()}>Restart geometry</button>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      <main className="workspace">
        <aside
          className={`feature-panel ${drawer ? "drawer-open" : ""}`}
          aria-label="Feature history"
        >
          <div className="studio-heading">
            <span className="studio-icon">▧</span>
            <div>
              <strong>Part Studio 1</strong>
              <span>Parametric workspace</span>
            </div>
            <button
              className="mobile-history icon-button"
              onClick={() => setDrawer(false)}
              aria-label="Close history"
            >
              ×
            </button>
          </div>
          <div className="section-label">REFERENCE GEOMETRY</div>
          <div className="reference-item">
            <span>⊕</span> Origin <small>0, 0, 0</small>
          </div>
          <div className="planes">
            <span>▱ Top</span>
            <span>▱ Front</span>
            <span>▱ Right</span>
          </div>
          <div className="section-label feature-heading">
            FEATURES{" "}
            <span>{doc.features.length.toString().padStart(2, "0")}</span>
          </div>
          <ol className="feature-list">
            {doc.features.map((f, index) => (
              <li
                key={f.id}
                className={`${selected === f.id ? "selected" : ""} ${f.suppressed || index >= active ? "suppressed" : ""}`}
              >
                <button
                  disabled={!!busy}
                  aria-pressed={selected === f.id}
                  onClick={() => setSelected(f.id)}
                  onDoubleClick={() => {
                    setDraft(structuredClone(f));
                    setPreview(null);
                    setDrawer(false);
                  }}
                >
                  <span className="feature-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="feature-icon">{icons[f.type]}</span>
                  <span>{f.name}</span>
                  {f.suppressed && <small>off</small>}
                </button>
              </li>
            ))}
          </ol>
          {!doc.features.length && (
            <p className="history-empty">
              Your design starts with a sketch.
              <br />
              Every feature will appear here.
            </p>
          )}
          {currentFeature && (
            <div className="feature-actions">
              <button
                disabled={!!busy}
                onClick={() => {
                  setDraft(structuredClone(currentFeature));
                  setPreview(null);
                  setDrawer(false);
                }}
              >
                Edit
              </button>
              <button
                disabled={!!busy}
                onClick={() =>
                  changeFeature({
                    ...currentFeature,
                    suppressed: !currentFeature.suppressed,
                  })
                }
              >
                {currentFeature.suppressed ? "Unsuppress" : "Suppress"}
              </button>
              <button
                aria-label="Move feature earlier"
                disabled={!!busy}
                onClick={() => move(-1)}
              >
                ↑
              </button>
              <button
                aria-label="Move feature later"
                disabled={!!busy}
                onClick={() => move(1)}
              >
                ↓
              </button>
              <button
                disabled={!!busy}
                onClick={() => {
                  try {
                    void transact(
                      parseDocument({
                        ...doc,
                        features: doc.features.filter((f) => f.id !== selected),
                        rollback: null,
                      }),
                    );
                    setSelected(null);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}
          {!!doc.features.length && (
            <label className="rollback">
              History position{" "}
              <select
                aria-label="History position"
                disabled={!!busy}
                value={doc.rollback ?? "end"}
                onChange={(e) =>
                  void transact({
                    ...doc,
                    rollback:
                      e.target.value === "end" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="end">End of history</option>
                {doc.features.map((f, i) => (
                  <option key={f.id} value={i}>
                    Before {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="parts-section">
            <div className="section-label">
              PARTS{" "}
              <span>{model.parts.length.toString().padStart(2, "0")}</span>
            </div>
            {model.parts.map((p) => (
              <button
                key={p.id}
                className={`part-item ${selected === p.id ? "selected" : ""}`}
                onClick={() => setSelected(p.id)}
              >
                <span className="part-swatch" />
                {p.name}
                <small>{p.valid ? "solid" : ""}</small>
              </button>
            ))}
          </div>
          <div className="local-note">
            <span>◉</span>
            <div>
              Your ideas stay here.
              <small>Local storage · No account · No telemetry</small>
            </div>
          </div>
        </aside>
        {drawer && (
          <button
            className="drawer-scrim"
            aria-label="Dismiss history drawer"
            onClick={() => setDrawer(false)}
          />
        )}
        <section className="canvas-area" aria-label="Design workspace">
          <Viewport
            model={preview?.model ?? model}
            document={preview?.doc ?? doc}
            selected={selected}
            onSelect={setSelected}
            preview={!!preview}
          />
          {!doc.features.length && !draft && !busy && (
            <div className="empty-state">
              <span className="eyebrow">A SPACE TO MAKE THINGS</span>
              <h1>
                From a thought
                <br />
                to a solid.
              </h1>
              <p>
                Sketch with precise dimensions.
                <br />
                Build, refine, and keep every idea on your device.
              </p>
              <button className="primary" onClick={() => begin("sketch")}>
                ＋ Create your first sketch
              </button>
              <button
                className="text-button"
                onClick={() => void transact(bracketDocument())}
              >
                Explore the mounting bracket ↗
              </button>
            </div>
          )}
          {busy && (
            <div className="busy-pill" role="status">
              <span className="spinner" />
              {busy}
              {ready && <button onClick={() => void restart()}>Cancel</button>}
            </div>
          )}
          {!draft && (currentPart || selectedReport) && (
            <div className="selection-card">
              <span className="eyebrow">
                {currentPart ? "PART PROPERTIES" : "SKETCH CONSTRAINTS"}
              </span>
              <strong>{currentPart?.name ?? currentFeature?.name}</strong>
              {currentPart ? (
                <>
                  <div>
                    Volume{" "}
                    <span data-testid="volume">
                      {(currentPart.volume / scale ** 3).toLocaleString("en", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      {units}³
                    </span>
                  </div>
                  <div>
                    Surface area{" "}
                    <span>
                      {(currentPart.area / scale ** 2).toLocaleString("en", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      {units}²
                    </span>
                  </div>
                  <div>
                    Topology{" "}
                    <span>
                      {currentPart.solids} solid · {currentPart.faces} faces
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Constraint status <span>{selectedReport?.status}</span>
                  </div>
                  <div>
                    Degrees of freedom <span>{selectedReport?.dof}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
        {draft && (
          <FeatureEditor
            feature={draft}
            document={doc}
            model={model}
            busy={!!busy}
            onChange={(f) => {
              setDraft(f);
              setPreview(null);
            }}
            onPreview={() => void previewDraft()}
            onApply={applyDraft}
            onCancel={() => {
              setDraft(null);
              setPreview(null);
            }}
          />
        )}
      </main>
      <footer className="bottom-bar">
        <div className="document-tabs">
          <span className="active-tab">▧ Part Studio 1</span>
          <button
            disabled={!!busy || !ready}
            onClick={() => {
              setSelected(null);
              void transact(emptyDocument());
            }}
            title="Create a new project; current document remains in undo history"
          >
            ＋ New project
          </button>
        </div>
        <div className="status-area">
          <span
            className={
              saved.includes("failed") || saved.includes("unavailable")
                ? "save-failed"
                : "save-state"
            }
            data-testid="save-status"
          >
            {saved}
          </span>
          <label className="units-control">
            <span className="sr-only">Document units</span>
            <select
              aria-label="Document units"
              value={units}
              disabled={!!busy || !ready}
              onChange={(e) =>
                void transact({ ...doc, units: e.target.value as "mm" | "in" })
              }
            >
              <option value="mm">mm</option>
              <option value="in">in</option>
            </select>
          </label>
          <span className="revision">r{doc.revision}</span>
        </div>
      </footer>
    </div>
  );
}
function historyReplaceHash() {
  window.history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#/studio`,
  );
}
