import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testProject = process.argv.includes("--test-project");
const testKey = (process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "").trim();
if (testProject && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(testKey)) {
  throw new Error("测试模式需要通过 SUPABASE_TEST_PUBLISHABLE_KEY 提供测试项目的 publishable key。");
}
const testConfig = testProject ? `
export const SUPABASE_CONFIG = Object.freeze({
  url: "https://ldozxltmzdbvfuupqsum.supabase.co",
  publishableKey: ${JSON.stringify(testKey)},
  emailFlowsEnabled: true
});
export const ADMIN_LOGIN = Object.freeze({ alias: "admin", authEmail: "admin@local.little-sheep-house.invalid" });
export function hasSupabaseConfig() { return true; }
` : null;
const files = new Set(["index.html", "home.html", "auth.js", "auth-guard.js", "supabase-client.js", "supabase-config.js", "script.js", "auth.css", "styles.css", "background-music.mp3"]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".mp3": "audio/mpeg" };
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
    const asset = /^(characters|photos)\/[a-zA-Z0-9._-]+$/.test(relative);
    if (!["GET", "HEAD"].includes(req.method) || (!files.has(relative) && !asset)) {
      res.writeHead(404).end("Not found");
      return;
    }
    if (relative === "supabase-config.js" && testConfig !== null) {
      res.writeHead(200, { "Content-Type": mime[".js"], "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : testConfig);
      return;
    }
    const file = path.join(root, relative);
    const info = await stat(file);
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start >= info.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
      return;
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
      "Content-Length": end - start + 1,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {})
    });
    if (req.method === "HEAD") res.end();
    else res.end((await readFile(file)).subarray(start, end + 1));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
const port = testProject ? 4174 : 4173;
server.listen(port, "127.0.0.1", () => console.log(`Local: http://127.0.0.1:${port}/ (${testProject ? "独立测试项目" : "正式项目配置"})`));
