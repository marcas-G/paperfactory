from starlette.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_t_test():
    resp = client.post(
        "/api/statistics/t-test",
        json={"group1": [1, 2, 3], "group2": [4, 5, 6]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "statistic" in data
    assert "pvalue" in data


def test_anova():
    resp = client.post(
        "/api/statistics/anova",
        json={"groups": [[1, 2, 3], [4, 5, 6], [7, 8, 9]]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "statistic" in data
    assert "pvalue" in data


def test_correlation():
    resp = client.post(
        "/api/statistics/correlation",
        json={"x": [1, 2, 3, 4, 5], "y": [2, 4, 6, 8, 10]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "pearson_r" in data
    assert abs(data["pearson_r"] - 1.0) < 1e-10


def test_code_execute():
    resp = client.post(
        "/api/code/execute",
        json={"code": "print('hello')", "timeout": 10},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "hello" in data["stdout"]


def test_describe():
    resp = client.post(
        "/api/statistics/describe",
        json={"data": [1, 2, 3, 4, 5]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mean"] == 3.0
    assert data["n"] == 5
