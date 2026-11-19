import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingIncludes: { "/install.sh": ["./installer/install.sh"] },
};

export default config;
