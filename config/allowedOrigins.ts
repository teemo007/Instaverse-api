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

export const getAllowedOrigins = (): string[] => {
  const configured = process.env.FRONTEND_ORIGIN?.trim();
  const origins = configured ? [normalizeOrigin(configured)] : [];

  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:5173");
  }

  return [...new Set(origins.filter((origin): origin is string => !!origin))];
};

export default getAllowedOrigins;
