"""Local PDF evidence engine. One bounded JSON request on stdin; no network or API keys."""
from __future__ import annotations

import base64
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile

import pymupdf as fitz

VERSION = 1
STOP = set("什么 怎么 哪些 如何 为什么 这个 那个 请问 告诉 一下 the a an of in is what how which and to".split())


def bounded_int(value, low, high, name):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{name} must be an integer in [{low}, {high}]")
    return value


def nonempty(value, name, cap=20000):
    if not isinstance(value, str) or not value.strip() or len(value) > cap:
        raise ValueError(f"{name} must contain 1..{cap} characters")
    return value.strip()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".pending-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def terms(text):
    found = set(re.findall(r"[a-z0-9_.]+", text.casefold()))
    for run in re.findall(r"[\u4e00-\u9fff]+", text):
        found.update([run] if len(run) == 1 else [run[i:i+2] for i in range(len(run)-1)])
    return found - STOP


class Evidence:
    def __init__(self, config, pdf):
        self.config = config
        self.pdf = Path(nonempty(pdf, "pdf")).expanduser().resolve(strict=True)
        roots = [Path(p).expanduser().resolve(strict=True) for p in config["allowedRoots"]]
        if not any(self.pdf.is_relative_to(root) for root in roots):
            raise ValueError("PDF is outside configured allowedRoots")
        if not self.pdf.is_file() or self.pdf.suffix.lower() != ".pdf":
            raise ValueError("Expected a regular PDF file")
        if self.pdf.stat().st_size > config["maxPdfBytes"]:
            raise ValueError("PDF exceeds maxPdfBytes")
        digest = hashlib.sha256()
        with self.pdf.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        self.sha = digest.hexdigest()
        self.root = Path(config["cacheDir"]).expanduser().resolve()
        self.cache = self.root / f"v{VERSION}" / self.sha
        self.cache.mkdir(parents=True, exist_ok=True)
        if not self.cache.resolve().is_relative_to(self.root):
            raise ValueError("Cache path escapes cacheDir")

    def open_pdf(self):
        doc = fitz.open(self.pdf)
        if doc.needs_pass or not doc.is_pdf:
            doc.close()
            raise ValueError("Encrypted or invalid PDF; provide an unlocked PDF")
        if not 1 <= len(doc) <= self.config["maxDocumentPages"]:
            doc.close()
            raise ValueError("PDF page count exceeds maxDocumentPages or is empty")
        return doc

    def child(self, relative):
        target = self.cache / relative
        if not target.resolve().is_relative_to(self.cache.resolve()):
            raise ValueError("Cache artifact escapes document cache")
        return target

    def index(self, limit=0):
        # SQLite owns a cross-process, cross-platform writer lock; a killed worker
        # releases it automatically. Readers only see atomically replaced JSON.
        with sqlite3.connect(self.child("writer.sqlite"), timeout=30) as lock:
            lock.execute("BEGIN IMMEDIATE")
            try:
                return self._index(limit)
            finally:
                lock.rollback()

    def _index(self, limit):
        path = self.child("index.json")
        old = json.loads(path.read_text("utf-8")) if path.exists() else None
        with self.open_pdf() as doc:
            count = min(limit, len(doc)) if limit else len(doc)
            if old and old.get("sha256") == self.sha and old.get("version") == VERSION and len(old["pages"]) >= count:
                return old
            records = list(old["pages"]) if old else []
            for i in range(len(records), count):
                page = doc[i]
                text = page.get_text()
                records.append({"page": i + 1, "label": page.get_label() or str(i + 1),
                                "text": text, "chars": len(text.strip()),
                                "images": len(page.get_images())})
                if len(records) % 25 == 0:
                    atomic_json(path, {"version": VERSION, "sha256": self.sha,
                                       "total_pages": len(doc), "pages": records, "outline": doc.get_toc()})
            result = {"version": VERSION, "sha256": self.sha, "total_pages": len(doc),
                      "pages": records, "outline": doc.get_toc()}
            atomic_json(path, result)
            return result

    def existing_index(self):
        path = self.child("index.json")
        return json.loads(path.read_text("utf-8")) if path.exists() else self.index()

    def notes(self):
        result = {}
        folder = self.child("notes")
        if folder.exists():
            for path in folder.glob("p*.json"):
                record = json.loads(self.child(f"notes/{path.name}").read_text("utf-8"))
                result[record["page"]] = record
        return result

    def coverage(self, idx, notes=None):
        notes = self.notes() if notes is None else notes
        low = [p["page"] for p in idx["pages"] if p["chars"] < 50 and p["page"] not in notes]
        return {"totalPages": idx["total_pages"], "indexedPages": len(idx["pages"]),
                "visualNotedPages": len(notes), "partial": len(idx["pages"]) < idx["total_pages"],
                "unreadLowTextPages": low,
                "warning": "Lexical retrieval is not exhaustive; page notes are model-authored, not verified source text."}

    def inspect(self, args):
        limit = bounded_int(args.get("limit", 0), 0, self.config["maxDocumentPages"], "limit")
        idx = self.index(limit)
        return {"documentId": self.sha, "name": self.pdf.name,
                "coverage": self.coverage(idx), "outline": idx["outline"][:100],
                "pageStats": [{k: p[k] for k in ("page", "label", "chars", "images")} for p in idx["pages"][:100]],
                "statsTruncated": len(idx["pages"]) > 100}

    def catalog(self, args):
        idx, notes = self.existing_index(), self.notes()
        return {"documentId": self.sha, "name": self.pdf.name,
                "outline": idx["outline"][:80], "coverage": self.coverage(idx, notes),
                "excerpts": [{"page": p["page"], "text": p["text"][:3000]}
                             for p in idx["pages"][:4]],
                "visualNotes": list(notes.values())[:4]}

    def search(self, args):
        query = nonempty(args["query"], "query", 2000)
        top = bounded_int(args.get("top", min(12, self.config["maxCandidates"])), 1, self.config["maxCandidates"], "top")
        idx, notes = self.existing_index(), self.notes()
        wanted = terms(query)
        docs = {}
        for p in idx["pages"]:
            note = notes.get(p["page"], {})
            metadata = "\n".join([note.get("summary", ""), *note.get("keywords", [])])
            docs[p["page"]] = (metadata + "\n") * 3 + p["text"]
        folded = {p: text.casefold() for p, text in docs.items()}
        df = {t: sum(t in text for text in folded.values()) for t in wanted}
        # Explicit figure/table requests should reach their source caption before
        # pages that merely repeat common query words or model-authored notes.
        labels = []
        for match in re.finditer(r"(?i)(?<!\w)(figure|fig\.?|table|图|表)\s*([0-9]+)(?![0-9])", query):
            kind, number = match.groups()
            prefix = r"(?:figure|fig\.?|图)" if kind.casefold().startswith("fig") or kind == "图" else r"(?:table|表)"
            labels.append(re.compile(r"(?im)^\s*" + prefix + r"\s*" + re.escape(number) + r"(?!\w)(?!\.\d)\s*[:.：]"))
        source_pages = {page["page"]: page["text"] for page in idx["pages"]}
        caption_boost = 1 + sum(math.log(1 + len(docs) / df[t]) * 8 for t in wanted if df[t])
        ranked = []
        for p, text in folded.items():
            score = sum(math.log(1 + len(docs) / df[t]) * min(text.count(t), 8) for t in wanted if df[t] and t in text)
            caption = next((match for pattern in labels if (match := pattern.search(source_pages[p]))), None)
            if caption:
                score += caption_boost
            if score > 0:
                pos = min((text.find(t) for t in wanted if t in text), default=0)
                if caption:
                    pos = len(docs[p]) - len(source_pages[p]) + caption.start()
                ranked.append({"page": p, "score": round(score, 4),
                               "excerpt": docs[p][max(0, pos-100):pos+400],
                               "source": "text_and_agent_note" if p in notes else "text_layer"})
        ranked.sort(key=lambda p: (-p["score"], p["page"]))
        return {"documentId": self.sha, "hits": ranked[:top], "matchedPages": len(ranked),
                "truncated": len(ranked) > top, "coverage": self.coverage(idx, notes)}

    def page(self, args, image=False):
        with self.open_pdf() as doc:
            return self._page(doc, args, image)

    def read_many(self, args):
        pages = args.get("pages")
        if not isinstance(pages, list) or not 1 <= len(pages) <= 24:
            raise ValueError("Supply one to 24 physical pages")
        with self.open_pdf() as doc:
            for number in pages:
                bounded_int(number, 1, len(doc), "page")
            return {"documentId": self.sha,
                    "pages": [self._page(doc, {"page": number}) for number in pages]}

    def _page(self, doc, args, image=False):
        page_no = bounded_int(args["page"], 1, len(doc), "page")
        page = doc[page_no - 1]
        text = page.get_text()
        result = {"documentId": self.sha, "page": page_no, "label": page.get_label() or str(page_no),
                  "evidenceId": f"{self.sha}:p{page_no}", "text": text[:self.config["maxTextChars"]],
                  "textTruncated": len(text) > self.config["maxTextChars"],
                  "source": "physical_pdf_page"}
        if image:
            scale = min(self.config["dpi"] / 72, self.config["maxImageSide"] / max(page.rect.width, page.rect.height))
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), colorspace=fitz.csRGB, alpha=False)
            result["pngBase64"] = base64.b64encode(pix.tobytes("png")).decode("ascii")
        return result

    def note(self, args):
        page = self.page(args)
        if args.get("evidenceId") != page["evidenceId"]:
            raise ValueError("evidenceId must match this document and physical page")
        summary = nonempty(args["summary"], "summary", 4000)
        keywords = args.get("keywords", [])
        if not isinstance(keywords, list) or len(keywords) > 30:
            raise ValueError("keywords must be an array of at most 30 strings")
        keywords = [nonempty(word, "keyword", 100) for word in keywords]
        record = {"page": page["page"], "evidenceId": page["evidenceId"], "summary": summary,
                  "keywords": keywords, "source": "agent_visual_note"}
        atomic_json(self.child(f"notes/p{page['page']:04d}.json"), record)
        return record

    def verify(self, args):
        page = self.page(args)
        quote = nonempty(args["quote"], "quote", 4000)
        # Full source text, never the search excerpt or an agent-authored note.
        with self.open_pdf() as doc:
            text = doc[page["page"]-1].get_text()
        normalize = lambda s: re.sub(r"\s+", " ", s).strip()
        found = normalize(quote) in normalize(text)
        return {"evidenceId": page["evidenceId"], "page": page["page"], "quote": quote,
                "status": "literal_match" if found else "not_found_in_text_layer",
                "semanticVerified": False,
                "note": "Whitespace-normalized literal match only. For scans, inspect the image; no match does not prove absence."}

    def locate(self, args):
        with self.open_pdf() as doc:
            return self._locate(doc, args)

    def locate_many(self, args):
        requests = args.get("requests")
        if not isinstance(requests, list) or not 1 <= len(requests) <= 24:
            raise ValueError("Supply one to 24 quote requests")
        with self.open_pdf() as doc:
            return {"documentId": self.sha,
                    "results": [self._locate(doc, request) for request in requests]}

    def _locate(self, doc, args):
        """Locate literal characters in PDF layout; never accept model coordinates."""
        quote = nonempty(args["quote"], "quote", 4000)
        needle = re.sub(r"\s+", " ", quote).strip()
        number = bounded_int(args["page"], 1, len(doc), "page")
        page = doc[number - 1]
        chars, positions = [], []
        line_id = 0
        for block in page.get_text("rawdict")["blocks"]:
            for line in block.get("lines", []):
                line_id += 1
                for span in line["spans"]:
                    for char in span["chars"]:
                        for c in char["c"]:
                            if c.isspace():
                                if chars and chars[-1] != " ":
                                    chars.append(" ")
                                    positions.append(None)
                            else:
                                chars.append(c)
                                positions.append((line_id, char["bbox"]))
                if chars and chars[-1] != " ":
                    chars.append(" ")
                    positions.append(None)
        text = "".join(chars)
        matches, start = [], 0
        while len(matches) < 20:
            offset = text.find(needle, start)
            if offset < 0:
                break
            boxes = {}
            for item in positions[offset:offset + len(needle)]:
                if item is not None:
                    line, box = item
                    boxes[line] = boxes[line] | fitz.Rect(box) if line in boxes else fitz.Rect(box)
            regions = []
            for box in boxes.values():
                # PDF raw text coordinates are unrotated; rendered pages are rotated.
                box = box * page.rotation_matrix
                box = box & page.rect
                regions.append([box.x0 / page.rect.width, box.y0 / page.rect.height,
                                box.x1 / page.rect.width, box.y1 / page.rect.height])
            matches.append({"regions": regions})
            start = offset + len(needle)
        return {"documentId": self.sha, "name": self.pdf.name, "page": number,
                "quote": quote, "matches": matches,
                "status": "located_text" if matches else "not_located",
                "precision": "pdf_character_layout" if matches else "page_only",
                "coordinateSystem": "normalized_rotated_page",
                "truncated": len(matches) == 20 and text.find(needle, start) >= 0}

    def export(self, args):
        question = nonempty(args["question"], "question", 4000)
        claims = args["claims"]
        if not isinstance(claims, list) or not 1 <= len(claims) <= 30:
            raise ValueError("claims must contain 1..30 entries")
        cited = set()
        rendered = []
        for claim in claims:
            statement = nonempty(claim["text"], "claim text", 4000)
            pages = claim["pages"]
            if not isinstance(pages, list) or not pages:
                raise ValueError("Each claim needs at least one physical page")
            for p in pages:
                self.page({"page": p})
                cited.add(p)
            mentioned = {int(p) for p in re.findall(r"第(\d+)页", statement)}
            if not mentioned.issubset(set(pages)):
                raise ValueError("Claim text cites pages outside its declared evidence")
            links = " ".join(f'<a href="#p{p}">[第{p}页]</a>' for p in sorted(set(pages)))
            rendered.append(f"<li>{html.escape(statement)} {links}</li>")
        if len(cited) > self.config["maxExportPages"]:
            raise ValueError("Evidence export exceeds maxExportPages")
        parts = ["<!doctype html><html lang=zh-CN><meta charset=utf-8>",
                 '<meta name="viewport" content="width=device-width, initial-scale=1">',
                 f"<title>{html.escape(question)}</title>",
                 "<style>body{font:16px/1.7 system-ui;max-width:1000px;margin:auto;padding:24px;background:#f7f6f1;color:#172d30}li{margin:12px 0}img{max-width:100%;border:1px solid #ccc}a{color:#087878}.note{color:#666;font-size:13px}</style>",
                 f"<h1>{html.escape(self.pdf.name)}</h1><h2>{html.escape(question)}</h2>",
                 '<p class=note>物理页码引用 · 以下结论由 agent 撰写，原图供人工核对；未做自动语义验证。</p>',
                 f"<ul>{''.join(rendered)}</ul>"]
        for p in sorted(cited):
            image = self.page({"page": p}, image=True)
            parts.append(f'<section id="p{p}"><h2>第{p}页</h2><img alt="第{p}页原图" src="data:image/png;base64,{image["pngBase64"]}"></section>')
        parts.append(f'<p class=note>Document SHA-256: {self.sha}</p></html>')
        folder = self.child("exports")
        folder.mkdir(exist_ok=True)
        fd, path = tempfile.mkstemp(prefix="evidence-", suffix=".html", dir=folder)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write("\n".join(parts))
        return {"path": path, "documentId": self.sha, "pages": sorted(cited), "semanticVerified": False}


def main():
    request = json.load(sys.stdin)
    engine = Evidence(request["config"], request["args"]["pdf"])
    operation = request["operation"]
    if operation == "read":
        result = engine.page(request["args"], image=request["args"].get("image", True))
    elif operation in ("inspect", "search", "note", "verify", "locate", "catalog", "export", "read_many", "locate_many"):
        result = getattr(engine, operation)(request["args"])
    else:
        raise ValueError("Unknown operation")
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
