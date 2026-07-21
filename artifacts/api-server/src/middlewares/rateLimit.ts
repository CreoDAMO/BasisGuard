/**
 * Rate limiting — applied globally and per expensive endpoint.
 *
 * Uses express-rate-limit's in-memory store (sufficient for a single-process
 * deployment; swap to RedisStore when running multiple replicas).
 *
 * Limits are intentionally generous for authenticated API use and strict only
 * for the two routes with significant backend cost:
 *   - /transactions/classify  — runs the protocol registry + DB fan-out
 *   - /coinbase/sync, /kraken/sync, /gemini/sync — external API calls subject
 *     to the exchange's own rate limits
 */

import rateLimit from "express-rate-limit";

/** Global limit: 200 authenticated API requests per minute per IP. */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down and try again in a minute." },
  skip: (req) => req.path === "/healthz", // Health checks must never be rate-limited
});

/**
 * Strict limit for expensive classification + external-API routes.
 * 10 requests per minute per IP.
 */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error:
      "Rate limit exceeded for this endpoint. " +
      "This route calls external APIs or performs heavy classification work — " +
      "please wait before retrying.",
  },
});
