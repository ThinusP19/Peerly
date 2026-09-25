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

/** A blank value in .env (e.g. `SMTP_HOST=`) counts as not set. */
const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

/** Settings that must be filled in before real email can be sent, per transport. */
const requiredFor = {
  smtp: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM_ADDRESS"],
  mailgun: ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAIL_FROM_ADDRESS"],
} as const;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    CORS_ORIGINS: z.string().default("http://127.0.0.1:7331,http://localhost:7331"),

    // IS-01 - the definitive domain list is still awaiting Sponsor confirmation.
    STUDENT_EMAIL_DOMAINS: z.string().default("mynwu.ac.za"),
    STAFF_EMAIL_DOMAINS: z.string().default("nwu.ac.za"),

    // SR-05
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_ABSOLUTE_MINUTES: z.coerce.number().int().positive().default(720),

    // FR-03, FR-06
    ACTIVATION_TOKEN_MINUTES: z.coerce.number().int().positive().default(1440),
    RECOVERY_TOKEN_MINUTES: z.coerce.number().int().positive().default(60),
    // Lifetime of the 6-digit code sent at registration.
    EMAIL_CODE_MINUTES: z.coerce.number().int().positive().default(10),

    // Base URL of the web app, for links inside emails.
    APP_URL: z.url().default("http://127.0.0.1:7331"),

    // CI-05. "log" prints emails to the console instead of sending them. It is
    // the default so the API runs without mail credentials. "smtp" sends through
    // any authenticated relay; "mailgun" sends through Mailgun's HTTP API.
    MAIL_TRANSPORT: z.enum(["log", "smtp", "mailgun"]).default("log"),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    MAIL_FROM_NAME: z.string().default("Peerly"),
    MAIL_FROM_ADDRESS: optional,
    MAIL_REPLY_TO: optional,
    // A Mailgun private or domain sending key, the sending domain (for example
    // mg.example.co.za) and the region the domain was created in, which decides
    // the API host. A key is only valid in its own region.
    MAILGUN_API_KEY: optional,
    MAILGUN_DOMAIN: optional,
    MAILGUN_REGION: z.enum(["eu", "us"]).default("eu"),

    // The password every seeded account shares (`npm run seed`). The default is
    // fine on a laptop and nowhere else: a seeded database reachable over the
    // network is 33 accounts behind one password that is published in this
    // repository. Any shared test deployment must set its own.
    SEED_PASSWORD: z.string().min(1).default("peerly-dev-password"),
  })
  .superRefine((value, ctx) => {
    // SR-14: the "log" transport prints activation links and verification codes
    // in full. That is exactly what makes it useful in development and exactly
    // what must never reach a production log, so the two are kept apart here
    // rather than by remembering to change it at deploy time.
    if (value.NODE_ENV === "production" && value.MAIL_TRANSPORT === "log") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message:
          'MAIL_TRANSPORT must be "smtp" or "mailgun" in production: the "log" transport writes tokens to the console.',
      });
    }

    if (value.MAIL_TRANSPORT === "log") return;
    for (const key of requiredFor[value.MAIL_TRANSPORT]) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when MAIL_TRANSPORT=${value.MAIL_TRANSPORT}`,
        });
      }
    }
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
  appUrl: raw.APP_URL,
  studentEmailDomains: csv(raw.STUDENT_EMAIL_DOMAINS),
  staffEmailDomains: csv(raw.STAFF_EMAIL_DOMAINS),
  session: {
    idleMinutes: raw.SESSION_IDLE_MINUTES,
    absoluteMinutes: raw.SESSION_ABSOLUTE_MINUTES,
  },
  tokens: {
    activationMinutes: raw.ACTIVATION_TOKEN_MINUTES,
    recoveryMinutes: raw.RECOVERY_TOKEN_MINUTES,
    emailCodeMinutes: raw.EMAIL_CODE_MINUTES,
  },
  mail: {
    transport: raw.MAIL_TRANSPORT,
    from: { name: raw.MAIL_FROM_NAME, address: raw.MAIL_FROM_ADDRESS },
    replyTo: raw.MAIL_REPLY_TO,
    smtp: {
      host: raw.SMTP_HOST,
      port: raw.SMTP_PORT,
      secure: raw.SMTP_SECURE === "true",
      user: raw.SMTP_USER,
      password: raw.SMTP_PASSWORD,
    },
    mailgun: {
      apiKey: raw.MAILGUN_API_KEY,
      domain: raw.MAILGUN_DOMAIN,
      region: raw.MAILGUN_REGION,
    },
  },
  seedPassword: raw.SEED_PASSWORD,
} as const;

export type Env = typeof env;
