export interface CognitiveMode {
  name: string;
  instructions: string;
  applicableTo: string[];
}

export const COGNITIVE_MODES: CognitiveMode[] = [
  {
    name: "FRAME",
    instructions:
      "定义问题边界和研究框架。明确研究问题的范围、假设的前提条件、以及验证的标准。确保问题可操作、可测试。在设计 Protocol 时，明确实验设计的约束条件。",
    applicableTo: [
      "ResearchQuestion",
      "Protocol",
      "KnowledgeItem",
    ],
  },
  {
    name: "EXPLORE",
    instructions:
      "广泛探索信息空间，不要过早收敛。收集多样化的信息来源，关注不同视角和可能性。在文献调研中，搜索多个关键词组合，发现非显而易见的关联。保持开放心态，记录所有发现。",
    applicableTo: [
      "KnowledgeItem",
      "ResearchQuestion",
    ],
  },
  {
    name: "MAP",
    instructions:
      "映射对象之间的关系和结构。分析引用网络、概念图谱和依赖关系。识别聚类、桥接节点和孤立区域。理解信息的全局拓扑结构。",
    applicableTo: [
      "KnowledgeItem",
      "Evidence",
    ],
  },
  {
    name: "COMPARE",
    instructions:
      "系统对比不同方法、假设或来源。识别相似性和差异，评估各自的优劣势。在 venue 匹配中，对比期刊范围、影响因子和审稿周期。保持客观，避免确认偏误。",
    applicableTo: [
      "Hypothesis",
      "Submission",
      "KnowledgeItem",
    ],
  },
  {
    name: "FALSIFY",
    instructions:
      "主动寻找反例和证伪证据。对每个假设，思考什么观察结果会否定它。寻找与当前结论冲突的证据。挑战自己的推理链条。在 self-review 中，攻击论文的每个论点。科学进步来自证伪，而非确认。",
    applicableTo: [
      "Hypothesis",
      "ResearchGap",
      "Report",
      "Submission",
      "Evidence",
    ],
  },
  {
    name: "DIAGNOSE",
    instructions:
      "诊断问题的根本原因。当实验失败或结果异常时，系统性排查可能的原因：实验设计缺陷、执行错误、外部干扰、假设本身的问题。使用排除法逐一验证每个可能的原因。",
    applicableTo: [
      "Result",
      "Experiment",
      "Report",
    ],
  },
  {
    name: "DISCRIMINATE",
    instructions:
      "区分竞争解释，找到能够区分不同假设的关键证据。设计判别性实验，使不同假设产生可区分的预测。在 gap 识别中，区分真正的知识缺口和已有研究覆盖的区域。",
    applicableTo: [
      "Hypothesis",
      "ResearchQuestion",
      "ResearchGap",
    ],
  },
  {
    name: "VERIFY",
    instructions:
      "验证证据与结论之间的一致性。检查结果是否支持声明，确保推理链条完整。交叉验证不同来源的证据。确认统计显著性和效应大小。保证可重现性。",
    applicableTo: [
      "Result",
      "Evidence",
      "KnowledgeItem",
      "Protocol",
    ],
  },
  {
    name: "SYNTHESIZE",
    instructions:
      "综合多个来源的证据形成统一结论。整合文献发现，识别共识和分歧。在论文写作中，将分散的证据编织成连贯的叙事。确保结论有充分的证据支撑，同时承认局限性。",
    applicableTo: [
      "Report",
      "ResearchQuestion",
      "Evidence",
      "KnowledgeItem",
    ],
  },
  {
    name: "DECIDE",
    instructions:
      "基于证据做出最终决策。权衡支持和反对的证据，考虑风险和收益。在投稿决策中，评估期刊匹配度、审稿风险和发表价值。决策必须基于证据，而非直觉或偏好。",
    applicableTo: [
      "Submission",
      "Hypothesis",
      "ResearchQuestion",
    ],
  },
  {
    name: "PLAN",
    instructions:
      "在采取行动之前，先生成详细的执行计划。明确：需要哪些信息、使用什么工具、按什么顺序执行、如何验证结果。计划应该具体、可执行、可验证。",
    applicableTo: [
      "ResearchQuestion",
      "Protocol",
      "Experiment",
      "Report",
    ],
  },
  {
    name: "REFLECT",
    instructions:
      "在行动后反思结果质量。问自己：结果充分吗？有什么不足之处？下次可以改进什么？基于反思调整后续策略。反思要具体，指出明确的问题和改进方向。",
    applicableTo: [
      "KnowledgeItem",
      "Evidence",
      "Result",
      "Hypothesis",
    ],
  },
  {
    name: "DEBATE",
    instructions:
      "扮演对立角色进行辩论。支持方论证观点的合理性，反对方寻找漏洞和反例，裁判基于证据做出裁决。辩论应该基于证据和逻辑，而非立场。多轮辩论后达成共识。",
    applicableTo: [
      "Hypothesis",
      "Evidence",
      "Report",
      "Submission",
    ],
  },
];

export function getCognitiveModeByName(name: string): CognitiveMode | undefined {
  return COGNITIVE_MODES.find((m) => m.name === name);
}
