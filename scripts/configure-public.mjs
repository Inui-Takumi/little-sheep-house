import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "supabase-config.js");
const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  throw new Error("SUPABASE_URL 格式不正确。");
}
if (!(key.startsWith("sb_publishable_") || key.startsWith("eyJ"))) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY 格式不正确。");
}

const source = await readFile(configPath, "utf8");
const updated = source
  .replace(/url: "[^"]+"/, `url: ${JSON.stringify(url)}`)
  .replace(/publishableKey: "[^"]+"/, `publishableKey: ${JSON.stringify(key)}`);

if (updated === source) throw new Error("没有找到可更新的公开配置字段。");
await writeFile(configPath, updated, "utf8");
console.log("已更新 supabase-config.js 的公开项目配置。");
