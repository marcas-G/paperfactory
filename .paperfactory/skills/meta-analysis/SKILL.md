---
name: meta-analysis
description: 对已收集的研究进行元分析
context: fork
allowed-tools: [search_scholarly, run_statistics]
cognitive-mode: SYNTHESIZE
max-iterations: 30
---

# Meta-Analysis Skill

## Purpose
Perform meta-analysis on a set of collected studies.

## Steps
1. Collect all relevant evidence and results
2. Extract effect sizes and confidence intervals
3. Run statistical meta-analysis via `run_statistics`
4. Assess heterogeneity and publication bias
5. Generate combined effect estimate

## Output
- Combined effect size with confidence interval
- Heterogeneity metrics (I², Q-statistic)
- Forest plot data
- Publication bias assessment
