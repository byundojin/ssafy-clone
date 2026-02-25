import * as vscode from "vscode";
import { BrowserManager } from "../browser/BrowserManager";
import { Assignment } from "../types";

export class AssignmentPanel {
  private static currentPanel: AssignmentPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  static show(
    browser: BrowserManager,
    title: string,
    detailUrl: string,
    assignment?: Assignment
  ) {
    if (AssignmentPanel.currentPanel) {
      AssignmentPanel.currentPanel.panel.reveal();
    } else {
      const panel = vscode.window.createWebviewPanel(
        "ssafyDetail",
        title,
        vscode.ViewColumn.Beside,
        { enableScripts: true, localResourceRoots: [] }
      );
      AssignmentPanel.currentPanel = new AssignmentPanel(panel);
      panel.onDidDispose(() => {
        AssignmentPanel.currentPanel = undefined;
      });
    }

    AssignmentPanel.currentPanel.panel.title = title;
    AssignmentPanel.currentPanel.load(browser, detailUrl, assignment);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this.panel = panel;
  }

  private async load(browser: BrowserManager, detailUrl: string, assignment?: Assignment) {
    this.panel.webview.html = loadingHtml("페이지 로딩 중...");

    let page;
    try {
      // 기존 로그인 세션의 컨텍스트에서 새 페이지 열기
      page = await browser.newPage();

      await page.goto(detailUrl);
      await page.waitForLoadState("domcontentloaded");

      // 과제 단일: 해당 과제의 "상세보기" 버튼 클릭
      if (assignment) {
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
      }

      // 본문이 실제로 렌더링될 때까지 대기
      await page.waitForFunction(() => {
        const el = document.querySelector(".practical_contents");
        return el && el.children.length > 0 && (el.textContent ?? "").trim().length > 10;
      }, { timeout: 2_000 });

      // 본문 innerHTML만 추출
      const content = await page.evaluate(() =>
        document.querySelector(".practical_contents")?.innerHTML ?? ""
      );

      this.panel.webview.html = contentHtml(content);
    } catch (e: any) {
      this.panel.webview.html = errorHtml(e.message ?? String(e));
    } finally {
      await page?.close();
    }
  }
}

function loadingHtml(msg: string) {
  return `<!DOCTYPE html><html><body style="background:#1e1e1e;color:#ccc;
    font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <div>${msg}</div></body></html>`;
}


function contentHtml(body: string) {
  return `<!DOCTYPE html><html>
  <head>
    <meta charset="utf-8">
    <base href="https://project.ssafy.com/">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src * 'unsafe-inline'; img-src * data:; font-src *;">
    <style>
      body { margin: 0; padding: 16px 24px; font-family: sans-serif;
             background: #ffffff; color: #000000; }
    </style>
  </head>
  <body>${body}</body>
  </html>`;
}

function errorHtml(msg: string) {
  return `<!DOCTYPE html><html><body style="background:#1e1e1e;color:#f66;
    font-family:sans-serif;padding:24px;margin:0"><b>오류:</b> ${msg}</body></html>`;
}
