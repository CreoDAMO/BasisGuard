---
name: Replit workflow port injection
description: Imported artifact workflow definitions may not be registered automatically; manually configured workflows need to export each service's PORT.
---

For imported projects, artifact TOML can exist on disk while the live Replit workflow registry is empty. When registering equivalent development workflows manually, export the service's expected `PORT` in the command; otherwise Vite may fall back to 3000 and API servers that require `PORT` will exit.

**Why:** The imported BasisGuard services were present but unregistered, and the first manually configured starts failed because the workflow runner did not inject the artifact TOML environment.

**How to apply:** Check the live workflow registry before restarting imported services. Prefer managed artifact workflows when registered; otherwise preserve the ports declared by the imported artifact definitions in manually configured workflow commands.