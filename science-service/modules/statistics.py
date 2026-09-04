from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from typing import Any


@dataclass
class TTestResult:
    statistic: float
    pvalue: float


@dataclass
class ANOVAResult:
    statistic: float
    pvalue: float


@dataclass
class CorrelationResult:
    pearson_r: float
    pearson_p: float
    spearman_r: float
    spearman_p: float


def t_test(group1: list[float], group2: list[float]) -> TTestResult:
    from scipy import stats

    stat, p = stats.ttest_ind(group1, group2)
    return TTestResult(statistic=stat, pvalue=p)


def anova(*groups: list[float]) -> ANOVAResult:
    from scipy import stats

    stat, p = stats.f_oneway(*groups)
    return ANOVAResult(statistic=stat, pvalue=p)


def correlation(
    x: list[float], y: list[float]
) -> CorrelationResult:
    from scipy import stats

    pr, pp = stats.pearsonr(x, y)
    sr, sp = stats.spearmanr(x, y)
    return CorrelationResult(
        pearson_r=pr,
        pearson_p=pp,
        spearman_r=sr,
        spearman_p=sp,
    )


def describe(data: list[float]) -> dict[str, Any]:
    import numpy as np
    from scipy import stats

    arr = np.array(data)
    return {
        "n": len(arr),
        "mean": float(np.mean(arr)),
        "std": float(np.std(arr, ddof=1)),
        "median": float(np.median(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "skewness": float(stats.skew(arr)),
        "kurtosis": float(stats.kurtosis(arr)),
        "q25": float(np.percentile(arr, 25)),
        "q75": float(np.percentile(arr, 75)),
    }
