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

/* =========================
   JSON RESPONSE
========================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

/* =========================
   DATA URL PARSER
========================= */

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }

  /*
   * Expected format:
   *
   * data:image/jpeg;base64,/9j/4AAQ...
   *
   */

  const match = dataUrl.match(
    /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s
  );

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2]
  };
}

/* =========================
   MIME TYPE NORMALIZER
========================= */

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

/* =========================
   MESSAGE NORMALIZER
========================= */

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  const normalized = [];

  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }

    const role =
      message.role === "assistant" ||
      message.role === "model"
        ? "model"
        : "user";

    const parts = [];

    /* =========================
       TEXT
    ========================= */

    let text = "";

    if (typeof message.content === "string") {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          return item?.text || "";
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
      parts.push({
        text: text.trim()
      });
    }

    /* =========================
       IMAGE
       IMPORTANT FIX
    ========================= */

    if (
      role === "user" &&
      typeof message.image === "string" &&
      message.image.startsWith("data:")
    ) {
      const image = parseDataUrl(message.image);

      if (image?.data) {
        parts.push({
          inlineData: {
            mimeType: normalizeMimeType(
              image.mimeType
            ),
            data: image.data
          }
        });
      }
    }

    /* =========================
       FILE CONTENT
    ========================= */

    if (
      role === "user" &&
      message.file &&
      typeof message.file === "object"
    ) {
      const file = message.file;

      /*
       * Text-readable files are already read
       * by script.js and stored in file.text.
       */

      if (
        typeof file.text === "string" &&
        file.text.trim() &&
        !file.text.startsWith(
          "PDF file attached:"
        )
      ) {
        parts.push({
          text:
            `\n\n[Attached file: ${
              file.name || "unknown file"
            }]\n` +
            file.text
        });
      }
    }

    if (parts.length > 0) {
      normalized.push({
        role,
        parts
      });
    }
  }

  return normalized;
}

/* =========================
   EXTRACT GEMINI TEXT
========================= */

function extractGeminiText(data) {
  if (
    !data ||
    !Array.isArray(data.candidates)
  ) {
    return "";
  }

  return data.candidates
    .flatMap(
      (candidate) =>
        candidate?.content?.parts || []
    )
    .map((part) => part?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

/* =========================
   FIND IMAGE IN LATEST USER
   MESSAGE
========================= */

function hasImagePart(message) {
  if (!message?.parts) {
    return false;
  }

  return message.parts.some(
    (part) =>
      part?.inlineData?.mimeType?.startsWith(
        "image/"
      )
  );
}

/* =========================
   LIMIT OLD IMAGES
========================= */

function optimizeConversation(messages) {
  /*
   * Keep text history.
   *
   * Keep image data only from the latest
   * user message that contains an image.
   *
   * This prevents old images from making
   * the request unnecessarily huge.
   */

  let latestImageIndex = -1;

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {
    if (hasImagePart(messages[i])) {
      latestImageIndex = i;
      break;
    }
  }

  if (latestImageIndex === -1) {
    return messages;
  }

  return messages.map(
    (message, index) => {
      if (
        index === latestImageIndex
      ) {
        return message;
      }

      if (!hasImagePart(message)) {
        return message;
      }

      return {
        role: message.role,
        parts: message.parts.filter(
          (part) =>
            !part?.inlineData
        )
      };
    }
  );
}

/* =========================
   MAIN WORKER
========================= */

export default {
  async fetch(request, env) {
    const url = new URL(
      request.url
    );

    const path =
      url.pathname;

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
        model: GEMINI_MODEL,
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
       API KEY
    ========================= */

    const apiKey =
      env?.GEMINI_API_KEY;

    if (!apiKey) {
      return json(
        {
          ok: false,
          error:
            "GEMINI_API_KEY is not configured in Cloudflare Worker secrets."
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
      !messages.length &&
      typeof body?.message ===
        "string"
    ) {
      messages = [
        {
          role: "user",
          parts: [
            {
              text:
                body.message.trim()
            }
          ]
        }
      ];
    }

    /* =========================
       NO MESSAGE
    ========================= */

    if (!messages.length) {
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
       BUILD GEMINI REQUEST
    ========================= */

    const geminiRequest = {
      systemInstruction: {
        parts: [
          {
            text:
              DEFAULT_SYSTEM_INSTRUCTION
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

    /* =========================
       GOOGLE SEARCH
    ========================= */

    if (
      body?.webSearch === true
    ) {
      geminiRequest.tools = [
        {
          google_search: {}
        }
      ];
    }

    /* =========================
       GEMINI API CALL
    ========================= */

    let response;

    try {
      response =
        await fetch(
          `${GEMINI_URL}?key=${encodeURIComponent(
            apiKey
          )}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(
                geminiRequest
              )
          }
        );
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            "Could not connect to Gemini API.",
          details:
            error?.message ||
            "Network error"
        },
        502
      );
    }

    /* =========================
       READ GEMINI RESPONSE
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
            "Gemini returned an invalid response.",
          status:
            response.status
        },
        502
      );
    }

    /* =========================
       GEMINI ERROR
    ========================= */

    if (!response.ok) {
      const details =
        data?.error ||
        data;

      return json(
        {
          ok: false,
          error:
            `Gemini API request failed (${response.status}).`,
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
      extractGeminiText(
        data
      );

    if (!reply) {
      return json(
        {
          ok: false,
          error:
            "Gemini returned no text.",
          details: {
            candidates:
              data?.candidates || []
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
      model: GEMINI_MODEL,
      creator: "Suraj Kumar",
      message: reply
    });
  }
};
