import { NotFoundHandler, ErrorHandler } from "hono";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err.name === "NotFoundError")
    return c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
  console.error(err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
};

export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }, 404);
};
