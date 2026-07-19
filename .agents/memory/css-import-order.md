---
name: CSS @import order in Vite/Tailwind
description: Google Fonts @import url() must come before @import 'tailwindcss' or PostCSS throws
---

**Rule:** In `index.css`, place `@import url('https://fonts.googleapis.com/...')` as the **first** line, before `@import 'tailwindcss'` and `@import 'tw-animate-css'`.

**Why:** CSS spec requires all `@import` statements to precede other at-rules. PostCSS enforces this strictly and throws `@import must precede all other statements` if the Google Fonts import comes after the Tailwind import.

**How to apply:** Every time index.css is written or edited, ensure the order is: Google Fonts → tailwindcss → tw-animate-css → @plugin → @custom-variant → @theme.
