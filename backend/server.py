import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from google.genai.errors import APIError

from prompt_builder import build_prompt

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize Rate Limiter (by IP address)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

def generate_with_gemini(api_key, system_prompt, user_prompt):
    """Call Google Gemini API using a user-provided key."""
    from google import genai
    client = genai.Client(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    logger.info("Generating with Gemini model: %s (User Key)", model_name)

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
@limiter.exempt
def health_check():
    """Health check endpoint."""
    provider = os.getenv("LLM_PROVIDER", "gemini")
    return jsonify({"status": "ok", "provider": provider})


@app.route('/api/test-key', methods=['POST'])
@limiter.limit("20 per hour")
def test_api_key():
    """Lightweight endpoint to validate the user's Gemini API key."""
    api_key = request.headers.get("X-Gemini-Api-Key")
    if not api_key:
        return jsonify({
            "error": "missing_api_key",
            "message": "Please add your Gemini API key in the extension settings."
        }), 400

    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        # Make a very cheap call (e.g. list models or generate 1 token) to test validity
        # Listing models is a free/cheap operation to test auth
        list(client.models.list())
        
        return jsonify({"success": True, "message": "Key is valid!"})
    except APIError as e:
        # Avoid logging the full exception string to prevent leaking the key
        logger.error("APIError testing key: Status Code %s", getattr(e, 'code', 'unknown'))
        return jsonify({
            "error": "invalid_api_key",
            "message": "This API key was rejected by Google. Please check it in your extension settings."
        }), 401
    except Exception as e:
        logger.error("Unexpected error testing key: %s", type(e).__name__)
        return jsonify({"success": False, "error": "An unexpected error occurred while testing the key."}), 500


@app.route('/api/generate', methods=['POST'])
@limiter.limit("20 per hour")
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
        provider = os.getenv("LLM_PROVIDER", "gemini").lower()

        if provider == "ollama":
            cover_letter = generate_with_ollama(system_prompt, user_prompt)
        elif provider == "gemini":
            api_key = request.headers.get("X-Gemini-Api-Key")
            if not api_key:
                return jsonify({
                    "error": "missing_api_key",
                    "message": "Please add your Gemini API key in the extension settings."
                }), 400
            
            cover_letter = generate_with_gemini(api_key, system_prompt, user_prompt)
        else:
            return jsonify({
                "success": False,
                "error": f"Unknown LLM_PROVIDER: '{provider}'. Use 'gemini' or 'ollama'."
            }), 400

        return jsonify({
            "success": True,
            "coverLetter": cover_letter
        })

    except APIError as e:
        logger.error("Gemini API Error during generation: Status Code %s", getattr(e, 'code', 'unknown'))
        # If it's auth related
        error_msg = str(e).lower()
        if '401' in error_msg or '403' in error_msg or 'api_key_invalid' in error_msg:
            return jsonify({
                "error": "invalid_api_key",
                "message": "This API key was rejected by Google. Please check it in your extension settings."
            }), 401
        
        return jsonify({"success": False, "error": "Google Gemini API error. Please try again."}), 500
    except Exception as e:
        logger.error("Unexpected error generating cover letter: %s", type(e).__name__)
        return jsonify({"success": False, "error": "An internal error occurred."}), 500


if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    provider = os.getenv("LLM_PROVIDER", "gemini")
    logger.info("Starting server on port %d with LLM provider: %s", port, provider)
    app.run(host='0.0.0.0', port=port, debug=True)
