import { createRequire } from "node:module";

// Resolves to the package root from both `src/` (tests) and `dist/` (published).
const pkg = createRequire(import.meta.url)("../package.json") as { version: string };

export const VERSION = pkg.version;
