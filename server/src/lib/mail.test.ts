import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `env.ts` reads the environment once, at import, and `mail.ts` picks its
 * transport from it. So each case stubs the environment first and imports both
 * fresh. Every mail variable is stubbed - blank where it should be unset -
 * because dotenv fills in anything left undefined from a developer's own .env.
 */
const base = {
  NODE_ENV: "test",
  MAIL_TRANSPORT: "log",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  MAIL_FROM_ADDRESS: "",
  MAIL_REPLY_TO: "",
  MAILGUN_API_KEY: "",
  MAILGUN_DOMAIN: "",
  MAILGUN_REGION: "eu",
};

const mailgun = {
  ...base,
  MAIL_TRANSPORT: "mailgun",
  MAILGUN_API_KEY: "key-123",
  MAILGUN_DOMAIN: "mg.example.co.za",
  MAIL_FROM_ADDRESS: "noreply@mg.example.co.za",
};

async function load(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("./mail.ts");
}

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("../config/env.ts");
}

const message = { to: "student@mynwu.ac.za", subject: "Your code", text: "secret 123456" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mailgunRequest", () => {
  const settings = {
    apiKey: "key-123",
    domain: "mg.example.co.za",
    region: "eu" as const,
    from: { name: "Peerly", address: "noreply@mg.example.co.za" },
  };

  it("posts to the EU host for an EU domain, with basic auth as api:<key>", async () => {
    const { mailgunRequest } = await load(base);
    const { url, init } = mailgunRequest(message, settings);

    expect(url).toBe("https://api.eu.mailgun.net/v3/mg.example.co.za/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe(
      `Basic ${Buffer.from("api:key-123").toString("base64")}`,
    );
  });

  it("posts to the US host for a US domain", async () => {
    const { mailgunRequest } = await load(base);
    expect(mailgunRequest(message, { ...settings, region: "us" }).url).toBe(
      "https://api.mailgun.net/v3/mg.example.co.za/messages",
    );
  });

  it("sends the sender, recipient, subject and plain-text body", async () => {
    const { mailgunRequest } = await load(base);
    const body = mailgunRequest(message, settings).init.body;

    expect(body.get("from")).toBe("Peerly <noreply@mg.example.co.za>");
    expect(body.get("to")).toBe("student@mynwu.ac.za");
    expect(body.get("subject")).toBe("Your code");
    expect(body.get("text")).toBe("secret 123456");
    expect(body.has("h:Reply-To")).toBe(false);
  });

  it("adds a Reply-To header only when one is configured", async () => {
    const { mailgunRequest } = await load(base);
    const body = mailgunRequest(message, { ...settings, replyTo: "help@example.co.za" }).init.body;
    expect(body.get("h:Reply-To")).toBe("help@example.co.za");
  });
});

describe("send over the mailgun transport", () => {
  it("reports success when Mailgun accepts the message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"<1@mg>"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { send } = await load(mailgun);

    await expect(send(message)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.eu.mailgun.net/v3/mg.example.co.za/messages",
    );
  });

  it("returns false on a refusal, logging the reason but never the body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 401 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { send } = await load(mailgun);

    await expect(send(message)).resolves.toBe(false);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("Mailgun answered 401: Forbidden");
    expect(logged).not.toContain("123456");
  });

  it("returns false rather than throwing when Mailgun cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { send } = await load(mailgun);

    await expect(send(message)).resolves.toBe(false);
  });
});

describe("mail configuration", () => {
  it("refuses the log transport in production, because it prints tokens", async () => {
    await expect(loadEnv({ ...base, NODE_ENV: "production" })).rejects.toThrow(
      /MAIL_TRANSPORT must be "smtp" or "mailgun" in production/,
    );
  });

  it("accepts the mailgun transport in production", async () => {
    const { env } = await loadEnv({ ...mailgun, NODE_ENV: "production" });
    expect(env.mail.transport).toBe("mailgun");
    expect(env.mail.mailgun).toEqual({
      apiKey: "key-123",
      domain: "mg.example.co.za",
      region: "eu",
    });
  });

  it("names every missing Mailgun setting", async () => {
    const error = await loadEnv({ ...base, MAIL_TRANSPORT: "mailgun" }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    for (const key of ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAIL_FROM_ADDRESS"]) {
      expect((error as Error).message).toContain(`${key} is required when MAIL_TRANSPORT=mailgun`);
    }
  });

  it("still requires the SMTP settings for the smtp transport", async () => {
    await expect(loadEnv({ ...base, MAIL_TRANSPORT: "smtp" })).rejects.toThrow(
      /SMTP_PASSWORD is required when MAIL_TRANSPORT=smtp/,
    );
  });

  it("rejects an unknown Mailgun region", async () => {
    await expect(loadEnv({ ...mailgun, MAILGUN_REGION: "asia" })).rejects.toThrow(/MAILGUN_REGION/);
  });
});

describe("submission reminder (FR-18)", () => {
  it("gives the closing time in South African time, as the app shows it (OR-11)", async () => {
    const { submissionReminderMail } = await load(base);

    // 20:00 UTC is 22:00 in Johannesburg.
    const mail = submissionReminderMail(
      "41200345@mynwu.ac.za",
      "Lerato",
      "Phase 2",
      "CMPG323",
      "2026-09-28T20:00:00.000Z",
    );

    expect(mail.text).toContain("28 September 2026 at 22:00 (South African time)");
    expect(mail.text).not.toContain("GMT");
  });

  it("rolls the date over when South Africa is already past midnight", async () => {
    const { inSouthAfrica } = await load(base);

    expect(inSouthAfrica("2026-09-28T23:30:00.000Z")).toBe(
      "29 September 2026 at 01:30 (South African time)",
    );
  });
});
