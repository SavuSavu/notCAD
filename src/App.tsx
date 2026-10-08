import { useEffect, useRef, useState } from "react";
import { Viewport } from "./Viewport";
import { WorkerClient } from "./kernel/client";
import type { ModelResult } from "./kernel/protocol";
import {
  bracketDocument,
  emptyDocument,
  revise,
  validateDocument,
  type Document,
  type Feature,
  type Sketch,
} from "./model/document";
import { formatMeasurement } from "./model/measurement";
import { History } from "./model/history";
import { moveFeature, removeFeature } from "./model/graph";
import {
  decodeProject,
  download,
  encodeProject,
  filename,
  MAX_ARCHIVE_BYTES,
} from "./storage/project";
import { loadLocal, saveLocal } from "./storage/autosave";
const emptyModel: ModelResult = { parts: [], diagnostics: [] };
type Tool =
  | "rectangle"
  | "circle"
  | "extrude"
  | "revolve"
  | "fillet"
  | "chamfer";
export default function App() {
  const history = useRef(new History(emptyDocument()));
  const [doc, setDoc] = useState(history.current.current);
  const [model, setModel] = useState<ModelResult>(emptyModel);
  const [busy, setBusy] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  const [storage, setStorage] = useState("Opening local recovery…");
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [editing, setEditing] = useState<Feature | null>(null);
  const [view, setView] = useState(0);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const client = useRef<WorkerClient | null>(null);
  const lock = useRef(true);
  const sequence = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  function persist(next: Document) {
    setStorage("Saving on this device…");
    saveQueue.current = saveQueue.current
      .then(() => saveLocal(next))
      .then(() => setStorage("Saved on this device"))
      .catch((e) => {
        setStorage(
          `Local save failed: ${e.message}. Download your project to keep a recovery copy.`,
        );
      });
  }
  useEffect(() => {
    client.current = new WorkerClient();
    let alive = true;
    const initialSequence = ++sequence.current;
    (async () => {
      let recovered: Document | null = null;
      let recoveryFailed = false;
      try {
        recovered = await loadLocal();
      } catch (e) {
        recoveryFailed = true;
        if (alive)
          setStorage(
            `Recovery unavailable: ${(e as Error).message}. Download your project to save.`,
          );
      }
      try {
        if (!alive || initialSequence !== sequence.current) return;
        const initial = recovered ?? history.current.current;
        // Restore project data before loading geometry so worker failure or
        // cancellation cannot remove the user's downloadable recovery copy.
        history.current = new History(initial);
        setDoc(history.current.current);
        setHydrated(true);
        if (recovered) setStorage("Recovered project data on this device");
        const response = await client.current!.request({
          type: "regenerate",
          revision: initial.revision,
          document: initial,
        });
        if (
          alive &&
          initialSequence === sequence.current &&
          response.ok &&
          response.type === "regenerate"
        ) {
          history.current = new History(initial);
          setDoc(initial);
          setModel(response.result);
          if (!recoveryFailed) {
            if (recovered) setStorage("Recovered your last local project");
            else setStorage("Ready · project stays on your device");
          }
        }
      } catch (e) {
        if (alive && initialSequence === sequence.current)
          setError((e as Error).message);
      } finally {
        if (alive && initialSequence === sequence.current) {
          setBusy(false);
          lock.current = false;
        }
      }
    })();
    return () => {
      alive = false;
      client.current?.dispose();
    };
  }, []);
  async function apply(
    next: Document,
    action: "commit" | "undo" | "redo" = "commit",
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const seq = ++sequence.current;
    try {
      const candidate = validateDocument({
        ...next,
        revision: history.current.current.revision + 1,
      });
      const response = await client.current!.request({
        type: "regenerate",
        document: candidate,
        revision: candidate.revision,
      });
      if (
        seq !== sequence.current ||
        !response.ok ||
        response.type !== "regenerate" ||
        response.revision !== candidate.revision
      )
        return;
      const committed =
        action === "undo"
          ? history.current.undo()
          : action === "redo"
            ? history.current.redo()
            : history.current.commit(candidate);
      setDoc(committed);
      setModel(response.result);
      persist(committed);
      setTool(null);
      setEditing(null);
    } catch (e) {
      if (seq === sequence.current) setError((e as Error).message);
    } finally {
      if (seq === sequence.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  }
  function navigateHistory(action: "undo" | "redo") {
    const next =
      action === "undo"
        ? history.current.peekUndo()
        : history.current.peekRedo();
    if (next) void apply(next, action);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveProject();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (lock.current && hydrated) cancel();
        setTool(null);
        setEditing(null);
        setSelected(null);
        return;
      }
      if ((event.target as HTMLElement).matches("input,select,textarea"))
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        navigateHistory(event.shiftKey ? "redo" : "undo");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function saveProject() {
    if (!hydrated) return;
    try {
      download(
        encodeProject(history.current.current),
        `${filename(history.current.current.name)}.notcad`,
        "application/zip",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_ARCHIVE_BYTES)
        throw new Error("Project exceeds the 8 MiB archive limit");
      const next = decodeProject(new Uint8Array(await file.arrayBuffer()));
      await apply(next);
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function exportPart(format: "step" | "stl") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const seq = ++sequence.current;
    try {
      const response = await client.current!.request({
        type: "export",
        format,
        document: doc,
        revision: doc.revision,
      });
      if (seq === sequence.current && response.ok && response.type === "export")
        download(
          response.bytes,
          `${filename(doc.name)}.${format}`,
          "application/octet-stream",
        );
    } catch (e) {
      if (seq === sequence.current) setError((e as Error).message);
    } finally {
      if (seq === sequence.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  function cancel() {
    if (!hydrated) return;
    ++sequence.current;
    client.current!.cancel();
    lock.current = false;
    setBusy(false);
    setError("Operation cancelled. Your last committed project is preserved.");
  }
  function start(next: Tool) {
    setDrawer(false);
    setEditing(null);
    setTool(next);
  }
  const active = editing ?? doc.features.find((f) => f.id === selected);
  const factor = doc.units === "in" ? 25.4 : 1;
  const totalVolume =
    model.parts.reduce((sum, p) => sum + p.volume, 0) / factor ** 3;
  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="#/">
          not<span>CAD</span>
          <i>local workshop</i>
        </a>
        <div className="document-title">
          <input
            aria-label="Project name"
            key={doc.name}
            defaultValue={doc.name}
            maxLength={120}
            disabled={busy}
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              e.currentTarget.value = name || doc.name;
              if (name && name !== doc.name) void apply(revise(doc, { name }));
            }}
          />
          <span>Private on your device</span>
        </div>
        <div className="file-actions">
          <button disabled={busy} onClick={() => fileInput.current?.click()}>
            Open
          </button>
          <button
            className="primary"
            onClick={saveProject}
            disabled={!hydrated}
          >
            Download project
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".notcad"
          hidden
          onChange={(e) => void openProject(e.target.files?.[0])}
        />
      </header>
      <nav className="toolbar" aria-label="Modeling tools">
        <button
          className="mobile-tree"
          disabled={busy}
          onClick={() => {
            setDrawer(!drawer);
            setInspectOpen(false);
            setTool(null);
            setEditing(null);
          }}
        >
          Features
        </button>
        <div className="tool-group">
          <button disabled={busy} onClick={() => start("rectangle")}>
            ▱ Rectangle
          </button>
          <button disabled={busy} onClick={() => start("circle")}>
            ○ Circle
          </button>
        </div>
        <div className="tool-group">
          <button
            disabled={busy || !doc.features.some((f) => f.type === "sketch")}
            onClick={() => start("extrude")}
          >
            ↗ Extrude
          </button>
          <button
            disabled={busy || !doc.features.some((f) => f.type === "sketch")}
            onClick={() => start("revolve")}
          >
            ⟳ Revolve
          </button>
        </div>
        <div className="tool-group">
          <button
            disabled={busy || !model.parts.length}
            onClick={() => start("fillet")}
          >
            ⌒ Fillet
          </button>
          <button
            disabled={busy || !model.parts.length}
            onClick={() => start("chamfer")}
          >
            ◩ Chamfer
          </button>
        </div>
        <button
          className="mobile-tree"
          disabled={busy}
          onClick={() => {
            setDrawer(false);
            setTool(null);
            setEditing(null);
            setInspectOpen(!inspectOpen);
          }}
        >
          Inspect / Export
        </button>
        <div className="toolbar-end">
          <button
            disabled={busy || !history.current.canUndo}
            onClick={() => navigateHistory("undo")}
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            disabled={busy || !history.current.canRedo}
            onClick={() => navigateHistory("redo")}
            aria-label="Redo"
          >
            ↷
          </button>
          <button onClick={() => setView((v) => v + 1)}>Fit view</button>
        </div>
      </nav>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      <div className="workspace">
        <aside className={`feature-tree ${drawer ? "open" : ""}`}>
          <div className="panel-heading">
            FEATURES <span>{doc.features.length}</span>
          </div>
          <div className="origin">
            <span>⌖ Origin</span>
            <span>XY · XZ · YZ</span>
          </div>
          <div className="features">
            {doc.features.map((feature, index) => (
              <button
                key={feature.id}
                disabled={busy}
                className={`feature ${feature.id === selected ? "selected" : ""} ${feature.suppressed || (doc.rollback !== null && index >= doc.rollback) ? "suppressed" : ""}`}
                onClick={() => {
                  setSelected(feature.id);
                  setEditing(feature);
                  setTool(null);
                  setDrawer(false);
                }}
              >
                <span className="feature-icon">
                  {feature.type === "sketch"
                    ? "▱"
                    : feature.type === "extrude"
                      ? "↗"
                      : feature.type === "revolve"
                        ? "⟳"
                        : "⌒"}
                </span>
                <span>
                  {feature.name}
                  <small>
                    {feature.type}
                    {feature.suppressed ? " · suppressed" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <label className="rollback">
            History position
            <select
              aria-label="History position"
              value={doc.rollback ?? doc.features.length}
              disabled={busy}
              onChange={(e) =>
                void apply(
                  revise(doc, {
                    rollback:
                      Number(e.target.value) === doc.features.length
                        ? null
                        : Number(e.target.value),
                  }),
                )
              }
            >
              {Array.from({ length: doc.features.length + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i === doc.features.length
                    ? "End of history"
                    : `After ${i} features`}
                </option>
              ))}
            </select>
          </label>
          <div className="parts-heading">
            PARTS <span>{model.parts.length}</span>
          </div>
          {model.parts.map((part) => (
            <button
              key={part.id}
              className={`part ${selected === part.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(part.id);
                setDrawer(false);
                setEditing(null);
                setTool(null);
              }}
            >
              ◇ {part.name}
            </button>
          ))}
          <div className="tree-footer">Exact geometry · millimeter model</div>
        </aside>
        <main className="canvas-region">
          <Viewport
            doc={doc}
            model={model}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              setDrawer(false);
              setTool(null);
              setEditing(null);
            }}
            view={view}
          />
          {!doc.features.length && !busy && (
            <div className="welcome">
              <span className="eyebrow">A WORKSPACE OF YOUR OWN</span>
              <h1>
                Make something
                <br />
                that fits.
              </h1>
              <p>
                Start with a precise sketch, then turn it into a solid. Your
                work stays on this device.
              </p>
              <button className="primary" onClick={() => start("rectangle")}>
                Create a rectangle sketch
              </button>
              <button
                className="text-button"
                onClick={() => void apply(bracketDocument())}
              >
                Explore a mechanical bracket ↗
              </button>
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              <span className="spinner" />
              Solving geometry…
              <button onClick={cancel} disabled={!hydrated}>
                Cancel
              </button>
            </div>
          )}
        </main>
        <aside
          className={`operation-panel ${tool || editing ? "editing" : inspectOpen ? "inspect-open" : ""}`}
        >
          {tool || editing ? (
            <FeatureForm
              key={editing?.id ?? tool}
              doc={doc}
              tool={tool}
              editing={editing}
              selected={selected}
              busy={busy}
              onHistoryEdit={(action, featureId) => {
                try {
                  void apply(
                    action === "delete"
                      ? removeFeature(doc, featureId)
                      : moveFeature(doc, featureId, action === "up" ? -1 : 1),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              onCancel={() => {
                if (lock.current) cancel();
                setTool(null);
                setEditing(null);
              }}
              onSubmit={(feature) => {
                const features = editing
                  ? doc.features.map((f) => (f.id === feature.id ? feature : f))
                  : [...doc.features, feature];
                void apply(revise(doc, { features, rollback: null }));
              }}
            />
          ) : (
            <>
              <div className="panel-heading">INSPECT</div>
              <div className="inspect">
                <span className="eyebrow">
                  {model.parts.length ? "MODEL PROPERTIES" : "GETTING STARTED"}
                </span>
                <h2>
                  {model.parts.length
                    ? `${model.parts.length} solid part${model.parts.length > 1 ? "s" : ""}`
                    : "Sketch. Shape. Refine."}
                </h2>
                <p>
                  {model.parts.length
                    ? "Select a feature to edit its dimensions. Changes rebuild the dependent geometry."
                    : "Rectangle and circle sketches are dimension driven and anchored to the selected plane."}
                </p>
                {model.parts.length > 0 && (
                  <dl>
                    <dt>Total volume</dt>
                    <dd data-testid="volume">
                      {formatMeasurement(totalVolume, 3)} {doc.units}³
                    </dd>
                    <dt>Surface area</dt>
                    <dd>
                      {formatMeasurement(
                        model.parts.reduce((sum, p) => sum + p.area, 0) /
                          factor ** 2,
                        2,
                      )}{" "}
                      {doc.units}²
                    </dd>
                    <dt>Geometry</dt>
                    <dd>Valid closed solids</dd>
                  </dl>
                )}
                {active?.type === "sketch" && (
                  <p>
                    {model.diagnostics.find((d) => d.featureId === active.id)
                      ?.dof ?? "—"}{" "}
                    degrees of freedom
                  </p>
                )}
                <label>
                  Display units
                  <select
                    aria-label="Display units"
                    value={doc.units}
                    disabled={busy}
                    onChange={(e) =>
                      void apply(
                        revise(doc, {
                          units: e.target.value as Document["units"],
                        }),
                      )
                    }
                  >
                    <option value="mm">Millimeters</option>
                    <option value="in">Inches</option>
                  </select>
                </label>
                <div className="export-actions">
                  <button
                    disabled={busy || !model.parts.length}
                    onClick={() => void exportPart("step")}
                  >
                    Export STEP
                  </button>
                  <button
                    disabled={busy || !model.parts.length}
                    onClick={() => void exportPart("stl")}
                  >
                    Export STL
                  </button>
                </div>
                <button
                  disabled={busy}
                  className="text-button"
                  onClick={async () => {
                    try {
                      const previous = await loadLocal("previous");
                      if (previous) await apply(previous);
                      else
                        setError("No previous recovery snapshot is available.");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Restore previous snapshot
                </button>
                <p className="milestone-note">
                  Early local build. Full CAD parity is in progress; this
                  application is an unfinished public preview.
                </p>
              </div>
            </>
          )}
        </aside>
      </div>
      <footer className="footer">
        <span
          className={
            storage.startsWith("Local save failed") ||
            storage.startsWith("Recovery unavailable")
              ? "storage-error"
              : ""
          }
        >
          ● {storage}
        </span>
        <span>
          {busy ? "Computing" : "Ready"} · {doc.units} · Rev {doc.revision}
        </span>
      </footer>
      <div className="tabs">
        <button className="active">▱ Part Studio 1</button>
        <span>Local project · no account required</span>
      </div>
    </div>
  );
}
interface FormProps {
  doc: Document;
  tool: Tool | null;
  editing: Feature | null;
  selected: string | null;
  busy: boolean;
  onCancel(): void;
  onHistoryEdit(action: "up" | "down" | "delete", featureId: string): void;
  onSubmit(feature: Feature): void;
}
function FeatureForm({
  doc,
  tool,
  editing,
  selected,
  busy,
  onCancel,
  onSubmit,
  onHistoryEdit,
}: FormProps) {
  const kind =
    editing?.type === "sketch"
      ? editing.profile.kind
      : (editing?.type ?? tool!);
  const factor = doc.units === "in" ? 25.4 : 1;
  const sketches = doc.features.filter(
    (f): f is Sketch =>
      f.type === "sketch" &&
      (!f.suppressed ||
        (editing !== null &&
          "sketchId" in editing &&
          editing.sketchId === f.id)) &&
      (!editing || doc.features.indexOf(f) < doc.features.indexOf(editing)),
  );
  const parts = doc.features.filter(
    (f) =>
      "operation" in f &&
      f.operation === "new" &&
      (!editing || doc.features.indexOf(f) < doc.features.indexOf(editing)),
  );
  const profile = editing?.type === "sketch" ? editing.profile : null;
  const [operation, setOperation] = useState(
    editing && "operation" in editing ? editing.operation : "new",
  );
  const [formError, setFormError] = useState("");
  const numeric = (
    name: string,
    label: string,
    value: number,
    positive = false,
    angle = false,
  ) => (
    <label>
      {label}
      {!angle && <span>{doc.units}</span>}
      <input
        name={name}
        type="number"
        step="any"
        required
        min={positive ? (angle ? 0.1 : 0.001 / factor) : -10000 / factor}
        max={angle ? 360 : 10000 / factor}
        defaultValue={angle ? value : value / factor}
      />
    </label>
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setFormError("");
        try {
          const data = new FormData(event.currentTarget),
            n = (name: string) => Number(data.get(name)) * factor;
          const common = {
            id: editing?.id ?? crypto.randomUUID(),
            name: String(data.get("name")).trim(),
            suppressed: editing?.suppressed ?? false,
          };
          let feature: Feature;
          if (kind === "rectangle" || kind === "circle") {
            feature = {
              ...common,
              type: "sketch",
              plane: String(data.get("plane")) as Sketch["plane"],
              offset: n("offset"),
              profile:
                kind === "rectangle"
                  ? {
                      kind,
                      x: n("x"),
                      y: n("y"),
                      width: n("width"),
                      height: n("height"),
                    }
                  : { kind, x: n("x"), y: n("y"), radius: n("radius") },
            };
          } else if (kind === "extrude" || kind === "revolve") {
            const base = {
              ...common,
              sketchId: String(data.get("sketchId")),
              operation,
              targetId:
                operation === "new" ? null : String(data.get("targetId")),
            };
            feature =
              kind === "extrude"
                ? { ...base, type: kind, depth: n("depth") }
                : { ...base, type: kind, angle: Number(data.get("angle")) };
          } else
            feature = {
              ...common,
              type: kind,
              targetId: String(data.get("targetId")),
              radius: n("radius"),
            };
          onSubmit(feature);
        } catch (e) {
          setFormError((e as Error).message);
        }
      }}
    >
      <div className="panel-heading">
        {editing ? "EDIT" : "CREATE"} {kind.toUpperCase()}
        <button type="button" onClick={onCancel} aria-label="Close operation">
          ×
        </button>
      </div>
      <div className="form-body">
        <label>
          Name
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={
              editing?.name ??
              `${kind[0].toUpperCase()}${kind.slice(1)} ${doc.features.length + 1}`
            }
          />
        </label>
        {(kind === "rectangle" || kind === "circle") && (
          <>
            <label>
              Sketch plane
              <select
                name="plane"
                defaultValue={editing?.type === "sketch" ? editing.plane : "XY"}
              >
                <option>XY</option>
                <option>XZ</option>
                <option>YZ</option>
              </select>
            </label>
            {numeric(
              "offset",
              "Plane offset",
              editing?.type === "sketch" ? editing.offset : 0,
            )}
            <div className="field-pair">
              {numeric(
                "x",
                kind === "circle" ? "Center U" : "Origin U",
                profile?.x ?? 0,
              )}
              {numeric(
                "y",
                kind === "circle" ? "Center V" : "Origin V",
                profile?.y ?? 0,
              )}
            </div>
            {kind === "rectangle" ? (
              <>
                {numeric(
                  "width",
                  "Width",
                  profile?.kind === "rectangle" ? profile.width : 60,
                  true,
                )}
                {numeric(
                  "height",
                  "Height",
                  profile?.kind === "rectangle" ? profile.height : 40,
                  true,
                )}
              </>
            ) : (
              numeric(
                "radius",
                "Radius",
                profile?.kind === "circle" ? profile.radius : 4,
                true,
              )
            )}
            <p className="form-help">
              Local U/V coordinates on the sketch plane. Dimensions and the
              anchored origin fully constrain this profile.
            </p>
          </>
        )}
        {(kind === "extrude" || kind === "revolve") && (
          <>
            <label>
              Profile
              <select
                name="sketchId"
                required
                defaultValue={
                  editing && "sketchId" in editing
                    ? editing.sketchId
                    : (sketches.find((s) => s.id === selected)?.id ??
                      sketches.at(-1)?.id)
                }
              >
                <option value="" disabled>
                  Select a sketch
                </option>
                {sketches.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.suppressed ? " · suppressed" : ""}
                  </option>
                ))}
              </select>
            </label>
            {kind === "extrude"
              ? numeric(
                  "depth",
                  "Depth",
                  editing?.type === "extrude" ? editing.depth : 6,
                  true,
                )
              : numeric(
                  "angle",
                  "Angle (degrees)",
                  editing?.type === "revolve" ? editing.angle : 360,
                  true,
                  true,
                )}
            <label>
              Operation
              <select
                value={operation}
                onChange={(e) =>
                  setOperation(e.target.value as typeof operation)
                }
              >
                <option value="new">New part</option>
                <option value="add">Add to part</option>
                <option value="remove">Remove from part</option>
                <option value="intersect">Intersect part</option>
              </select>
            </label>
            {operation !== "new" && (
              <label>
                Target part
                <select
                  name="targetId"
                  required
                  defaultValue={
                    editing && "targetId" in editing
                      ? (editing.targetId ?? "")
                      : parts[0]?.id
                  }
                >
                  {parts.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="form-help">
              {kind === "extrude"
                ? "Extrudes along the positive plane normal: XY → +Z, XZ → −Y, YZ → +X."
                : "Revolves about the local V axis through U = 0. Place the profile on one side of the axis."}
            </p>
          </>
        )}
        {(kind === "fillet" || kind === "chamfer") && (
          <>
            <label>
              Target part
              <select
                name="targetId"
                required
                defaultValue={
                  editing && "targetId" in editing
                    ? (editing.targetId ?? "")
                    : parts[0]?.id
                }
              >
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {numeric(
              "radius",
              kind === "fillet" ? "Radius" : "Distance",
              editing && "radius" in editing ? editing.radius : 1,
              true,
            )}
            <p className="form-help">
              Applies to all edges of the target part. Choose a small size;
              invalid operations preserve your project.
            </p>
          </>
        )}
        {formError && <p role="alert">{formError}</p>}
        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy}>
            Apply {kind}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {editing && (
          <>
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() =>
                onSubmit({ ...editing, suppressed: !editing.suppressed })
              }
            >
              {editing.suppressed ? "Unsuppress feature" : "Suppress feature"}
            </button>
            <p className="form-help">
              Required dependencies must remain available for later features.
            </p>
            <div className="history-actions">
              <button
                type="button"
                disabled={busy || doc.features[0].id === editing.id}
                onClick={() => onHistoryEdit("up", editing.id)}
              >
                Move earlier
              </button>
              <button
                type="button"
                disabled={busy || doc.features.at(-1)?.id === editing.id}
                onClick={() => onHistoryEdit("down", editing.id)}
              >
                Move later
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onHistoryEdit("delete", editing.id)}
              >
                Delete feature
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
