const OPENAI_MODEL = "gpt-5.4-mini";

const OPENAI_URL =
  "https://api.openai.com/v1/responses";

const CORS_HEADERS = {
  "Content-Type":
    "application/json; charset=utf-8",

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",

  "Access-Control-Allow-Methods":
    "GET, POST, OPTIONS"
};


/* =========================
   DEFAULT SYSTEM INSTRUCTION
========================= */

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
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: CORS_HEADERS
    }
  );
}


/* =========================
   MIME TYPE NORMALIZER
========================= */

function normalizeMimeType(type) {
  if (typeof type !== "string") {
    return "image/jpeg";
  }

  const value =
    type.toLowerCase().trim();

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
   DATA URL PARSER
========================= */

function parseDataUrl(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:")
  ) {
    return null;
  }

  /*
   * Expected format:
   *
   * data:image/jpeg;base64,/9j/4AAQ...
   */

  const match =
    dataUrl.match(
      /^data:([^;]+);base64,(.+)$/s
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
   MESSAGE NORMALIZER
========================= */

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
        : "user";

    const content = [];

    /* =========================
       TEXT
    ========================= */

    let text = "";

    if (
      typeof message.content ===
      "string"
    ) {
      text = message.content;

    } else if (
      Array.isArray(message.content)
    ) {
      text = message.content
        .map((item) => {
          if (
            typeof item === "string"
          ) {
            return item;
          }

          if (
            item &&
            typeof item.text ===
              "string"
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
      text = String(
        message.content
      );
    }

    if (text.trim()) {
      content.push({
        type: "input_text",
        text: text.trim()
      });
    }


    /* =========================
       IMAGE
    ========================= */

    if (
      role === "user" &&
      typeof message.image ===
        "string" &&
      message.image.trim()
    ) {
      const image =
        parseDataUrl(
          message.image
        );

      if (image?.data) {
        content.push({
          type: "input_image",
          image_url:
            `data:${normalizeMimeType(
              image.mimeType
            )};base64,${image.data}`
        });
      }
    }


    /* =========================
       FILE CONTENT
    ========================= */

    if (
      role === "user" &&
      message.file &&
      typeof message.file ===
        "object"
    ) {
      const file =
        message.file;

      if (
        typeof file.text ===
          "string" &&
        file.text.trim()
      ) {
        content.push({
          type: "input_text",
          text:
            `\n\nAttached file: ${
              message.filename ||
              file.name ||
              "unknown file"
            }\n\n` +
            file.text
        });
      }
    }


    /* =========================
       FALLBACK
    ========================= */

    if (!content.length) {
      content.push({
        type: "input_text",
        text:
          "Please respond to the user."
      });
    }

    normalized.push({
      role,
      content
    });
  }

  return normalized;
}


/* =========================
   FIND IMAGE IN MESSAGE
========================= */

function hasImage(message) {
  if (!message) {
    return false;
  }

  if (
    typeof message.image ===
      "string" &&
    message.image.startsWith(
      "data:image/"
    )
  ) {
    return true;
  }

  return false;
}


/* =========================
   LIMIT OLD IMAGES
========================= */

function optimizeConversation(
  messages
) {
  /*
   * Keep complete text history.
   *
   * Keep image data only from the
   * latest user message that contains
   * an image.
   *
   * This prevents old images from
   * unnecessarily increasing API usage.
   */

  if (!Array.isArray(messages)) {
    return [];
  }

  let latestImageIndex = -1;

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {
    if (
      hasImage(messages[i])
    ) {
      latestImageIndex = i;
      break;
    }
  }

  if (
    latestImageIndex === -1
  ) {
    return messages;
  }

  return messages.map(
    (message, index) => {
      if (
        index === latestImageIndex
      ) {
        return message;
      }

      if (!hasImage(message)) {
        return message;
      }

      /*
       * Remove old image but keep
       * its text content.
       */

      const copy = {
        ...message
      };

      delete copy.image;

      return copy;
    }
  );
}


/* =========================
   EXTRACT OPENAI TEXT
========================= */

function extractOpenAIText(data) {
  if (!data) {
    return "";
  }

  if (
    typeof data.output_text ===
      "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const parts = [];

  if (Array.isArray(data.output)) {
    for (
      const item of data.output
    ) {
      if (
        !Array.isArray(
         
