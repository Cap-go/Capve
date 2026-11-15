import type { IconName } from "../../components/Icon";

/** Copy strings accept the inline markup in `../inline.tsx`: `code`, **bold**, [label](/path). */
export type Faq = { q: string; a: string };

export type Card = { title: string; body: string; icon?: IconName; href?: string };

export type Section = {
  title: string;
  body: string;
  bullets?: string[];
  code?: { label?: string; text: string };
};

export type DocLink = { label: string; href: string };

/** Product page: /features/:slug */
export type Feature = {
  slug: string;
  icon: IconName;
  /** Short name for menus and cards. */
  name: string;
  /** One line for menus and cards. */
  summary: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lead: string;
  highlights: Card[];
  sections: Section[];
  docs: DocLink[];
  faqs: Faq[];
};

/** Ideal-customer page: /solutions/:slug */
export type Solution = {
  slug: string;
  icon: IconName;
  name: string;
  summary: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lead: string;
  pains: Card[];
  workflow: Card[];
  features: string[];
  docs: DocLink[];
  faqs: Faq[];
};
