/**
 * A served byte count, in the unit that keeps its digits meaningful.
 *
 * A fixed unit lies at both ends: dividing every payload by a megabyte renders
 * a real 4 KB call as "0.0 MB", which tells the reader a measured value is
 * zero — the exact defect the honest-absence rules exist to prevent, and worse
 * here because the number *was* served. So the unit adapts: bytes stay bytes,
 * and each step up happens only once the value fills it.
 *
 * Decimal units (KB = 1,000 B), because the payload sizes this renders are
 * transfer measurements and that is how the rest of the row's tooling — HTTP
 * headers, load balancers — counts them.
 *
 * One decimal below ten, none above: `4.2 KB` and `47 KB` are each as precise
 * as a reader can use, and `47.3` invites comparing a digit that is noise.
 *
 * Returns `undefined` for anything that is not a finite non-negative number,
 * so an unmeasured payload stays "not measured" in the caller's words rather
 * than becoming a zero here.
 */
export function bytesText(bytes: unknown): string | undefined {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return undefined;

  if (bytes < 1_000) return `${Math.round(bytes)} B`;

  const kilobyte = { size: 1_000, label: 'KB' } as const;
  const larger = [
    { size: 1_000_000_000_000, label: 'TB' },
    { size: 1_000_000_000, label: 'GB' },
    { size: 1_000_000, label: 'MB' },
  ] as const;
  const unit = larger.find((u) => bytes >= u.size) ?? kilobyte;
  const value = bytes / unit.size;
  const text = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: value < 10 ? 1 : 0,
  });
  return `${text} ${unit.label}`;
}
