from modules.sandbox import execute_code, CodeExecutionResult


def test_execute_simple():
    result = execute_code("x = 1 + 2\nprint(x)")
    assert result.success is True
    assert "3" in result.stdout
    assert result.execution_time < 5


def test_execute_math():
    result = execute_code("import math\nprint(math.sqrt(16))")
    assert result.success is True
    assert "4.0" in result.stdout


def test_execute_error():
    result = execute_code("raise ValueError('test error')")
    assert result.success is False
    assert "ValueError" in result.stderr


def test_execute_timeout():
    result = execute_code("while True: pass", timeout=1)
    assert result.success is False
    assert "timed out" in result.stderr.lower()


def test_execute_empty():
    result = execute_code("")
    assert result.success is True
    assert result.stdout == ""


def test_execute_with_list():
    result = execute_code("data = [1, 2, 3, 4, 5]\nprint(sum(data))")
    assert result.success is True
    assert "15" in result.stdout


def test_execute_function():
    code = """
def double(x):
    return x * 2
result = double(21)
print(result)
"""
    result = execute_code(code)
    assert result.success is True
    assert "42" in result.stdout
