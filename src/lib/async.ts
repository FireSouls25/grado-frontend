// Concurrencia acotada con semántica allSettled: nunca rechaza y conserva
// el orden de entrada, para que el índice siga alineado con el item.
// Evita el thundering herd de N reportes a la vez en el panel y el listado.
export async function mapSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(limit, 1), Math.max(items.length, 1)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        try {
          results[i] = { status: 'fulfilled', value: await fn(items[i]) };
        } catch (reason) {
          results[i] = { status: 'rejected', reason };
        }
      }
    }
  );
  await Promise.all(workers);
  return results;
}
