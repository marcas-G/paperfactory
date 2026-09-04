# PaperFactory Phase 报告

## 元数据

| 字段 | 值 |
|------|-----|
| **Phase** | {{PHASE_NAME}} |
| **Phase 编号** | {{PHASE_NUMBER}} |
| **开始时间** | {{START_TIME}} |
| **完成时间** | {{END_TIME}} |
| **耗时** | {{DURATION}} |
| **负责人** | Agent (PaperFactory Dev Team) |
| **状态** | ✅ COMPLETED |

---

## 1. Phase 概述

### 1.1 目标

{{PHASE_GOAL}}

### 1.2 设计依据

本 Phase 实现内容对应设计文档 `docs/design/architecture-v3.md` 的以下章节：

{{DESIGN_SECTIONS}}

### 1.3 入口条件

| 条件 | 状态 |
|------|------|
| {{ENTRY_CONDITIONS}} | ✅ |

### 1.4 出口条件（验收标准）

| 标准 | 结果 |
|------|------|
| {{EXIT_CRITERIA}} | ✅/❌ |

---

## 2. 任务完成清单

| # | 任务 | 文件 | 状态 | 备注 |
|---|------|------|------|------|
| {{TASK_TABLE}} | | | | |

---

## 3. 代码变更

### 3.1 文件统计

| 类型 | 数量 |
|------|------|
| 新增文件 | {{FILES_ADDED}} |
| 修改文件 | {{FILES_MODIFIED}} |
| 删除文件 | {{FILES_DELETED}} |
| 总变更行数 | {{LINES_CHANGED}} |
| + 新增行 | {{LINES_ADDED}} |
| - 删除行 | {{LINES_DELETED}} |

### 3.2 新增文件清单

{{NEW_FILES_LIST}}

### 3.3 目录结构变更

{{DIR_TREE_DIFF}}

---

## 4. 测试报告

### 4.1 总览

| 指标 | 值 |
|------|-----|
| 测试总数 | {{TOTAL_TESTS}} |
| 通过 | {{PASSED_TESTS}} |
| 失败 | {{FAILED_TESTS}} |
| 跳过 | {{SKIPPED_TESTS}} |
| 通过率 | {{PASS_RATE}} |
| 新增测试数 | {{NEW_TESTS}} |

### 4.2 覆盖率

| 维度 | 值 | 要求 | 状态 |
|------|-----|------|------|
| 语句覆盖率 | {{STMT_COV}}% | ≥{{STMT_THRESHOLD}}% | ✅/❌ |
| 分支覆盖率 | {{BRANCH_COV}}% | ≥{{BRANCH_THRESHOLD}}% | ✅/❌ |
| 函数覆盖率 | {{FUNC_COV}}% | ≥{{FUNC_THRESHOLD}}% | ✅/❌ |
| 行覆盖率 | {{LINE_COV}}% | ≥{{LINE_THRESHOLD}}% | ✅/❌ |

### 4.3 测试文件清单

{{TEST_FILES_LIST}}

### 4.4 关键测试场景

| 场景 | 输入 | 预期 | 实际 |
|------|------|------|------|
| {{KEY_SCENARIOS}} | | | |

---

## 5. CI/CD 状态

| 检查项 | 结果 |
|--------|------|
| Lint | {{LINT_STATUS}} |
| Type Check | {{TYPECHECK_STATUS}} |
| Unit Tests | {{UNIT_TEST_STATUS}} |
| Integration Tests | {{INTEGRATION_TEST_STATUS}} |
| Docker Build | {{DOCKER_STATUS}} |
| Coverage Threshold | {{COVERAGE_STATUS}} |

---

## 6. 问题与风险

### 6.1 已解决问题

| # | 问题 | 解决方案 |
|---|------|---------|
| {{RESOLVED_ISSUES}} | | |

### 6.2 待决策事项

| # | 事项 | 建议 | 影响 |
|---|------|------|------|
| {{DECISIONS_NEEDED}} | | | |

### 6.3 已知限制

{{KNOWN_LIMITATIONS}}

---

## 7. 技术决策记录

{{TECHNICAL_DECISIONS}}

---

## 8. 下一步

### 8.1 下 Phase：{{NEXT_PHASE_NAME}}

| 项目 | 内容 |
|------|------|
| 目标 | {{NEXT_PHASE_GOAL}} |
| 入口条件 | {{NEXT_ENTRY_CONDITIONS}} |
| 预估工作量 | {{NEXT_ESTIMATE}} |
| 风险 | {{NEXT_RISKS}} |

---

## 附录

### A. 完整测试输出

{{TEST_OUTPUT}}

### B. Git Commit 列表

{{COMMIT_LIST}}

### C. 设计文档变更

{{DESIGN_CHANGES}}
