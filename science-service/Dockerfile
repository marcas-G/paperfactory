FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive texlive-latex-extra texlive-fonts-recommended \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY main.py ./
COPY modules/ ./modules/

# Install dependencies directly, not as a package
RUN pip install --no-cache-dir \
    fastapi>=0.110.0 \
    "uvicorn[standard]>=0.30.0" \
    scipy>=1.13.0 \
    numpy>=1.26.0 \
    pandas>=2.2.0 \
    httpx>=0.27.0 \
    pydantic>=2.7.0 \
    python-multipart>=0.0.9

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
