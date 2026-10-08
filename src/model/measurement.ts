/** Preserve small nonzero measurements instead of rounding them to zero. */
export function formatMeasurement(value: number, fractionDigits: number) {
  return value.toLocaleString(
    "en",
    value !== 0 && Math.abs(value) < 10 ** -fractionDigits
      ? { maximumSignificantDigits: 4 }
      : { maximumFractionDigits: fractionDigits },
  );
}
