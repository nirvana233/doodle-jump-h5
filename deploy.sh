#!/usr/bin/env bash
# ============================================================
# Bouncy Hop 🎮 — 一键部署脚本
# 支持：Cloudflare Pages（首选，免费无需信用卡）
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------- 前置检查 ----------
check_prereqs() {
    info "检查环境依赖..."

    if ! command -v git &>/dev/null; then
        err "需要安装 Git: https://git-scm.com/downloads"
        exit 1
    fi
    ok "Git 已安装"

    if ! command -v node &>/dev/null; then
        warn "Node.js 未检测到，将跳过本地 Wrangler 安装（不影响 GitHub Actions 部署）"
    else
        ok "Node.js $(node -v) 已安装"
    fi

    if command -v gh &>/dev/null; then
        ok "GitHub CLI (gh) 已安装"
        HAS_GH=true
    else
        warn "GitHub CLI (gh) 未安装，可手动创建仓库（不影响部署流程）"
        HAS_GH=false
    fi
}

# ---------- Git 初始化 ----------
init_git() {
    if [ -d ".git" ]; then
        info "Git 仓库已存在"
        return
    fi

    info "初始化 Git 仓库..."
    git init
    git checkout -b main
    ok "Git 仓库初始化完成"
}

# ---------- 创建 GitHub 仓库 ----------
create_github_repo() {
    local repo_name
    repo_name=$(basename "$(pwd)")

    if $HAS_GH; then
        if gh repo view "$repo_name" &>/dev/null 2>&1; then
            info "GitHub 仓库 '$repo_name' 已存在"
        else
            info "在 GitHub 上创建仓库 '$repo_name'..."
            gh repo create "$repo_name" --public --push --source=. --remote=origin
            ok "GitHub 仓库已创建并推送代码"
        fi
    else
        warn "请手动创建 GitHub 仓库:"
        echo "  1. 打开 https://github.com/new"
        echo "  2. 仓库名: $(basename "$(pwd)")"
        echo "  3. 选择 Public"
        echo "  4. 不要勾选初始化选项"
        echo "  5. 创建后运行以下命令:"
        echo "     git remote add origin https://github.com/你的用户名/$(basename "$(pwd)").git"
        echo "     git push -u origin main"
        echo ""
        read -rp "按回车键继续（确认已推送代码到 GitHub）..."
    fi
}

# ---------- 提交并推送代码 ----------
commit_and_push() {
    info "提交代码..."

    if git status --porcelain | grep -q .; then
        git add -A
        git commit -m "Initial commit: Bouncy Hop game v15.0"
        ok "代码已提交"
    else
        info "没有新的更改需要提交"
    fi

    if git remote -v | grep -q origin; then
        info "推送代码到 GitHub..."
        git push -u origin main || warn "推送失败，请检查远程仓库配置"
        ok "代码已推送到 GitHub"
    fi
}

# ---------- Cloudflare Pages 部署说明 ----------
cloudflare_pages_guide() {
    echo ""
    echo "============================================================"
    echo -e "  ${GREEN}🎉 部署准备完成！${NC}"
    echo "============================================================"
    echo ""
    echo -e "  ${CYAN}📌 下一步：连接到 Cloudflare Pages 实现自动部署${NC}"
    echo ""
    echo "  1. 注册/登录 Cloudflare (免费，无需信用卡)"
    echo "     → https://dash.cloudflare.com/sign-up"
    echo ""
    echo "  2. 进入 Cloudflare Dashboard → Workers & Pages → Pages"
    echo ""
    echo "  3. 点击「创建应用程序」→「Pages」→「连接到 Git」"
    echo ""
    echo "  4. 授权 GitHub，选择仓库: $(basename "$(pwd)")"
    echo ""
    echo "  5. 在构建设置中填写（纯静态项目无需构建）:"
    echo "     框架预设:   None"
    echo "     构建命令:   (留空)"
    echo "     构建输出:   / (根目录)"
    echo "     根目录:     (留空)"
    echo ""
    echo "  6. 点击「保存并部署」→ 等待部署完成 ✅"
    echo ""
    echo "  🔗 部署完成后你会获得一个 *.pages.dev 域名"
    echo "  💡 可在 Cloudflare Pages 的「自定义域」中绑定自己的域名"
    echo ""
    echo "  🔄 后续更新：只需推送代码到 GitHub main 分支，"
    echo "     Cloudflare Pages 会自动重新构建部署！"
    echo ""
    echo "============================================================"

    # 尝试自动注册/安装 Wrangler (Cloudflare CLI)
    if command -v npx &>/dev/null; then
        echo ""
        warn "你也可以通过 Wrangler CLI 直接部署（如果已登录 Cloudflare 账号）:"
        echo "  npx wrangler pages deploy . --project-name=bouncy-hop"
    fi
}

# ---------- GitHub Actions 手动部署 ----------
github_actions_guide() {
    echo ""
    echo -e "  ${CYAN}📌 备用方案：通过 GitHub Actions 部署${NC}"
    echo ""
    echo "  已创建 .github/workflows/deploy.yml"
    echo "  如需启用，请在 GitHub 仓库设置中添加 Secrets:"
    echo ""
    echo "  1. 获取 Cloudflare API Token:"
    echo "     Cloudflare Dashboard → 我的个人资料 → API 令牌"
    echo "     → 创建令牌 → Cloudflare Pages"
    echo ""
    echo "  2. 在 GitHub 仓库添加 Secret:"
    echo "     仓库 → Settings → Secrets and variables → Actions"
    echo "     添加 CLOUDFLARE_API_TOKEN"
    echo ""
    echo "  3. 推送代码到 main 即可自动部署"
    echo ""
}

# ============================================================
# 主流程
# ============================================================
main() {
    echo ""
    echo -e "  ${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "  ${GREEN}║    Bouncy Hop 🎮 — 一键部署工具         ║${NC}"
    echo -e "  ${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    check_prereqs
    echo ""
    init_git
    commit_and_push
    echo ""
    create_github_repo
    echo ""
    cloudflare_pages_guide
    echo ""
    github_actions_guide

    echo -e "${GREEN}✅ 部署准备完成！${NC}"
    echo "请按照上面的步骤在 Cloudflare Pages 控制台完成最后配置。"
    echo ""
}

main "$@"
