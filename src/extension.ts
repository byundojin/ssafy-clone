import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { CourseTreeProvider, CourseItem, ChapterItem, AssignmentItem } from "./views/CourseTreeProvider";
import { BrowserManager } from "./browser/BrowserManager";
import { SsafySession } from "./browser/SsafySession";
import { SsafyScraper } from "./crawler/SsafyScraper";
import { PracticeStarter } from "./browser/PracticeStarter";
import { CloneService } from "./git/CloneService";
import { getGitlabToken, promptAndSaveToken, getCredentials, promptAndSaveCredentials } from "./config";
import { createGitlabToken } from "./browser/GitlabTokenCreator";
import { Assignment, Course } from "./types";

type CloneTask = { assignment: Assignment; targetDir: string; destName: string };

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function ensurePlaywrightBrowser(extensionPath: string) {
  const { chromium } = await import("playwright");
  const execPath = chromium.executablePath();
  if (fs.existsSync(execPath)) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Playwright 브라우저 설치 중..." },
    () => new Promise<void>((resolve, reject) => {
      const cli = path.join(extensionPath, "node_modules", "playwright", "cli.js");
      const proc = child_process.spawn(process.execPath, [cli, "install", "chromium"], { stdio: "pipe" });
      proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`playwright install 실패 (exit ${code})`)));
      proc.on("error", reject);
    })
  );
}

/** 브라우저가 살아있지 않으면 자동 로그인, 자격증명 없으면 입력 받기 */
async function ensureBrowserAlive(
  browser: BrowserManager,
  cookiesPath: string,
  secrets: vscode.SecretStorage
): Promise<boolean> {
  if (browser.isAlive()) return true;

  const ctx = await browser.launch(false);
  const session = new SsafySession(ctx, cookiesPath);

  let creds = await getCredentials(secrets);
  if (!creds) {
    creds = await promptAndSaveCredentials(secrets);
    if (!creds) { await browser.close(); return false; }
  }

  try {
    await session.autoLogin(creds.id, creds.pw);
    return true;
  } catch {
    // 자동 로그인 실패 → 수동 로그인 안내
    vscode.window.showInformationMessage("자동 로그인 실패. 브라우저에서 직접 로그인해주세요.");
    await session.manualLogin();
    return true;
  }
}

async function openGitlabTokenPage(browser: BrowserManager) {
  if (!browser.isAlive()) return;
  const page = await browser.newPage();
  await page.goto("https://lab.ssafy.com");
  await page.waitForLoadState("networkidle");
  await page.goto("https://lab.ssafy.com/-/user_settings/personal_access_tokens");
}

