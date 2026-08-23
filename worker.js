const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.6";

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders()
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
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
        message: "RAO AI Worker is running"
      });
    }

    // Accept all common chat endpoints
    const isChatEndpoint =
      path === "/api/chat" ||
      path === "/chat" ||
      path === "/.netlify/functions/chat";

    if (request.method !== "POST" || !isChatEndpoint) {
      return json({
        ok: false,
        error: "Not found",
        path
      }, 404);
    }

    // API key check
    if (!env.OPENAI_API_KEY) {
      return json({
        ok: false,
        error: "OPENAI_API_KEY is not configured"
      }, 500);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "Invalid JSON request"
      }, 400);
    }

    // Support different frontend message formats
    let messages = body.messages;

    if (!Array.isArray(messages)) {
      if (typeof body.message === "string") {
        messages = [
          {
            role: "user",
            content: body.message
          }
        ];
      } else if (typeof body.input === "string") {
        messages = [
          {
            role: "user",
            content: body.input
          }
        ];
      } else {
        return json({
          ok: false,
          error: "No message provided"
        }, 400);
      }
    }

    // Convert messages to Responses API input
    const input = messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content:
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)
    }));

    try {
      const openaiResponse = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          input
        })
      });

      const data = await openaiResponse.json();

      if (!openaiResponse.ok) {
        return json({
          ok: false,
          error: data?.error?.message || "OpenAI API error",
          details: data?.error || data
        }, openaiResponse.status);
      }

      // Extract text safely
      let reply = "";

      if (typeof data.output_text === "string") {
        reply = data.output_text;
      }

      if (!reply && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (Array.isArray(item.content)) {
            for (const content of item.content) {
              if (
                content.type === "output_text" &&
                typeof content.text === "string"
              ) {
                reply += content.text;
              }
            }
          }
        }
      }

      return json({
        ok: true,
        reply: reply || "I couldn't generate a response.",
        output_text: reply,
        response: data
      });

    } catch (error) {
      return json({
        ok: false,
        error: error?.message || "Worker request failed"
      }, 500);
    }
  }
};
