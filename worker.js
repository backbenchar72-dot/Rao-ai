const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.6";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function getTextFromResponse(data) {
  if (!data) return "";

  // Normal Responses API output
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // Fallback parser
  if (Array.isArray(data.output)) {
    const parts = [];

    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue;

      for (const content of item.content) {
        if (
          content &&
          content.type === "output_text" &&
          typeof content.text === "string"
        ) {
          parts.push(content.text);
        }
      }
    }

    if (parts.length) return parts.join("\n").trim();
  }

  return "";
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(Boolean)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content:
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)
    }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
      (url.pathname === "/" ||
        url.pathname === "/api/chat" ||
        url.pathname === "/.netlify/functions/chat")
    ) {
      return json({
        ok: true,
        service: "RAO AI",
        message: "RAO AI Worker is running."
      });
    }

    // Chat endpoint
    if (
      request.method === "POST" &&
      (url.pathname === "/api/chat" ||
        url.pathname === "/.netlify/functions/chat")
    ) {
      if (!env.OPENAI_API_KEY) {
        return json(
          {
            error: "OPENAI_API_KEY is not configured in Cloudflare."
          },
          500
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            error: "Invalid JSON request."
          },
          400
        );
      }

      const messages = normalizeMessages(body.messages);

      // Also allow a simple { message: "Hello" } request
      if (!messages.length && typeof body.message === "string") {
        messages.push({
          role: "user",
          content: body.message
        });
      }

      if (!messages.length) {
        return json(
          {
            error: "No messages were provided."
          },
          400
        );
      }

      const openaiRequest = {
        model: MODEL,
        input: messages
      };

      // Optional web search from frontend
      if (body.webSearch === true) {
        openaiRequest.tools = [
          {
            type: "web_search"
          }
        ];
      }

      let response;

      try {
        response = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify(openaiRequest)
        });
      } catch (error) {
        return json(
          {
            error: "Could not connect to OpenAI.",
            details: error?.message || "Network error"
          },
          502
        );
      }

      const rawText = await response.text();

      let data;

      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        return json(
          {
            error: "OpenAI returned an invalid response.",
            details: rawText.slice(0, 500)
          },
          502
        );
      }

      if (!response.ok) {
        return json(
          {
            error:
              data?.error?.message ||
              `OpenAI API request failed (${response.status}).`,
            status: response.status,
            details: data?.error || null
          },
          response.status
        );
      }

      const reply = getTextFromResponse(data);

      if (!reply) {
        return json(
          {
            error: "OpenAI returned no text response.",
            raw: data
          },
          502
        );
      }

      return json({
        ok: true,
        reply,
        output_text: reply
      });
    }

    return json(
      {
        error: "Not found",
        path: url.pathname
      },
      404
    );
  }
};
