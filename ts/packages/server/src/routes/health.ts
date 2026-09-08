import * as fs from "fs";
import { Hono } from "hono";

export function createHealthRoutes(): Hono {
  const router = new Hono();

  router.get("/", (c) => {
    const html = fs.readFileSync("src/api/static/index.html", "utf8");
    return c.html(html);
  });

  router.get("/health", (c) =>
    c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  );

  return router;
}
