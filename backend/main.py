# backend/main.py
import os, json, io, re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from groq import Groq
from pypdf import PdfReader
from docx import Document

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health():
    return {"status": "ok", "endpoints": ["/docs", "/extract"]}

# --- Groq client ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("Set GROQ_API_KEY in backend/.env")
client = Groq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = (
    "You are a medical note information extractor. "
    "Return ONLY strict JSON (no markdown). "
    "Use null or [] for missing fields; never invent facts."
)

EXTRACTION_INSTRUCTIONS = """
Extract these fields from the clinical note:

- name
- age
- mental_illnesses (array of strings)
- medications_taken (array of objects: name, dose, route, frequency, duration, reason; null if missing)
- past_history (string)
- diagnoses (array of objects: label, code (ICD/DSM) if present, priority one of high/medium/low or null)

Return JSON only with this shape:
{
  "name": null,
  "age": null,
  "mental_illnesses": [],
  "medications_taken": [],
  "past_history": "",
  "diagnoses": []
}
"""

# ---------- Helpers ----------
def _read_txt(raw: bytes) -> str:
    return raw.decode("utf-8", errors="ignore")

def _read_pdf(raw: bytes) -> str:
    reader = PdfReader(io.BytesIO(raw))
    chunks = []
    for page in reader.pages:
        chunks.append(page.extract_text() or "")
    return "\n".join(chunks)

def _read_docx(raw: bytes) -> str:
    doc = Document(io.BytesIO(raw))
    return "\n".join(p.text for p in doc.paragraphs)

def extract_text_from_upload(file: UploadFile, raw: bytes) -> str:
    name = (file.filename or "").lower()
    ctype = (file.content_type or "").lower()

    if name.endswith(".pdf") or "pdf" in ctype:
        return _read_pdf(raw)
    if name.endswith(".docx") or "officedocument.wordprocessingml.document" in ctype:
        return _read_docx(raw)
    # default to txt
    return _read_txt(raw)

def _null_if_placeholder(s: str | None):
    if not s:
        return None
    # treat things like [PATIENT] [PATIENT] or [NAME] as redacted → null
    if re.fullmatch(r"\s*(\[[A-Z]+\]\s*)+", s.strip()):
        return None
    return s.strip()

def _title(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s

def postprocess(data: dict) -> dict:
    # name
    data["name"] = _null_if_placeholder(data.get("name"))
    # age stays as is

    # mental illnesses: tidy capitalization
    mi = data.get("mental_illnesses") or []
    data["mental_illnesses"] = [_title(x.strip()) for x in mi if str(x).strip()]

    # meds: lowercase names, keep dose/freq fields if present
    meds = data.get("medications_taken") or []
    cleaned = []
    for m in meds:
        if not isinstance(m, dict): 
            continue
        name = (m.get("name") or "").strip()
        if not name:
            continue
        cleaned.append({
            "name": name.lower(),  # consistent display; you can title() if preferred
            "dose": (m.get("dose") or None),
            "route": (m.get("route") or None),
            "frequency": (m.get("frequency") or None),
            "duration": (m.get("duration") or None),
            "reason": (m.get("reason") or None),
        })
    data["medications_taken"] = cleaned

    # past history: collapse whitespace
    ph = (data.get("past_history") or "").strip()
    ph = re.sub(r"\s+", " ", ph)
    data["past_history"] = ph

    # diagnoses: capitalize labels; keep code/priority
    dx = data.get("diagnoses") or []
    out = []
    for d in dx:
        if not isinstance(d, dict): 
            continue
        label = (d.get("label") or "").strip()
        if not label:
            continue
        out.append({
            "label": _title(label),
            "code": d.get("code") or None,
            "priority": d.get("priority") or None
        })
    data["diagnoses"] = out
    return data
# -----------------------------

@app.post("/extract")
async def extract_patient_data(file: UploadFile = File(...)):
    # accept .txt, .pdf, .docx
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    text = extract_text_from_upload(file, raw).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Could not read text from the file.")

    user_prompt = f"{EXTRACTION_INSTRUCTIONS}\n\nNOTE TEXT:\n\"\"\"{text}\"\"\""

    try:
        resp = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            temperature=0,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = resp.choices[0].message.content.strip()
        # Strip fences if present
        if content.startswith("```"):
            content = content.strip("`").strip()
            if content.lower().startswith("json"):
                content = content[4:].strip()
        data = json.loads(content)
        return postprocess(data)

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Model did not return valid JSON: {e}; content_sample={content[:800]}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")