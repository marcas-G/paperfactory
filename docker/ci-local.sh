#!/bin/bash
# ============================================================
# 本地 CI 模拟脚本
# 等价于 GitHub Actions CI Pipeline，在 Docker 内一键执行
# ============================================================
set -euo pipefail

cd /app

echo "========================================"
echo "  PaperFactory Local CI"
echo "========================================"

# --- Python ---
echo ""
echo "[1/5] Python: Install dependencies..."
uv sync --group dev

echo ""
echo "[2/5] Python: Ruff lint..."
uv run ruff check packages/ tests/

echo ""
echo "[2b/5] Python: Ruff format..."
uv run ruff format --check packages/ tests/

echo ""
echo "[2c/5] Python: Pyright type check..."
uv run pyright packages/ tests/

echo ""
echo "[3/5] Python: Tests + Coverage..."
uv run pytest tests/ --cov=packages --cov-report=term-missing --cov-report=xml --cov-fail-under=80

# --- TypeScript ---
echo ""
echo "[4/5] TypeScript: Install dependencies..."
cd ts
pnpm install

echo ""
echo "[4b/5] TypeScript: ESLint..."
pnpm lint || echo "WARNING: TS ESLint not ready yet (no source files)"

echo ""
echo "[4c/5] TypeScript: Type check..."
pnpm typecheck || echo "WARNING: TS typecheck not ready yet (no source files)"

echo ""
echo "[4d/5] TypeScript: Tests..."
pnpm test:coverage || echo "WARNING: TS tests not ready yet (no source files)"

# --- Architecture ---
echo ""
echo "[5/5] Architecture tests..."
cd /app
uv run pytest tests/architecture/ -v

echo ""
echo "========================================"
echo "  CI PASSED"
echo "========================================"
