from __future__ import annotations

import subprocess
import tempfile
import os
from dataclasses import dataclass
from typing import Any


@dataclass
class LatexResult:
    success: bool
    pdf_bytes: bytes
    log: str


def compile_latex(source: str, timeout: int = 60) -> LatexResult:
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_file = os.path.join(tmpdir, "main.tex")
        pdf_file = os.path.join(tmpdir, "main.pdf")
        log_file = os.path.join(tmpdir, "main.log")

        with open(tex_file, "w") as f:
            f.write(source)

        try:
            result = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", tex_file],
                capture_output=True,
                timeout=timeout,
                cwd=tmpdir,
            )

            log = ""
            if os.path.exists(log_file):
                with open(log_file) as lf:
                    log = lf.read()

            if os.path.exists(pdf_file):
                with open(pdf_file, "rb") as pf:
                    pdf_bytes = pf.read()
                return LatexResult(
                    success=True,
                    pdf_bytes=pdf_bytes,
                    log=log,
                )

            return LatexResult(
                success=False,
                pdf_bytes=b"",
                log=log,
            )
        except subprocess.TimeoutExpired:
            return LatexResult(success=False, pdf_bytes=b"", log="Compilation timed out")
        except FileNotFoundError:
            return LatexResult(
                success=False,
                pdf_bytes=b"",
                log="pdflatex not installed",
            )
