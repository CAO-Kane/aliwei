import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Importing this module is the very first side effect of the app.
// Both .env and .env.local are optional; whichever exists gets loaded.
// .env.local wins on key collisions (it's the typical "local override" file
// in Next.js / dotenv conventions).

for (const name of [".env", ".env.local"] as const) {
  const path = resolve(process.cwd(), name);
  if (existsSync(path)) {
    loadEnv({ path });
  }
}
