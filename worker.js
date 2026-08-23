const GEMINI_MODEL = "gemini-2.5-flash";
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
  if (!data?.candidates) return "";

  return data.candidates
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    // Health check
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
        model: GEMINI_MODEL,
        message: "RAO AI Worker is running."
      });
    }

    // Supported chat routes
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

    if (request.method !== "POST") {
      return json({
        ok: false,
        error: "Method not allowed"
      }, 405);
    }

    // Gemini API secret
    if (!env.GEMINI_API_KEY) {
      return json({
        ok: false,
        error: "GEMINI_API_KEY is not configured in Cloudflare."
      }, 500);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "Invalid JSON request."
      }, 400);
    }

    // Accept existing frontend formats
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

    // Gemini request
    const geminiRequest = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    // Optional system instruction from frontend
    if (typeof body?.system === "string" && body.system.trim()) {
      geminiRequest.systemInstruction = {
        parts: [
          {
            text: body.system.trim()
          }
        ]
      };
    }

    // Optional Google Search
    if (body?.webSearch === true) {
      geminiRequest.tools = [
        {
          google_search: {}
        }
      ];
    }

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

    let data;

    try {
      data = await response.json();
    } catch {
      return json({
        ok: false,
        error: "Gemini returned an invalid response."
      }, 502);
    }

    // Gemini API error
    if (!response.ok) {
      return json({
        ok: false,
        error:
          data?.error?.message ||
          `Gemini API request failed (${response.status}).`,
        status: response.status,
        details: data?.error || null
      }, response.status);
    }

    const reply = extractGeminiText(data);

    if (!reply) {
      return json({
        ok: false,
        error: "Gemini returned no text response.",
        details: data
      }, 502);
    }

    // Compatible with existing RAO AI frontend
    return json({
      ok: true,
      reply,
      output_text: reply,
      response: data
    });
  }
};
