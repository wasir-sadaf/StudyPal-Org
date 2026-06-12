import json
import os

from fastapi import FastAPI, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import ToolMessage

from service.s3TextractService import upload_note_to_s3, analyze_note_from_s3
from expense_agent import (
    ExpenseAgent,
    ClarificationNeeded,
    ExpenseCategorizationError,
    ExpenseParseError,
    ExpenseSaveError,
    ReceiptExtractionError,
)
from agent import studypal_graph
from task_agent import TaskAgent

# Load environment variables
load_dotenv()

app = FastAPI(title="StudyPal Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Model for Textract
class AnalyzeRequest(BaseModel):
    s3_key: str


class ExpenseTextRequest(BaseModel):
    text: str
    user_id: str | None = None


class TaskAssistantRequest(BaseModel):
    message: str
    history: list[dict[str, str]] = []


agent = ExpenseAgent()
task_agent = TaskAgent()

@app.post("/upload-note/")
async def upload_note(file: UploadFile = File(...)):
    """Uploads an image or PDF to the S3 'notes' directory."""
    return upload_note_to_s3(file)

@app.post("/analyze-note/")
async def analyze_note(request: AnalyzeRequest):
    """Reads the S3 file using Textract and returns extracted text."""
    analyze_result = analyze_note_from_s3(request.s3_key)
    if analyze_result.get("status") != "success":
        return analyze_result

    extracted_text = analyze_result.get("extracted_text", "")
    if not extracted_text.strip():
        return {"status": "DOWN", "error": "No text extracted from the document."}

    llm = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.2,
    )

    state = {
        "messages": [],
        "raw_notes": extracted_text,
        "web_search_results": None,
        "youtube_search_results": None,
        "final_study_guide": "",
    }

    try:
        result_state = studypal_graph.invoke(
            state,
            config={"configurable": {"my_llm": llm}},
        )
    except Exception as exc:
        return {"status": "DOWN", "error": f"LLM processing failed: {exc}"}

    messages = result_state.get("messages", [])
    final_message = messages[-1] if messages else None

    youtube_links = []
    web_links = []
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue

        tool_name = getattr(message, "name", "")
        payload = message.content
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                payload = {}

        if tool_name == "search_youtube" and isinstance(payload, dict):
            for item in payload.get("results", []) or []:
                title = item.get("title")
                url = item.get("url")
                if title and url:
                    youtube_links.append({"title": title, "url": url})

        if tool_name == "search_web" and isinstance(payload, dict):
            for item in payload.get("organic", []) or []:
                title = item.get("title")
                url = item.get("link")
                if title and url:
                    lowered_url = url.lower()
                    if "youtube.com" in lowered_url or "youtu.be" in lowered_url:
                        continue
                    web_links.append({"title": title, "url": url})

    structured_output = {
        "notes_markdown": getattr(final_message, "content", ""),
        "youtube_links": youtube_links,
        "web_links": web_links,
    }
    try:
        parsed = json.loads(final_message.content)
        if isinstance(parsed, dict):
            structured_output.update(parsed)
    except json.JSONDecodeError:
        pass

    structured_output["youtube_links"] = youtube_links
    structured_output["web_links"] = web_links

    if not structured_output.get("notes_markdown"):
        structured_output["notes_markdown"] = extracted_text

    return {
        "status": "success",
        "final_output": structured_output,
    }


@app.post("/expense/text")
async def expense_text(request: ExpenseTextRequest, authorization: str | None = Header(None)):
    try:
        saved = agent.process_text(request.text, auth_token=authorization)
        return {"status": "success", "expense": saved}
    except ClarificationNeeded as err:
        return {"clarification_needed": True, "question": err.question}
    except (ExpenseParseError, ExpenseCategorizationError, ExpenseSaveError) as err:
        return {"status": "DOWN", "error": str(err)}


@app.post("/expense/receipt")
async def expense_receipt(
    file: UploadFile = File(...),
    user_id: str | None = Form(None),
    authorization: str | None = Header(None)
):
    try:
        upload_result = upload_note_to_s3(file)
        if upload_result.get("status") != "success":
            return {"status": "DOWN", "error": upload_result.get("error", "Upload failed")}

        saved = agent.process_receipt(upload_result["s3_key"], auth_token=authorization)
        return {"status": "success", "expense": saved}
    except ClarificationNeeded as err:
        return {"clarification_needed": True, "question": err.question}
    except ReceiptExtractionError as err:
        return {"status": "DOWN", "error": str(err)}
    except (ExpenseParseError, ExpenseCategorizationError, ExpenseSaveError) as err:
        return {"status": "DOWN", "error": str(err)}


@app.post("/task/assistant")
async def task_assistant(request: TaskAssistantRequest, authorization: str | None = Header(None)):
    try:
        result = task_agent.run(request.message, auth_token=authorization, history=request.history)
        return {"status": "success", **result}
    except Exception as err:
        return {"status": "DOWN", "error": str(err)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)