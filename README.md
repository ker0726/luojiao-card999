# 罗娇 · 个人数字名片与作品集

武汉理工大学 数字经济 2502 班 · 学号 1025007580 ·「数智编程」课程结课作业

## 项目简介

纯静态单页个人数字名片，包含 Hero 身份区、教育背景、作品集（e次元账本 / 像素小恐龙闯关 / 智学伴侣）、技能标签云、联系区共五个板块。深色科技风 + 玻璃拟态卡片，响应式适配手机 / 平板 / 桌面。

## 技术栈

- 单文件 `index.html`：HTML + CSS + JavaScript 全部内联
- 零框架、零构建、零外部图片（图标与作品封面均为内联 SVG）
- Canvas 粒子背景、IntersectionObserver 滚动显现、数据驱动模态框
- 无 package.json，无后端，任意静态托管平台均可直接部署

## 目录结构

```
├── index.html    # 网站全部内容（唯一页面）
├── vercel.json   # Vercel 可选配置（安全响应头，非必需）
├── README.md     # 本文件
└── DEPLOY.md     # 两种部署方式的详细步骤与平台对比
```

## 公网访问链接（两种部署方式）

| 部署方式 | 公网链接 | 状态 |
| --- | --- | --- |
| GitHub Pages | `https://<GitHub用户名>.github.io/luojiao-card/` | 待部署后补全 |
| Vercel | `https://luojiao-card.vercel.app` | 待部署后补全 |

> 部署完成后，把上面两个占位链接替换为真实地址即可。操作步骤见 [DEPLOY.md](./DEPLOY.md)。

## 本地预览

```bash
# 任选其一，然后浏览器打开 http://localhost:8000
python -m http.server 8000
# 或直接双击 index.html
```
