from __future__ import annotations

import tempfile
import os
from dataclasses import dataclass
from typing import Any


@dataclass
class PDFParseResult:
    title: str
    authors: list[str]
    abstract: str
    headers: list[str]
    references: list[str]


def parse_pdf(pdf_bytes: bytes, grobid_url: str = "http://localhost:8070") -> PDFParseResult:
    try:
        from grobid_client.grobid import GrobidClient

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(pdf_bytes)
            pdf_path = f.name

        try:
            client = GrobidClient(grobid_url)
            fulltext = client.process_fulltext(pdf_path)

            tei = fulltext.find("{http://www.tei-c.org/ns/1.0}teiAll")
            title_elem = fulltext.find(".//{http://www.tei-c.org/ns/1.0}title")
            title = title_elem.text if title_elem is not None else ""

            authors = []
            for author in fulltext.findall(".//{http://www.tei-c.org/ns/1.0}persName"):
                authors.append(author.text or "")

            abstract_elem = fulltext.find(".//{http://www.tei-c.org/ns/1.0}abstract")
            abstract = ""
            if abstract_elem is not None:
                abstract = " ".join(abstract_elem.itertext())

            headers = []
            for heading in fulltext.findall(".//{http://www.tei-c.org/ns/1.0}head"):
                headers.append(heading.text or "")

            refs = []
            for ref in fulltext.findall(".//{http://www.tei-c.org/ns/1.0}ref"):
                refs.append(ref.text or "")

            return PDFParseResult(
                title=title,
                authors=authors,
                abstract=abstract,
                headers=headers,
                references=refs,
            )
        finally:
            os.unlink(pdf_path)
    except Exception as e:
        return PDFParseResult(
            title="",
            authors=[],
            abstract="",
            headers=[],
            references=[],
        )
