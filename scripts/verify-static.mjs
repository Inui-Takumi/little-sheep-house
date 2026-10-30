import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const [index, home, auth, guard, client, migration, config, readme] = await Promise.all([
  read("index.html"),
  read("home.html"),
  read("auth.js"),
  read("auth-guard.js"),
  read("supabase-client.js"),
  read("supabase/migrations/202610180001_two_account_auth.sql"),
  read("supabase-config.js"),
  read("README.md")
]);

const checks = [
  [index.includes('src="./auth.js"'), "登录页加载 auth.js"],
  [home.includes('src="./auth-guard.js"'), "主页在故事脚本前加载认证守卫"],
  [!home.includes('src="./script.js"'), "主页不直接加载故事脚本"],
  [guard.includes('script.src = "./script.js"'), "认证通过后才加载故事脚本"],
  [client.includes("@supabase/supabase-js@2.118.0"), "Supabase JS 版本固定为 2.118.0"],
  [auth.includes("crypto.subtle.digest"), "邀请码在浏览器中做 SHA-256"],
  [migration.includes("unique check (slot in (1, 2))"), "数据库槽位唯一约束存在"],
  [migration.includes("before_user_created"), "注册前置 Hook 存在"],
  [migration.includes("for update"), "注册并发锁存在"],
  [migration.includes("auth.uid()) = id"), "profiles 自有行 RLS 存在"],
  [!/(?:ADMIN_PASSWORD\s*=|adminPassword\s*:)\s*["'][^<"']+["']/.test(`${index}${home}${auth}${guard}${client}${migration}${config}${readme}`), "源码未硬编码管理员密码"],
  [!config.includes("sb_secret_"), "浏览器配置不含 secret key"],
  [!migration.includes("SHEEP-") && !config.includes("SHEEP-"), "邀请码明文未进入提交文件"]
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
}
if (failed) process.exitCode = 1;
