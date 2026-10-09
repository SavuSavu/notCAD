import fs from "node:fs";
import path from "node:path";
const packages = [
  "react",
  "react-dom",
  "three",
  "replicad",
  "replicad-opencascadejs",
  "@salusoft89/planegcs",
  "fflate",
  "idb",
  "zod",
];
fs.mkdirSync("dist/licenses", { recursive: true });
for (const name of packages) {
  const dir = path.join("node_modules", name);
  const license = fs
    .readdirSync(dir)
    .find((file) => /^licen[cs]e(\.|$)/i.test(file));
  if (!license) throw new Error(`Missing installed license for ${name}`);
  fs.copyFileSync(
    path.join(dir, license),
    `dist/licenses/${name.replaceAll("/", "-")}.txt`,
  );
}
fs.copyFileSync(
  "THIRD_PARTY_NOTICES.md",
  "dist/licenses/THIRD_PARTY_NOTICES.md",
);
