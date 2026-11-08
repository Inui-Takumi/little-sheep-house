# 小羊的网络小屋

一个面向手机浏览器的双账号私密入口与七幕互动故事。GitHub Pages 托管静态前端，Supabase Auth 和 PostgreSQL 负责登录、注册名额与账号资料。

## 在线地址

- GitHub Pages：https://inui-takumi.github.io/little-sheep-house/

> 登录只能拦截正常访问流程。仓库、静态 HTML、照片、动画和音乐仍是公开资源，请勿放入不希望公开的敏感内容。

## 当前进度（2026-11-08）

登录页已更新为卡通绵羊与新标题。独立测试项目已验证一次性邀请码、账号隔离、确认邮件和找回密码；正式项目的 SMTP 与回跳配置已核对，正式邀请码哈希已配置，前端启用注册与邮件找回。正式环境的邮件送达、受邀账号注册和找回仍待真实住客验证。

### 2026-10-30 基线

admin 已在 Supabase 初始化，本地登录、会话保持、退出和七幕故事回归通过。用户选择先完成 admin 与本地开发，邮件配置稍后处理，因此 `supabase-config.js` 的 `emailFlowsEnabled` 为 `false`，第二账号注册及邮件找回暂未开放，邀请码尚未生成。本版本按用户要求同步 GitHub `main`，继续保留上述功能开关。

