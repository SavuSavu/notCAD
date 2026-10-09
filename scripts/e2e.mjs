import { spawn } from "node:child_process";
// Firefox's Linux headless backend lacks WebGL here. Run its real display backend
// under Xvfb when a desktop display is unavailable; never skip viewport checks.
const needsDisplay = process.platform === "linux" && !process.env.DISPLAY;
const command = needsDisplay
  ? "xvfb-run"
  : process.platform === "win32"
    ? "npx.cmd"
    : "npx";
const args = [
  ...(needsDisplay ? ["-a", "npx"] : []),
  "playwright",
  "test",
  ...process.argv.slice(2),
];
const child = spawn(command, args, { stdio: "inherit" });
child.on("error", (error) => {
  console.error(
    needsDisplay
      ? "Browser tests require Xvfb on headless Linux. Install it with npx playwright install --with-deps."
      : error.message,
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
