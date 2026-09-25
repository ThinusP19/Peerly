/**
 * pm2 process file for a server that runs Peerly under pm2 instead of systemd.
 *
 *   pm2 start ecosystem.config.cjs     first time
 *   pm2 reload ecosystem.config.cjs    after `git pull` and a rebuild
 *
 * The API reads everything else - including HOST and PORT - from server/.env.
 * The web app is configured here, because the built server reads only HOST and
 * PORT. Both must be on loopback, behind the reverse proxy.
 *
 * The API is one process in fork mode, never cluster: sign-in rate limits and
 * lock-outs are counted in memory, so a second process would double the
 * attempts a brute-force gets (see docs/handover/deployment.md section 7).
 */
module.exports = {
  apps: [
    {
      name: "peerly-api",
      cwd: `${__dirname}/server`,
      script: "src/index.ts",
      // pm2 would otherwise pick a TypeScript runner for a .ts file. Node strips
      // the types itself.
      interpreter: "node",
      node_args: "--experimental-strip-types",
      exec_mode: "fork",
      instances: 1,
      // Lets in-flight requests finish on a reload (index.ts drains for 10s).
      kill_timeout: 15000,
      env: { NODE_ENV: "production", DOTENV_CONFIG_QUIET: "true" },
    },
    {
      name: "peerly-web",
      cwd: __dirname,
      script: ".output/server/index.mjs",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      env: { NODE_ENV: "production", HOST: "127.0.0.1", PORT: "3310" },
    },
  ],
};
