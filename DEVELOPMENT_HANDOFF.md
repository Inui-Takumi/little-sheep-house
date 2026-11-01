# Little Sheep House 第二版开发交接

> 更新时间：2026-11-01（Asia/Shanghai）
>
> 发布分支：`main`（开发分支：`codex/supabase-auth`）
>
> 开发基线：`c8aeef9 docs: document migrated project workspace`
>
> 状态：admin 与本地开发已验证；当前功能版本已推送 GitHub `main`，GitHub Pages 登录页已生效。邮件配置待办，第二账号邮件功能保持关闭。
>
> 当前工作区：`E:\Little-Sheep-House`

## 2026-11-01 续接状态

- 登录页已将人像替换为卡通绵羊，并将标题改为“全世界最聪明的小羊的网络小屋”；本地页面已查看，静态检查通过。
- 用户报告已完成 admin 密码重置；本次未再次使用密码验证登录。密码和密钥不得记录在文件或聊天中。
- 下一步为配置邮件服务。已建议使用 Brevo 免费 SMTP；用户已打开 Brevo 注册页面，账号注册、事务邮件激活、发件人及 SMTP 配置是否完成尚未确认。自有域名情况待用户确认。
- 在邮件可正常发送并完成验证前，保持 `emailFlowsEnabled: false`；邀请码尚未生成，第二账号尚未创建（云端状态沿用此前记录，需重新核验）。
- 后续按第 5 节继续：验证邮件、生成并配置邀请码、验证后启用注册，再测试正式站点及手机浏览器。不要使用生产槽位创建临时测试账号。

## 1. 第二版目标

**2026-10-30 最新决策：用户选择“先完成 admin 登录和本地开发，邮件配置稍后处理”，随后要求把当前版本更新到 GitHub。发布 admin 可用的现版本，第二账号邮件功能继续关闭。**

- 保留 GitHub Pages 正式地址：`https://inui-takumi.github.io/little-sheep-house/`。
- GitHub Pages 继续托管静态前端；Supabase Auth + PostgreSQL 提供登录、注册和账号资料。
- 未登录访问 `home.html` 时先返回登录页，主页内容在会话和资料校验通过前保持隐藏。
- 总账号数固定为 2：预置 `admin` 占槽位 1；一次性邀请码只允许创建一个槽位 2 账号。
- 第二个账号必须使用真实邮箱，并在确认邮箱后登录；支持邮件找回密码。
- 静态源码和素材仍然公开，登录仅作为网站访问流程拦截。

## 2. 账号约定

### 槽位 1：管理员账号

- 登录别名：`admin`
- Supabase 内部邮箱：`admin@local.little-sheep-house.invalid`
- 昵称：`全世界最聪明的小羊`
- 性别：`女`
- 密码：由用户在原始需求中指定；初始化时通过私有环境变量传入，**不得写入本文、源码、Git 历史或命令日志**。
- 不绑定真实邮箱；忘记密码时只能通过私有初始化/重置流程处理。

### 槽位 2：受邀账号

- 使用真实邮箱作为登录标识。
- 注册字段：昵称、邮箱、性别、密码、确认密码、一次性邀请码。
- 性别选项：女、男、保密。
- 密码至少 8 位。
- 邮箱确认后才能正常登录；允许邮件找回密码。

## 3. 已完成的本地开发

