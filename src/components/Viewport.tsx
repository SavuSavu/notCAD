import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CadDocument, SketchFeature } from "../core/model";
import { sketchOrigin } from "../core/model";
import type { ModelResult } from "../kernel/protocol";

type View = "iso" | "top" | "front" | "right";
interface Props {
  model: ModelResult;
  document: CadDocument;
  selected: string | null;
  onSelect: (id: string | null) => void;
  preview: boolean;
}
type SceneState = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  group: THREE.Group;
  renderer: THREE.WebGLRenderer;
  fit: (view?: View) => void;
};
function clear(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      mats.forEach((m) => m.dispose());
    }
  });
  group.clear();
}
function outline(f: SketchFeature) {
  const origin = sketchOrigin(f),
    points: THREE.Vector3[] = [];
  const xy =
    f.profile.kind === "rectangle"
      ? [
          [-f.profile.width / 2, -f.profile.height / 2],
          [f.profile.width / 2, -f.profile.height / 2],
          [f.profile.width / 2, f.profile.height / 2],
          [-f.profile.width / 2, f.profile.height / 2],
          [-f.profile.width / 2, -f.profile.height / 2],
        ]
      : Array.from({ length: 97 }, (_, i) => {
          const p = f.profile;
          return p.kind === "circle"
            ? [
                p.radius * Math.cos((i / 96) * Math.PI * 2),
                p.radius * Math.sin((i / 96) * Math.PI * 2),
              ]
            : [0, 0];
        });
  xy.forEach(([x, y]) =>
    points.push(
      new THREE.Vector3(...origin).add(
        f.plane === "XY"
          ? new THREE.Vector3(x, y, 0)
          : f.plane === "XZ"
            ? new THREE.Vector3(x, 0, y)
            : new THREE.Vector3(0, x, y),
      ),
    ),
  );
  return points;
}
export function Viewport({
  model,
  document,
  selected,
  onSelect,
  preview,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    state = useRef<SceneState | null>(null),
    select = useRef(onSelect);
  select.current = onSelect;
  const [error, setError] = useState("");
  const firstGeometry = useRef(true),
    lastModel = useRef<ModelResult | null>(null);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        "WebGL is unavailable. Enable hardware acceleration to display the model. Project download remains available.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "CAD model viewport");
    renderer.domElement.tabIndex = 0;
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-90, 90, 90, -90, 0.1, 1000000);
    camera.up.set(0, 0, 1);
    camera.position.set(100, -140, 110);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minZoom = 0.0001;
    controls.maxZoom = 1000;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    const ambient = new THREE.HemisphereLight(0xffffff, 0x8c9996, 2.7);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(40, -70, 130);
    scene.add(key);
    const grid = new THREE.GridHelper(400, 40, 0xb5c3bd, 0xd5ded7);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.04;
    scene.add(grid);
    const axes = new THREE.AxesHelper(25);
    scene.add(axes);
    const group = new THREE.Group();
    scene.add(group);
    const render = () => renderer.render(scene, camera);
    const fit = (view: View = "iso") => {
      const box = new THREE.Box3().setFromObject(group);
      const center = box.isEmpty()
        ? new THREE.Vector3()
        : box.getCenter(new THREE.Vector3());
      const diameter = box.isEmpty()
        ? 100
        : Math.max(box.getSize(new THREE.Vector3()).length(), 1);
      const direction =
        view === "top"
          ? new THREE.Vector3(0, 0, 1)
          : view === "front"
            ? new THREE.Vector3(0, -1, 0)
            : view === "right"
              ? new THREE.Vector3(1, 0, 0)
              : new THREE.Vector3(1, -1.5, 1.1).normalize();
      camera.up.set(0, view === "top" ? 1 : 0, view === "top" ? 0 : 1);
      camera.position
        .copy(center)
        .addScaledVector(direction, diameter * 3 + 10);
      controls.target.copy(center);
      camera.zoom = (camera.top - camera.bottom) / (diameter * 1.25);
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    state.current = { scene, camera, controls, group, renderer, fit };
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.left = (-90 * w) / h;
      camera.right = (90 * w) / h;
      camera.updateProjectionMatrix();
      render();
    });
    resize.observe(container);
    controls.addEventListener("change", render);
    let down: [number, number] = [0, 0];
    const pointers = new Set<number>();
    let multiplePointers = false;
    const pointerDown = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      if (pointers.size > 1) multiplePointers = true;
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (multiplePointers) {
        if (!pointers.size) multiplePointers = false;
        return;
      }
      if (e.button !== 0) return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const bounds = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.params.Line = { threshold: 1 / camera.zoom };
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray
        .intersectObjects(group.children, true)
        .find((hit) => hit.object.userData.id);
      select.current(hit?.object.userData.id ?? null);
    };
    const keyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        fit();
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", (event) => {
      pointers.delete(event.pointerId);
      if (!pointers.size) multiplePointers = false;
    });
    renderer.domElement.addEventListener("keydown", keyDown);
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        "The graphics context was lost. Download your project, then reload to restore the viewport.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    controls.update();
    render();
    return () => {
      resize.disconnect();
      controls.dispose();
      clear(group);
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      axes.geometry.dispose();
      (axes.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    clear(s.group);
    for (const part of model.parts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(part.mesh.vertices, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(part.mesh.normals, 3),
      );
      geometry.setIndex(part.mesh.triangles);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: part.id === selected ? 0xd09a56 : 0x6d9592,
          metalness: 0.22,
          roughness: 0.52,
          transparent: preview,
          opacity: preview ? 0.65 : 1,
        }),
      );
      mesh.userData.id = part.id;
      s.group.add(mesh);
      const edges = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute(
          "position",
          new THREE.Float32BufferAttribute(part.edges, 3),
        ),
        new THREE.LineBasicMaterial({
          color: part.id === selected ? 0x805326 : 0x27494a,
          transparent: true,
          opacity: 0.7,
        }),
      );
      s.group.add(edges);
    }
    const consumed = new Set(
      document.features
        .filter(
          (f) =>
            (f.type === "extrude" || f.type === "revolve") && !f.suppressed,
        )
        .map((f) => ("sketchId" in f ? f.sketchId : "")),
    );
    for (const f of document.features.slice(
      0,
      document.rollback ?? document.features.length,
    )) {
      if (
        f.type !== "sketch" ||
        f.suppressed ||
        (consumed.has(f.id) && selected !== f.id)
      )
        continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(outline(f)),
        new THREE.LineBasicMaterial({
          color: selected === f.id ? 0xbf692b : 0x237b82,
          depthTest: false,
        }),
      );
      line.userData.id = f.id;
      line.renderOrder = 2;
      s.group.add(line);
    }
    if (
      s.group.children.length &&
      (firstGeometry.current || lastModel.current !== model)
    ) {
      s.fit();
      firstGeometry.current = false;
    }
    lastModel.current = model;
    s.renderer.render(s.scene, s.camera);
  }, [model, document, selected, preview]);
  return (
    <div className="viewport" ref={host}>
      <div className="view-label">
        <span className="crosshair">＋</span> PART STUDIO{" "}
        <span>/ ORTHOGRAPHIC</span>
      </div>
      <div className="view-tools" aria-label="View orientation">
        {(["iso", "top", "front", "right"] as View[]).map((v) => (
          <button key={v} onClick={() => state.current?.fit(v)}>
            {v === "iso" ? "Isometric" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <button onClick={() => state.current?.fit()} title="Fit model (F)">
          Fit
        </button>
      </div>
      {error && (
        <div className="viewport-error" role="alert">
          {error}
        </div>
      )}
      <div className="view-hint">
        Drag to orbit · Scroll to zoom · Right-drag to pan
        <br />
        <span>Touch: one finger to orbit · two to zoom and pan</span>
      </div>
      {preview && <div className="preview-label">PREVIEW · Apply to keep</div>}
    </div>
  );
}
