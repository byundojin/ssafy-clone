import * as vscode from "vscode";

const SECRET_KEY = "ssafy.gitlabToken";
const ID_KEY = "ssafy.userId";
const PW_KEY = "ssafy.userPw";

export async function getGitlabToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  return secrets.get(SECRET_KEY);
}

export async function promptAndSaveToken(
  secrets: vscode.SecretStorage,
  openTokenPage?: () => Promise<void>,
  autoCreate?: () => Promise<string>
): Promise<string | undefined> {
  const options = autoCreate ? ["자동 생성", "직접 입력"] : ["직접 입력"];
  const action = await vscode.window.showInformationMessage(
    "SSAFY GitLab Personal Access Token을 입력하세요.",
    ...options
  );
  if (!action) return undefined;

  if (action === "자동 생성") {
    try {
      const token = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "GitLab 토큰 자동 생성 중..." },
        () => autoCreate!()
      );
      await secrets.store(SECRET_KEY, token);
      vscode.window.showInformationMessage("GitLab 토큰이 자동 생성되었습니다.");
      return token;
    } catch (e: any) {
      vscode.window.showErrorMessage(`토큰 자동 생성 실패: ${e.message}`);
      return undefined;
    }
  }

  // 직접 입력
  if (openTokenPage) await openTokenPage();

  const token = await vscode.window.showInputBox({
    title: "GitLab 토큰 입력",
    prompt: "SSAFY GitLab Personal Access Token을 입력하세요.",
    password: true,
    ignoreFocusOut: true,
  });
  if (!token) return undefined;
  await secrets.store(SECRET_KEY, token);
  return token;
}

export async function clearToken(secrets: vscode.SecretStorage): Promise<void> {
  await secrets.delete(SECRET_KEY);
}

export async function getCredentials(secrets: vscode.SecretStorage): Promise<{ id: string; pw: string } | undefined> {
  const id = await secrets.get(ID_KEY);
  const pw = await secrets.get(PW_KEY);
  if (id && pw) return { id, pw };
  return undefined;
}

export async function promptAndSaveCredentials(secrets: vscode.SecretStorage): Promise<{ id: string; pw: string } | undefined> {
  const id = await vscode.window.showInputBox({
    title: "SSAFY 아이디",
    prompt: "SSAFY 로그인 이메일을 입력하세요.",
    ignoreFocusOut: true,
  });
  if (!id) return undefined;

  const pw = await vscode.window.showInputBox({
    title: "SSAFY 비밀번호",
    prompt: "SSAFY 비밀번호를 입력하세요.",
    password: true,
    ignoreFocusOut: true,
  });
  if (!pw) return undefined;

  await secrets.store(ID_KEY, id);
  await secrets.store(PW_KEY, pw);
  return { id, pw };
}
