const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4o-mini";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function makeInput(messages) {
  return messages.map((message) => {
    const role = message.role === "assistant" ? "assistant" : "user";

    let content = message.content;

    if (typeof content !== "string") {
      content = JSON.stringify(content);
    }

    return {
      role,
      content
    };
  });
}

function extractReply(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const part of item.content) {
        if (typeof part?.text === "string" && part.text.trim()) {
          parts.push(part.text.trim());
        }
      }
    }
  }

  return parts.join("\n").trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return jsonResponse(null, 204);
    }

    // Health check
    if (
      request.method === "GET" &&
      (url.pathname === "/api/chat" ||
       url.pathname === "/.netlify/functions/chat")
    ) {
      return jsonResponse({
        ok: true,
        service: "RAO AI",
        message: "RAO AI Worker is running."
      });
    }

    // CHAT API
    if (
      url.pathname === "/api/chat" ||
      url.pathname === "/.netlify/functions/chat"
    ) {
      if (request.method !== "POST") {
        return jsonResponse({
          error: "Method not allowed"
        }, 405);
      }

      if (!env.OPENAI_API_KEY) {
        return jsonResponse({
          error: "OPENAI_API_KEY is not configured."
        }, 500);
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return jsonResponse({
          error: "Invalid JSON request."
        }, 400);
      }

      const messages = Array.isArray(body?.messages)
        ? body.messages
        : [];

      if (!messages.length) {
        return jsonResponse({
          error: "No messages were provided."
        }, 400);
      }

      try {
        const response = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: MODEL,
            input: makeInput(messages)
          })
        });

        const rawText = await response.text();

        let data = null;

        try {
          data = rawText ? JSON.parse(rawText) : null;
        } catch {
          return jsonResponse({
            error: "OpenAI returned an invalid response.",
            details: rawText.slice(0, 500)
          }, 502);
        }

        if (!response.ok) {
          return jsonResponse({
            error: data?.error?.message || "OpenAI API request failed."
          }, response.status);
        }

        const reply = extractReply(data);

        if (!reply) {
          return jsonResponse({
            error: "OpenAI returned no text response."
          }, 502);
        }

        return jsonResponse({
          reply,
          output_text: reply
        });
      } catch (error) {
        return jsonResponse({
          error: error?.message || "Internal server error."
        }, 500);
      }
    }

    // Serve website files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("RAO AI Worker is running.", {
      status: 200
    });
  }
};
