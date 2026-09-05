from __future__ import annotations

import base64
from typing import Any

from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel

from modules.statistics import (
    t_test,
    anova,
    correlation,
    describe,
    TTestResult,
    ANOVAResult,
    CorrelationResult,
)
from modules.pdf_parsing import parse_pdf
from modules.latex import compile_latex
from modules.sandbox import execute_code

app = FastAPI(title="Science Service", version="0.1.0")


# --- Request/Response models ---


class TTestRequest(BaseModel):
    group1: list[float]
    group2: list[float]


class ANOVAResultReq(BaseModel):
    groups: list[list[float]]


class CorrelationRequest(BaseModel):
    x: list[float]
    y: list[float]


class DescribeRequest(BaseModel):
    data: list[float]


class LatexRequest(BaseModel):
    source: str
    timeout: int = 60


class SandboxRequest(BaseModel):
    language: str = "python"
    code: str
    timeout: int = 30
    env: dict[str, str] = {}


class SandboxResponse(BaseModel):
    output: str = ""
    isError: bool = False


class CodeRequest(BaseModel):
    code: str
    timeout: int = 30


class CodeResponse(BaseModel):
    stdout: str
    stderr: str
    success: bool
    execution_time: float


class HealthResponse(BaseModel):
    status: str
    version: str


# --- Endpoints ---


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", version="0.1.0")


@app.post("/api/statistics/t-test")
async def api_t_test(req: TTestRequest) -> TTestResult:
    return t_test(req.group1, req.group2)


@app.post("/api/statistics/anova")
async def api_anova(req: ANOVAResultReq) -> ANOVAResult:
    return anova(*req.groups)


@app.post("/api/statistics/correlation")
async def api_correlation(req: CorrelationRequest) -> CorrelationResult:
    return correlation(req.x, req.y)


@app.post("/api/statistics/describe")
async def api_describe(req: DescribeRequest) -> dict[str, Any]:
    return describe(req.data)


@app.post("/api/pdf/parse")
async def api_pdf_parse(
    file: UploadFile = File(...),
    grobid_url: str = "http://localhost:8070",
) -> dict[str, Any]:
    pdf_bytes = await file.read()
    result = parse_pdf(pdf_bytes, grobid_url)
    return {
        "title": result.title,
        "authors": result.authors,
        "abstract": result.abstract,
        "headers": result.headers,
        "references": result.references,
    }


@app.post("/api/latex/compile")
async def api_latex_compile(req: LatexRequest) -> dict[str, Any]:
    result = compile_latex(req.source, req.timeout)
    response: dict[str, Any] = {
        "success": result.success,
        "log": result.log,
    }
    if result.pdf_bytes:
        response["pdf_base64"] = base64.b64encode(result.pdf_bytes).decode("utf-8")
    return response


@app.post("/api/sandbox/execute", response_model=SandboxResponse)
async def api_sandbox_execute(req: SandboxRequest) -> SandboxResponse:
    result = execute_code(req.code, req.timeout)
    return SandboxResponse(
        output=result.stdout or result.stderr or "",
        isError=not result.success,
    )


@app.post("/api/code/execute")
async def api_code_execute(req: CodeRequest) -> CodeResponse:
    result = execute_code(req.code, req.timeout)
    return CodeResponse(
        stdout=result.stdout,
        stderr=result.stderr,
        success=result.success,
        execution_time=result.execution_time,
    )
