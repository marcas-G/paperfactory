#!/bin/bash
# ============================================================
# PaperFactory 部署脚本
#
# 用法:
#   ./deploy.sh build       # 构建所有镜像
#   ./deploy.sh up          # 部署到服务器
#   ./deploy.sh down        # 停止服务
#   ./deploy.sh test        # 部署前测试
#   ./deploy.sh full        # build + test + up
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY="${REGISTRY:-localhost:5000}"
IMAGE_NAME="${IMAGE_NAME:-paperfactory}"
TAG="${TAG:-$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo 'dev')}"

deploy_build() {
  echo ">> 构建 Python 镜像..."
  docker build -f "$PROJECT_DIR/docker/Dockerfile.python" \
    --target prod \
    -t "$REGISTRY/$IMAGE_NAME-python:$TAG" \
    -t "$REGISTRY/$IMAGE_NAME-python:latest" \
    "$PROJECT_DIR"

  echo ">> 构建 TypeScript 镜像..."
  docker build -f "$PROJECT_DIR/ts/Dockerfile" \
    --target prod \
    -t "$REGISTRY/$IMAGE_NAME-ts:$TAG" \
    -t "$REGISTRY/$IMAGE_NAME-ts:latest" \
    "$PROJECT_DIR/ts"

  echo ">> 推送镜像..."
  docker push "$REGISTRY/$IMAGE_NAME-python:$TAG"
  docker push "$REGISTRY/$IMAGE_NAME-python:latest"
  docker push "$REGISTRY/$IMAGE_NAME-ts:$TAG"
  docker push "$REGISTRY/$IMAGE_NAME-ts:latest"

  echo ">> 构建完成: $REGISTRY/$IMAGE_NAME:$TAG"
}

deploy_up() {
  cd "$SCRIPT_DIR"
  export PAPERFACTORY_TAG="$TAG"
  echo ">> 部署 (tag=$TAG)..."
  docker compose pull
  docker compose up -d
  echo ">> 部署完成"
}

deploy_down() {
  cd "$SCRIPT_DIR"
  echo ">> 停止服务..."
  docker compose down
  echo ">> 已停止"
}

deploy_test() {
  echo ">> 运行 Python 测试..."
  docker compose --profile test-python run --rm test-py

  echo ">> 运行 TypeScript 测试..."
  docker compose --profile test-typescript run --rm test-ts

  echo ">> 测试完成"
}

deploy_full() {
  deploy_build
  deploy_test
  deploy_up
}

case "${1:-}" in
  build)   deploy_build ;;
  up)      deploy_up ;;
  down)    deploy_down ;;
  test)    deploy_test ;;
  full)    deploy_full ;;
  *)
    echo "用法: $0 {build|up|down|test|full}"
    exit 1
    ;;
esac
