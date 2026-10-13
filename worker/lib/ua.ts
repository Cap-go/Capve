/** Tiny dependency-free User-Agent parser for click reports. */

export type ParsedUserAgent = {
  device_type: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
  os: string | null;
  browser: string | null;
  is_bot: boolean;
};

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|phantomjs|lighthouse|curl|wget|python-requests|httpclient|okhttp|go-http-client|java\/|axios|node-fetch|monitor|scanner/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua?.trim()) return true;
  return BOT_RE.test(ua);
}

function detectOs(ua: string): string | null {
  if (/Windows Phone/i.test(ua)) return "Windows Phone";
  if (/Windows/i.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

function detectBrowser(ua: string): string | null {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/YaBrowser/i.test(ua)) return "Yandex";
  if (/FBAN|FBAV/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  if (/MSIE|Trident/i.test(ua)) return "Internet Explorer";
  return null;
}

function detectDevice(ua: string): ParsedUserAgent["device_type"] {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua)) return "tablet";
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|X11|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const value = ua?.trim() ?? "";
  const bot = isBotUserAgent(value);
  if (!value) {
    return { device_type: "unknown", os: null, browser: null, is_bot: true };
  }
  return {
    device_type: bot ? "bot" : detectDevice(value),
    os: detectOs(value),
    browser: bot ? null : detectBrowser(value),
    is_bot: bot,
  };
}
