// 这里只能填写可公开的项目 URL 与 publishable key。
// 不要在浏览器代码中加入 secret key、admin 密码或邀请码明文。
export const SUPABASE_CONFIG = Object.freeze({
  url: "https://cjeuimfyuvetfniidrgk.supabase.co",
  publishableKey: "sb_publishable_QR_7DLjo4flxj5pRxRV72A_3Z8Ad6Ko",
  // SMTP 完成并验证邮件流程后，才开放第二账号注册和邮件找回。
  emailFlowsEnabled: false
});

export const ADMIN_LOGIN = Object.freeze({
  alias: "admin",
  authEmail: "admin@local.little-sheep-house.invalid"
});

export function hasSupabaseConfig() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_CONFIG.url)
    && SUPABASE_CONFIG.publishableKey.length > 20
    && !SUPABASE_CONFIG.publishableKey.includes("YOUR_");
}
