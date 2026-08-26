const OPENAI_MODEL = "gpt-5.4-mini";
const OPENAI_URL = "https://api.openai.com/v1/responses";

const CORS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_SYSTEM_INSTRUCTION = `
You are RAO AI, a helpful AI assistant.

IMPORTANT IDENTITY RULES:
- Your name is RAO AI.
- The creator/developer of RAO AI is Suraj Kumar.
- If the user asks who created you, who your creator is, or similar questions, answer:
  "RAO AI ka creator Suraj Kumar ne create kiya hai."
- Never say that Google created RAO AI.
- Never invent another creator.
- Do not claim that RAO AI was created by Google, OpenAI, Microsoft, or another company.

LANGUAGE RULES:
- Reply in the same language as the user whenever possible.
- If the user writes Hindi or Hinglish, reply in Hindi/Hinglish.
- If the user writes English, reply in English.

BEHAVIOR:
- Be helpful, accurate, friendly and concise.
- Do not invent facts.
- If you are unsure, say so.
- When an image is provided, actually analyze the image.
- Never reveal API keys, secrets, or environment variables.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      if (!message || typeof message !== "object") {
        return null;
      }

      const role =
        message.role === "assistant" ||
        message.role === "system" ||
        message.role === "developer"
          ? message.role
          : "user";

      let content = message.content;

      // Already in Responses API format.
      if (Array.isArray(content)) {
        const normalizedContent = [];

        for (const part of content) {
          if (!part || typeof part !== "object") {
            continue;
          }

          if (part.type === "input_text" && typeof part.text === "string") {
            normalizedContent.push({
              type: "input_text",
              text: part.text,
            });
            continue;
          }

          if (part.type === "input_image") {
            const imageUrl =
              part.image_url ||
              part.url ||
              part.imageUrl;

            if (typeof imageUrl === "string" && imageUrl.length > 0) {
              normalizedContent.push({
                type: "input_image",
                image_url: imageUrl,
              });
            }
            continue;
          }

          // Support common frontend image format.
          if (
            (part.type === "image_url" || part.type === "image") &&
            part.image_url
          ) {
            const imageUrl =
              typeof part.image_url === "string"
                ? part.image_url
                : part.image_url.url;

            if (typeof imageUrl === "string" && imageUrl.length > 0) {
              normalizedContent.push({
                type: "input_image",
                image_url: imageUrl,
              });
            }
            continue;
          }

          // Support Gemini-style text parts from old frontend code.
          if (
            part.type === "text" &&
            typeof part.text === "string"
          ) {
            normalizedContent.push({
              type: "input_text",
              text: part.text,
            });
          }
        }

        if (normalizedContent.length > 0) {
          return {
            role,
            content: normalizedContent,
          };
        }

        return null;
      }

      // Simple string content.
      if (typeof content === "string") {
        return {
          role,
          content: content,
        };
      }

      // Gemini-style message:
      // { role: "user", parts: [{ text: "hello" }] }
      if (Array.isArray(message.parts)) {
        const converted = [];

        for (const part of message.parts) {
          if (!part || typeof part !== "object") {
            continue;
          }

          if (typeof part.text === "string") {
            converted.push({
              type: "input_text",
              text: part.text,
            });
            continue;
          }

          if (part.inlineData) {
            const mimeType =
              part.inlineData.mimeType || "image/jpeg";

            const data = part.inlineData.data;

            if (typeof data === "string" && data.length > 0) {
              converted.push({
                type: "input_image",
                image_url: `data:${mimeType};base64,${data}`,
              });
            }
          }
        }

        if (converted.length > 0) {
          return {
            role,
            content: converted,
          };
        }
      }

      return null;
    })
    .filter(Boolean);
}

function extractOutputText(data) {
  if (!data) {
    return "";
  }

  if (typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

  let text = "";

  for (const item of data.output) {
    if (!item || item.type !== "message") {
      continue;
    }

    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (
        part &&
        part.type === "output_text" &&
        typeof part.text === "string"
      ) {
        text += part.text;
      }
    }
  }

  return text.trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // -------------------------
    // CORS
    // -------------------------

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // -------------------------
    // HEALTH CHECK
    // -------------------------

    if (request.method === "GET") {
      return json({
        ok: true,
        service: "RAO AI",
        model: OPENAI_MODEL,
        creator: "Suraj Kumar",
        message: "RAO AI Worker is running.",
        endpoint: path,
      });
    }

    // -------------------------
    // METHOD CHECK
    // -------------------------

    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed.",
        },
        405
      );
    }

    // -------------------------
    // API KEY
    // -------------------------

    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      return json(
        {
          ok: false,
          error:
            "OPENAI_API_KEY is not configured in Cloudflare Worker secrets.",
        },
        500
      );
    }

    // -------------------------
    // READ BODY
    // -------------------------

    let body;

    try {
      body = await request.json();
    } catch (error) {
      return json(
        {
          ok: false,
          error: "Invalid JSON request.",
        },
        400
      );
    }

    // -------------------------
    // NORMALIZE MESSAGES
    // -------------------------

    let messages = normalizeMessages(body?.messages);

    // Support:
    // { "message": "Hello" }
    // and
    // { "message": "Hello", "image": "data:image/..." }

    if (
      messages.length === 0 &&
      typeof body?.message === "string"
    ) {
      const content = [
        {
          type: "input_text",
          text: body.message.trim(),
        },
      ];

      if (
        typeof body?.image === "string" &&
        body.image.length > 0
      ) {
        content.push({
          type: "input_image",
          image_url: body.image,
        });
      }

      messages = [
        {
          role: "user",
          content,
        },
      ];
    }

    // Support single message with parts.
    if (
      messages.length === 0 &&
      Array.isArray(body?.parts)
    ) {
      messages = normalizeMessages([
        {
          role: "user",
          parts: body.parts,
        },
      ]);
    }

    if (messages.length === 0) {
      return json(
        {
          ok: false,
          error: "No message provided.",
        },
        400
      );
    }

    // -------------------------
    // LIMIT OLD IMAGES
    // Keep only the latest user image.
    // -------------------------

    let latestImageMessage = -1;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];

      if (!Array.isArray(message.content)) {
        continue;
      }

      const hasImage = message.content.some(
        (part) =>
          part &&
          part.type === "input_image" &&
          typeof part.image_url === "string"
      );

      if (hasImage) {
        latestImageMessage = i;
        break;
      }
    }

    if (latestImageMessage !== -1) {
      messages = messages.map((message, index) => {
        if (index === latestImageMessage) {
          return message;
        }

        if (!Array.isArray(message.content)) {
          return message;
        }

        const hasImage = message.content.some(
          (part) =>
            part &&
            part.type === "input_image"
        );

        if (!hasImage) {
          return message;
        }

        return {
          ...message,
          content: message.content.filter(
            (part) => part.type !== "input_image"
          ),
        };
      });
    }

    // Remove messages whose content became empty.
    messages = messages.filter((message) => {
      if (Array.isArray(message.content)) {
        return message.content.length > 0;
      }

      return true;
    });

    // -------------------------
    // BUILD OPENAI REQUEST
    // -------------------------

    const openAIRequest = {
      model: OPENAI_MODEL,
      instructions: DEFAULT_SYSTEM_INSTRUCTION,
      input: messages,
      max_output_tokens: 4096,
    };

    // -------------------------
    // WEB SEARCH
    // -------------------------

    if (body?.webSearch === true) {
      openAIRequest.tools = [
        {
          type: "web_search_preview",
        },
      ];
    }

    // -------------------------
    // OPENAI RESPONSES API
    // -------------------------

    let response;

    try {
      response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(openAIRequest),
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error: "Could not connect to OpenAI API.",
          details: error?.message || "Network error",
        },
        502
      );
    }

    // -------------------------
    // READ OPENAI RESPONSE
    // -------------------------

    let data;

    try {
      data = await response.json();
    } catch (error) {
      return json(
        {
          ok: false,
          error: "OpenAI returned an invalid response.",
          status: response.status,
        },
        502
      );
    }

    // -------------------------
    // OPENAI ERROR
    // -------------------------

    if (!response.ok) {
      const details =
        data?.error ||
        data ||
        "Unknown OpenAI API error.";

      return json(
        {
          ok: false,
          error: `OpenAI API request failed (${response.status}).`,
          status: response.status,
          details,
        },
        response.status
      );
    }

    // -------------------------
    // EXTRACT ANSWER
    // -------------------------

    const reply = extractOutputText(data);

    if (!reply) {
      return json(
        {
          ok: false,
          error: "OpenAI returned no text.",
          details: {
            output: data?.output || [],
          },
        },
        502
      );
    }

    // -------------------------
    // SUCCESS
    // -------------------------

    return json({
      ok: true,
      service: "RAO AI",
      model: OPENAI_MODEL,
      creator: "Suraj Kumar",
      message: reply,
    });
  },
};
