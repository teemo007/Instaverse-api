import { OAuth2Client } from "google-auth-library";

import { normalizeEmail } from "./authValidation.js";

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string;
  emailVerified: true;
}

export class GoogleIdentityError extends Error {
  readonly code = "INVALID_GOOGLE_CREDENTIAL";

  constructor() {
    super("The Google credential could not be verified.");
    this.name = "GoogleIdentityError";
  }
}

const googleClient = new OAuth2Client();

export const verifyGoogleCredential = async (
  credential: string,
): Promise<GoogleIdentity> => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is required for Google sign-in.");
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
  } catch {
    throw new GoogleIdentityError();
  }

  const payload = ticket.getPayload();
  const subject = payload?.sub?.trim();
  const email = payload?.email ? normalizeEmail(payload.email) : "";

  if (!subject || !email || !email.includes("@") || payload?.email_verified !== true) {
    throw new GoogleIdentityError();
  }

  const name = payload.name?.trim() || email.split("@", 1)[0] || "Google user";
  return {
    subject,
    email,
    name,
    emailVerified: true,
  };
};
