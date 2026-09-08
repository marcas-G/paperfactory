export interface PaperInfo {
  title: string;
  authors: string;
  year: string;
  url?: string;
  summary?: string;
}

/** 结构化活动项：agent 过程时间线的最小单元（Manus 式过程感的核心） */
export interface ActivityItem {
  kind: 'phase' | 'thinking' | 'tool' | 'review';
  /** 主文案，如 "文献调研" / "调用 literature_search" / "第 2 轮推理" */
  label: string;
  status: 'active' | 'done' | 'error';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  /** 结果摘要，如 "5 papers" / "exit 0" */
  resultSummary?: string;
  /** 可展开详情（原始 JSON / 输出文本） */
  detail?: string;
  timestamp?: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';

  /** 正文（Markdown 渲染） */
  content?: string;

  /** 文献卡片 */
  papers?: PaperInfo[];

  /** 假设卡片 */
  hypothesis?: string;

  /** 活动时间线：同一阶段的 thinking/工具调用聚合展示 */
  activities?: ActivityItem[];

  /** 报告文档容器模式（带标题栏的文档卡片） */
  isReport?: boolean;
  reportTitle?: string;

  /** 人工审批 */
  needsApproval?: boolean;
  approvalSummary?: string;
  approvalRunId?: string;

  /** 兼容旧数据 */
  isThinking?: boolean;
  thinkingText?: string;
}
