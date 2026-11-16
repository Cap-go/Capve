export const ONBOARDING_STEPS = ["verify", "campaign", "click", "conversion"] as const;
export type OnboardingStep = typeof ONBOARDING_STEPS[number];
export type OnboardingStatus = {
  accountId: string;
  campaignId: string | null;
  steps: Record<OnboardingStep, boolean>;
  nextStep: OnboardingStep | null;
  complete: boolean;
  dismissed: boolean;
  emailTips: boolean;
};
export type OnboardingPreferences = { dismissed?: boolean; emailTips?: boolean };
