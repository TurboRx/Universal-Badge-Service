import { exec } from "child_process";
import path from "path";

export function runGenerateScript() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve("./generate.sh");

    const command =
      process.platform === "win32"
        ? `bash "${scriptPath}"`
        : `bash "${scriptPath}"`;

    exec(
      command,
      { env: process.env },
      (error, stdout, stderr) => {
        if (error) {
          console.error("❌ generate.sh failed");
          console.error(stderr || error.message);
          return reject(error);
        }

        if (stdout) {
          console.log("✅ generate.sh output:");
          console.log(stdout.trim());
        }

        resolve();
      }
    );
  });
}
