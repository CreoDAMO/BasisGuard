---
name: Clerk auth setup
description: How Clerk auth is wired in BasisGuard — JIT user provisioning, route protection pattern, health exclusion
---

## Setup
- Replit-managed Clerk (setupClerkWhitelabelAuth provisioned keys automatically)
- clerkProxyMiddleware + clerkMiddleware mounted in app.ts BEFORE body parsers
- requireAuth in middlewares/auth.ts: verifies Clerk session via getAuth(req), JIT-provisions users row on first hit, attaches req.user

## Route protection pattern
```typescript
router.use(healthRouter);    // /healthz stays public
router.use(requireAuth);     // all subsequent routes require valid Clerk session
```
Admin routes (approve/reject submissions, signoff positions) additionally use requireRole(ADMIN_ROLES).

## Roles
- super_admin | reviewer | cpa_partner (default on JIT provision)
- ADMIN_ROLES = ["super_admin", "reviewer"]
- Role is stored in local users table, not in Clerk metadata

## JIT provisioning
On first authenticated request, requireAuth checks users table by clerk_id. If not found, inserts with role="cpa_partner". Email/displayName from sessionClaims.

## Health endpoint
Health route is GET /healthz (not /health). Mounted before requireAuth in routes/index.ts so it stays public. Other non-existent paths correctly return 401 (requireAuth runs before the 404 fallback).

## Frontend
- App.tsx wraps everything in ClerkProvider with dark theme appearance matching app palette (#0a0a0a bg, #e6e6e6 fg)
- publishableKeyFromHost from @clerk/react/internal (NOT the raw env var directly)
- proxyUrl = import.meta.env.VITE_CLERK_PROXY_URL (empty in dev — intentional, do not gate on NODE_ENV)
- Sign-in/sign-up: routing="path", full window.location-based path including basePath
- Route wildcards must be exactly /sign-in/*? and /sign-up/*? for Clerk OAuth sub-paths
- useCurrentUser() hook in hooks/use-current-user.ts fetches /api/me for role display in sidebar
- Sidebar footer shows email, role label, and sign-out button (useClerk().signOut)

**Why:** The plain text submittedBy/reviewedBy fields in the original schema were unverifiable. The users table + JIT provisioning ties those fields to a real Clerk identity.
