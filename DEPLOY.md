# 部署手册：GitHub Pages + Vercel 双平台上线

本项目为纯静态单文件站点（根目录 `index.html`），以下两种方式的最终链接：

| 平台 | 最终公网链接 |
| --- | --- |
| GitHub Pages | https://ker0726.github.io/luojiao-card999/ |
| Vercel | https://luojiao-card999.vercel.app |

> 代码已推送至 https://github.com/ker0726/luojiao-card999 （提交 09fb959）。

---

## 前置：本地 Git 提交（已完成可跳过）

```bash
git init -b main
git add .
git commit -m "feat: 个人数字名片单页 + 部署文档"
```

---

## 方式一：GitHub Pages

### 步骤

1. **建仓库**：浏览器打开 <https://github.com/new> → Repository name 填 `luojiao-card` → Public → **不要**勾选 "Add a README" → Create repository。
2. **推送代码**（在本项目目录执行）：

   ```bash
   git remote add origin https://github.com/<GitHub用户名>/luojiao-card.git
   git push -u origin main
   ```

   首次推送会弹出登录窗口，用浏览器授权即可（Git Credential Manager 自动处理，无需手动配 SSH）。
3. **开启 Pages**：仓库页 → **Settings → Pages** → Build and deployment：
   - Source：`Deploy from a branch`
   - Branch：`main`，目录 `/ (root)` → Save
4. **等待 1~2 分钟**，访问 `https://<GitHub用户名>.github.io/luojiao-card/`。

### 校验方法

```bash
curl -I https://<GitHub用户名>.github.io/luojiao-card/
# 期望：HTTP/2 200，content-type: text/html
```

浏览器打开后核对：Hero 区显示「罗娇 / 武汉理工大学 · 数字经济2502 / 学号：1025007580」，滚动后作品卡片逐张浮现即成功。

### 推不上去的排查

| 报错 | 原因 | 解决 |
| --- | --- | --- |
| `remote: Repository not found` | 仓库名或用户名拼错，或无权限 | 核对 `git remote -v` 的 URL 与网页地址一致 |
| 一直让输密码 | GitHub 已停用密码认证 | 密码框改填 **Personal Access Token**（github.com → Settings → Developer settings → Tokens (classic) → 勾 `repo` 权限生成） |
| `failed to push some refs` | 远程有初始提交 | 建仓库时不要勾 README；或先 `git pull --rebase origin main` 再 push |
| Pages 开了但 404 | 分支/目录选错或还在构建 | 确认 Settings → Pages 显示 "Your site is live at ..."，根目录确有 `index.html`，等 2 分钟刷新 |

---

## 方式二：Vercel（导入 GitHub 仓库）

### 步骤

1. 完成方式一的第 1~2 步（代码已在 GitHub 上）。
2. 打开 <https://vercel.com/new> → 用 **GitHub 账号登录** → Import Git Repository 选中 `luojiao-card`。
3. 配置页保持：
   - Framework Preset：**Other**
   - Build Command：**留空**
   - Output Directory：**`.`**
   - 无需 vercel.json（仓库里这份只是加了安全响应头，留着也不影响）
4. 点 **Deploy**，约 30 秒得到 `https://luojiao-card.vercel.app`。
5. 之后每次 `git push`，Vercel 自动重新部署，链接不变。

### 校验方法

```bash
curl -I https://luojiao-card.vercel.app
# 期望：HTTP/2 200
```

浏览器打开核对内容同上。

### 备选：Netlify（不想用 Vercel 时）

- 最简单：打开 <https://app.netlify.com/drop>，把整个项目文件夹**拖进去**，立即得到 `https://<随机名>.netlify.app`（可在 Site settings 改名）。
- 或连接 Git 仓库持续部署：Build command 留空，Publish directory 填 `.`。

---

## 三种平台差异对比

| 维度 | GitHub Pages | Vercel | Netlify |
| --- | --- | --- | --- |
| 是否免费 | 免费（公开仓库） | 免费（Hobby 档） | 免费（Starter 档） |
| 是否需要构建 | 不需要，直接托管静态文件 | 不需要（本项目 Build 留空） | 不需要（可拖文件夹） |
| 自动 HTTPS | 有 | 有 | 有 |
| 自动重新部署 | push 后自动更新 | push 后自动更新 | 连 Git 后自动更新；拖拽方式需手动重拖 |
| 国内直连访问 | 一般可访问，偶尔波动 | 偶尔波动 | 一般可访问 |
| 适合场景 | 课程作业、简历页、项目主页，链接带用户名显得正式 | 前端项目作品集，部署最快、自带预览环境 | 快速 demo、临时分享、表单类小站 |

**大白话结论（交作业怎么选）**：

- **GitHub Pages 最稳**：链接里带你的用户名和仓库名，老师一看就知道是你的仓库，且和代码托管绑在一起，交作业首选。
- **Vercel 最快**：登 GitHub → 导入 → 点 Deploy，一分钟出链接，适合作为第二个平台证明你掌握了两种部署方式。
- Netlify 当备胎：前两个出问题时，拖文件夹 30 秒搞定。

---

## 部署后回填

两个平台都上线后，把本文档和 `README.md` 中的占位链接替换为真实地址，再 `git add . && git commit -m "docs: 回填正式链接" && git push` 即可。
