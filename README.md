# Instagram AI Spoiler Blocker 🛡️

An AI-powered Chrome Extension and FastAPI backend that intercepts Instagram Reels and Feed posts, inspects post captions and overlay text, and blurs spoilers (movies, anime, series, games) with an interactive **"Click to Reveal"** warning overlay.

---

## 🌟 Key Features

- **Chrome Extension (Manifest V3)**:
  - Observes the dynamic Instagram DOM via `MutationObserver`.
  - Extracts caption text and image alt text while filtering out UI boilerplate words.
  - Intercepts dynamic feeds and Reels with a hydration wait and debounce caching.
  - Automatically applies a 50px blur to spoiler content with an overlay:  
    `⚠️ Spoiler Warning: [spoiled_media]. Click to Reveal.`
  - Seamless click-to-reveal user interaction.

- **FastAPI AI Backend**:
  - Built with **FastAPI** and the official **`google-genai` SDK**.
  - Powered by **Gemini 2.5 Flash** with **Structured Outputs (Pydantic)**.
  - Robust logging and empty-string fast fail to minimize latency and token usage.
  - Built-in heuristic fallback mode to avoid failing open.

---

## 📁 Repository Structure

```
Instagramspoileravoider/
├── backend/
│   ├── .env.example        # Environment variables template
│   ├── main.py             # FastAPI backend with Gemini 2.5 Flash & CORS
│   └── requirements.txt    # Python dependencies
├── extension/
│   ├── manifest.json       # Manifest V3 configuration
│   └── content.js          # DOM extraction, observer & overlay script
├── .gitignore
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Backend Setup

1. Open a terminal and navigate to `/backend`:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   # Windows PowerShell
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. *(Optional)* Add your Gemini API key:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Add your Gemini API key:
     ```env
     GEMINI_API_KEY="AIza..."
     ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend will be available at `http://localhost:8000`.

---

### 2. Chrome Extension Setup

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left corner).
4. Select the `extension/` directory from this repository:
   ```
   c:\Instagramspoileravoider\extension
   ```
5. Navigate to [Instagram](https://www.instagram.com). Posts and Reels will now be scanned for spoilers in real time!
