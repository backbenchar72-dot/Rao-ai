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
- If the user asks who created you or who your creator is, answer:
  "RAO AI ko Suraj Kumar ne create kiya hai."
- Never say that Google created RAO AI.
- Never invent another creator name.
- Do not claim that RAO AI was created by Google, OpenAI, Microsoft, or another company.

LANGUAGE RULE:
- Reply in the same language as the user whenever possible.
- If the user writes Hindi/Hinglish, reply in Hindi/Hinglish.
- If the user writes English, reply in English.

BEHAVIOR:
- Be helpful, accurate, friendly and concise.
- If you do not know something, say so instead of inventing facts.
- When an image is provided, actually analyze the image.
- Never claim that an image was not provided when an image is present in the request.
- Do not reveal secret API keys or server environment variables.
`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

/*
 * Convert a frontend data URL such as:
 *
 * data:image/jpeg;base64,/9j/4AAQ...
 *
 * into Gemini inlineData:
 *
 * {
 *   inlineData: {
 *     mimeType: "image/jpeg",
 *     data: "/9j/4AAQ..."
 *   }
 * }
 */
function dataUrlToInlineData(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }

  const match = dataUrl.match(
    /^data:([^;,]+);base64,(.+)$/s
  );

  if (!match) {
    return null;
  }

  const mimeType = match[1].trim();
  const base64Data = match[2].trim();

  if (!mimeType.startsWith("image/")) {
    return null;
  }

  if (!base64Data) {
    return null;
  }

  return {
    inlineData: {
      mimeType,
      data: base64Data
    }
  };
}

/*
 * Convert frontend messages into Gemini contents.
 *
 * IMPORTANT:
 * message.image is now converted into Gemini inlineData.
 */
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

      /*
       * TEXT
       */
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
        message.content !== null &&
        message.content !== undefined
      ) {
        text = JSON.stringify(
          message.content
        );
      }

      if (text.trim()) {
        parts.push({
          text: text.trim()
        });
      }

      /*
       * IMAGE
       */
      if (message.image) {
        const imagePart =
          dataUrlToInlineData(
            message.image
          );

        if (imagePart) {
          parts.push(imagePart);
        }
      }

      /*
       * TEXT FILE
       *
       * The current frontend sends file.text
       * for supported text files.
       */
      if (message.file) {
        const fileName =
          message.file.name || "file";

        const fileType =
          message.file.type || "";

        const fileText =
          typeof message.file.text === "string"
            ? message.file.text
            : "";

        /*
         * Only add text when actual text exists.
         * Avoid sending useless metadata to Gemini.
         */
        if (fileText.trim()) {
          parts.push({
            text:
              `\n\n[Attached file: ${fileName}]\n` +
              `File type: ${fileType || "unknown"}\n` +
              `File content:\n${fileText}`
          });
        } else {
          /*
           * For PDFs and unsupported files, tell
           * the model that the frontend attached
           * the file but no extracted text is
           * available yet.
           */
          parts.push({
            text:
              `\n\n[Attached file: ${fileName}]\n` +
              `File type: ${fileType || "unknown"}.\n` +
              `The file is attached, but text extraction ` +
              `is not available in the current frontend.`
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

/*
 * Gemini response text extraction
 */
function extractGeminiText(data) {
  if (!data?.candidates?.length) {
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

export default {
  async fetch(request, env) {
    /*
     * CORS
     */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    /*
     * Health check
     */
    if (request.method === "GET") {
      return json({
        ok: true,
        service: "RAO AI",
        model: GEMINI_MODEL,
        creator: "Suraj Kumar",
        message:
          "RAO AI Worker is running."
      });
    }

    /*
     * Only POST is allowed for chat
     */
    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed."
        },
        405
      );
    }

    /*
     * Check API key
     */
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

    /*
     * Read JSON body
     */
    let body;

    try {
      body = await request.json();
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

    /*
     * Convert messages
     */
    let messages =
      normalizeMessages(
        body?.messages
      );

    /*
     * Support single-message request too
     */
    if (
      !messages.length &&
      typeof body?.message === "string"
    ) {
      messages = [
        {
          role: "user",
          parts: [
            {
              text: body.message
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

    /*
     * Gemini request
     */
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

    /*
     * Optional Google Search
     */
    if (body?.webSearch === true) {
      geminiRequest.tools = [
        {
          google_search: {}
        }
      ];
    }

    /*
     * Call Gemini
     */
    let response;

    try {
      response = await fetch(
        `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`,
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

    /*
     * Read Gemini response safely
     */
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

    /*
     * Gemini API error
     */
    if (!response.ok) {
      return json(
        {
          ok: false,
          error:
            `Gemini API request failed (${response.status}).`,
          status:
            response.status,
          details:
            data?.error || data
        },
        response.status
      );
    }

    /*
     * Extract reply
     */
    const reply =
      extractGeminiText(data);

    if (!reply) {
      return json(
        {
          ok: false,
          error:
            "Gemini returned no text."
        },
        502
      );
    }

    /*
     * SUCCESS
     */
    return json({
      ok: true,
      service: "RAO AI",
      model: GEMINI_MODEL,
      creator: "Suraj Kumar",
      message: reply
    });
  }
};
