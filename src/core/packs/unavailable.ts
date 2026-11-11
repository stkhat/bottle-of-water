/**
 * The data of these packs is not on this device: still downloading, failed to
 * download, or stored in a format this code does not read. The background answers a
 * request that needs them with `{ ok: false, code: "packsUnavailable", packs }`, and
 * `send` (src/messaging/client.ts) throws this error again where the request was sent.
 */
export class PacksUnavailableError extends Error {
  readonly packs: string[];

  constructor(packs: readonly string[]) {
    super(`Language data not available: ${packs.join(", ")}`);
    this.name = "PacksUnavailableError";
    this.packs = [...packs];
  }
}

/**
 * `Promise.all`, except that it waits for every promise: when some fail only because
 * packs are not on the device, it fails with one `PacksUnavailableError` naming all of
 * those packs, so that one reply names everything a request waits for. Any other
 * failure is thrown as it is, first.
 */
export async function allOf<T extends readonly unknown[] | []>(
  promises: T,
): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  const results = await Promise.allSettled(promises);
  const reasons = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
  const other = reasons.find(
    (reason) => !(reason instanceof PacksUnavailableError),
  );
  if (other !== undefined) throw other;
  if (reasons.length > 0)
    throw new PacksUnavailableError([
      ...new Set(
        reasons.flatMap((reason) => (reason as PacksUnavailableError).packs),
      ),
    ]);
  return results.map(
    (result) => (result as PromiseFulfilledResult<unknown>).value,
  ) as { -readonly [P in keyof T]: Awaited<T[P]> };
}
