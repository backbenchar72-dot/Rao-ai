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
- Never say Google created RAO AI.
- Never invent another creator name.

LANGUAGE RULE:
- Reply in the same language as the user whenever possible.
- If the user writes Hindi/Hinglish, reply in Hindi/Hinglish.
- If the user writes English, reply in English.

BEHAVIOR:
- Be helpful, accurate, friendly and concise.
- If you do not know something, say so instead of inventing facts.
- When an image is attached, actually analyze the image.
- When a file is attached, use its available contents.
- Never claim that an image was not attached if image data is actually provided.
- Do not reveal API keys or server environment variables.
`;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

/* =========================
   NORMALIZE TEXT
========================= */

function getMessageText(message) {
  if (!message) return "";

  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        return item?.text || "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (message.content != null) {
    try {
      return JSON.stringify(message.content);
    } catch {
      return "";
    }
  }

  return "";
}

/* =========================
   DATA URL PARSER
========================= */

function parseDataUrl(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:")
  ) {
    return null;
  }

  const match = dataUrl.match(
    /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s
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
   NORMALIZE MESSAGES
   INCLUDING IMAGES/FILES
========================= */

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(Boolean)
    .map((message) => {
      const role =
        message.role === "assistant" ||
        message.role === "model"
          ? "model"
          : "user";

      const parts = [];

      const text = getMessageText(message);

      if (text.trim()) {
        parts.push({
          text: text.trim()
        });
      }

      /* =========================
         IMAGE SUPPORT
      ========================= */

      if (message.image) {
        const image = parseDataUrl(message.image);

        if (image) {
          parts.push({
            inlineData: {
              mimeType: image.mimeType,
              data: image.data
            }
          });
        }
      }

      /* =========================
         FILE SUPPORT
      ========================= */

      if (message.file) {
        const file = message.file;

        if (
          typeof file.text === "string" &&
          file.text.trim()
        ) {
          parts.push({
            text:
              `\n\nAttached file: ${file.name || "file"}\n` +
              file.text
          });
        } else if (file.name) {
          parts.push({
            text:
              `\n\nAttached file: ${file.name}`
          });
        }
      }

      return {
        role,
        parts
      };
    })
    .filter(
      (message) =>
        Array.isArray(message.parts) &&
        message.parts.length > 0
    );
}

/* =========================
   EXTRACT GEMINI TEXT
========================= */

function extractGeminiText(data) {
  if (!data?.candidates?.length) {
    return "";
  }

  return data.candidates
    .flatMap(
      (candidate) =>
        candidate?.content?.parts || []
    )
    .map(
      (part) =>
        typeof part?.text === "string"
          ? part.text
          : ""
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

/* =========================
   GEMINI ERROR MESSAGE
========================= */

function getGeminiErrorMessage(
  status,
  data
) {
  const apiError =
    data?.error || {};

  const message =
    apiError?.message ||
    data?.message ||
    "";

  const statusName =
    apiError?.status ||
    "";

  if (status === 429) {
    return (
      "Gemini API quota/rate limit reached. " +
      "Thodi der baad dobara try karein."
    );
  }

  if (status === 503) {
    return (
      "Gemini service abhi temporarily busy hai. " +
      "RAO AI automatically retry kar raha tha. " +
      "Thodi der baad dobara try karein."
    );
  }

  if (status === 408) {
    return (
      "Gemini request timeout ho gayi. " +
      "Please dobara try karein."
    );
  }

  if (status === 400) {
    return (
      "Gemini request mein problem hai. " +
      (message || "Request invalid hai.")
    );
  }

  if (status === 401) {
    return (
      "Gemini API key invalid ya expired hai."
    );
  }

  if (status === 403) {
    return (
      "Gemini API access allowed nahi hai. " +
      "API key/project permissions check karein."
    );
  }

  if (status === 404) {
    return (
      "Gemini model available nahi hai. " +
      `Current model: ${GEMINI_MODEL}`
    );
  }

  return (
    `Gemini API request failed (${status}).` +
    (
      message || statusName
        ? ` ${message || statusName}`
        : ""
    )
  );
}

/* =========================
   WAIT
========================= */

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/* =========================
   GEMINI REQUEST WITH RETRY
========================= */

async function callGemini(
  apiKey,
  geminiRequest
) {
  const maxAttempts = 4;

  /*
   * Official-style exponential backoff:
   *
   * Attempt 1 -> immediate
   * Attempt 2 -> ~1 second
   * Attempt 3 -> ~2 seconds
   * Attempt 4 -> ~4 seconds
   */

  const delays = [
    0,
    1000,
    2000,
    4000
  ];

  let lastStatus = 500;
  let lastData = null;

  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {
    if (delays[attempt] > 0) {
      const jitter =
        Math.floor(
          Math.random() * 500
        );

      await sleep(
        delays[attempt] + jitter
      );
    }

    try {
      const response =
        await fetch(
          `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify(
              geminiRequest
            )
          }
        );

      let data = null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          data
        };
      }

      lastStatus =
        response.status;

      lastData = data;

      /*
       * Retry only transient errors.
       *
       * 408 = timeout
       * 429 = rate limit/quota
       * 500 = server error
       * 502 = bad gateway
       * 503 = service unavailable
       * 504 = gateway timeout
       */

      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (!retryable) {
        break;
      }

    } catch (error) {
      /*
       * Network failure.
       * Retry it.
       */

      lastStatus = 502;

      lastData = {
        error: {
          message:
            error?.message ||
            "Network error"
        }
      };
    }
  }

  return {
    ok: false,
    status: lastStatus,
    data: lastData
  };
}

