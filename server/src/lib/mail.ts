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
 *          immediately, so no request waits on an SMTP round trip.
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
 * nodemailer is imported dynamically rather than at module load so that the
 * development path never needs it installed. NOTE: it is not yet in
 * package.json - add it before setting MAIL_TRANSPORT=smtp.
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

const transport: Transport = env.mail.transport === "smtp" ? smtpTransport : logTransport;

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
