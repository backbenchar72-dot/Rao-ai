const GEMINI_MODEL = "gemini-3.6-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

/*
  RAO AI IDENTITY
*/
const DEFAULT_SYSTEM_INSTRUCTION = `
You are RAO AI, a personal AI assistant.

IMPORTANT IDENTITY RULES:

1. Your name is RAO AI.

2. Your creator/developer is Suraj Kumar.

3. If the user asks:
   - "Rao AI ko kisne create kiya?"
   - "Rao AI ka creator kaun hai?"
   - "Tumhe kisne banaya?"
   - "Who created Rao AI?"
   - "Who is your creator?"
   - or any similar question,

   ALWAYS answer:
   "RAO AI ko Suraj Kumar ne create kiya hai."

4. NEVER say that Google created RAO AI.

5. NEVER say that OpenAI created RAO AI.

6. NEVER say that Gemini created RAO AI.

7. Gemini is only the AI model/API powering RAO AI.
   It is NOT the creator of RAO AI.

8. If asked about the underlying AI model, you can say:
   "RAO AI Gemini model/API ka use karta hai."

9. Keep the distinction clear:
   Creator/Developer = Suraj Kumar
   AI Model/API = Google Gemini

10. Reply in the same language as the user whenever practical.
   If the user speaks Hindi, reply in Hindi.
   If the user speaks English, reply in English.
   If the user speaks Hinglish, reply naturally in Hinglish.

11. Be helpful, friendly and concise.

12. Do not invent a different creator name.
`;

/*
  Convert frontend messages to Gemini format
*/
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

/*
  Extract Gemini text
*/
function extractGeminiText(data) {
  if (!data?.candidates) return "";

  return data.candidates
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("");
}

/*
  Worker
*/
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /*
      CORS preflight
    */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    /*
      Health check
    */
    if (
      request.method === "GET" &&
      (
        path === "/" ||
        path === "/api/chat" ||
        path === "/chat" ||
        path === "/.netlify/functions/chat"
      )
    ) {
      return json({
        ok: true,
        service: "RAO AI",
        creator: "Suraj Kumar",
        model: GEMINI_MODEL,
        message: "RAO AI Worker is running."
      });
    }

    /*
      Supported chat routes
    */
    const isChatRoute =
      path === "/api/chat" ||
      path === "/chat" ||
      path === "/.netlify/functions/chat";

    if (!isChatRoute) {
      return json({
        ok: false,
        error: "Not found",
        path
      }, 404);
    }

    /*
      Only POST allowed for chat
    */
    if (request.method !== "POST") {
      return json({
        ok: false,
        error: "Method not allowed"
      }, 405);
    }

    /*
      Gemini API key
    */
    if (!env.GEMINI_API_KEY) {
      return json({
        ok: false,
        error: "GEMINI_API_KEY is not configured in Cloudflare."
      }, 500);
    }

    /*
      Read request body
    */
    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "Invalid JSON request."
      }, 400);
    }

    /*
      Accept different frontend formats
    */
    let messages = [];

    if (Array.isArray(body?.messages)) {
      messages = body.messages;
    } else if (typeof body?.message === "string") {
      messages = [
        {
          role: "user",
          content: body.message
        }
      ];
    } else if (typeof body?.input === "string") {
      messages = [
        {
          role: "user",
          content: body.input
        }
      ];
    }

    const contents = normalizeMessages(messages);

    if (!contents.length) {
      return json({
        ok: false,
        error: "No message provided."
      }, 400);
    }

    /*
      Gemini request
    */
    const geminiRequest = {
      contents,

      systemInstruction: {
        parts: [
          {
            text: DEFAULT_SYSTEM_INSTRUCTION
          }
        ]
      },

      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    /*
      Optional additional system instruction
    */
    if (typeof body?.system === "string" && body.system.trim()) {
      geminiRequest.systemInstruction.parts.push({
        text:
          "\nAdditional application instructions:\n" +
          body.system.trim()
      });
    }

    /*
      Optional Google Search
    */
    if (body?.webSearch === true) {
      geminiRequest.tools = [
        {
          google_search: {}
        }
      ];
    }

    /*
      Call Gemini
    */
    let response;

    try {
      response = await fetch(
        `${GEMINI_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(geminiRequest)
        }
      );
    } catch (error) {
      return json({
        ok: false,
        error: "Could not connect to Gemini API.",
        details: error?.message || "Network error"
      }, 502);
    }

    /*
      Read Gemini response
    */
   
