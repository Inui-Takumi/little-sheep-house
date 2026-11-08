import { readHidden } from "./read-hidden.mjs";

try {
  process.env.SUPABASE_URL = "https://ldozxltmzdbvfuupqsum.supabase.co";
  process.env.SUPABASE_TEST_PUBLISHABLE_KEY = "sb_publishable_qlA831EjHre15l3XLGtPFQ_kJXasNxW";
  delete process.env.INVITE_HASH;
  process.env.SUPABASE_SECRET_KEY = await readHidden("输入测试项目现有的 secret key（输入不显示）");
  process.env.ADMIN_PASSWORD = await readHidden("为测试管理员设置密码（至少 8 位，输入不显示）");
  await import("./initialize-test-admin.mjs");
} catch (error) {
  console.error(`初始化未完成：${error.message}`);
  process.exitCode = 1;
} finally {
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.ADMIN_PASSWORD;
}
