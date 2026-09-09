/**
 * REQ-R5 引用门（Citation Gate）：
 * 研究报告的引用必须 ⊆ 已入库知识条目的来源——未命中者剥离并计数，
 * 宪法 "Evidence changes research state; prose does not" 的程序化防线。
 */

export interface CitationGateResult {
  /** 清洗后的报告文本（未命中引用被替换） */
  content: string;
  /** 命中的引用数 */
  sourced: number;
  /** 被剥离的引用数 */
  unsourced: number;
  /** 被剥离的引用明细（审计用） */
  removed: string[];
}

const URL_PATTERN = /https?:\/\/[^\s)\]"'<>。，；、）】]+/g;

/** 从知识条目提取全部合法来源 URL（sourceIds / metadata.url / metadata 来源字段）。 */
export function collectKnownSources(
  knowledgeItems: ReadonlyArray<Record<string, unknown>>,
): Set<string> {
  const known = new Set<string>();
  for (const item of knowledgeItems) {
    const sourceIds = (item.sourceIds as Array<string> | undefined) ?? [];
    for (const s of sourceIds) if (s) known.add(s);
    const meta = (item.metadata as Record<string, unknown> | undefined) ?? {};
    const url = meta.url as string | undefined;
    if (url) known.add(url);
  }
  return known;
}

/**
 * 对报告文本执行引用门：文本中每个 URL 若不在已知来源集内，
 * 替换为 "[unsourced citation removed]"。
 * 已知来源的等价缩写（如 arxiv.org/abs/XXXX 的 v 后缀差异）按去版本号归一匹配。
 */
export function enforceCitationGate(
  reportContent: string,
  knownSources: ReadonlySet<string>,
): CitationGateResult {
  const normalizedKnown = new Set<string>();
  for (const s of knownSources) normalizedKnown.add(normalizeArxiv(s));

  let sourced = 0;
  const removed: string[] = [];
  const content = reportContent.replace(URL_PATTERN, (url) => {
    if (normalizedKnown.has(normalizeArxiv(url))) {
      sourced++;
      return url;
    }
    // 非学术引用的内部/无关链接（如 localhost、图床）不强制剥离——只管论文类 URL
    if (!isCitationLike(url)) return url;
    removed.push(url);
    return "[unsourced citation removed]";
  });

  return { content, sourced, unsourced: removed.length, removed };
}

/** arXiv URL 去版本号归一（.../abs/2503.16581v2 -> .../abs/2503.16581）。 */
function normalizeArxiv(url: string): string {
  return url.replace(/(arxiv\.org\/abs\/[^v?#\s]+)v\d+/, "$1");
}

/** 是否"论文引用型" URL（arXiv/S2/DOI/学术域）——只对这类执行剥离。 */
function isCitationLike(url: string): boolean {
  return /arxiv\.org|semanticscholar\.org|doi\.org|biorxiv|medrxiv|aclanthology|openreview\.net/i.test(url);
}
