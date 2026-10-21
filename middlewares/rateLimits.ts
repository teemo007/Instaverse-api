import { rateLimit } from "express-rate-limit";

const sharedOptions = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts. Please try again later.",
    code: "RATE_LIMITED",
  },
} as const;

export const authRateLimit = rateLimit({
  ...sharedOptions,
  limit: 20,
});

export const passwordRateLimit = rateLimit({
  ...sharedOptions,
  limit: 5,
});
