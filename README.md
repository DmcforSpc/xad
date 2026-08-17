# D.FS

> 少年没有乌托邦，心向远方自明朗。

D.FS 是一个用于记录 Web 安全、CTF、渗透测试与学习过程的个人技术博客。
站点基于 Jekyll 和 Chirpy 构建，并在主题之上实现了独立的视觉、交互与文章加密能力。

[访问博客](https://dmcforspc.github.io/xad/) · [GitHub 仓库](https://github.com/DmcforSpc/xad)

## 项目特性

- 深色与浅色双主题，以及响应式页面布局
- 文章分类、标签、归档、目录和全文导航
- 本地字体与静态资源，减少关键资源的外部依赖
- PWA 与离线缓存支持
- 可选的文章密码保护，密码仅通过 GitHub Secrets 注入
- GitHub Actions 自动构建并部署到 GitHub Pages

## 技术栈

- Jekyll、Liquid、Kramdown
- Chirpy Theme
- Sass、JavaScript
- GSAP、ScrollTrigger、Lenis
- GitHub Actions、GitHub Pages

## 本地运行

环境要求：Git、Ruby、Bundler。

```bash
git clone https://github.com/DmcforSpc/xad.git
cd xad
bundle install
bundle exec jekyll serve --livereload
```

启动后访问 <http://127.0.0.1:4000/xad/>。

仓库也提供了本地运行和完整检查脚本：

```bash
bash tools/run.sh
bash tools/test.sh
```

## 编写文章

文章放在 `_posts/`，文件名遵循 `YYYY-MM-DD-title.md`。基本 Front Matter 示例：

```yaml
---
title: 文章标题
date: 2026-08-18 20:00
categories: 学习笔记
tags:
  - WEB
author: DmcforSpc
description: 一段用于列表和 SEO 的文章摘要
---
```

文章图片统一放在 `assets/img/attachments/`。提交前建议执行：

```bash
bundle exec jekyll build
```

## 加密文章

需要密码保护的文章可增加以下 Front Matter：

```yaml
locked: true
lock_id: post-example
description: 受保护文章的公开摘要
```

在 GitHub 仓库的 Actions Secrets 中配置 `POST_PASSWORDS`，内容为 JSON 对象：

```json
{"post-example":"your-password"}
```

不要把真实密码写入文章、配置文件或提交历史。部署时，工作流会在 Jekyll 构建完成后执行
`scripts/encrypt_posts.py`，将对应文章替换为浏览器端解锁页面。

## 部署

推送到 `main` 分支后，[Pages 工作流](.github/workflows/pages-deploy.yml)会依次完成：

1. 安装 Ruby 与 Bundler 依赖
2. 构建 Jekyll 站点
3. 处理需要密码保护的文章
4. 上传并部署 GitHub Pages 产物

站点地址由 `_config.yml` 中的 `url` 与 `baseurl` 控制。

## 目录结构

```text
.
├── _posts/                 # 博客文章
├── _tabs/                  # 关于、归档、分类等页面
├── _layouts/               # 页面布局
├── _includes/              # 可复用页面片段
├── _sass/redesign/         # 自定义设计系统与页面样式
├── assets/                 # 图片、字体、样式与脚本
├── scripts/                # 本地预览和文章加密工具
├── .github/workflows/      # GitHub Pages 部署工作流
├── _config.yml             # Jekyll 站点配置
├── Gemfile                 # Ruby 依赖声明
└── Gemfile.lock            # Ruby 依赖版本锁定
```

## 许可证

本项目基于 [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy) 进行定制，
相关代码遵循 [MIT License](LICENSE)。第三方字体与前端库的许可证位于对应资源目录。
