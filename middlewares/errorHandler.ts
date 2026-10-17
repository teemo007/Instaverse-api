import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface ExposableHttpError extends Error {
  expose: true;
  status: number;
}

const isExposableHttpError = (error: unknown): error is ExposableHttpError =>
  error instanceof Error &&
  (error as Partial<ExposableHttpError>).expose === true &&
  Number.isInteger((error as Partial<ExposableHttpError>).status) &&
  (error as Partial<ExposableHttpError>).status! >= 400 &&
  (error as Partial<ExposableHttpError>).status! < 500 &&
  error.message.trim().length > 0;

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    message: `Route ${req.method} ${req.originalUrl} was not found.`,
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status =
    error instanceof HttpError || isExposableHttpError(error)
      ? error.status
      : 500;
  const message =
    error instanceof HttpError || isExposableHttpError(error)
      ? error.message
      : "Something went wrong.";

  res.status(status).json({ message });
};
