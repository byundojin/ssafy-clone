import { BrowserManager } from "./BrowserManager";

const SCOPES = ["read_user", "read_repository", "read_api", "api"];
const TOKEN_NAME = "ssafy-clone-auto";

/**
 * Playwright로 GitLab Personal Access Token을 자동 생성하고 반환합니다.
 */
export async function createGitlabToken(browser: BrowserManager): Promise<string> {
  const page = await browser.newPage();
  try {
    // SSO 확립: GitLab 홈 먼저 방문
    await page.goto("https://lab.ssafy.com");
    await page.waitForLoadState("networkidle");

    // 토큰 설정 페이지 이동
    await page.goto("https://lab.ssafy.com/-/user_settings/personal_access_tokens");
    await page.waitForLoadState("networkidle");

    // 환영 모달 강제 제거
    await page.evaluate(() => {
      document.querySelectorAll("[id*='dap_welcome_modal']").forEach(el => el.remove());
      document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());
      document.body.classList.remove("modal-open");
    });

    // "Add new token" 버튼 클릭 → 폼 열기
    await page.locator("[data-testid='add-new-token-button']").click({ timeout: 5_000 });
    await page.waitForSelector("[data-testid='create-token-button']", { timeout: 5_000 });

    // 토큰 이름 입력 (YYYY placeholder가 아닌 첫 번째 text input)
    const nameInputs = await page.locator("input[type='text']").all();
    for (const input of nameInputs) {
      const ph = (await input.getAttribute("placeholder")) ?? "";
      if (!ph.includes("YYYY")) {
        await input.fill(TOKEN_NAME, { force: true });
        break;
      }
    }

    // 만료일 설정 (1년 후)
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    await page.locator("input[placeholder='YYYY-MM-DD']").fill(
      expiry.toISOString().slice(0, 10),
      { force: true }
    );

    // 스코프 체크 (Bootstrap custom-control → label 클릭)
    await page.evaluate((scopes) => {
      for (const scope of scopes) {
        const cb = document.querySelector(`input[value='${scope}']`) as HTMLInputElement | null;
        if (cb && !cb.checked) {
          const label = document.querySelector(`label[for='${cb.id}']`) as HTMLElement | null;
          if (label) label.click();
          else cb.click();
        }
      }
    }, SCOPES);

    // 생성
    await page.locator("[data-testid='create-token-button']").click();

    // 생성된 토큰 추출
    await page.waitForSelector("[data-testid='created-access-token-field']", { timeout: 10_000 });
    const token = await page.inputValue("[data-testid='created-access-token-field']");

    if (!token) throw new Error("토큰 생성 후 값을 찾을 수 없습니다.");
    return token;
  } finally {
    await page.close();
  }
}
