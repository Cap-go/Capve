import { bentoConfigured, bentoRequest } from "./bento";
import type { Env } from "../types";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  disableTracking?: boolean;
};

function emailFrom(env: Env): string {
  return env.EMAIL_FROM ?? "noreply@capve.app";
}

/** Local dev install (APP_URL on localhost): safe to print emails, which carry auth links. */
export function isLocalDev(env: Env): boolean {
  try {
    const host = new URL(env.APP_URL).hostname;
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export async function sendEmail(env: Env, input: SendEmailInput): Promise<void> {
  const from = emailFrom(env);

  if (bentoConfigured(env)) {
    await bentoRequest(env, "emails", [{
      to: input.to, from, subject: input.subject, html_body: input.disableTracking
        ? '{{ "true" | disable_click }}{{ "true" | disable_open }}{{ "true" | disable_utms }}' + input.html
        : input.html,
      transactional: true,
    }]);
    return;
  }

  if (!env.EMAIL) {
    // Bodies contain reset/verify links: only print them on a local dev install.
    if (isLocalDev(env)) {
      console.log(`[email] To: ${input.to} | From: ${from} | ${input.subject}\n${input.text}`);
    } else {
      console.warn(`[email] No EMAIL binding; not sent: ${input.subject}`);
    }
    return;
  }

  await env.EMAIL.send({
    to: input.to,
    from,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}

export function resetPasswordEmail(appUrl: string, token: string) {
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    disableTracking: true,
    subject: "Reset your Capve password",
    text: `Reset your password: ${link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.\n\n— Capve`,
    html: `<p><a href="${link}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p><p>— Capve</p>`,
  };
}

export function verifyEmailEmail(appUrl: string, token: string) {
  const link = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    disableTracking: true,
    subject: "Verify your Capve email",
    text: `Confirm your email address: ${link}\n\nThis link expires in 24 hours. If you did not create a Capve account, ignore this email.\n\n— Capve`,
    html: `<p><a href="${link}">Confirm your email address</a></p><p>This link expires in 24 hours. If you did not create a Capve account, ignore this email.</p><p>— Capve</p>`,
  };
}
