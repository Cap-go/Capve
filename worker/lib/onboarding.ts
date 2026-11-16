import { approvedStatusSql } from "./metrics";
import { ONBOARDING_STEPS, type OnboardingStatus } from "../../shared/onboarding";

/** Progress comes from one real campaign's funnel, never from clicking a checkbox. */
export async function onboardingStatus(db: D1Database, accountId: string): Promise<OnboardingStatus> {
  const account = await db.prepare(`SELECT u.email_verified, o.dismissed, o.email_tips
    FROM users u LEFT JOIN account_onboarding o ON o.account_id = u.id WHERE u.id = ?`)
    .bind(accountId).first<{ email_verified: number; dismissed: number | null; email_tips: number | null }>();
  // Prefer the furthest-along campaign so unrelated clicks/conversions cannot complete the funnel.
  const campaign = await db.prepare(`SELECT p.id,
    EXISTS (SELECT 1 FROM clicks c WHERE c.program_id = p.id AND c.is_bot = 0) AS has_click,
    EXISTS (SELECT 1 FROM conversions v JOIN clicks c ON c.id = v.click_id
      WHERE c.program_id = p.id AND v.program_id = p.id AND c.is_bot = 0
        AND ${approvedStatusSql("v")}) AS has_conversion
    FROM programs p WHERE p.user_id = ? AND p.status != 'archived'
    ORDER BY has_conversion DESC, has_click DESC, p.created_at ASC, p.id ASC LIMIT 1`)
    .bind(accountId).first<{ id: string; has_click: number; has_conversion: number }>();
  const steps = {
    verify: account?.email_verified === 1,
    campaign: !!campaign,
    click: !!campaign?.has_click,
    conversion: !!campaign?.has_conversion,
  };
  const nextStep = ONBOARDING_STEPS.find((step) => !steps[step]) ?? null;
  return {
    accountId, campaignId: campaign?.id ?? null, steps, nextStep, complete: nextStep === null,
    dismissed: account?.dismissed === 1, emailTips: account?.email_tips === 1,
  };
}
