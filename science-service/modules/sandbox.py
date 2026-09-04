from __future__ import annotations

import ast
import sys
import io
import contextlib
import signal
from dataclasses import dataclass
from typing import Any


class TimeoutException(Exception):
    pass


def _timeout_handler(signum: Any, frame: Any) -> None:
    raise TimeoutException("Code execution timed out")


@dataclass
class CodeExecutionResult:
    stdout: str
    stderr: str
    success: bool
    execution_time: float


def execute_code(code: str, timeout: int = 30) -> CodeExecutionResult:
    import time

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()

    start_time = time.time()
    timer_set = False
    try:
        try:
            signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(timeout)
            timer_set = True
        except ValueError:
            pass

        try:
            tree = ast.parse(code)
            namespace: dict[str, Any] = {}

            for node in ast.walk(tree):
                if isinstance(node, ast.Import) or isinstance(node, ast.ImportFrom):
                    pass

            exec(compile(tree, "<string>", "exec"), namespace)

            if timer_set:
                signal.alarm(0)
            elapsed = time.time() - start_time

            stdout = sys.stdout.getvalue()
            stderr = sys.stderr.getvalue()

            return CodeExecutionResult(
                stdout=stdout,
                stderr=stderr,
                success=True,
                execution_time=elapsed,
            )
        except TimeoutException:
            if timer_set:
                signal.alarm(0)
            return CodeExecutionResult(
                stdout="",
                stderr="Execution timed out",
                success=False,
                execution_time=timeout,
            )
        except BaseException as exc:
            if timer_set:
                signal.alarm(0)
            elapsed = time.time() - start_time
            stdout = sys.stdout.getvalue()
            stderr = sys.stderr.getvalue()
            return CodeExecutionResult(
                stdout=stdout,
                stderr=f"{type(exc).__name__}: {exc}\n{stderr}",
                success=False,
                execution_time=elapsed,
            )
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
