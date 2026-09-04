from modules.statistics import t_test, anova, correlation, describe


def test_t_test_normal():
    g1 = [1, 2, 3, 4, 5]
    g2 = [2, 3, 4, 5, 6]
    result = t_test(g1, g2)
    assert result.statistic < 0
    assert result.pvalue > 0.05


def test_t_test_significant():
    g1 = [1, 1, 1, 1, 1]
    g2 = [10, 10, 10, 10, 10]
    result = t_test(g1, g2)
    assert abs(result.statistic) > 5
    assert result.pvalue < 0.001


def test_t_test_identical():
    g1 = [1, 2, 3, 4, 5]
    g2 = [1, 2, 3, 4, 5]
    result = t_test(g1, g2)
    assert result.statistic == 0
    assert result.pvalue == 1.0


def test_anova_two_groups():
    g1 = [1, 2, 3, 4, 5]
    g2 = [2, 3, 4, 5, 6]
    result = anova(g1, g2)
    assert result.statistic >= 0
    assert 0 <= result.pvalue <= 1


def test_anova_three_groups():
    g1 = [1, 2, 3]
    g2 = [10, 11, 12]
    g3 = [20, 21, 22]
    result = anova(g1, g2, g3)
    assert result.pvalue < 0.001


def test_anova_identical_groups():
    g1 = [1, 2, 3, 4, 5]
    result = anova(g1, g1, g1)
    assert result.pvalue >= 0.5


def test_correlation_perfect():
    x = [1, 2, 3, 4, 5]
    y = [2, 4, 6, 8, 10]
    result = correlation(x, y)
    assert abs(result.pearson_r - 1.0) < 1e-10
    assert result.pearson_p < 0.001


def test_correlation_negative():
    x = [1, 2, 3, 4, 5]
    y = [5, 4, 3, 2, 1]
    result = correlation(x, y)
    assert abs(result.pearson_r + 1.0) < 1e-10


def test_correlation_random():
    x = [1, 3, 2, 5, 4]
    y = [5, 2, 4, 1, 3]
    result = correlation(x, y)
    assert -1 <= result.pearson_r <= 1
    assert -1 <= result.spearman_r <= 1


def test_describe():
    data = [1, 2, 3, 4, 5]
    result = describe(data)
    assert result["n"] == 5
    assert result["mean"] == 3.0
    assert result["median"] == 3.0
    assert result["min"] == 1
    assert result["max"] == 5


def test_describe_skewness():
    data = [1, 2, 3, 4, 100]
    result = describe(data)
    assert result["skewness"] > 0