async function runClone(secrets: vscode.SecretStorage, browser: BrowserManager, tasks: CloneTask[]) {
  let token = await getGitlabToken(secrets);
  if (!token) {
    token = await promptAndSaveToken(
      secrets,
      () => openGitlabTokenPage(browser),
      () => createGitlabToken(browser)
    );
    if (!token) return;
  }

  const starter = new PracticeStarter(browser);
  const cloneService = new CloneService(token);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Clone 중... (0/${tasks.length})`,
      cancellable: false,
    },
    async (progress) => {
      const errors: string[] = [];

      for (let i = 0; i < tasks.length; i++) {
        const { assignment, targetDir, destName } = tasks[i];
        progress.report({ message: `(${i + 1}/${tasks.length}) ${assignment.name}` });

        try {
          const gitlabUrl = await starter.getGitlabUrl(assignment);
          await cloneService.clone(gitlabUrl, targetDir, destName);
        } catch (e: any) {
          errors.push(`${assignment.name}: ${e.message}`);
        }
      }

      if (errors.length > 0) {
        vscode.window.showErrorMessage(`일부 실패:\n${errors.join("\n")}`);
      } else {
        vscode.window.showInformationMessage(`${tasks.length}개 과제 clone 완료!`);
      }
    }
  );
}

export function activate(context: vscode.ExtensionContext) {
  const dataPath = path.join(context.extensionPath, "courses.json");
  const cookiesPath = path.join(context.globalStorageUri.fsPath, "cookies.json");
  const provider = new CourseTreeProvider();
  const browser = BrowserManager.getInstance();

  ensurePlaywrightBrowser(context.extensionPath).catch((e) =>
    vscode.window.showErrorMessage(`브라우저 설치 실패: ${e.message}`)
  );

  const treeView = vscode.window.createTreeView("ssafyCourses", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  loadData();

  function loadData() {
    if (fs.existsSync(dataPath)) {
      const courses: Course[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      provider.refresh(courses);
      treeView.message = undefined;
    } else {
      treeView.message = "스크랩 버튼을 눌러 과제를 불러오세요.";
    }
  }

  // ── 커맨드 ────────────────────────────────────────────────────────

  context.subscriptions.push(

    // 스크랩: 로그인(필요시) + 과제 목록 갱신
    vscode.commands.registerCommand("ssafy.scrape", async () => {
      try {
        const alive = await ensureBrowserAlive(browser, cookiesPath, context.secrets);
        if (!alive) return;

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "SSAFY 과제 목록 불러오는 중..." },
          async () => {
            const page = await browser.newPage();
            try {
              const scraper = new SsafyScraper(page);
              const courses = await scraper.scrapeAll();
              fs.writeFileSync(dataPath, JSON.stringify(courses, null, 2), "utf-8");
              loadData();
              vscode.window.showInformationMessage(`완료! 과정 ${courses.length}개 로드됨.`);
            } finally {
              await page.close();
            }
          }
        );
      } catch (e: any) {
        vscode.window.showErrorMessage(`오류: ${e.message}`);
        await browser.close();
      }
    }),

    // 새로고침 (저장된 courses.json 재로드)
    vscode.commands.registerCommand("ssafy.refresh", () => {
      loadData();
    }),

    // clone
    vscode.commands.registerCommand("ssafy.clone", async (item: AssignmentItem) => {
      try {
        await ensureBrowserAlive(browser, cookiesPath, context.secrets);
      } catch (e: any) {
        vscode.window.showErrorMessage(`로그인 실패: ${e.message}`);
        return;
      }
      const root = getWorkspaceRoot();
      if (!root) { vscode.window.showWarningMessage("폴더를 열어주세요."); return; }
      await runClone(context.secrets, browser, [{
        assignment: item.assignment,
        targetDir: path.join(root, item.course.name, item.chapter.name),
        destName: item.assignment.name,
      }]);
    }),

    // cloneAll
    vscode.commands.registerCommand("ssafy.cloneAll", async (item: CourseItem | ChapterItem) => {
      try {
        await ensureBrowserAlive(browser, cookiesPath, context.secrets);
      } catch (e: any) {
        vscode.window.showErrorMessage(`로그인 실패: ${e.message}`);
        return;
      }
      const root = getWorkspaceRoot();
      if (!root) { vscode.window.showWarningMessage("폴더를 열어주세요."); return; }

      let tasks: CloneTask[];
      if (item instanceof ChapterItem) {
        const chapterDir = path.join(root, item.course.name, item.chapter.name);
        tasks = item.chapter.assignments.map((a) => ({
          assignment: a,
          targetDir: chapterDir,
          destName: a.name,
        }));
      } else {
        tasks = item.course.chapters.flatMap((ch) =>
          ch.assignments.map((a) => ({
            assignment: a,
            targetDir: path.join(root, item.course.name, ch.name),
            destName: a.name,
          }))
        );
      }
      await runClone(context.secrets, browser, tasks);
    }),

    // 토큰 설정
    vscode.commands.registerCommand("ssafy.resetToken", async () => {
      const alive = await ensureBrowserAlive(browser, cookiesPath, context.secrets);
      if (!alive) return;
      const token = await promptAndSaveToken(
        context.secrets,
        () => openGitlabTokenPage(browser),
        () => createGitlabToken(browser)
      );
      if (token) vscode.window.showInformationMessage("GitLab 토큰이 저장되었습니다.");
    }),
  );

  context.subscriptions.push({ dispose: () => browser.close() });
  context.subscriptions.push(treeView);
}

export function deactivate() {
  BrowserManager.getInstance().close();
}
