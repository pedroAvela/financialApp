export function isSameOrigin(origin: string | null, host: string | null, protocol: string) {
  if (!origin || !host || !["http:", "https:"].includes(protocol)) return false;
  try {
    const expected = new URL(`${protocol}//${host}`);
    return !expected.username && !expected.password && expected.pathname === "/" &&
      !expected.search && !expected.hash && origin === expected.origin;
  } catch { return false; }
}
