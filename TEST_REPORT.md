# 本地开发与认证验证记录

日期：2026-10-30（Asia/Shanghai）

工作区：`E:\Little-Sheep-House`

发布分支：`main`（开发分支：`codex/supabase-auth`）

验证环境：Windows / Microsoft Edge，本地预览 `http://127.0.0.1:4173/`，真实 Supabase 项目 `cjeuimfyuvetfniidrgk`。

## 已完成

### 云端与真实 API

- 项目恢复后控制台显示 Healthy，最小密码长度保存为 8。
- 第二次 admin bootstrap 迁移成功执行；admin 槽位为 1、昵称和性别正确、邮箱已确认。
- 错误密码返回 `invalid_credentials`；正确密码登录成功。
- 会话刷新成功。
- 匿名客户端无法读取 `profiles`，无法调用 `configure_registration` 或 `prepare_admin_seed`。
- admin 只能读到自己的资料，不能枚举其他资料，不能修改资料或调用预授权 RPC。
- 错误邀请码被真实 Before User Created Hook 以 `invite_invalid` 拦截。
- 邀请码尚未配置，注册状态为关闭，第二账号未创建。

后端测试命令：`npm run check:auth`，需要通过私有环境变量提供 `ADMIN_PASSWORD`。此测试适用于当前“仅 admin、注册尚未开放”阶段；不适用于第二账号已创建后的状态。

### 浏览器交互

- 未登录直访 `home.html` 返回 `index.html?error=session`。
- 错误密码显示统一错误；admin 别名正确映射并登录主页。
- 主页展示昵称，刷新后仍保持会话；已有会话访问登录页自动回主页。
- 账户菜单与退出正常，admin 找回密码显示后台重置说明。
- 历史缓存恢复重新校验后显示主页，故事脚本只有一份；退出点击后立即隐藏故事，避免导航期间露出缓存内容。
- 最终退出后点击浏览器返回，仍回到 `index.html?error=session`；退出事件和页面逻辑不会重复触发导航。
- 七幕内容依序可达；回忆卡片和关心卡片展开正常。
- 相册切换至第二张、秘密提示展开正常。
- “就一点点想”两次点击与“超级想”分支均能到达结尾。
- 浏览器返回、页面返回和“再看一次”正常。
- 点击后背景音乐播放正常；刷新时受浏览器自动播放限制会显示点击音符提示。
- 登录页和主页检查实际 CSS 宽度 320、390、430；页面内容没有横向溢出。修复了隐藏返回按钮时账户栏错位，以及窄屏经典滚动条占宽造成的溢出。
- 所有认证表单使用 POST；无效脚本加载时不会把密码放入 GET 查询参数。

截图保存在被 Git 忽略的 `test-results/` 中。

### GitHub 与正式静态文件

- 2026-10-30 已将功能版本 `48405939faafa60f927bec90a348fd2d138aa7cf` 推送到 `main`，本地与远端提交一致。
- GitHub Pages 正式地址已返回新登录页，HTTP 200。
- 线上 `index.html`、`home.html`、`auth.js`、`auth-guard.js`、`supabase-client.js`、`supabase-config.js`、`auth.css`、`styles.css` 均为 HTTP 200，内容与发布版本一致（统一换行后比较）。
- 第二账号邮件功能开关仍为 `false`。
- 以上为静态发布核验，不等同于正式网址的完整登录和邮件流程回归。

## 待完成

- 配置 SMTP 或 Send Email Hook。默认邮件服务仅向 Supabase 组织成员发信，用户已选择稍后处理。
- 生成并配置一次性邀请码，启用 `emailFlowsEnabled`。
- 第二账号注册、确认邮件、邮件找回和双方 RLS 交叉读取测试。
- 使用独立测试数据库验证并发注册；不得为测试消耗生产唯一名额。
- 真实微信内浏览器与手机系统浏览器。
- 正式网址完整登录会话和邮件回跳验证；静态发布已完成。

当前功能版本已同步 GitHub `main`，GitHub Pages 登录入口已生效；第二账号邮件功能保持关闭。
