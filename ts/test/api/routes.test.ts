import { describe, it, expect } from "vitest";
import { APIRouter, APIRequest } from "@api/routes";

describe("API Router", () => {
  it("handles GET route", () => {
    const router = new APIRouter();
    router.get("/items", (_req: APIRequest) => ({ status: 200, body: { items: [] } }));
    const response = router.handle("GET", "/items", {});
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it("handles POST route", () => {
    const router = new APIRouter();
    router.post("/items", (_req: APIRequest) => ({
      status: 201,
      body: { created: true, data: _req.body },
    }));
    const response = router.handle("POST", "/items", { body: { name: "test" } });
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({ name: "test" });
  });

  it("returns 404 for unknown route", () => {
    const router = new APIRouter();
    const response = router.handle("GET", "/unknown", {});
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Not found");
  });
});
