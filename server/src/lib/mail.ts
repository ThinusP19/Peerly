import { env } from "../config/env.ts";

/**
 * Outbound e-mail (CI-05, SI-05).
 *
 * Two rules shape this module:
 *
 *   OR-03  A mail failure must not stop anyone signing in, evaluating,
 *          calculating or exporting. So `send` never throws. It reports the
 *          failure and returns false, and callers carry on.
 *   CI-05  Dispatch is asynchronous. `queue` hands the message off and returns
 *          immediately, so no request waits on an SMTP or HTTP round trip.
 *
 * The consequence of OR-03 is worth stating plainly: a student can be left
 * without their verification code and the request that triggered it will still
 * report success. That is the correct trade - the alternative is a registration
 * that fails outright because a mail server blinked - and it is why every flow
 * that sends a code also offers a resend.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

type Transport = (mail: Mail) => Promise<void>;

/**
 * Development transport: prints the message instead of sending it, so the API
 * runs with no SMTP credentials at all.
 *
 * This prints activation links and verification codes in full, which SR-14
 * forbids in a real log. `env.ts` refuses to start a production server on this
 * transport, so the two never meet.
 */
const logTransport: Transport = async (mail) => {
  console.log(
    [
      "",
      "--- mail ---",
      `to:      ${mail.to}`,
      `subject: ${mail.subject}`,
      "",
      mail.text,
      "--- end ---",
      "",
    ].join("\n"),
  );
};

/**
 * SMTP transport.
 *
 * nodemailer is imported dynamically rather than at module load, so a
 * development server running on the "log" transport never pays for it.
 *
 * Any authenticated SMTP relay works, including Mailgun - see
 * `docs/handover/deployment.md` for the settings. Nothing here is specific to
 * a provider, and switching between them is four environment variables.
 */
