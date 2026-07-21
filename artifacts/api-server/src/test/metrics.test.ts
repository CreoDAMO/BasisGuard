/**
 * metrics.test.ts
 *
 * Tests for the in-process Metrics class and metricsMiddleware.
 * These are pure unit tests — no HTTP server or DB needed.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { metrics, type MetricsSnapshot } from "../core/metrics.js";

// Reset singleton state before each test so tests don't bleed into each other.
// The Metrics class exposes reset() for exactly this purpose.
beforeEach(() => {
  metrics.reset();
});

// ── increment ─────────────────────────────────────────────────────────────────

describe("Metrics.increment", () => {
  it("starts counters at 0 before any increment", () => {
    const snap = metrics.snapshot();
    expect(snap.counters["my.counter"]).toBeUndefined();
  });

  it("increments a counter by 1 by default", () => {
    metrics.increment("my.counter");
    expect(metrics.snapshot().counters["my.counter"]).toBe(1);
  });

  it("increments by a custom amount", () => {
    metrics.increment("my.counter", 5);
    expect(metrics.snapshot().counters["my.counter"]).toBe(5);
  });

  it("accumulates across multiple calls", () => {
    metrics.increment("http.requests.total");
    metrics.increment("http.requests.total");
    metrics.increment("http.requests.total", 3);
    expect(metrics.snapshot().counters["http.requests.total"]).toBe(5);
  });

  it("tracks independent counters independently", () => {
    metrics.increment("a");
    metrics.increment("b");
    metrics.increment("b");
    const snap = metrics.snapshot();
    expect(snap.counters["a"]).toBe(1);
    expect(snap.counters["b"]).toBe(2);
  });
});

// ── timing ────────────────────────────────────────────────────────────────────

describe("Metrics.timing", () => {
  it("records a single sample correctly", () => {
    metrics.timing("api.latency_ms", 42);
    const snap = metrics.snapshot();
    expect(snap.timings["api.latency_ms"]).toEqual({
      count: 1,
      total_ms: 42,
      avg_ms: 42,
      max_ms: 42,
    });
  });

  it("accumulates multiple samples and computes avg + max", () => {
    metrics.timing("api.latency_ms", 10);
    metrics.timing("api.latency_ms", 30);
    metrics.timing("api.latency_ms", 20);
    const t = metrics.snapshot().timings["api.latency_ms"]!;
    expect(t.count).toBe(3);
    expect(t.total_ms).toBe(60);
    expect(t.avg_ms).toBe(20);
    expect(t.max_ms).toBe(30);
  });

  it("tracks max correctly across many samples", () => {
    for (let i = 1; i <= 10; i++) metrics.timing("x", i * 10);
    expect(metrics.snapshot().timings["x"]!.max_ms).toBe(100);
  });

  it("independent timing keys do not interfere", () => {
    metrics.timing("fast", 5);
    metrics.timing("slow", 500);
    const snap = metrics.snapshot();
    expect(snap.timings["fast"]!.avg_ms).toBe(5);
    expect(snap.timings["slow"]!.avg_ms).toBe(500);
  });
});

// ── snapshot ──────────────────────────────────────────────────────────────────

describe("Metrics.snapshot", () => {
  it("returns a snapshot with the required top-level keys", () => {
    const snap = metrics.snapshot();
    expect(snap).toHaveProperty("uptime_seconds");
    expect(snap).toHaveProperty("counters");
    expect(snap).toHaveProperty("timings");
    expect(snap).toHaveProperty("generated_at");
  });

  it("uptime_seconds is a non-negative number", () => {
    const { uptime_seconds } = metrics.snapshot();
    expect(typeof uptime_seconds).toBe("number");
    expect(uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("generated_at is an ISO 8601 timestamp", () => {
    const { generated_at } = metrics.snapshot();
    expect(generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(generated_at).getTime()).not.toBeNaN();
  });

  it("counters is an object (plain, not a Map)", () => {
    metrics.increment("test");
    const snap = metrics.snapshot();
    expect(snap.counters).not.toBeInstanceOf(Map);
    expect(typeof snap.counters).toBe("object");
  });

  it("timings is an object (plain, not a Map)", () => {
    metrics.timing("test", 1);
    const snap = metrics.snapshot();
    expect(snap.timings).not.toBeInstanceOf(Map);
    expect(typeof snap.timings).toBe("object");
  });

  it("snapshot after reset has empty counters and timings", () => {
    metrics.increment("x");
    metrics.timing("y", 100);
    metrics.reset();
    const snap = metrics.snapshot();
    expect(Object.keys(snap.counters)).toHaveLength(0);
    expect(Object.keys(snap.timings)).toHaveLength(0);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe("Metrics.reset", () => {
  it("clears all counters", () => {
    metrics.increment("a");
    metrics.increment("b", 10);
    metrics.reset();
    const snap = metrics.snapshot();
    expect(snap.counters["a"]).toBeUndefined();
    expect(snap.counters["b"]).toBeUndefined();
  });

  it("clears all timings", () => {
    metrics.timing("latency", 500);
    metrics.reset();
    expect(metrics.snapshot().timings["latency"]).toBeUndefined();
  });

  it("new increments after reset start from 0 again", () => {
    metrics.increment("counter", 99);
    metrics.reset();
    metrics.increment("counter");
    expect(metrics.snapshot().counters["counter"]).toBe(1);
  });
});

// ── MetricsSnapshot type contract ─────────────────────────────────────────────

describe("MetricsSnapshot shape contract (GET /api/metrics response)", () => {
  it("timing entries have exactly the four expected keys", () => {
    metrics.timing("resp_ms", 123);
    const entry = metrics.snapshot().timings["resp_ms"]!;
    expect(Object.keys(entry).sort()).toEqual(
      ["avg_ms", "count", "max_ms", "total_ms"].sort(),
    );
  });

  it("counter values are always numbers", () => {
    metrics.increment("req.total", 7);
    const snap = metrics.snapshot();
    for (const [, v] of Object.entries(snap.counters)) {
      expect(typeof v).toBe("number");
    }
  });
});

// ── HTTP-layer tests (todo — requires Clerk + DB mocks) ───────────────────────

describe("GET /api/metrics HTTP-layer (blocked on Clerk/DB mocking)", () => {
  it.todo("returns 200 with MetricsSnapshot shape for super_admin role");
  it.todo("returns 403 for reviewer role");
  it.todo("returns 403 for cpa_partner role");
  it.todo("returns 401 for unauthenticated request");
  it.todo("uptime_seconds increases between two calls");
  it.todo("http.requests.total counter increments after each request through the app");
});
