const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.6-luna";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function makeInput(messages) {
  return messages.map((message) => ({
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
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    // Health check
    if (
      request.method === "GET" &&
      (url.pathname === "/api/chat" ||
        url.pathname === "/.netlify/functions/chat")
    ) {
      return json({
        ok: true,
        service: "RAO AI",
        message: "RAO AI Worker is running."
      });
    }

    // Chat API
    if (
      url.pathname === "/api/chat" ||
      url.pathname === "/.netlify/functions/chat"
    ) {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

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
        return json({ error: "Invalid JSON request." }, 400);
      }

      const messages = Array.isArray(body?.messages)
        ? body.messages
        : [];

      if (!messages.length) {
        return json({ error: "No messages were provided." }, 400);
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

        let data;

        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          return json(
            {
              error: "OpenAI returned an invalid response.",
              details: rawText.slice(0, 1000)
            },
            502
          );
        }

        if (!response.ok) {
          return json(
            {
              error:
                data?.error?.message ||
                `OpenAI request failed with status ${response.status}.`,
              openai_status: response.status,
              details: data
            },
            response.status
          );
        }

        const reply =
          data?.output_text ||
          data?.output
            ?.flatMap((item) =>
              Array.isArray(item?.content) ? item.content : []
            )
            ?.map((item) => item?.text)
            ?.filter(Boolean)
            ?.join("\n")
            ?.trim();

        if (!reply) {
          return json(
            {
              error: "OpenAI returned no text response.",
              details: data
            },
            502
          );
        }

        return json({
          reply,
          output_text: reply
        });
      } catch (error) {
        return json(
          {
            error: error?.message || "Internal server error."
          },
          500
        );
      }
    }

    // Website files
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("RAO AI Worker is running.", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};
