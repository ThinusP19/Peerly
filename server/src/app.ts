import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { env } from "./config/env.ts";
import { pool } from "./db/pool.ts";
import { errorHandler, notFoundHandler } from "./middleware/errors.ts";

export function createApp() {
  const app = express();

  // Behind the university proxy (CI-09), so the client IP used for rate limiting
  // comes from the forwarded header rather than the proxy's own address.
  app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(helmet());

  // CI-06: only the registered front-end origins may call the API. Credentials
  // are on, because the session travels in a cookie (CI-08).
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin.toLowerCase())) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin ${origin} is not allowed to call this API.`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // A broad ceiling so a single client cannot flood the API. The tighter
  // per-account limits CI-07 requires sit on the auth routes themselves.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: { code: "rate_limited", message: "Too many requests. Please slow down." } },
    }),
  );

  app.get("/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", database: "up" });
    } catch {
      // Report the dependency honestly rather than claiming health.
      res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
