import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

export interface BrowserOpts {
  headless?: boolean;
  proxy?: string; // http://user:pass@host:port
  locale?: string;
}

export async function launchBrowser(opts: BrowserOpts = {}): Promise<{ browser: Browser; context: BrowserContext }> {
  const proxy = opts.proxy ?? process.env.PROXY_URL;
  const browser = await chromium.launch({
    headless: opts.headless ?? (process.env.SCRAPE_HEADLESS !== 'false'),
    args: ['--disable-blink-features=AutomationControlled'],
    ...(proxy ? { proxy: parseProxy(proxy) } : {}),
  });
  const ua = UA_POOL[Math.floor(Math.random() * UA_POOL.length)]!;
  const context = await browser.newContext({
    userAgent: ua,
    locale: opts.locale ?? 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1440, height: 900 },
  });
  // Automation-Fingerprint maskieren
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { browser, context };
}

function parseProxy(url: string) {
  const u = new URL(url);
  return {
    server: `${u.protocol}//${u.host}`,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
  };
}

export async function politeWait(minMs = 1500, maxMs = 3500): Promise<void> {
  const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await new Promise(r => setTimeout(r, delay));
}

export async function safeGoto(page: Page, url: string): Promise<boolean> {
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res || res.status() >= 400) return false;
    return true;
  } catch {
    return false;
  }
}
