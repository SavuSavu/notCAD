import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelResult } from "./kernel/protocol";
import type { Document, Sketch } from "./model/document";
import { pointOnPlane } from "./kernel/engine";
interface Props {
  model: ModelResult;
  doc: Document;
  selected: string | null;
  onSelect(id: string): void;
  view: number;
}
export function Viewport({ model, doc, selected, onSelect, view }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
    fitted: boolean;
    documentId: string | null;
  } | null>(null);
  useEffect(() => {
    const element = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("3D viewing requires WebGL. Project files remain downloadable.");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100000);
    camera.up.set(0, 0, 1);
    camera.position.set(120, 160, 130);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(20, 20, 10);
    controls.enableDamping = true;
    const ambient = new THREE.HemisphereLight(0xeef8ff, 0x60707a, 2.6);
    scene.add(ambient);
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(80, -100, 150);
    scene.add(light);
    const grid = new THREE.GridHelper(400, 40, 0xadbfc9, 0xdce5e9);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    const axes = new THREE.AxesHelper(20);
    scene.add(axes);
    const group = new THREE.Group();
    scene.add(group);
    state.current = {
      renderer,
      scene,
      camera,
      controls,
      group,
      fitted: false,
      documentId: null,
    };
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
    let start: [number, number] = [0, 0];
    const down = (event: PointerEvent) => {
      start = [event.clientX, event.clientY];
    };
    const up = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5)
        return;
      const box = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - box.left) / box.width) * 2 - 1,
          (-(event.clientY - box.top) / box.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray
        .intersectObjects(group.children)
        .find((h) => h.object instanceof THREE.Mesh);
      if (hit) selectRef.current(hit.object.userData.id);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments ||
          object instanceof THREE.LineLoop
        ) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.documentId !== doc.id) {
      s.documentId = doc.id;
      s.fitted = false;
    }
    for (const child of [...s.group.children]) {
      s.group.remove(child);
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.LineSegments ||
        child instanceof THREE.LineLoop
      ) {
        child.geometry.dispose();
        for (const material of Array.isArray(child.material)
          ? child.material
          : [child.material])
          material.dispose();
      }
    }
    for (const part of model.parts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(part.mesh.positions, 3),
      );
      geometry.setIndex(part.mesh.indices);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: part.id === selected ? 0x3a9b99 : 0xa4c6d5,
          metalness: 0.12,
          roughness: 0.43,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
      );
      mesh.userData.id = part.id;
      s.group.add(mesh);
      s.group.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry, 25),
          new THREE.LineBasicMaterial({
            color: part.id === selected ? 0x147875 : 0x395b6a,
          }),
        ),
      );
    }
    const sketches = doc.features
      .slice(0, doc.rollback ?? doc.features.length)
      .filter(
        (f): f is Sketch =>
          f.type === "sketch" &&
          !f.suppressed &&
          (f.id === selected || model.parts.length === 0),
      );
    for (const sketch of sketches) {
      const p = sketch.profile;
      const points =
        p.kind === "rectangle"
          ? [
              [p.x, p.y],
              [p.x + p.width, p.y],
              [p.x + p.width, p.y + p.height],
              [p.x, p.y + p.height],
            ]
          : Array.from({ length: 96 }, (_, i) => [
              p.x + p.radius * Math.cos((i / 96) * 2 * Math.PI),
              p.y + p.radius * Math.sin((i / 96) * 2 * Math.PI),
            ]);
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map(
          ([u, v]) =>
            new THREE.Vector3(
              ...pointOnPlane(sketch.plane, u, v, sketch.offset),
            ),
        ),
      );
      s.group.add(
        new THREE.LineLoop(
          geometry,
          new THREE.LineBasicMaterial({ color: 0xf08b40, depthTest: false }),
        ),
      );
    }
    if (!s.fitted && s.group.children.length) {
      fit(s);
      s.fitted = true;
    }
  }, [model, doc, selected]);
  useEffect(() => {
    if (state.current) fit(state.current);
  }, [view]);
  return (
    <div className="viewport" ref={ref} aria-label="3D model viewport">
      {error && <p role="alert">{error}</p>}
      <div className="viewport-label">
        PART STUDIO <span>01</span>
      </div>
      <div className="viewport-hint">
        Drag to orbit · Scroll or pinch to zoom · Tap a part to select
      </div>
    </div>
  );
}
export function fit(s: {
  group: THREE.Group;
  camera: THREE.PerspectiveCamera;
  controls: Pick<OrbitControls, "target" | "update">;
}) {
  const box = new THREE.Box3().setFromObject(s.group);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6);
  const halfVerticalFov = THREE.MathUtils.degToRad(s.camera.fov / 2);
  const halfHorizontalFov = Math.atan(
    Math.tan(halfVerticalFov) * s.camera.aspect,
  );
  const distance =
    (radius / Math.sin(Math.min(halfVerticalFov, halfHorizontalFov))) * 1.15;
  s.controls.target.copy(center);
  s.camera.position
    .copy(center)
    .add(new THREE.Vector3(1, 1.4, 1.1).normalize().multiplyScalar(distance));
  s.camera.near = Math.max(distance / 10000, 1e-8);
  s.camera.far = Math.max(distance * 100, 100);
  s.camera.updateProjectionMatrix();
  s.controls.update();
}
