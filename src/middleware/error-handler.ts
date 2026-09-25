import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export const errorHandler: ErrorHandler = (error, c) => {
  console.error(error);

  if (error instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: error.issues.map((issue) => issue.message).join(", ")
      },
      400
    );
  }

  if (error instanceof AppError) {
    return c.json(
      {
        success: false,
        error: error.error,
        message: error.message
      },
      error.statusCode as ContentfulStatusCode
    );
  }

  return c.json(
    {
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: process.env.NODE_ENV === "production" ? "Unexpected server error" : error.message
    },
    500
  );
};
