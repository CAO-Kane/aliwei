import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aliwei/domain", "@aliwei/ui"],
};

// Pass rules: [] to disable Turbopack loader rules — no files in this app use
// "use generative", and the loader causes Turbopack panics in monorepo setups
// (Turbopack can't place the loader's emitted resource paths within the project
// filesystem root). Webpack rules for production builds are unaffected.
export default withAui(nextConfig, { rules: [] });
