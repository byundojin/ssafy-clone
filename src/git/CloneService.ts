import * as child_process from "child_process";
import * as path from "path";

export class CloneService {
  constructor(private token: string) {}

  /** gitlabUrl을 인증 토큰으로 clone → destName 폴더로 저장 */
  async clone(gitlabUrl: string, targetDir: string, destName: string): Promise<string> {
    const authedUrl = gitlabUrl.replace("https://", `https://oauth2:${this.token}@`);
    const dest = path.join(targetDir, destName);

    await new Promise<void>((resolve, reject) => {
      const proc = child_process.spawn("git", ["clone", authedUrl, dest], {
        stdio: "pipe",
        shell: false,
      });

      const stderr: string[] = [];
      proc.stderr?.on("data", (d: Buffer) => stderr.push(d.toString()));

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git clone 실패 (exit ${code}): ${stderr.join("")}`));
      });

      proc.on("error", reject);
    });

    return dest;
  }
}
