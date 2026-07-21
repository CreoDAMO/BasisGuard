/**
 * Simple in-process metrics counters.
 *
 * Intentionally lightweight — no external dependencies, no file I/O.
 * Counters reset on process restart. For a persistent solution, swap the
 * in-memory store for a Prometheus push-gateway or a timeseries DB.
 *
 * Usage:
 *   import { metrics } from "./metrics.js";
 *   metrics.increment("positions.created");
 *   metrics.timing("classify.duration_ms", elapsed);
 */

export interface MetricsSnapshot {
  uptime_seconds: number;
  counters: Record<string, number>;
  timings: Record<string, { count: number; total_ms: number; avg_ms: number; max_ms: number }>;
  generated_at: string;
}

class Metrics {
  private startTime = Date.now();
  private counters: Map<string, number> = new Map();
  private timings: Map<string, { count: number; total: number; max: number }> = new Map();

  /** Increment a named counter by `amount` (default 1). */
  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  /** Record a duration sample (milliseconds) under `name`. */
  timing(name: string, durationMs: number): void {
    const existing = this.timings.get(name);
    if (!existing) {
      this.timings.set(name, { count: 1, total: durationMs, max: durationMs });
    } else {
      existing.count++;
      existing.total += durationMs;
      existing.max = Math.max(existing.max, durationMs);
    }
  }

  /** Snapshot all counters and timing aggregates. */
  snapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;

    const timings: Record<string, { count: number; total_ms: number; avg_ms: number; max_ms: number }> = {};
    for (const [k, v] of this.timings) {
      timings[k] = {
        count: v.count,
        total_ms: Math.round(v.total),
        avg_ms: Math.round(v.total / v.count),
        max_ms: Math.round(v.max),
      };
    }

    return {
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      counters,
      timings,
      generated_at: new Date().toISOString(),
    };
  }

  /** Reset all counters and timings (for testing). */
  reset(): void {
    this.counters.clear();
    this.timings.clear();
  }
}

/** Singleton instance shared across the process. */
export const metrics = new Metrics();

/**
 * Express middleware that records request counts and durations per route.
 * Mount after the pino-http logger.
 */
import type { Request, Response, NextFunction } from "express";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const route = req.path.split("/").slice(0, 3).join("/") || "/"; // e.g. /api/positions
    const status = res.statusCode;
    metrics.increment(`http.requests.total`);
    metrics.increment(`http.requests.${status >= 500 ? "5xx" : status >= 400 ? "4xx" : "2xx"}`);
    metrics.increment(`http.route.${req.method.toLowerCase()}.${route.replace(/\//g, "_")}`);
    metrics.timing("http.response_time_ms", Date.now() - start);
  });
  next();
}
