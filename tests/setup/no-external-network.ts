import { afterAll } from "vitest";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  if (
    hostname !== "localhost" &&
    hostname !== "::1" &&
    !hostname.startsWith("127.")
  ) {
    throw new Error(
      `Tests forbid external network requests; blocked ${url.origin}.`
    );
  }
  return originalFetch(input, init);
};

afterAll(() => {
  globalThis.fetch = originalFetch;
});