/* =========================
   WORKER
========================= */

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    const path =
      url.pathname;

    /* =========================
       CORS
    ========================= */

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers: CORS_HEADERS
        }
      );
    }

    /* =========================
       HEALTH CHECK
    ========================= */

    if (
      request.method ===
      "GET"
    ) {
      return json({
        ok: true,
        service: "RAO AI",
        model: GEMINI_MODEL,
        creator: "Suraj Kumar",
        message:
          "RAO AI Worker is running."
      });
    }

    /* =========================
       METHOD CHECK
    ========================= */

    if (
      request.method !==
      "POST"
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
      env.GEMINI_API_KEY;

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
    } catch {
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
       MESSAGES
    ========================= */

    let messages =
      normalizeMessages(
        body.messages
      );

    /*
     * Support:
     *
     * {
     *   message: "Hello"
     * }
     */

    if (
      !messages.length &&
      typeof body.message ===
        "string"
    ) {
      messages = [
        {
          role: "user",
          parts: [
            {
              text:
                body.message
            }
          ]
        }
      ];
    }

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
       GEMINI REQUEST
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

      contents:
        messages,

      generationConfig: {
        maxOutputTokens: 4096,

        thinkingConfig: {
          thinkingLevel:
            "medium"
        }
      }
    };

    /* =========================
       GOOGLE SEARCH
    ========================= */

    if (
      body.webSearch === true
    ) {
      geminiRequest.tools = [
        {
          google_search: {}
        }
      ];
    }

    /* =========================
       CALL GEMINI
    ========================= */

    const result =
      await callGemini(
        apiKey,
        geminiRequest
      );

    /* =========================
       GEMINI ERROR
    ========================= */

    if (!result.ok) {
      return json(
        {
          ok: false,

          error:
            getGeminiErrorMessage(
              result.status,
              result.data
            ),

          status:
            result.status,

          retryAttempted: true,

          details:
            result.data?.error ||
            null
        },
        result.status
      );
    }

    /* =========================
       EXTRACT RESPONSE
    ========================= */

    const reply =
      extractGeminiText(
        result.data
      );

    if (!reply) {
      return json(
        {
          ok: false,

          error:
            "Gemini returned no text.",

          retryAttempted: false
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