- [x] 原故事主页从 `index.html` 移至 `home.html`，七幕内容、音乐、相册和整蛊逻辑保留。
- [x] 新 `index.html` 为奶油粉、信封、小羊手账风登录页。
- [x] 登录、注册、忘记密码、设置新密码四种状态已实现。
- [x] `admin` 在前端映射到内部认证邮箱。
- [x] `home.html` 在认证通过前隐藏内容，认证守卫通过后才加载原 `script.js`。
- [x] 主页增加昵称账户按钮和退出登录。
- [x] Supabase JS 固定为 `@supabase/supabase-js@2.118.0`。
- [x] 会话持久化、自动刷新和恢复链接检测已启用。
- [x] 公开 Supabase URL 与 publishable key 已写入 `supabase-config.js`。
- [x] 数据库 migration、Auth Hook 函数、资料触发器、RLS 和初始化脚本已加入仓库。
- [x] 初始化脚本不会把管理员密码、邀请码明文或 secret key 写入源码。
- [x] `npm run check` 已通过全部静态校验。
- [x] 修复 Auth 创建用户时 app_metadata 写入时序导致的 admin 初始化失败，增加一次性服务端预授权迁移。
- [x] admin 已创建，真实 API 与浏览器登录、刷新、退出测试通过。
- [x] 原七幕、音乐、相册、回忆卡片、关心卡片、返回、整蛊两分支、重播回归通过。
- [x] 320、390、430 CSS 像素登录页和主页检查；修复昵称按钮列错位与窄屏滚动条溢出。
- [x] 历史缓存恢复时重新验证会话；所有认证表单使用 POST，避免 JS 失败时以 GET 发送密码。

主要文件：

- `index.html`：登录与注册入口。
- `home.html`：受保护的故事主页。
- `auth.js`：登录、注册、找回和恢复密码逻辑。
- `auth-guard.js`：主页会话与资料校验、退出登录。
- `auth.css`：认证页样式。
- `supabase-client.js`：Supabase 客户端与正式回跳地址生成。
- `supabase-config.js`：仅包含可公开的 Project URL、publishable key 和 admin 映射。
- `supabase/migrations/202610180001_two_account_auth.sql`：可重复执行的数据库迁移。
- `supabase/migrations/202610300002_admin_bootstrap.sql`：服务端一次性 admin 初始化预授权。
- `scripts/generate-invite.mjs`：生成一次性邀请码与 SHA-256。
- `scripts/seed-admin.mjs`：写入邀请码哈希并创建/校验 admin。
- `scripts/reset-admin-password.mjs`：后台重置 admin 密码。
- `scripts/verify-static.mjs`：静态安全和结构校验。
- `scripts/verify-auth.mjs`：当前阶段真实后端认证与权限校验（通过私有环境变量提供密码）。
- `scripts/dev-server.mjs`：仅提供网页和素材的本地预览服务器。
- `TEST_REPORT.md`：已完成与未覆盖的验证记录。

## 4. Supabase 项目状态

### 项目信息

- 组织：`Little Sheep House`
- Organization ref：`hhriwisgewljcqgognqa`
- 项目：`Little Sheep House`
- Project ref：`cjeuimfyuvetfniidrgk`
- Project URL：`https://cjeuimfyuvetfniidrgk.supabase.co`
- 区域：Southeast Asia / Singapore (`ap-southeast-1`)
- 套餐：Free
- 控制台状态：Healthy
- 2026-10-30：项目因闲置暂停后已按用户确认恢复，重新显示 Healthy。
- 创建时安全选项：Data API 开启、自动暴露新表关闭、自动 RLS 开启。

### 已在云端生效

- [x] 数据库迁移执行成功，SQL Editor 返回 `Success. No rows returned`。
- [x] `public.profiles` 已创建，槽位限制为 `1/2`，`slot` 唯一。
- [x] `public.profiles` 已启用 RLS，只允许登录用户读取自己的资料行。
- [x] `private.registration_config` 已创建并显式启用 RLS。
- [x] 一次性邀请码只存 SHA-256 哈希的私有配置结构已建立。
- [x] 注册触发器在同一事务中占用槽位 2，并用行锁和唯一约束处理并发注册。
- [x] `Before User Created` Hook 已创建并显示 `ENABLED`，调用 `public.before_user_created`。
- [x] Site URL 已保存为 GitHub Pages 正式根地址。
- [x] Redirect URL 已保存两条：正式根地址、正式根地址的 `?mode=recovery`。
- [x] Email Provider 已启用。
- [x] `Confirm email` 已启用。
- [x] 最小密码长度已保存为 8，并重新打开设置确认。
- [x] 第二次迁移 `202610300002_admin_bootstrap.sql` 执行成功。
- [x] admin 与槽位 1 资料已成功创建；一次性初始化凭据已消费并清除。
- [x] 匿名读资料/调用私有配置函数、普通用户改资料均被拒绝。
- [x] 错误邀请码被注册 Hook 拦截；真实登录、会话刷新通过。

