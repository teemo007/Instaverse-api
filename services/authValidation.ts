export interface PublicUser {
  _id: string;
  username: string;
  email: string;
}

interface PublicUserSource {
  _id: unknown;
  username: string;
  email: string;
}

export interface DuplicateEmail {
  email: string;
  count: number;
}

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const validatePassword = (value: unknown): string => {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw new TypeError("Password must contain between 12 and 128 characters.");
  }

  return value;
};

export const toPublicUser = (user: PublicUserSource): PublicUser => ({
  _id: String(user._id),
  username: user.username,
  email: user.email,
});

export const findDuplicateEmails = (
  emails: readonly string[],
): DuplicateEmail[] => {
  const counts = new Map<string, number>();

  for (const email of emails) {
    const normalized = normalizeEmail(email);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([email, count]) => ({ email, count }))
    .sort((left, right) => left.email.localeCompare(right.email));
};
import User from "../models/user.js";


export const findUserForPassword = (email: string) =>
  User.findOne({ email: normalizeEmail(email) }).select("+password");
