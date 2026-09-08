export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content?: string;

  // Tool cards
  papers?: Array<{ title: string; authors: string; year: string }>;
  hypothesis?: string;

  // Approval
  needsApproval?: boolean;
  approvalSummary?: string;
  approvalRunId?: string;

  // Thinking
  isThinking?: boolean;
  thinkingText?: string;
}
