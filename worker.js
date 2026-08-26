const OPENAI_MODEL = "gpt-5.4-mini";
const OPENAI_URL = "https://api.openai.com/v1/responses";

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
- If the user asks who created you, who your creator is, or similar questions, answer:
  "RAO AI ko Suraj Kumar ne create kiya hai."
- Never say that Google created RAO AI.
- Never invent another creator name.
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
- Do not pretend that an image was provided if no image data is present.
- Never reveal API keys, secrets, or environment variables.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

function parseDataUrl(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:")
  ) {
    return null;
  }

  const match = dataUrl.match(
    /^data:([^;,]+);base64,(.+)$/s
  );

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

function normalizeMimeType(type) {
  if (typeof type !== "string") {
    return "image/jpeg";
  }

  const value = type.toLowerCase().trim();

  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif"
  ];

  if (allowed.includes(value)) {
    return value === "image/jpg"
      ? "image/jpeg"
      : value;
  }

  return "image/jpeg";
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const normalized = [];

  for (const message of messages) {
    if (
      !message ||
      typeof message !== "object"
    ) {
      continue;
    }

    const role =
      message.role === "assistant" ||
      message.role === "model"
        ? "assistant"
        : message.role === "system"
          ? "system"
          : "user";

    const content = [];

    let text = "";

    if (
      typeof message.content === "string"
    ) {
      text = message.content;
    } else if (
      Array.isArray(message.content)
    ) {
      text = message.content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          if (
            item &&
            typeof item.text === "string"
          ) {
            return item.text;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n");
    } else if (
      message.content !== undefined &&
      message.content !== null
    ) {
      text = String(message.content);
    }

    if (text.trim()) {
      content.push({
        type: "input_text",
        text: text.trim()
      });
    }

    if (
      role === "user" &&
      typeof message.image === "string"
    ) {
      const image =
        parseDataUrl(message.image);

      if (image) {
        content.push({
          type: "input_image",
          image_url:
            `data:${normalizeMimeType(
              image.mimeType
            )};base64,${image.data}`,
          detail: "auto"
        });
      }
    }

    if (
      role === "user" &&
      message.file &&
      typeof message.file === "object"
    ) {
      const file = message.file;

      if (
        typeof file.text === "string" &&
        file.text.trim()
      ) {
        content.push({
          type: "input_text",
          text:
            `\n[Attached file: ${
              file.name || "unknown file"
            }]\n${file.text}`
        });
      }
    }

    if (content.length) {
      normalized.push({
        role,
        content
      });
    }
  }

  return normalized;
}

function optimizeConversation(messages) {
  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    return [];
  }

  let latestImageIndex = -1;

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {
    const content =
      messages[i]?.content;

    if (
      Array.isArray(content) &&
      content.some(
        (part) =>
          part?.type === "input_image"
      )
    ) {
      latestImageIndex = i;
      break;
    }
  }

  if (latestImageIndex === -1) {
    return messages;
  }

  return messages
    .map((message, index) => {
      if (
        index === latestImageIndex
      ) {
        return message;
      }

      if (
        !Array.isArray(
          message?.content
        )
      ) {
        return message;
      }

      const withoutOldImages =
        message.content.filter(
          (part) =>
            part?.type !== "input_image"
        );

      if (
        withoutOldImages.length === 0
      ) {
        return null;
      }

      return {
        role: message.role,
        content: withoutOldImages
      };
    })
    .filter(Boolean);
}

