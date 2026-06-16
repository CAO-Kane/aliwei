import { config as loadEnv } from "dotenv";

// Importing this module is the very first side effect of the app.
// Both .env and .env.local are optional; whichever exists gets loaded.
// .env.local wins on key collisions (it's the typical "local override" file
// in Next.js / dotenv conventions). override: true is required so the later
// file in `path` overwrites keys loaded by the earlier one.

loadEnv({
  path: [".env", ".env.local"],
  override: true,
});
