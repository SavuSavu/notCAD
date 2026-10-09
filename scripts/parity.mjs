import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrix = JSON.parse(
  fs.readFileSync(path.join(root, "docs/parity.json"), "utf8"),
);
const gates = JSON.parse(
  fs.readFileSync(path.join(root, "docs/release-gates.json"), "utf8"),
);
const ids = new Set(),
  errors = [];
for (const row of matrix.rows) {
  if (ids.has(row.id)) errors.push(`Duplicate row ${row.id}`);
  ids.add(row.id);
  if (
    !row.source?.startsWith("https://") ||
    !row.modes?.length ||
    !row.example ||
    !row.acceptance?.length ||
    !row.fixture
  )
    errors.push(`Incomplete row ${row.id}`);
  if (!["not-started", "partial", "verified"].includes(row.status))
    errors.push(`Unknown status ${row.id}`);
  for (const file of row.evidence)
    if (!fs.existsSync(path.join(root, file)))
      errors.push(`Missing evidence ${file}`);
  if (
    row.status === "verified" &&
    (row.modeAudit !== "complete" || !row.evidence.length)
  )
    errors.push(`Unsubstantiated verification ${row.id}`);
}
const counts = Object.fromEntries(
  ["not-started", "partial", "verified"].map((status) => [
    status,
    matrix.rows.filter((r) => r.status === status).length,
  ]),
);
console.log(
  `Baseline: ${matrix.baselineDate}. ${matrix.rows.length} capability rows. ${JSON.stringify(counts)}`,
);
if (process.argv.includes("--release")) {
  if (!matrix.inventoryComplete)
    errors.push(
      "Official documentation inventory and per-mode audit are incomplete.",
    );
  const incomplete = matrix.rows.filter((r) => r.status !== "verified");
  if (incomplete.length)
    errors.push(`${incomplete.length} capability rows are not fully verified.`);
  for (const [name, gate] of Object.entries(gates.gates)) {
    if (gate.status !== "passed" || !gate.evidence?.length)
      errors.push(`Release gate ${name} has no passing evidence.`);
    for (const file of gate.evidence ?? [])
      if (!fs.existsSync(path.join(root, file)))
        errors.push(`Missing release evidence: ${file}`);
  }
  if (!gates.artifactSha256 || !gates.sourceRevision)
    errors.push(
      "No tested artifact digest and source revision have been attested.",
    );
  if (gates.knownDataLossDefects !== 0)
    errors.push("Data-loss defect review is incomplete.");
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    process.argv.includes("--release")
      ? "Release evidence checks passed. Deployment must test and use this exact artifact."
      : "Inventory structure is valid. This is not a parity or release pass.",
  );