function extractOpenAIText(data) {
  if (
    typeof data?.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const parts = [];

  for (
    const item of data?.output || []
  ) {
    for (
      const content of item?.content || []
    ) {
      if (
        content?.type === "output_text" &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }

  return parts
    .filter(Boolean)
    .join("\n")
    .trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(
      request.url
    );

    const path = url.pathname;

    /* =========================
       CORS
    ========================= */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    /* =========================
       HEALTH CHECK
    ========================= */

    if (
      request.method === "GET"
    ) {
      return json({
        ok: true,
        service: "RAO AI",
        model: OPENAI_MODEL,
        creator: "Suraj Kumar",
        message:
          "RAO AI Worker is running.",
        endpoint: path
      });
    }

    /* =========================
       METHOD CHECK
    ========================= */

    if (
      request.method !== "POST"
    ) {
      return json(
        {
          ok: false,
          error:
            "Method not allowed."
        },
        405
      );
    }

    /* =========================
       OPENAI API KEY
    ========================= */

    const apiKey =
      env?.OPENAI_API_KEY;

    if (!apiKey) {
      return json(
        {
          ok: false,
          error:
            "OPENAI_API_KEY is not configured in Cloudflare Worker secrets."
        },
        500
      );
    }

    /* =========================
       READ BODY
    ========================= */

    let body;

    try {
      body =
        await request.json();
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            "Invalid JSON request."
        },
        400
      );
    }

    /* =========================
       NORMALIZE MESSAGES
    ========================= */

    let messages =
      normalizeMessages(
        body?.messages
      );

    /* =========================
       SINGLE MESSAGE SUPPORT
    ========================= */

    if (
      messages.length === 0 &&
      typeof body?.message ===
        "string" &&
      body.message.trim()
    ) {
      messages = [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                body.message.trim()
            }
          ]
        }
      ];

      if (
        typeof body?.image ===
        "string"
      ) {
        const image =
          parseDataUrl(
            body.image
          );

        if (image) {
          messages[0].content.push({
            type: "input_image",
            image_url:
              `data:${normalizeMimeType(
                image.mimeType
              )};base64,${image.data}`,
            detail: "auto"
          });
        }
      }
    }

    /* =========================
       NO MESSAGE
    ========================= */

    if (messages.length === 0) {
      return json(
        {
          ok: false,
          error:
            "No message provided."
        },
        400
      );
    }

    /* =========================
       OPTIMIZE IMAGE HISTORY
    ========================= */

    messages =
      optimizeConversation(
        messages
      );

    /* =========================
       BUILD OPENAI REQUEST
    ========================= */

    const requestBody = {
      model: OPENAI_MODEL,

      instructions:
        DEFAULT_SYSTEM_INSTRUCTION,

      input: messages,

      max_output_tokens: 4096
    };

    /* =========================
       WEB SEARCH
    ========================= */

    if (
      body?.webSearch === true
    ) {
      requestBody.tools = [
        {
          type: "web_search"
        }
      ];
    }

    /* =========================
       OPENAI API CALL
    ========================= */

    let response;

    try {
      response =
        await fetch(
          OPENAI_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Authorization":
                `Bearer ${apiKey}`
            },

            body:
              JSON.stringify(
                requestBody
              )
          }
        );
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            "Could not connect to OpenAI API.",
          details:
            error?.message ||
            "Network error"
        },
        502
      );
    }

    /* =========================
       READ OPENAI RESPONSE
    ========================= */

    let data;

    try {
      data =
        await response.json();
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            "OpenAI returned an invalid response.",
          status:
            response.status
        },
        502
      );
    }

    /* =========================
       OPENAI ERROR
    ========================= */

    if (!response.ok) {
      const details =
        data?.error ||
        data;

      return json(
        {
          ok: false,
          error:
            `OpenAI API request failed (${response.status}).`,
          status:
            response.status,
          details
        },
        response.status
      );
    }

    /* =========================
       EXTRACT ANSWER
    ========================= */

    const reply =
      extractOpenAIText(
        data
      );

    if (!reply) {
      return json(
        {
          ok: false,
          error:
            "OpenAI returned no text.",
          details: {
            output:
              data?.output || []
          }
        },
        502
      );
    }

    /* =========================
       SUCCESS
    ========================= */

    return json({
      ok: true,
      service: "RAO AI",
      model: OPENAI_MODEL,
      creator: "Suraj Kumar",
      message: reply
    });
  }
};
