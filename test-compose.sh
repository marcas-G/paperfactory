#!/bin/bash
# Test: Docker Compose 一键启动所有核心服务
set -e

COMPOSE_FILE="docker/docker-compose.yml"

echo "=== Test 1: Compose 配置有效 ==="
cd docker && docker-compose config > /dev/null 2>&1
echo "PASS"

echo ""
echo "=== Test 2: 核心服务存在 ==="
for svc in postgres migrate ts-app science-service; do
  docker-compose config 2>/dev/null | grep -q "  ${svc}:" && echo "PASS: ${svc}" || { echo "FAIL: ${svc} missing"; exit 1; }
done

echo ""
echo "=== Test 3: 启动核心服务 ==="
docker-compose down 2>/dev/null
docker-compose up -d 2>&1 | tail -3

echo ""
echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  docker-compose ps postgres | grep -q "healthy" && { echo "PASS: PostgreSQL ready after ${i}s"; break; }
  [ "$i" -eq 30 ] && { echo "FAIL: PostgreSQL not ready"; docker-compose down; exit 1; }
  sleep 2
done

echo ""
echo "Waiting for TS app..."
for i in $(seq 1 30); do
  docker-compose ps ts-app | grep -q "healthy" && { echo "PASS: TS app ready after ${i}s"; break; }
  [ "$i" -eq 30 ] && { echo "FAIL: TS app not ready"; docker-compose logs ts-app 2>&1 | tail -10; docker-compose down; exit 1; }
  sleep 2
done

echo ""
echo "Waiting for science service..."
for i in $(seq 1 30); do
  docker-compose ps science-service | grep -q "healthy" && { echo "PASS: Science service ready after ${i}s"; break; }
  [ "$i" -eq 30 ] && { echo "FAIL: Science service not ready"; docker-compose logs science-service 2>&1 | tail -10; docker-compose down; exit 1; }
  sleep 2
done

echo ""
echo "=== Test 4: API health check ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://localhost:3001/health" 2>/dev/null || echo "000")
[ "$HTTP_CODE" = "200" ] && echo "PASS: /health returns 200" || { echo "FAIL: /health returns $HTTP_CODE"; docker-compose down; exit 1; }

echo ""
echo "=== Test 5: Science service health check ==="
SCI_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://localhost:8001/health" 2>/dev/null || echo "000")
[ "$SCI_CODE" = "200" ] && echo "PASS: science /health returns 200" || { echo "FAIL: science /health returns $SCI_CODE"; docker-compose down; exit 1; }

echo ""
echo "=== Test 6: API creates project ==="
RESULT=$(curl -s --connect-timeout 5 -X POST "http://localhost:3001/api/projects" -H "Content-Type: application/json" -d '{"name":"Compose Test"}')
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['id'] != '00000000-0000-4000-a000-000000000000'; assert d['name'] == 'Compose Test'; print('PASS: project created with real UUID')" 2>/dev/null || { echo "FAIL: project creation"; docker-compose down; exit 1; }

echo ""
echo "=== All tests passed ==="
docker-compose down
echo "Cleanup done."
