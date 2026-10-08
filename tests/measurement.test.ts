import { expect, it } from "vitest";
import { formatMeasurement } from "../src/model/measurement";
it("keeps the standard precision for ordinary model measurements", () => {
  expect(formatMeasurement(26338.407105, 3)).toBe("26,338.407");
  expect(formatMeasurement(6000, 2)).toBe("6,000");
  expect(formatMeasurement(0, 3)).toBe("0");
});
it("preserves small nonzero volume and area measurements", () => {
  expect(formatMeasurement(1e-9, 3)).toBe("0.000000001");
  expect(formatMeasurement(6e-6, 2)).toBe("0.000006");
  expect(formatMeasurement(0.002, 2)).toBe("0.002");
});
