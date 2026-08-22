const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-mini";

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

function makeInput(messages) {
  return messages.map((message) => {
    const content = [];

    if (message?.image) {
      content.push({
        type: "input_image",
        image_url: message.image
      });
    }

    if (message?.file?.text) {
      content.push({
        type: "input_text",
        text:
          `FILE CONTENT (${message.file.name || "uploaded file"}):\n\n` +
          String(message.file.text)
      });
    }

    if (message?.content) {
      content.push({
        type: "input_text",
        text: String(message.content)
      });
    }

    if (!content.length) {
      content.push({
        type: "input_text",
        text: "Please respond to the user."
      });
    }

    return {
      role: message?.role === "assistant" ? "assistant" : "user",
      content
    };
  });
}

function extractReply(data) {
  if (!data) return "";

  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const parts = [];

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const part of item.content) {
        if (
          typeof part?.text === "string" &&
          part.text.trim()
        ) {
          parts.push(part.text);
        }
      }
    }
  }

  return parts.join("\n").trim();
}

export default {
  async fetch(request, env) {

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "POST, OPTIONS"
        }
      });
    }

    // Health check
    if (request.method === "GET") {
      return jsonResponse(200, {
        ok: true,
        service: "RAO AI",
        message: "RAO AI Worker is running."
      });
    }

    // Only POST for chat
    if (request.method !== "POST") {
      return jsonResponse(405, {
        error: "Method not allowed"
      });
    }

    try {

      // API KEY CHECK
      if (!env.OPENAI_API_KEY) {
        return jsonResponse(500, {
          error: "OPENAI_API_KEY is not configured."
        });
      }

      // READ REQUEST
      let body;

      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse(400, {
          error: "Invalid JSON request."
        });
      }

      const messages = Array.isArray(body?.messages)
        ? body.messages
        : [];

      if (!messages.length) {
        return jsonResponse(400, {
          error: "No messages were provided."
        });
      }

      // CALL OPENAI
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
      } catch (error) {
        return jsonResponse(502, {
          error: "OpenAI returned an invalid response.",
          details: rawText.slice(0, 500)
        });
      }

      // OPENAI ERROR
      if (!response.ok) {
        return jsonResponse(response.status, {
          error:
            data?.error?.message ||
            "OpenAI API request failed."
        });
      }

      // EXTRACT ANSWER
      const reply = extractReply(data);

      if (!reply) {
        return jsonResponse(502, {
          error: "OpenAI returned no text response."
        });
      }

      // SUCCESS
      return jsonResponse(200, {
        reply: reply,
        output_text: reply
      });

    } catch (error) {
      return jsonResponse(500, {
        error: error?.message || "Internal server error."
      });
    }
  }
};