### 当前停点

- admin 登录与本地开发阶段已完成。下一个工作项是配置邮件发送服务。
- **原“Supabase 默认邮件服务够用”的假设不成立**：官方服务只向项目组织成员发信、每小时 2 封。普通第二账号必须使用自定义 SMTP 或 Send Email Hook。[官方说明](https://supabase.com/docs/guides/auth/testing-auth-flows)
- 邮件配置工作已恢复；Brevo 注册页面已打开，配置尚待完成。
- 现版本已同步 GitHub `main`，第二账号邮件功能按约定保持关闭。
- `emailFlowsEnabled: false`，注册标签隐藏并提示“第二把钥匙正在准备中”。邮件找回暂停，但 admin 可查看手动重置提示。
- 邀请码尚未生成，私有邀请码配置仍为空；`is_registration_open()` 返回 `false`，槽位 2 未占用。
- 服务端密钥仅在初始化期间载入会话内存，未保存进文件或输出；后续如需再次初始化应重新从控制台安全读取。

### 已完成的发布（2026-10-30）

- 功能版本提交：[`4840593`](https://github.com/Inui-Takumi/little-sheep-house/commit/48405939faafa60f927bec90a348fd2d138aa7cf)。
- 本地 `main` 与远端 `origin/main` 在发布后指向同一提交；推送完成时工作区干净。
- 正式地址：`https://inui-takumi.github.io/little-sheep-house/`，已返回“登录 · 小羊的网络小屋”登录页，HTTP 200。
- 已逐一核对线上 `index.html`、`home.html`、`auth.js`、`auth-guard.js`、`supabase-client.js`、`supabase-config.js`、`auth.css`、`styles.css`；全部 HTTP 200，内容与发布版本一致（统一换行后比较）。
- 线上 `emailFlowsEnabled` 仍为 `false`，不会提前开放第二账号注册或邮件找回。
- 此次发布核验覆盖静态文件；正式网址上的完整登录会话和邮件回跳测试仍需补做。此前真实 Supabase API 与本地浏览器登录测试已通过。

## 5. 后续执行计划

按以下顺序继续：

1. **配置邮件服务（当前唯一前置待办）**
   - 用户自行在 Supabase 填写现有邮箱 SMTP 凭据，或选择邮件提供方；不要要求用户把授权码发到聊天。
   - 保持邮箱确认开启，验证正式回跳地址。
   - 密码策略已保存为 8，无需再修改。

2. **取得现有 API 密钥**
   - 从 `Project Settings → API Keys` 读取现有 publishable key 与 secret key。
   - 优先读取现有 secret key，不创建新 key；如果必须创建持久密钥，需要在最终动作前再次获得用户确认。
   - secret key 只在受控的本地初始化进程中使用，不写入浏览器代码、Markdown、Git、聊天或日志。

3. **生成一次性邀请码**
   - 仅在邮件服务就绪后执行；目前尚未生成。
   - 运行 `npm run generate:invite`。
   - 明文只在最终交付时单独告知用户；仓库和 Supabase 数据库只保存 SHA-256 哈希。

4. **配置邀请码哈希**
   - admin 已存在并验证通过，无需再次重设密码；后续只需配置邀请码哈希。
   - 使用仅服务端允许调用的 `configure_registration` RPC，将邀请码 SHA-256 写入 `private.registration_config`。
   - `npm run seed:admin` 供首次初始化或明确需要重设 admin 时使用，不要为配置邀请码而无意重设已存在的 admin 密码。
   - 不把管理员密码或 secret key放入命令输出、文件或 Git 历史。

5. **后端验证**
   - 验证 `admin` 存在且 `profiles.slot = 1`。
   - 验证匿名请求不能枚举或修改 `profiles`。
   - 验证错误邀请码被 Before User Created Hook 拒绝。
   - 邮件服务就绪、写入邀请码哈希后，验证 `is_registration_open()` 返回 `true`，并将 `emailFlowsEnabled` 改为 `true`。
   - 不在生产环境创建临时第二账号，以免消耗唯一槽位；正确邀请码的最终注册由真实第二位用户完成。

6. **前端与响应式验证**
   - admin 与本地浏览器测试已通过，详情见 `TEST_REPORT.md`；后续重点验证新增邮件流程。
   - 通过 `npm run dev` 启动 `http://127.0.0.1:4173/`。
   - 对正式 GitHub Pages 部署后再做一次完整登录测试。

7. **代码整理与发布**
   - 当前 admin 可用版本已发布，提交 `4840593`；下列步骤用于后续邮件功能完成后的新版本。
   - 删除或保留本地确认截图；`.gitignore` 已排除 `supabase-*-confirmation.png`。
   - 再运行 `npm run check` 和 JS 语法检查。
   - 审查 `git diff`，确认无 secret、默认密码、邀请码明文。
   - 在 `codex/supabase-auth` 提交。
   - 后端和本地测试通过后合并到 `main`，通过 `http://127.0.0.1:7897` 代理推送 GitHub。
   - 验证 `https://inui-takumi.github.io/little-sheep-house/` 已变为登录页。

8. **最终交付**
   - 单独给用户一次性邀请码。
   - 说明通过私有脚本或 Supabase 后台重置 admin 密码的方法。
   - 汇报线上测试结果和任何未覆盖项。

## 6. 测试清单

- [x] 未登录直接访问 `home.html` 返回登录页；守卫通过前内容隐藏。
- [x] `admin` 以用户指定密码登录；错误密码显示统一错误。
- [x] 页面刷新保持会话；已有会话访问登录页直接跳主页。
- [x] 退出后主页再次受控。
- [ ] 错误邀请码、无效邮箱、弱密码、重复邮箱无法注册。
- [ ] 正确邀请码可创建唯一第二账号，并发送确认邮件。
- [ ] 第二账号确认邮箱后可登录。
- [ ] 第二账号可通过真实邮箱找回密码。
- [x] `admin` 忘记密码提示后台手动重置。
- [ ] 第二账号创建后注册入口关闭。
- [ ] 并发注册最多成功一个。
- [x] 匿名读资料被拒绝；admin 不能枚举他人资料或修改本人资料。第二账号交叉读取尚待真实第二账号创建。
- [x] 七幕故事和原有交互完整回归。
- [x] 320 / 390 / 430 像素完成检查。
- [x] 当前版本推送 GitHub `main`，正式登录页与八个关键线上文件一致性核对通过。
- [ ] 真实微信内浏览器和手机系统浏览器检查。
- [ ] 正式 GitHub Pages、Supabase 会话和邮件跳转均使用正式网址。

## 7. 安全边界

- GitHub Pages 只能进行流程级登录拦截，静态 HTML、JS、图片和音乐仍可被直接访问。
- publishable key 可公开，但所有公开表必须依靠 RLS；secret key 永远不得进入浏览器或 Git。
- `admin` 是普通槽位 1 账号，不具备网站管理后台权限。
- 第二账号使用真实邮箱，不另设用户名。
- 不强制 admin 首次登录修改密码。
- Supabase 默认邮件服务不能向任意邮箱发信；生产第二账号邮件流程需要自定义 SMTP 或 Send Email Hook。

## 8. 续接命令

```powershell
Set-Location 'E:\Little-Sheep-House'
git status --short
npm run check
```

继续工作前先阅读本文、`README.md`、迁移文件和当前 `git diff`。不要直接覆盖用户工作区中的现有改动。
