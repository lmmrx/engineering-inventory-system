import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not catch rejected promises thrown from async route handlers —
 * an unhandled rejection there crashes the whole process instead of producing
 * an HTTP error response. Wrap every async handler with this so errors reach
 * the error-handling middleware instead.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
