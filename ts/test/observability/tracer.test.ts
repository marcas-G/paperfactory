import { describe, it, expect, beforeEach } from "vitest";
import { NoOpTracer } from "@observability/tracer";

describe("Tracer", () => {
  let tracer: NoOpTracer;

  beforeEach(() => {
    tracer = new NoOpTracer();
  });

  it("creates span", () => {
    const span = tracer.startSpan("test_operation");
    expect(span.name).toBe("test_operation");
    expect(span.traceId).toBeTruthy();
    expect(span.spanId).toBeTruthy();
    expect(span.status).toBe("OK");
  });

  it("ends span", () => {
    const span = tracer.startSpan("test");
    const ended = tracer.endSpan(span);
    expect(ended.endTime).toBeDefined();
    expect(ended.status).toBe("OK");
  });

  it("ends span with error status", () => {
    const span = tracer.startSpan("failing");
    const ended = tracer.endSpan(span, "ERROR");
    expect(ended.status).toBe("ERROR");
  });

  it("creates nested child span", () => {
    const parent = tracer.startSpan("parent");
    const child = tracer.createChildSpan(parent, "child");
    expect(child.parentId).toBe(parent.spanId);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.name).toBe("child");
  });

  it("gets all spans", () => {
    tracer.startSpan("span1");
    tracer.startSpan("span2");
    const spans = tracer.getSpans();
    expect(spans.length).toBe(2);
  });

  it("span has attributes", () => {
    const span = tracer.startSpan("op", {
      attributes: { key: "value", count: 42 },
    });
    expect(span.attributes.key).toBe("value");
    expect(span.attributes.count).toBe(42);
  });
});
