import { Browser, BrowserContext, Page, chromium } from "playwright";
import * as fs from "fs";

/** Windows에 설치된 Edge 또는 Chrome 경로 반환 (없으면 undefined → Playwright 번들 Chromium 사용) */
function findSystemChrome(): string | undefined {
  const candidates = [
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return candidates.find((p) => fs.existsSync(p));
}

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private _page: Page | null = null;

  private constructor() {}

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  isAlive(): boolean {
    return this.browser !== null && this.context !== null;
  }

  async launch(headless = false): Promise<BrowserContext> {
    const executablePath = findSystemChrome();
    this.browser = await chromium.launch({
      headless,
      executablePath, // 시스템 Edge/Chrome 우선 사용
      args: ["--disable-blink-features=AutomationControlled"],
    });
    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // window.chrome이 없으면 추가 (Playwright 번들 Chromium 대비)
      if (!(window as any).chrome) {
        (window as any).chrome = { runtime: {} };
      }
    });
    return this.context;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error("브라우저가 실행되지 않았습니다. 로그인을 먼저 하세요.");
    return this.context;
  }

  async newPage(): Promise<Page> {
    const page = await this.getContext().newPage();
    return page;
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = null;
    this.browser = null;
    this._page = null;
  }
}
