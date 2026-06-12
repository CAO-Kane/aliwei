import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aliwei/domain", "@aliwei/ui"],
};

export default withAui(nextConfig);
