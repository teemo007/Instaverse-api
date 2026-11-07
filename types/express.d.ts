export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      authSession?: {
        token: string;
        csrfToken: string;
        expiresAt: Date;
      };
    }
  }
}
