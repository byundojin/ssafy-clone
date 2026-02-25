import { Page } from "playwright";
import { Assignment, Chapter, Course } from "../types";

const SELECTORS = {
  courseItem: ".practice.swiper-slide",
  courseName: "[class^='tit_type'] a span",
};

export class SsafyScraper {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async scrapeAll(): Promise<Course[]> {
    const courses = await this.scrapeCourses();
    for (let i = 0; i < courses.length; i++) {
      courses[i].chapters = await this.scrapeChapters(i);
    }
    return courses;
  }

  private async scrapeCourses(): Promise<Course[]> {
    await this.page.goto("https://project.ssafy.com/home");
    await this.page.waitForLoadState("networkidle");

    const courseNames = await this.page.$$eval(
      SELECTORS.courseItem,
      (items, sel) => items.map((el) => el.querySelector(sel)?.textContent?.trim() ?? ""),
      SELECTORS.courseName
    );

    return courseNames.map((name, idx) => ({ id: String(idx), name, chapters: [] }));
  }

  private async scrapeChapters(courseIndex: number): Promise<Chapter[]> {
    await this.page.goto("https://project.ssafy.com/home");
    await this.page.waitForLoadState("networkidle");

    const cards = await this.page.$$(SELECTORS.courseItem);
    if (!cards[courseIndex]) return [];

    const link = await cards[courseIndex].$("a");
    if (link) await link.click();
    else await cards[courseIndex].click();

    await this.page.waitForURL((url) => !url.href.endsWith("/home"), { timeout: 2_000 }).catch(() => {});
    await this.page.waitForLoadState("networkidle");

    // 챕터 이름 + expected 수 + href 한 번에 수집
    const chapterData = await this.page.evaluate(() => {
      const tbody = document.querySelectorAll("tbody")[1];
      if (!tbody) return [] as { name: string; expected: number; href: string }[];
      return Array.from(tbody.querySelectorAll("tr")).map((tr) => {
        const a = tr.querySelector("td.text_left a") as HTMLAnchorElement | null;
        if (!a) return null;
        const span = a.querySelector("span.romanize");
        if (span) span.remove();
        const name = a.textContent?.trim() ?? "";
        const cells = tr.querySelectorAll("td");
        const c1 = parseInt(cells[1]?.textContent?.trim() ?? "0", 10);
        const c2 = parseInt(cells[2]?.textContent?.trim() ?? "0", 10);
        return { name, expected: c1 + c2, href: a.href };
      }).filter((x): x is { name: string; expected: number; href: string } => !!x && !!x.name);
    });

    const chapters: Chapter[] = [];
    const courseUrl = this.page.url();

    for (let ci = 0; ci < chapterData.length; ci++) {
      const { name, expected, href } = chapterData[ci];

      if (href && href.startsWith("http")) {
        await this.page.goto(href);
        await this.page.waitForLoadState("domcontentloaded");
      } else {
        // href 없으면 목록 페이지로 돌아가서 클릭
        await this.page.goto(courseUrl);
        await this.page.waitForLoadState("networkidle");
        const links = await this.page.locator("tbody").nth(1).locator("tr td.text_left a").all();
        if (!links[ci]) continue;
        await links[ci].click();
        await this.page.waitForURL((url) => url.href !== courseUrl, { timeout: 2_000 }).catch(() => {});
        await this.page.waitForLoadState("domcontentloaded");
      }

      // 기대 과제 수만큼 렌더링될 때까지 대기
      await this.page.waitForFunction(
        (exp) => {
          const count = document.querySelectorAll(".practical_list span.list > ul").length;
          return exp === 0 || count >= exp;
        },
        expected,
        { timeout: 5_000 }
      ).catch(() => {});

      const assignments = await this.page.evaluate(() => {
        const results: { type: string; name: string }[] = [];
        document.querySelectorAll(".practical_list > div").forEach((group) => {
          const type = group.querySelector(".tit")?.textContent?.trim() ?? "";
          group.querySelectorAll("span.list > ul").forEach((ul) => {
            const name = (ul.querySelector("li.list_tit")?.childNodes[0]?.textContent ?? "").trim();
            if (name) results.push({ type, name });
          });
        });
        return results;
      });

      chapters.push({
        id: String(ci),
        name,
        assignments: assignments.map((a, idx) => ({
          id: `${ci}-${idx}`,
          name: a.name,
          type: a.type,
          detailUrl: this.page.url(),
        })),
      });
    }

    return chapters;
  }
}
