import { Page } from "playwright";
import { BrowserManager } from "./BrowserManager";
import { Assignment } from "../types";

export class PracticeStarter {
  constructor(private browser: BrowserManager) {}

  /** 과제 실습하기 → 과제실습실 → GitLab URL 반환 */
  async getGitlabUrl(assignment: Assignment): Promise<string> {
    const page = await this.browser.newPage();
    let practiceRoom: Page | null = null;
    try {
      // 챕터 페이지 이동
      await page.goto(assignment.detailUrl);
      await page.waitForSelector(".practical_list span.list > ul", { timeout: 3_000 });

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
      await page.waitForSelector("a.btn.btnfn.primary.ml_5", { timeout: 3_000 });

      // 실습하기 버튼 클릭 → 새 탭 열림
      const ctx = page.context();
      [practiceRoom] = await Promise.all([
        ctx.waitForEvent("page", { timeout: 3_000 }),
        page.click("a.btn.btnfn.primary.ml_5"),
      ]);

      // 실습실 URL 리다이렉트 대기
      await practiceRoom.waitForURL(
        (url) => url.href.includes("/practiceroom/"),
        { timeout: 3_000 }
      );

      // 학습실 생성 완료 대기 — 서버가 실습 환경 만드는 시간
      await practiceRoom.waitForSelector(".btn_clone .form_group span", {
        state: "attached",
        timeout: 60_000,
      });

      const gitlabUrl = await practiceRoom.evaluate(
        () => document.querySelector(".btn_clone .form_group span")?.textContent?.trim() ?? ""
      );

      if (!gitlabUrl) throw new Error("GitLab URL을 찾을 수 없습니다.");
      return gitlabUrl;
    } finally {
      await practiceRoom?.close().catch(() => {});
      await page.close().catch(() => {});
    }
  }
}
