import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from prompt_builder import build_prompt

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)


def generate_with_gemini(system_prompt, user_prompt):
    """Call Google Gemini API."""
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in .env")

    client = genai.Client(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    logger.info("Generating with Gemini model: %s", model_name)

    response = client.models.generate_content(
        model=model_name,
        contents=user_prompt,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.7,
        ),
    )
    return response.text


def generate_with_ollama(system_prompt, user_prompt):
    """Call local Ollama instance."""
    from ollama import Client

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model_name = os.getenv("OLLAMA_MODEL", "llama3.2")

    logger.info("Generating with Ollama model: %s at %s", model_name, base_url)

    client = Client(host=base_url)
    response = client.chat(
        model=model_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.7},
    )
    return response.message.content


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    provider = os.getenv("LLM_PROVIDER", "gemini")
    return jsonify({"status": "ok", "provider": provider})


@app.route('/api/generate', methods=['POST'])
def generate_cover_letter():
    """Generate a cover letter using the configured LLM provider."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "error": "No JSON payload provided"}), 400

        resume_text = data.get('resumeText', '').strip()
        job_description = data.get('jobDescription', '').strip()
        custom_instructions = data.get('customInstructions', '').strip()

        if not resume_text or not job_description:
            return jsonify({
                "success": False,
                "error": "Missing required fields: resumeText and jobDescription are required."
            }), 400

        system_prompt, user_prompt = build_prompt(resume_text, job_description, custom_instructions)

        # Route to the configured LLM provider
        provider = os.getenv("LLM_PROVIDER", "gemini").lower()

        if provider == "ollama":
            cover_letter = generate_with_ollama(system_prompt, user_prompt)
        elif provider == "gemini":
            cover_letter = generate_with_gemini(system_prompt, user_prompt)
        else:
            return jsonify({
                "success": False,
                "error": f"Unknown LLM_PROVIDER: '{provider}'. Use 'gemini' or 'ollama'."
            }), 400

        return jsonify({
            "success": True,
            "coverLetter": cover_letter
        })

    except Exception as e:
        logger.error("Error generating cover letter: %s", str(e), exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    provider = os.getenv("LLM_PROVIDER", "gemini")
    logger.info("Starting server on port %d with LLM provider: %s", port, provider)
    app.run(host='0.0.0.0', port=port, debug=True)
