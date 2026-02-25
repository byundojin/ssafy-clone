import { BrowserManager } from "./BrowserManager";
import { Assignment } from "../types";

export class PracticeStarter {
  constructor(private browser: BrowserManager) {}

  /** 과제 실습하기 → 과제실습실 → GitLab URL 반환 */
  async getGitlabUrl(assignment: Assignment): Promise<string> {
    const page = await this.browser.newPage();
    try {
      // 챕터 페이지 이동
      await page.goto(assignment.detailUrl);
      await page.waitForLoadState("domcontentloaded");

      // 해당 과제의 상세보기 클릭 (이름으로 찾기)
      await page.evaluate((name) => {
        const uls = Array.from(document.querySelectorAll(".practical_list span.list > ul"));
        for (const ul of uls) {
          const n = (ul.querySelector("li.list_tit")?.childNodes[0]?.textContent ?? "").trim();
          if (n === name) {
            (ul.querySelector("li:last-child a") as HTMLElement | null)?.click();
            return;
          }
        }
      }, assignment.name);

      // 실습하기 버튼이 나타날 때까지 대기
      await page.waitForSelector("a.btn.btnfn.primary.ml_5", { timeout: 15_000 });

      // 실습하기 버튼 클릭 → 새 탭 열림
      const ctx = page.context();
      const [practiceRoom] = await Promise.all([
        ctx.waitForEvent("page", { timeout: 10_000 }),
        page.click("a.btn.btnfn.primary.ml_5"),
      ]);

      // 새 탭에도 webdriver 속성 숨김 (context addInitScript 타이밍 보완)
      await practiceRoom.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      });

      try {
        // about:blank → 실습실 URL 리다이렉트 대기
        await practiceRoom.waitForURL(
          (url) => url.href.includes("/practiceroom/"),
          { timeout: 30_000 }
        );
        await practiceRoom.waitForLoadState("networkidle", { timeout: 15_000 });
        await practiceRoom.waitForTimeout(2000);
        // .btn_clone은 드롭다운이라 hidden 상태 → attached 대기 후 textContent 직접 추출
        await practiceRoom.waitForSelector(".btn_clone .form_group span", {
          state: "attached",
          timeout: 15_000,
        });

        const gitlabUrl = await practiceRoom.evaluate(
          () => document.querySelector(".btn_clone .form_group span")?.textContent?.trim() ?? ""
        );

        if (!gitlabUrl) throw new Error("GitLab URL을 찾을 수 없습니다.");
        return gitlabUrl;
      } finally {
        await practiceRoom.close();
      }
    } finally {
      await page.close();
    }
  }
}
