/** Comparison tolerance in the units of the measured quantity (mm, mm², mm³).
 * Exact analytic checks never compare tessellated volume to B-rep precision.
 */
export function analyticTolerance(expected: number) {
  return Math.max(1e-7, Math.abs(expected) * 1e-8);
}
