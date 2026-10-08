import { artifactDigest } from "./artifact-digest.mjs";
import { readFileSync } from "node:fs";
const parity = JSON.parse(
  readFileSync(new URL("../docs/parity.json", import.meta.url)),
);
const evidence = JSON.parse(
  readFileSync(new URL("../docs/release-evidence.json", import.meta.url)),
);
const reasons = [];
if (!parity.baselineFrozen || !parity.documentationAuditComplete)
  reasons.push("Official documentation/Free eligibility audit is unfinished");
if (!parity.rows.length) reasons.push("Parity matrix is empty");
const unfinished = parity.rows.filter(
  (row) =>
    row.status !== "complete" ||
    row.documentationReview !== "complete" ||
    !row.passingEvidence.length,
);
if (unfinished.length)
  reasons.push(
    `${unfinished.length}/${parity.rows.length} parity rows lack complete acceptance evidence`,
  );
for (const name of [
  "regressionsPassed",
  "independentExchangeReadersPassed",
  "noKnownDataLossDefects",
  "releaseReady",
])
  if (evidence[name] !== true) reasons.push(`${name} is unverified`);
for (const [browser, passed] of Object.entries(evidence.browserVerification))
  if (!passed) reasons.push(`${browser} release verification pending`);
for (const [device, check] of Object.entries(evidence.physicalDevices))
  if (
    !check.passed ||
    !check.device ||
    !check.osVersion ||
    !check.date ||
    !check.evidence
  )
    reasons.push(`${device} physical-device evidence missing`);
if (!/^[a-f0-9]{64}$/.test(evidence.artifactSha256 ?? ""))
  reasons.push("Tested release artifact digest missing");
if (evidence.artifactSha256) {
  try {
    if (artifactDigest() !== evidence.artifactSha256)
      reasons.push("Current artifact differs from the tested release artifact");
  } catch {
    reasons.push("Built release artifact is unavailable");
  }
}
if (reasons.length) {
  console.error(
    `Publication blocked:\n${reasons.map((reason) => `- ${reason}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  "Recorded parity gates passed. Revalidate evidence against the built artifact before enabling deployment.",
);
