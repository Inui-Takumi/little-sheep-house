# 全世界最聪明的小羊的专属网络小屋

一个面向手机浏览器的七幕互动网站，用来表达想念、记录回忆、展示相册和传递关心。

## 在线地址

- GitHub Pages：https://inui-takumi.github.io/little-sheep-house/

## 项目结构

- `index.html`：七个互动场景及主要文案
- `styles.css`：移动端布局、动画与响应式样式
- `script.js`：场景切换、音乐、相册、返回和整蛊交互
- `background-music.mp3`：背景音乐
- `characters/`：小羊 Q 版动画及静态封面
- `photos/`：时光相册图片

## 本地预览

在项目目录执行：

```powershell
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

## 发布说明

GitHub Pages 直接发布 `main` 分支根目录。提交并推送到 `main` 后，线上页面会自动更新。

项目中的照片、动画和音乐会随公开仓库一同公开，请勿加入不希望公开的私人信息。
