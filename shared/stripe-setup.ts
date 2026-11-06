export type StripeSetupCheck = {
  id: string;
  label: string;
  status: "ready" | "attention" | "disabled" | "unknown";
  detail: string;
  href?: string;
};

export type StripeSetupStatus = {
  checkedAt: number;
  billingEnabled: boolean;
  automaticTaxEnabled: boolean;
  mode: "live" | "test" | "unknown";
  accountId: string | null;
  checks: StripeSetupCheck[];
};
