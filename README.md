# AI Cover Letter Generator Chrome Extension

An intelligent, context-aware Chrome Extension that automates the job application process by dynamically generating and attaching custom cover letters tailored directly to job postings. The system parses your uploaded resume, matches key requirements from the target job description using a Python backend integrated with the Gemini LLM, and formats the output into a beautifully structured, professionally styled PDF with selective bolding. Its core strength lies in its **Universal Injection Engine**, which uses advanced DOM-traversal (via atomic text-node tree-walking) to securely bypass resume upload slots, automatically target cover letter zones (handling both file-drop elements and textboxes), and programmatically inject the generated file or text directly into the page.

## Features

- **Universal Injection Engine**: Uses TreeWalker atomic text node scanning to accurately find Cover Letter inputs/dropzones without leaks into adjacent fields.
- **Resume Protection**: Actively prevents PDF attachments or text injections from overwriting your main Resume upload field.
- **Formatted PDF Output**: Automatically creates beautifully styled PDF downloads with custom margin layouts and selective, readable bold text.
- **Modern UI Redesign**: A sleek, dark slate design with dynamic loader animations and real-time auto-paste status alerts.

---

## Directory Structure

```text
├── extension/             # Chrome Extension source files
│   ├── manifest.json      # Extension metadata
│   ├── popup.html         # User interface
│   ├── popup.css          # Styling (Vanilla CSS)
│   ├── popup.js           # Extension frontend logic & DOM injection
│   ├── lib/               # PDF.js and jsPDF libraries
│   └── icons/             # Chrome extension store icons
├── backend/               # Server-side generation service
│   ├── server.py          # Flask backend server
│   ├── prompt_builder.py  # Gemini LLM system & user prompt construction
│   └── requirements.txt   # Python dependencies
└── .gitignore             # Git ignored files
```

---

## Installation & Setup

### 1. Backend Server Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Setup your configuration:
   Create a `.env` file inside `backend/` and add your Google Gemini API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=5000
   ```
5. Run the server:
   ```bash
   python server.py
   ```

### 2. Chrome Extension Installation (Local Testing)
1. Open Google Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** (top-left button).
4. Select the `extension/` directory of this project.
5. Pin the **Cover Letter AI** extension to your toolbar.
6. Make sure to update the `API_URL` and `API_TEST_URL` inside `extension/popup.js` to point to your live Railway deployment.

### 3. Deploying to the Chrome Web Store
To publish this extension so anyone can download it from the Chrome Web Store:
1. Zip the extension folder: `zip -r cover-letter-ai.zip extension/` (Make sure your production API URLs are set in `popup.js` before zipping).
2. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
3. Pay the $5 one-time developer registration fee.
4. Click **New Item** and upload `cover-letter-ai.zip`.
5. Fill out the Store Listing (Title, Description, Category).
6. Under **Privacy**, state that your extension handles user data (resumes) but does not sell it, and all API keys are stored locally on the user's device (`chrome.storage.local`).
7. Submit for Review (Google typically takes 24 to 72 hours to approve new extensions).
