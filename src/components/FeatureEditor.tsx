import type { CadDocument, Feature, SketchFeature } from "../core/model";
import { uid } from "../core/model";
import type { ModelResult } from "../kernel/protocol";

export function newFeature(
  type: Feature["type"],
  doc: CadDocument,
  selected: string | null,
  model: ModelResult,
): Feature {
  const common = {
    id: uid(),
    name: `${type[0].toUpperCase() + type.slice(1)} ${doc.features.filter((f) => f.type === type).length + 1}`,
    suppressed: false,
  };
  if (type === "sketch")
    return {
      ...common,
      type,
      plane: "XY",
      x: 0,
      y: 0,
      offset: 0,
      profile: { kind: "rectangle", width: 60, height: 40 },
    };
  const sketchId =
    doc.features.find((f) => f.id === selected && f.type === "sketch")?.id ??
    doc.features.filter((f) => f.type === "sketch" && !f.suppressed).at(-1)
      ?.id ??
    "";
  const targetId =
    model.parts.find((p) => p.id === selected)?.id ?? model.parts[0]?.id;
  if (type === "extrude")
    return { ...common, type, sketchId, mode: "new", distance: 10 };
  if (type === "revolve")
    return { ...common, type, sketchId, mode: "new", angle: 360, axis: "Z" };
  return { ...common, type, targetId: targetId ?? "", radius: 1 };
}
interface Props {
  feature: Feature;
  document: CadDocument;
  model: ModelResult;
  onChange: (f: Feature) => void;
  onPreview: () => void;
  onApply: () => void;
  onCancel: () => void;
  busy: boolean;
}
export function FeatureEditor({
  feature: f,
  document: doc,
  model,
  onChange,
  onApply,
  onPreview,
  onCancel,
  busy,
}: Props) {
  const scale = doc.units === "in" ? 25.4 : 1;
  const set = (patch: Partial<Feature>) =>
    onChange({ ...f, ...patch } as Feature);
  const num = (
    label: string,
    value: number,
    change: (value: number) => void,
    angle = false,
  ) => (
    <label>
      {label}
      <span className="numeric">
        <input
          aria-label={label}
          type="number"
          step="any"
          required
          value={
            Number.isNaN(value)
              ? ""
              : Number((value / (angle ? 1 : scale)).toPrecision(12))
          }
          onChange={(e) => change(e.target.valueAsNumber)}
          onBlur={(e) => {
            if (e.target.value === "") change(NaN);
          }}
        />
        <span>{angle ? "°" : doc.units}</span>
      </span>
    </label>
  );
  const length = (
    label: string,
    value: number,
    change: (value: number) => void,
  ) => num(label, value, (v) => change(v * scale));
  const target = () => (
    <label>
      Target part
      <select
        aria-label="Target part"
        value={"targetId" in f ? (f.targetId ?? "") : ""}
        onChange={(e) => set({ targetId: e.target.value })}
      >
        <option value="">Choose part</option>
        {model.parts.map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const profile = (patch: Partial<SketchFeature["profile"]>) => {
    if (f.type === "sketch")
      set({ profile: { ...f.profile, ...patch } as SketchFeature["profile"] });
  };
  return (
    <aside className="operation-panel" aria-label="Feature editor">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">FEATURE PARAMETERS</span>
          <h2>
            {f.type === "sketch"
              ? "Sketch profile"
              : f.type[0].toUpperCase() + f.type.slice(1)}
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={onCancel}
          aria-label="Close feature editor"
          disabled={busy}
        >
          ×
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
      >
        <fieldset disabled={busy}>
          <label>
            Name
            <input
              value={f.name}
              maxLength={120}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
          </label>
          {f.type === "sketch" ? (
            <>
              <label>
                Sketch plane
                <select
                  aria-label="Sketch plane"
                  value={f.plane}
                  onChange={(e) =>
                    set({ plane: e.target.value as SketchFeature["plane"] })
                  }
                >
                  <option value="XY">Top · XY</option>
                  <option value="XZ">Front · XZ</option>
                  <option value="YZ">Right · YZ</option>
                </select>
              </label>
              <div className="segmented" aria-label="Profile shape">
                <button
                  type="button"
                  aria-pressed={f.profile.kind === "rectangle"}
                  onClick={() =>
                    set({
                      profile: { kind: "rectangle", width: 60, height: 40 },
                    })
                  }
                >
                  ▱ Rectangle
                </button>
                <button
                  type="button"
                  aria-pressed={f.profile.kind === "circle"}
                  onClick={() =>
                    set({ profile: { kind: "circle", radius: 10 } })
                  }
                >
                  ○ Circle
                </button>
              </div>
              {f.profile.kind === "rectangle" ? (
                <div className="field-pair">
                  {length("Width", f.profile.width, (v) =>
                    profile({ width: v }),
                  )}
                  {length("Height", f.profile.height, (v) =>
                    profile({ height: v }),
                  )}
                </div>
              ) : (
                length("Radius", f.profile.radius, (v) =>
                  profile({ radius: v }),
                )
              )}
              <div className="field-pair">
                {length("Center X", f.x, (v) => set({ x: v }))}
                {length("Center Y", f.y, (v) => set({ y: v }))}
              </div>
              {length("Plane offset", f.offset, (v) => set({ offset: v }))}
              <p className="field-help">
                Coordinates follow the sketch plane. Dimensions and position
                fully constrain this profile.
              </p>
            </>
          ) : f.type === "extrude" || f.type === "revolve" ? (
            <>
              <label>
                Sketch
                <select
                  aria-label="Sketch"
                  required
                  value={f.sketchId}
                  onChange={(e) => set({ sketchId: e.target.value })}
                >
                  <option value="">Choose sketch</option>
                  {doc.features
                    .filter((s) => s.type === "sketch" && !s.suppressed)
                    .map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Operation
                <select
                  aria-label="Operation"
                  value={f.mode}
                  onChange={(e) =>
                    set({
                      mode: e.target.value as typeof f.mode,
                      targetId: f.targetId ?? model.parts[0]?.id,
                    })
                  }
                >
                  <option value="new">New part</option>
                  <option value="add">Add to part</option>
                  <option value="remove">Remove from part</option>
                  <option value="intersect">Intersect with part</option>
                </select>
              </label>
              {f.mode !== "new" && target()}
              {f.type === "extrude" ? (
                <>
                  <label>
                    Extrusion extent
                    <select
                      aria-label="Extrusion extent"
                      value={f.extent ?? "one-sided"}
                      onChange={(e) => {
                        const extent = e.target.value as NonNullable<
                          typeof f.extent
                        >;
                        set({
                          extent,
                          secondDistance:
                            extent === "two-sided"
                              ? (f.secondDistance ?? Math.abs(f.distance))
                              : undefined,
                        });
                      }}
                    >
                      <option value="one-sided">One direction</option>
                      <option value="symmetric">Symmetric</option>
                      <option value="two-sided">Two directions</option>
                    </select>
                  </label>
                  {length(
                    f.extent === "symmetric" ? "Total distance" : "Distance",
                    f.distance,
                    (v) => set({ distance: v }),
                  )}
                  {f.extent === "two-sided" &&
                    length("Second distance", f.secondDistance!, (v) =>
                      set({ secondDistance: v }),
                    )}
                </>
              ) : (
                <>
                  {num("Angle", f.angle, (v) => set({ angle: v }), true)}
                  <label>
                    Global revolution axis
                    <select
                      aria-label="Global revolution axis"
                      value={f.axis}
                      onChange={(e) =>
                        set({ axis: e.target.value as "X" | "Y" | "Z" })
                      }
                    >
                      <option>X</option>
                      <option>Y</option>
                      <option>Z</option>
                    </select>
                  </label>
                </>
              )}
              <p className="field-help">
                {f.type === "extrude"
                  ? f.extent === "symmetric"
                    ? "Half the total distance on each side of the sketch plane."
                    : f.extent === "two-sided"
                      ? "The second distance extends opposite the first. Enter a positive second distance; a negative first distance reverses both directions."
                      : "Blind extrusion along the sketch normal. Negative distances reverse the direction."
                  : "Revolve around a global axis through the origin. Position the profile away from that axis."}
              </p>
            </>
          ) : (
            <>
              {target()}
              {length(
                f.type === "fillet" ? "Radius" : "Distance",
                f.radius,
                (v) => set({ radius: v }),
              )}
              <p className="field-help">
                Applies to all edges of the target part. Selected-edge finishes
                are planned.
              </p>
            </>
          )}
          <div className="form-actions">
            <button type="button" onClick={onPreview}>
              Preview
            </button>
            <button className="primary" type="submit">
              Apply feature <span>↵</span>
            </button>
          </div>
          <button
            type="button"
            className="text-button cancel-edit"
            onClick={onCancel}
          >
            Cancel
          </button>
        </fieldset>
      </form>
    </aside>
  );
}
