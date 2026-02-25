import { BrowserContext, Page } from "playwright";
import { writeFile, readFile, mkdir } from "fs/promises";
import * as fs from "fs";
import * as path from "path";

const SSAFY_HOME = "https://project.ssafy.com/home";

export class SsafySession {
  constructor(private context: BrowserContext, private cookiesPath: string) {}

  /** 저장된 쿠키로 세션 복원 시도 → 성공 시 true */
  static async tryRestore(cookiesPath: string, context: BrowserContext): Promise<boolean> {
    if (!fs.existsSync(cookiesPath)) return false;
    try {
      const state = JSON.parse(await readFile(cookiesPath, "utf-8"));
      await context.addCookies(state.cookies ?? []);

      const page = await context.newPage();
      try {
        await page.goto(SSAFY_HOME);
        await page.waitForURL((url) => url.href.includes("/home") || url.href.includes("/login"), { timeout: 10_000 });
        const isLoggedIn = page.url().includes("/home");
        return isLoggedIn;
      } finally {
        await page.close();
      }
    } catch {
      return false;
    }
  }

  /** ID/PW로 자동 로그인 */
  async autoLogin(id: string, pw: string): Promise<void> {
    const page = await this.context.newPage();
    try {
      await page.goto(SSAFY_HOME);
      await page.waitForURL(
        (url) => url.href.includes("/home") || url.href.includes("/login"),
        { timeout: 10_000 }
      );

      if (!page.url().includes("/login")) return; // 이미 로그인됨

      await page.waitForSelector("#userId");
      await page.fill("#userId", id);
      await page.fill("#userPwd", pw);
      await page.click("a.btn.btnfn.primary");

      await page.waitForURL(
        (url) => url.href.includes("project.ssafy.com/home"),
        { timeout: 30_000 }
      );

      await this.saveSession();
    } finally {
      await page.close();
    }
  }

  /** 브라우저에서 사용자가 직접 로그인 → 완료 후 쿠키 저장 */
  async manualLogin(): Promise<void> {
    const page = await this.context.newPage();
    try {
      await page.goto(SSAFY_HOME);
      await page.waitForURL(
        (url) => url.href.includes("project.ssafy.com/home"),
        { timeout: 300_000 }
      );
      await this.saveSession();
    } finally {
      await page.close();
    }
  }

  private async saveSession() {
    const state = await this.context.storageState();
    await mkdir(path.dirname(this.cookiesPath), { recursive: true });
    await writeFile(this.cookiesPath, JSON.stringify(state, null, 2), "utf-8");
  }
}
