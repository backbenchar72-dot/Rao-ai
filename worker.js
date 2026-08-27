const OPENAI_MODEL = "gpt-5.4-mini";
const OPENAI_URL = "https://api.openai.com/v1/responses";

const REALTIME_MODEL = "gpt-realtime-2.1";

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


/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}


/* =========================================================
   NORMALIZE MESSAGE
========================================================= */

function normalizeMessages(body) {
  let messages = [];

  if (Array.isArray(body.messages)) {
    messages = body.messages;
  }

  /*
    Support single-message requests:
    {
      "message": "Hello"
    }
  */
  if (!messages.length && typeof body.message === "string") {
    messages = [
      {
        role: "user",
        content: body.message.trim(),
      },
    ];
  }

  /*
    Support:
    {
      "message": {
        "role": "user",
        "content": "Hello"
      }
    }
  */
  if (
    !messages.length &&
    body.message &&
    typeof body.message === "object"
  ) {
    messages = [body.message];
  }

  return messages;
}


/* =========================================================
   CONVERT TO RESPONSES API INPUT
========================================================= */

function buildInput(messages, body) {
  const input = [];

  for (const message of messages) {
    if (!message) continue;

    const role =
      message.role === "assistant"
        ? "assistant"
        : message.role === "system"
          ? "system"
          : "user";

    /*
      Simple string content
    */
    if (typeof message.content === "string") {
      const text = message.content.trim();

      if (!text) continue;

      /*
        Responses API accepts:
        role + content
      */
      input.push({
        role,
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      });

      continue;
    }

    /*
      Array content
      Useful for image input.
    */
    if (Array.isArray(message.content)) {
      const content = [];

      for (const part of message.content) {
        if (!part) continue;

        /*
          Already in Responses API format
        */
        if (
          part.type === "input_text" ||
          part.type === "input_image" ||
          part.type === "input_file"
        ) {
          content.push(part);
          continue;
        }

        /*
          OpenAI-style image_url format
        */
        if (part.type === "image_url") {
          let imageUrl = part.image_url;

          if (
            imageUrl &&
            typeof imageUrl === "object" &&
            typeof imageUrl.url === "string"
          ) {
            imageUrl = imageUrl.url;
          }

          if (typeof imageUrl === "string" && imageUrl.length > 0) {
            content.push({
              type: "input_image",
              image_url: imageUrl,
            });
          }

          continue;
        }

        /*
          Generic text part
        */
        if (typeof part.text === "string") {
          content.push({
            type: "input_text",
            text: part.text,
          });
        }
      }

      if (content.length) {
        input.push({
          role,
          content,
        });
      }
    }
  }

  /*
    Support body.images directly.

    Example:
    {
      "message": "What is this?",
      "images": [
        "data:image/jpeg;base64,..."
      ]
    }
  */

  if (Array.isArray(body.images) && body.images.length) {
    const lastUserIndex = [...input]
      .map((x, i) => (x.role === "user" ? i : -1))
      .filter((i) => i !== -1)
      .pop();

    const imageParts = [];

    for (const image of body.images) {
      if (typeof image !== "string") continue;

      if (
        image.startsWith("data:image/") ||
        image.startsWith("https://") ||
        image.startsWith("http://")
      ) {
        imageParts.push({
          type: "input_image",
          image_url: image,
        });
      }
    }

    if (imageParts.length) {
      if (lastUserIndex !== undefined) {
        input[lastUserIndex].content.push(...imageParts);
      } else {
        input.push({
          role: "user",
          content: imageParts,
        });
      }
    }
  }

  return input;
}


/* =========================================================
   EXTRACT TEXT
========================================================= */

function extractResponseText(data) {
  if (!data) return "";

  if (typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  let result = "";

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item) continue;

      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (
            part &&
            part.type === "output_text" &&
            typeof part.text === "string"
          ) {
            result += part.text;
          }
        }
      }
    }
  }

  return result.trim();
}


/* =========================================================
   HANDLE NORMAL OPENAI REQUEST
========================================================= */

