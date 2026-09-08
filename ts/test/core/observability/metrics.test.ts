import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryMetrics } from "@pf/core/observability/metrics";

describe("Metrics", () => {
  let metrics: InMemoryMetrics;

  beforeEach(() => {
    metrics = new InMemoryMetrics();
  });

  describe("Counter", () => {
    it("increments counter", () => {
      metrics.counter.inc("requests");
      const all = metrics.getMetrics();
      const counter = all.find((m) => m.name === "requests");
      expect(counter?.value).toBe(1);
    });

    it("increments with custom value", () => {
      metrics.counter.inc("bytes", 100);
      metrics.counter.inc("bytes", 50);
      const counter = metrics.getMetrics().find((m) => m.name === "bytes");
      expect(counter?.value).toBe(150);
    });
  });

  describe("Histogram", () => {
    it("observes values", () => {
      metrics.histogram.observe("latency", 100);
      metrics.histogram.observe("latency", 200);
      const all = metrics.getMetrics().filter((m) => m.name === "latency");
      expect(all.length).toBe(2);
      expect(all[0].value).toBe(100);
      expect(all[1].value).toBe(200);
    });
  });

  describe("Gauge", () => {
    it("sets value", () => {
      metrics.gauge.set("temperature", 36.6);
      const gauge = metrics.getMetrics().find((m) => m.name === "temperature");
      expect(gauge?.value).toBe(36.6);
    });

    it("increments gauge", () => {
      metrics.gauge.set("active", 0);
      metrics.gauge.inc("active", 1);
      const gauge = metrics.getMetrics().find((m) => m.name === "active");
      expect(gauge?.value).toBe(1);
    });

    it("decrements gauge", () => {
      metrics.gauge.set("active", 5);
      metrics.gauge.dec("active", 2);
      const gauge = metrics.getMetrics().find((m) => m.name === "active");
      expect(gauge?.value).toBe(3);
    });

    it("decrements gauge that does not exist creates negative", () => {
      metrics.gauge.dec("new_metric", 5);
      const gauge = metrics.getMetrics().find((m) => m.name === "new_metric");
      expect(gauge?.value).toBe(-5);
    });

    it("increments gauge that does not exist", () => {
      metrics.gauge.inc("new_inc", 10);
      const gauge = metrics.getMetrics().find((m) => m.name === "new_inc");
      expect(gauge?.value).toBe(10);
    });
  });

  it("gets all metrics", () => {
    metrics.counter.inc("requests");
    metrics.gauge.set("active", 3);
    expect(metrics.getMetrics().length).toBe(2);
  });
});
