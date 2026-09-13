import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Everything the FSD calls configuration rather than a literal (OR-19) enters
 * here, and every secret comes from the environment rather than the repository
 * (SR-13). The process refuses to start on a bad value - a server running with
 * a silently defaulted session lifetime is worse than one that will not boot.
 */
const csv = (value: string) =>
  value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGINS: z.string().default("http://localhost:8080"),

  // IS-01 - the definitive domain list is still awaiting Sponsor confirmation.
  STUDENT_EMAIL_DOMAINS: z.string().default("mynwu.ac.za"),
  STAFF_EMAIL_DOMAINS: z.string().default("nwu.ac.za"),

  // SR-05
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_ABSOLUTE_MINUTES: z.coerce.number().int().positive().default(720),

  // FR-03, FR-06
  ACTIVATION_TOKEN_MINUTES: z.coerce.number().int().positive().default(1440),
  RECOVERY_TOKEN_MINUTES: z.coerce.number().int().positive().default(60),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid server configuration:\n${issues}`);
}

const raw = parsed.data;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === "production",
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  corsOrigins: csv(raw.CORS_ORIGINS),
  studentEmailDomains: csv(raw.STUDENT_EMAIL_DOMAINS),
  staffEmailDomains: csv(raw.STAFF_EMAIL_DOMAINS),
  session: {
    idleMinutes: raw.SESSION_IDLE_MINUTES,
    absoluteMinutes: raw.SESSION_ABSOLUTE_MINUTES,
  },
  tokens: {
    activationMinutes: raw.ACTIVATION_TOKEN_MINUTES,
    recoveryMinutes: raw.RECOVERY_TOKEN_MINUTES,
  },
} as const;

export type Env = typeof env;