async function handleChat(request, env) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return json(
      {
        ok: false,
        error: "OPENAI_API_KEY is not configured in Cloudflare Worker secrets.",
      },
      500
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Invalid JSON request.",
      },
      400
    );
  }

  const messages = normalizeMessages(body);

  if (!messages.length) {
    return json(
      {
        ok: false,
        error: "No message provided.",
      },
      400
    );
  }

  const input = buildInput(messages, body);

  if (!input.length) {
    return json(
      {
        ok: false,
        error: "Could not build a valid input.",
      },
      400
    );
  }

  /*
    Web search
  */
  const tools = [];

  if (body.webSearch === true || body.web_search === true) {
    tools.push({
      type: "web_search",
    });
  }

  /*
    Streaming
    Frontend can send:
      { "stream": true }
  */
  const stream = body.stream === true;

  const requestBody = {
    model: OPENAI_MODEL,

    instructions:
      typeof body.systemInstruction === "string" &&
      body.systemInstruction.trim()
        ? body.systemInstruction.trim()
        : DEFAULT_SYSTEM_INSTRUCTION,

    input,

    max_output_tokens: 4096,

    store: false,
  };

  if (tools.length) {
    requestBody.tools = tools;
  }

  if (stream) {
    requestBody.stream = true;
  }

  let response;

  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },

      body: JSON.stringify(requestBody),
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

  /*
    STREAMING RESPONSE
  */

  if (stream) {
    if (!response.ok) {
      let details = null;

      try {
        details = await response.json();
      } catch {
        details = await response.text();
      }

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

    return new Response(response.body, {
      status: 200,

      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",

        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  /*
    NORMAL JSON RESPONSE
  */

  let data;

  try {
    data = await response.json();
  } catch {
    return json(
      {
        ok: false,
        error: "OpenAI returned an invalid response.",
        status: response.status,
      },
      502
    );
  }

  if (!response.ok) {
    return json(
      {
        ok: false,
        error: `OpenAI API request failed (${response.status}).`,
        status: response.status,
        details: data?.error || data,
      },
      response.status
    );
  }

  const reply = extractResponseText(data);

  if (!reply) {
    return json(
      {
        ok: false,
        error: "OpenAI returned no text.",
        details: {
          response_id: data?.id || null,
          output: data?.output || [],
        },
      },
      502
    );
  }

  return json({
    ok: true,
    service: "RAO AI",
    model: OPENAI_MODEL,
    creator: "Suraj Kumar",
    message: reply,
    response_id: data?.id || null,
  });
}


/* =========================================================
   REALTIME VOICE TOKEN
=========================================================

   Browser should call:

   POST /realtime-token

   Worker creates a short-lived Realtime client secret.

   IMPORTANT:
   Never send OPENAI_API_KEY directly to the browser.
========================================================= */

async function handleRealtimeToken(request, env) {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return json(
      {
        ok: false,
        error: "OPENAI_API_KEY is not configured.",
      },
      500
    );
  }

  let body = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const voice =
    typeof body.voice === "string" && body.voice.trim()
      ? body.voice.trim()
      : "marin";

  const instructions =
    typeof body.instructions === "string" &&
    body.instructions.trim()
      ? body.instructions.trim()
      : DEFAULT_SYSTEM_INSTRUCTION;

  const realtimeRequest = {
    session: {
      type: "realtime",
      model: REALTIME_MODEL,

      instructions,

      audio: {
        output: {
          voice,
        },
      },
    },
  };

  let response;

  try {
    response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify(realtimeRequest),
      }
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: "Could not connect to OpenAI Realtime API.",
        details: error?.message || "Network error",
      },
      502
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    return json(
      {
        ok: false,
        error: "Realtime API returned invalid JSON.",
        status: response.status,
      },
      502
    );
  }

  if (!response.ok) {
    return json(
      {
        ok: false,
        error: `Realtime API request failed (${response.status}).`,
        status: response.status,
        details: data?.error || data,
      },
      response.status
    );
  }

  /*
    Current GA endpoint returns `value`.
  */
  return json({
    ok: true,
    value: data?.value || data?.client_secret?.value || null,
    expires_at:
      data?.expires_at ||
      data?.client_secret?.expires_at ||
      null,
    session: data?.session || null,
  });
}


/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /*
      CORS preflight
    */
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    /*
      HEALTH CHECK
    */
    if (request.method === "GET") {
      return json({
        ok: true,
        service: "RAO AI",
        model: OPENAI_MODEL,
        creator: "Suraj Kumar",
        message: "RAO AI Worker is running.",
        endpoint: path,
        realtime: "/realtime-token",
      });
    }

    /*
      ONLY POST BELOW
    */
    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Method not allowed.",
        },
        405,
        {
          Allow: "GET, POST, OPTIONS",
        }
      );
    }

    /*
      REALTIME VOICE TOKEN
    */
    if (
      path === "/realtime-token" ||
      path === "/api/realtime-token"
    ) {
      return handleRealtimeToken(request, env);
    }

    /*
      CHAT
    */
    return handleChat(request, env);
  },
};
