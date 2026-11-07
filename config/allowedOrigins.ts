const normalizeOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Vite moves to the next free port (5174, 5175, ...) when 5173 is taken, so in
// development any loopback origin is accepted rather than one hard-coded port.
const isLoopbackOrigin = (origin: string): boolean => {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
};

export const getAllowedOrigins = (): string[] => {
  const configured = process.env.FRONTEND_ORIGIN?.trim();
  const origins = configured ? [normalizeOrigin(configured)] : [];

  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:5173");
  }

  return [...new Set(origins.filter((origin): origin is string => !!origin))];
};

export const isAllowedOrigin = (origin: string): boolean =>
  getAllowedOrigins().includes(origin) ||
  (process.env.NODE_ENV !== "production" && isLoopbackOrigin(origin));

export default getAllowedOrigins;
