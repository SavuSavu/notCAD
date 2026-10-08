import { expect, it } from "vitest";
import * as THREE from "three";
import { fit } from "../src/Viewport";
for (const aspect of [0.35, 1, 2])
  for (const size of [0.01, 1000]) {
    it(`fits a ${size} mm part in a viewport with aspect ${aspect}`, () => {
      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry(size, size / 2, size / 3),
        material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(10000, -5000, 100);
      group.add(mesh);
      const camera = new THREE.PerspectiveCamera(38, aspect, 0.05, 100000);
      camera.up.set(0, 0, 1);
      const controls = {
        target: new THREE.Vector3(),
        update: () => {
          camera.lookAt(controls.target);
          camera.updateMatrixWorld();
          return false;
        },
      };
      try {
        fit({ group, camera, controls });
        const box = new THREE.Box3().setFromObject(group),
          projected: THREE.Vector3[] = [];
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z])
              projected.push(new THREE.Vector3(x, y, z).project(camera));
        for (const point of projected) {
          expect(Math.abs(point.x)).toBeLessThan(0.99);
          expect(Math.abs(point.y)).toBeLessThan(0.99);
          expect(point.z).toBeGreaterThan(-1);
          expect(point.z).toBeLessThan(1);
        }
        expect(
          Math.max(
            ...projected.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))),
          ),
        ).toBeGreaterThan(0.1);
      } finally {
        geometry.dispose();
        material.dispose();
      }
    });
  }