功能版本 [`4840593`](https://github.com/Inui-Takumi/little-sheep-house/commit/48405939faafa60f927bec90a348fd2d138aa7cf) 已推送，正式站点登录页已生效，八个关键线上文件与发布内容一致。正式网址完整登录和邮件流程回归仍待完成。

Supabase 默认邮件服务只向项目组织成员发送邮件，不能满足普通第二账号的注册和找回需求。已配置自定义 SMTP，正式项目邮件流程仍待验证；参见[官方限制说明](https://supabase.com/docs/guides/auth/testing-auth-flows)。开发进度和历史测试记录仅保留在本地。

## 页面与账号规则

- `index.html`：登录、唯一一次注册、邮箱找回与新密码设置。
- `home.html`：原有七幕故事；只有在线会话与本人资料都校验通过后才加载 `script.js`。
- `admin` 固定占用槽位 1，昵称为“全世界最聪明的小羊”，性别为“女”。
- 第二位住客使用真实邮箱和一次性邀请码注册，占用槽位 2，并需确认邮箱。
- 槽位 2 创建后，数据库会原子地消费邀请码；唯一约束与行锁保证并发注册最多成功一个。
- `profiles` 开启 RLS，登录用户只能读取自己的资料，不能在客户端创建、修改或枚举账号。

## 项目结构

- `auth.js`、`auth.css`：登录、注册、找回密码与界面样式。
- `auth-guard.js`：主页在线会话与个人资料守卫、账户菜单、退出登录。
- `supabase-config.js`：只存放可公开的 Project URL 与 publishable key。
- `supabase/migrations/`：资料表、RLS、注册 Hook、创建资料触发器和私有邀请码配置。
- `scripts/`：生成邀请码、写入公开配置、初始化或重置 admin、静态安全检查。
- `styles.css`、`script.js`、`characters/`、`photos/`：原故事和素材。

## 首次部署

### 1. 创建 Supabase 项目

在 Supabase 创建新项目，区域优先选 Singapore。打开 Authentication 配置：

- 开启 Email + Password。
- 开启 Confirm email。
- Site URL 填 `https://inui-takumi.github.io/little-sheep-house/`。
- Redirect URLs 加入同一正式地址；开发时可另加 `http://127.0.0.1:4173/`。
- 最低密码长度设为 8。

### 2. 应用数据库 migration

按文件名顺序执行 `supabase/migrations/` 中的全部迁移（包括 `202610300002_admin_bootstrap.sql`），或登录 CLI 后执行：

```powershell
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

然后在 Authentication → Hooks 中启用 **Before User Created**，选择 Postgres 函数 `public.before_user_created`。仓库中的 `supabase/config.toml` 同样记录了该配置。

### 3. 生成一次性邀请码

```powershell
npm install
npm run generate:invite
```

命令只输出一次邀请码明文和 SHA-256。把明文安全地交给第二位住客，不要写入仓库；初始化时只使用哈希。

### 4. 初始化 admin 和邀请码哈希

以下值只放在当前终端环境中。secret key、admin 密码和邀请码明文都不能提交：

```powershell
$env:SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
$env:SUPABASE_SECRET_KEY="<SUPABASE_SECRET_KEY>"
$env:ADMIN_PASSWORD="<ADMIN_PASSWORD>"
$env:INVITE_HASH="<GENERATED_SHA256>"
npm run seed:admin
```

脚本会用 Auth Admin API 创建并确认内部 admin 用户，由数据库触发器写入槽位 1；再次运行只会更新可信的已初始化 admin。创建时由仅服务端可调用的 `prepare_admin_seed` 预授权随机一次性凭据，触发器在同一事务中校验并消费，脚本随后清除用户资料中的凭据。

只初始化 admin 时可以不设置 `INVITE_HASH`；注册保持关闭。邮件服务完成后再生成邀请码并传入哈希。第二账号已存在时，脚本拒绝重新配置邀请码。

### 5. 写入公开前端配置

```powershell
$env:SUPABASE_PUBLISHABLE_KEY="<SUPABASE_PUBLISHABLE_KEY>"
npm run configure:public
npm run check
```

`supabase-config.js` 中的 Project URL 和 publishable key 会随静态前端公开，这是 Supabase 的预期用法；权限由 RLS 控制。

### 6. 本地与线上验证

```powershell
npm run dev
```

访问 `http://127.0.0.1:4173/`。本地服务器只提供网页与素材，不提供 `.git`、脚本、交接文件或依赖目录。设置私有 `ADMIN_PASSWORD` 后，可运行 `npm run check:auth` 验证当前 admin 与关闭注册状态下的后端权限。

独立测试项目可使用本地专用模式，不会改写正式配置文件：在当前终端设置测试项目的 `SUPABASE_TEST_PUBLISHABLE_KEY`，然后运行 `npm run dev:test`。此模式固定连接 `ldozxltmzdbvfuupqsum`，仅接受 `sb_publishable_` 密钥，并在 `http://127.0.0.1:4174/` 启用本地邮件界面；实际注册仍受测试项目的数据库规则控制。测试项目 Site URL 应为该地址，恢复密码回跳也需在测试项目 URL Configuration 中允许。切勿将 secret key 填入该变量。

在测试项目尚未配置邀请码且已启用注册 Hook 时，可用同一公开 key 运行 `npm run check:test-auth`，核查关闭状态、匿名权限及错误邀请码拦截。该检查固定使用测试项目，不应替代正确邀请码、并发或真实邮件验证。

需要首次初始化测试管理员时，可在项目目录运行 `node scripts/initialize-test-admin-interactive.mjs`，按提示隐藏输入测试项目现有的 secret key 和自定测试密码。程序只连接测试项目，若测试管理员已存在则停止，不会重设其密码。若执行中出错，先核查测试项目账号与资料后再继续。

配置 SMTP 和邀请码哈希后启用 `emailFlowsEnabled`，由真实受邀住客完成正式项目的注册、确认和密码找回验证。推送 `main` 后，GitHub Pages 会自动更新。

## admin 忘记密码

admin 使用内部认证邮箱，不接收找回邮件。通过 Supabase 后台的 secret key 手动重置：

```powershell
$env:SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
$env:SUPABASE_SECRET_KEY="<SUPABASE_SECRET_KEY>"
$env:ADMIN_PASSWORD="<NEW_PASSWORD>"
npm run reset:admin
```

## 安全边界

- 浏览器只接触 Supabase URL 和 publishable key。
- secret key、admin 密码、邀请码明文和真实邀请码哈希只通过私有环境变量处理。
- `private.registration_config` 不暴露给匿名或普通登录用户。
- `Before User Created` Hook 提前拒绝错误邀请码；创建用户触发器再次校验并锁定私有配置，避免绕过与并发竞争。
- 密码由 Supabase Auth 存储和校验，不写入项目数据库表或 Git 历史。
