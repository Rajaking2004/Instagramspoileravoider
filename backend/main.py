import os
import json
import logging
from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("spoiler_blocker")

app = FastAPI(title="Instagram AI Spoiler Blocker Backend")

# Enable CORS for Chrome extension requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Output Schema
class SpoilerResult(BaseModel):
    is_spoiler: bool = Field(
        ...,
        description="True if the text reveals major plot points, twists, character deaths, climax, or endings of any movie, TV series, anime, book, or video game."
    )
    spoiled_media: List[str] = Field(
        default_factory=list,
        description="List of specific titles (e.g. ['Jujutsu Kaisen', 'Avengers: Endgame']) being spoiled."
    )

class AnalyzeRequest(BaseModel):
    text: Optional[str] = ""

SPOILER_SYSTEM_PROMPT = """You are an expert AI spoiler detection classifier.
Your task is to analyze the provided text extracted from a social media post (Instagram caption, reel text, or comments).
Determine if the text contains spoilers or reveals key plot events (such as character deaths, seals, defeats, secret reveals, betrayals, ending outcomes, tournament winners) for any anime, manga, movie, TV series, game, or book.

Rules:
1. If the text mentions general buzz, praises an episode/animation, or quotes without revealing major plot secrets, set is_spoiler = false and spoiled_media = [].
2. If the text reveals an important plot detail or character fate (e.g., "Gojo gets sealed in the Prison Realm", "Sukuna takes over Megumi", "Iron Man dies in Endgame"), set is_spoiler = true and identify the title in spoiled_media (e.g., ["Jujutsu Kaisen"]).
3. Ensure spoiled_media is empty when is_spoiler is false.
"""

# Initialize Google GenAI client
client = None
try:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if api_key:
        client = genai.Client(api_key=api_key)
        logger.info("Google GenAI Client initialized successfully with API key.")
    else:
        client = genai.Client()
        logger.info("Google GenAI Client initialized using default environment credentials.")
except Exception as exc:
    logger.warning(f"Google GenAI Client initialization notice: {exc}")

@app.get("/")
def read_root():
    return {
        "status": "ok",
        "service": "Instagram AI Spoiler Blocker Backend",
        "client_ready": client is not None
    }

@app.post("/analyze", response_model=SpoilerResult)
async def analyze_content(payload: AnalyzeRequest):
    raw_text = (payload.text or "").strip()

    # Log incoming payload exactly
    logger.info(f"[RECEIVED TEXT FROM EXTENSION]: \"\"\"{raw_text}\"\"\"")

    # Fast-fail fallback: empty or whitespace-only text
    if not raw_text or len(raw_text) == 0:
        logger.info("[ANALYSIS SKIPPED]: Empty or whitespace text provided. Returning is_spoiler=False.")
        return SpoilerResult(is_spoiler=False, spoiled_media=[])

    # If client is not initialized or no API key is present
    if not client:
        logger.warning("[FALLBACK MODE]: Gemini client unavailable. Executing heuristic keyword check.")
        text_lower = raw_text.lower()
        spoiler_triggers = ["sealed", "dies", "died", "kills", "killed", "spoiler", "ending", "death", "prison realm", "bankai"]
        if any(trig in text_lower for trig in spoiler_triggers):
            result = SpoilerResult(is_spoiler=True, spoiled_media=["Potential Media (Heuristic)"])
            logger.info(f"[RETURNED JSON (Heuristic)]: {result.model_dump_json()}")
            return result
        result = SpoilerResult(is_spoiler=False, spoiled_media=[])
        logger.info(f"[RETURNED JSON (Heuristic)]: {result.model_dump_json()}")
        return result

    try:
        logger.info("[GEMINI API CALL]: Sending text to gemini-2.5-flash with response_schema=SpoilerResult...")
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{SPOILER_SYSTEM_PROMPT}\n\nAnalyze this text:\n\"\"\"{raw_text}\"\"\"",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SpoilerResult,
                temperature=0.1
            ),
        )

        if response.parsed and isinstance(response.parsed, SpoilerResult):
            result = response.parsed
        elif response.parsed:
            result = SpoilerResult.model_validate(response.parsed)
        else:
            data = json.loads(response.text)
            result = SpoilerResult(**data)

        # Log exact JSON returned by the model
        logger.info(f"[EXACT JSON RETURNED BY GEMINI]: {result.model_dump_json()}")
        return result

    except Exception as exc:
        logger.error(f"[ERROR IN GEMINI GENERATION]: {exc}")
        # Secondary safety fallback
        text_lower = raw_text.lower()
        spoiler_triggers = ["sealed", "dies", "died", "kills", "killed", "spoiler", "ending", "death", "prison realm"]
        if any(trig in text_lower for trig in spoiler_triggers):
            fallback_res = SpoilerResult(is_spoiler=True, spoiled_media=["Detected (Fallback)"])
            logger.info(f"[RETURNED JSON (Fallback)]: {fallback_res.model_dump_json()}")
            return fallback_res
        
        fallback_res = SpoilerResult(is_spoiler=False, spoiled_media=[])
        logger.info(f"[RETURNED JSON (Fallback)]: {fallback_res.model_dump_json()}")
        return fallback_res

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