const smtpTransport: Transport = async (mail) => {
  const { createTransport } = await import("nodemailer");
  const transporter = createTransport({
    host: env.mail.smtp.host,
    port: env.mail.smtp.port,
    secure: env.mail.smtp.secure,
    auth: { user: env.mail.smtp.user!, pass: env.mail.smtp.password! },
  });

  await transporter.sendMail({
    from: { name: env.mail.from.name, address: env.mail.from.address! },
    replyTo: env.mail.replyTo,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
};

/** The API host for each Mailgun region. A domain and its keys live in one. */
const mailgunHosts = { eu: "https://api.eu.mailgun.net", us: "https://api.mailgun.net" } as const;

export interface MailgunSettings {
  apiKey: string;
  domain: string;
  region: keyof typeof mailgunHosts;
  from: { name: string; address: string };
  replyTo?: string | undefined;
}

/**
 * Builds the Mailgun "send a message" request. Kept apart from the fetch so the
 * exact request - URL, credentials and fields - can be tested without a network.
 */
export function mailgunRequest(mail: Mail, settings: MailgunSettings) {
  const body = new URLSearchParams({
    from: `${settings.from.name} <${settings.from.address}>`,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
  if (settings.replyTo) body.set("h:Reply-To", settings.replyTo);

  return {
    url: `${mailgunHosts[settings.region]}/v3/${encodeURIComponent(settings.domain)}/messages`,
    init: {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`api:${settings.apiKey}`).toString("base64")}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    } satisfies RequestInit,
  };
}

/**
 * Mailgun HTTP API transport. Same contract as SMTP: it throws on any refusal,
 * and `send` below turns that into a logged failure rather than an error.
 *
 * Mailgun's error body names the problem ("Forbidden", "Domain not found") and
 * never echoes the message, so it is safe to put in the log line.
 */
const mailgunTransport: Transport = async (mail) => {
  const { url, init } = mailgunRequest(mail, {
    apiKey: env.mail.mailgun.apiKey!,
    domain: env.mail.mailgun.domain!,
    region: env.mail.mailgun.region,
    from: { name: env.mail.from.name, address: env.mail.from.address! },
    replyTo: env.mail.replyTo,
  });

  const response = await fetch(url, init);
  if (!response.ok) {
    const reason = (await response.text().catch(() => "")).slice(0, 200).trim();
    throw new Error(`Mailgun answered ${response.status}${reason ? `: ${reason}` : ""}`);
  }
};

const transports: Record<typeof env.mail.transport, Transport> = {
  log: logTransport,
  smtp: smtpTransport,
  mailgun: mailgunTransport,
};

const transport = transports[env.mail.transport];

/**
 * Sends and reports whether it worked. Never throws - see OR-03 above.
 */
export async function send(mail: Mail): Promise<boolean> {
  try {
    await transport(mail);
    return true;
  } catch (error) {
    // SR-14: the recipient and the subject are enough to diagnose a delivery
    // problem. The body carries the token, so it is never logged.
    console.error(
      `[mail] could not send "${mail.subject}" to ${mail.to}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Fire-and-forget dispatch (CI-05). The request continues without waiting.
 */
export function queue(mail: Mail): void {
  void send(mail);
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ *
 * Plain text only. An e-mail client that renders no HTML still has to show a
 * usable code and a usable link (UR-07).
 */

const signOff = `\n\nIf you weren't expecting this email, you can ignore it.\n\n- Peerly`;

export const verificationCodeMail = (to: string, name: string, code: string): Mail => ({
  to,
  subject: `${code} is your Peerly verification code`,
  text:
    `Hi ${name},\n\n` +
    `Your Peerly verification code is:\n\n    ${code}\n\n` +
    `Enter it on the registration page to confirm this email address. ` +
    `It expires in ${env.tokens.emailCodeMinutes} minutes.` +
    signOff,
});

export const activationLinkMail = (to: string, name: string, token: string): Mail => ({
  to,
  subject: "Set up your Peerly account",
  text:
    `Hi ${name},\n\n` +
    `An account has been created for you on Peerly. Use the link below to confirm ` +
    `this email address and choose a password:\n\n` +
    `${env.appUrl}/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}\n\n` +
    `The link expires in ${Math.round(env.tokens.activationMinutes / 60)} hours.` +
    signOff,
});

/**
 * A moment as South African students read it: "28 September 2026 at 13:13
 * (South African time)", the same wording and zone the app shows (OR-11).
 * Fixed to Africa/Johannesburg rather than the server's own zone, which on a
 * hosted machine is usually UTC.
 */
export function inSouthAfrica(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Johannesburg",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year} at ${parts.hour}:${parts.minute} (South African time)`;
}

/**
 * Reminds a student that an evaluation is still outstanding (FR-18).
 *
 * It carries no link to a specific assessment, because a student signs in and
 * sees everything owed in one place; a deep link would only fail for anyone not
 * already signed in. It names the closing time, since that is the one fact that
 * decides whether they need to act tonight or at the weekend.
 */
export const submissionReminderMail = (
  to: string,
  name: string,
  assessmentName: string,
  moduleCode: string,
  closesAt: string,
): Mail => ({
  to,
  subject: `Reminder: your peer evaluation for ${moduleCode} is still outstanding`,
  text:
    `Hi ${name},\n\n` +
    `Your peer evaluation for "${assessmentName}" (${moduleCode}) hasn't been submitted yet.\n\n` +
    `It closes on ${inSouthAfrica(closesAt)}. After that it can't be submitted.\n\n` +
    `Sign in to complete it:\n\n    ${env.appUrl}\n\n` +
    `If you've already submitted it, you can ignore this.` +
    signOff,
});

export const passwordResetMail = (to: string, name: string, token: string): Mail => ({
  to,
  subject: "Reset your Peerly password",
  text:
    `Hi ${name},\n\n` +
    `Use the link below to choose a new password:\n\n` +
    `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}\n\n` +
    `The link expires in ${env.tokens.recoveryMinutes} minutes. ` +
    `Your current password keeps working until you do.` +
    signOff,
});
