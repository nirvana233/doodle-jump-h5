# Bouncy Hop! 🎮

一款使用原生 JavaScript + Canvas 编写的竖屏跳跃游戏（类似"涂鸦跳跃"风格），**v15.0**。

> **在线体验** → [点击这里](https://bouncy-hop.pages.dev)（部署后更新）

---

## 🚀 快速部署

### 方式一：Cloudflare Pages（推荐，免费无需信用卡）

1. **运行一键部署脚本**（会自动初始化 Git 并推送代码到 GitHub）：
   ```bash
   bash deploy.sh
   ```

2. 根据脚本提示，在 [Cloudflare Dashboard](https://dash.cloudflare.com/sign-up) 中：
   - 进入 **Workers & Pages → Pages → 创建 → 连接到 Git**
   - 选择刚推送的仓库
   - 构建设置：框架预设选 **None**，构建输出目录填 **`/`**
   - 点击 **保存并部署**

3. 部署完成后获得 `https://bouncy-hop-xxx.pages.dev` 域名

### 方式二：GitHub Actions 自动化

1. 获取 [Cloudflare API Token](https://dash.cloudflare.com/profile/api-tokens)
2. 在 GitHub 仓库设置中添加 Secret: `CLOUDFLARE_API_TOKEN`
3. 每次推送到 `main` 分支会自动部署

### 方式三：直接使用 Gh-Pages

```bash
# 手动部署到 GitHub Pages
git checkout -b gh-pages
git push origin gh-pages
# 然后在仓库 Settings → Pages 中启用 gh-pages 分支
```

### 方式四：Wrangler CLI 一键部署

```bash
npx wrangler pages deploy . --project-name=bouncy-hop
```

---

## 🎯 游戏特性

- **5 种平台**：普通、移动、易碎、一次性、时效渐隐
- **3 种道具**：竹蜻蜓（飞行）、火箭（极速）、护盾（保护）
- **2 种敌人**：巡逻怪物、引力黑洞
- **9 种角色皮肤**：经典绿、蜜桃粉、天空蓝、黄金色、库洛米、哆啦A梦、海绵宝宝、皮卡丘、自定义女孩
- **13 种音效**：纯 Web Audio API 合成，无需外部音频文件
- **多端操控**：键盘 / 鼠标 / 重力感应 / 触屏

---

## 🎮 操作方式

| 操作 | PC | 手机 |
|------|-----|------|
| 移动 | A/D 或 ←/→ | 重力感应倾斜 |
| 射击 | 空格/W/↑ 或鼠标点击 | 轻点屏幕 |
| 暂停 | P 键或按钮 | 按钮 |

---

## 🛠 项目结构

```
├── index.html          # HTML 入口
├── style.css           # 暗黑磨砂玻璃 UI 样式
├── src/
│   ├── assets.js       # 视觉绘制器 + 音效引擎
│   ├── entities.js     # 游戏实体与粒子系统
│   ├── physics.js      # 物理碰撞引擎 + 关卡生成
│   └── game.js         # 主控制中心与渲染循环
├── assets/
│   ├── skin-girl.png   # 自定义皮肤（可选）
│   └── README.md       # 皮肤使用说明
├── deploy.sh           # 一键部署脚本
└── .github/workflows/  # GitHub Actions 自动部署
```

---

## 🎨 自定义皮肤

详见 [assets/README.md](assets/README.md)
