/** Keep provider fan-out below a fixed concurrency ceiling. */
export async function mapInBatches<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  batchSize = 5,
): Promise<R[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError('batchSize must be a positive integer');
  }

  const results: R[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = await Promise.all(
      items.slice(start, start + batchSize).map(worker),
    );
    results.push(...batch);
  }
  return results;
}
