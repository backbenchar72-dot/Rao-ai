const GEMINI_MODEL = "gemini-3.6-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const DEFAULT_SYSTEM_INSTRUCTION = `
You are RAO AI, a helpful AI assistant.

IMPORTANT IDENTITY RULES:
- Your name is RAO AI.
- The creator/developer of RAO AI is Suraj Kumar.
- If the user asks "Who created you?", "Who is your creator?", "RAO AI kisne banaya?", "Creator kaun hai?", or similar questions, answer clearly:
  "RAO AI ko Suraj Kumar ne create kiya hai."
- Never say that Google created RAO AI.
- Never invent another creator name.
- Do not claim that RAO AI was created by Google, OpenAI, Microsoft, or any other company.
- If the user asks about the creator, always identify Suraj Kumar as the creator.

LANGUAGE RULE:
- Reply in the same language as the user whenever possible.
- If the user writes Hindi/Hinglish, reply in Hindi/Hinglish.
- If the user writes English, reply in English.
- For greetings, reply naturally in the same language.

BEHAVIOR:
- Be helpful, accurate, friendly and concise.
- If you do not know something, say so instead of inventing facts.
- Do not reveal secret API keys or server environment variables.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(Boolean)
    .map((message) => {
      const role =
        message.role === "assistant" || message.role === "model"
          ? "model"
          : "user";

      let text = "";

      if (typeof message.content === "string") {
        text = message.content;
      } else if (Array.isArray(message.content)) {
        text = message.content
          .map((item) => {
            if (typeof item === "string") return item;
            return item?.text || "";
          })
          .filter(Boolean)
          .join("\n");
      } else if (message.content != null) {
        text = JSON.stringify(message.content);
      }

      return {
        role,
        parts: [{ text }]
      };
    })
    .filter((message) => message.parts[0].text.trim());
}

function extractGeminiText(data) {
  if (!data?.candidates?.length) return "";

  return data.candidates
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // Health check
    if (request.method === "GET") {
      return json({
        ok: true,
        service: "RAO AI",
        model: GEMINI_MODEL,
        creator: "Suraj Kumar",
        message: "RAO AI Worker is running."
      });
    }

    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed."
        },
        405
      );
    }

    // Read request body
    let body;

    try {
      body = await request.json();
    } catch (error) {
      return json(
        {
          ok: false,
          error: "Invalid JSON request."
        },
        400
      );
    }

    // Support both messages[] and single message
    let messages = normalizeMessages(body.messages);

    if (!messages.length && typeof body.message === "string") {
      messages = [
        {
          role: "user",
          parts: [{ text: body.message }]
        }
      ];
    }

    if (!messages.length) {
      return json(
        {
          ok: false,
          error: "No message provided."
        },
        400
      );
    }

    // Gemini request
    const geminiRequest = {
      systemInstruction: {
        parts: [
          {
            text: DEFAULT_SYSTEM_INSTRUCTION
          }
        ]
      },

      contents: messages,

      generationConfig: {
        maxOutputTokens: 4096,
        thinkingConfig: {
          thinkingLevel: "medium"
        }
      }
    };

    // Optional Google Search grounding
    if (body.webSearch === true) {
      geminiRequest.tools = [
        {
          google_search: {}
        }
      ];
    }

    // API key check
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return json(
        {
          ok: false,
          error: "GEMINI_API_KEY is not configured in Cloudflare Worker secrets."
        },
        500
      );
    }

    // Call Gemini
    let response;

    try {
      response = await fetch(
        `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(geminiRequest)
        }
      );
    } catch (error) {
      return json(
        {
          ok: false,
          error: "Could not connect to Gemini API.",
          details: error?.message || "Network error"
        },
        502
      );
    }

    // Read Gemini response
    let data;

    try {
      data = await response.json();
    } catch (error) {
      return json(
        {
          ok: false,
          error: "Gemini returned an invalid response.",
          status: response.status
        },
        502
      );
    }

    // Gemini API error
    if (!response.ok) {
      return json(
        {
          ok: false,
          error: `Gemini API request failed (${response.status}).`,
          status: response.status,
          details: data?.error || data
        },
        response.status
      );
    }

    // Extract answer
    const reply = extractGeminiText(data);

    if (!reply) {
      return json(
        {
          ok: false,
          error: "Gemini returned no text.",
          details: data
        },
        502
      );
    }

    // Success
    return json({
      ok: true,
      service: "RAO AI",
      model: GEMINI_MODEL,
      creator: "Suraj Kumar",
      message: reply
    });
  }
};
