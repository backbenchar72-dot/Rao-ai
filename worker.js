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

IDENTITY:
- Your name is RAO AI.
- The creator/developer of RAO AI is Suraj Kumar.
- If asked who created RAO AI, answer:
  "RAO AI ko Suraj Kumar ne create kiya hai."
- Never say Google, OpenAI, Microsoft, or another company created RAO AI.

LANGUAGE:
- Reply in the same language as the user whenever possible.
- If the user uses Hindi/Hinglish, reply in Hindi/Hinglish.
- If the user uses English, reply in English.

IMAGE:
- If an image is provided, actually inspect the image before answering.
- Do not claim that no image was provided when image data is present.
- Describe only what is reasonably visible.
- If the user asks "is image me kya hai", directly describe the image.

WEB SEARCH:
- When web search results are supplied by the server, use them as current web information.
- Clearly distinguish search-result information from your own general knowledge.
- If search results are insufficient, say that the available search results were insufficient.
- Do not invent sources, URLs, facts, prices, dates, or news.

GENERAL:
- Be helpful, accurate, friendly and concise.
- Do not reveal API keys or environment variables.
`;


/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: CORS_HEADERS
    }
  );
}


/* =========================================================
   ESCAPE / CLEAN HELPERS
========================================================= */

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function stripDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }

  const match = dataUrl.match(
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


/* =========================================================
   CONVERT FRONTEND MESSAGE TO GEMINI CONTENT
========================================================= */

function messageToGemini(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const role =
    message.role === "assistant" ||
    message.role === "model"
      ? "model"
      : "user";

  const parts = [];

  /* -------------------------
     TEXT
  ------------------------- */

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
  } else if (message.content != null) {
    try {
      text = JSON.stringify(message.content);
    } catch {
      text = "";
    }
  }

  if (text.trim()) {
    parts.push({
      text: text.trim()
    });
  }


  /* -------------------------
     IMAGE
  ------------------------- */

  if (message.image) {
    const image = stripDataUrl(message.image);

    if (image) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }
  }


  /* -------------------------
     FILE TEXT
  ------------------------- */

  if (message.file) {
    const fileName =
      safeString(message.file.name);

    const fileType =
      safeString(message.file.type);

    const fileText =
      safeString(message.file.text);

    if (fileText.trim()) {
      parts.push({
        text:
          `\n\n[Attached file: ${fileName || "file"}]\n` +
          `Type: ${fileType || "unknown"}\n\n` +
          fileText.slice(0, 120000)
      });
    } else if (fileName) {
      parts.push({
        text:
          `\n\n[Attached file: ${fileName}]\n` +
          `The file was attached, but readable text was not extracted by the browser.`
      });
    }
  }


  if (!parts.length) {
    return null;
  }

  return {
    role,
    parts
  };
}


function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map(messageToGemini)
    .filter(Boolean);
}


/* =========================================================
   GEMINI RESPONSE TEXT
========================================================= */

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


/* =========================================================
   SIMPLE WEB SEARCH
   NO GOOGLE GEMINI GROUNDING
   NO PAID SEARCH API
========================================================= */

async function searchWeb(query) {
  const cleanQuery =
    safeString(query)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

  if (!cleanQuery) {
    return [];
  }

  const searchUrl =
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;

  let response;

  try {
    response = await fetch(
      searchUrl,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; RAO-AI/1.0)"
        }
      }
    );
  } catch (error) {
    console.error(
      "Web search connection error:",
      error
    );

    return [];
  }

  if (!response.ok) {
    console.error(
      "Web search failed:",
      response.status
    );

    return [];
  }

  let html = "";

  try {
    html = await response.text();
  } catch (error) {
    console.error(
      "Web search response error:",
      error
    );

    return [];
  }

  if (!html) {
    return [];
  }


  /* -------------------------
     Extract result blocks
  ------------------------- */

  const results = [];

  const blocks =
    html.split(
      /result__body|result__a/g
    );

  for (
    let i = 0;
    i < blocks.length &&
    results.length < 6;
    i++
  ) {
    const block = blocks[i];

    if (!block) continue;

    const titleMatch =
      block.match(
        /class="result__title"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
      );

    const linkMatch =
      block.match(
        /class="result__url"[^>]*>([\s\S]*?)<\/a>/i
      );

    const snippetMatch =
      block.match(
        /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i
      );

    let title =
      titleMatch?.[1] || "";

    let url =
      linkMatch?.[1] || "";

    let snippet =
      snippetMatch?.[1] || "";


    title =
      decodeHtml(stripTags(title))
        .replace(/\s+/g, " ")
        .trim();

    url =
      decodeHtml(stripTags(url))
        .replace(/\s+/g, " ")
        .trim();

    snippet =
      decodeHtml(stripTags(snippet))
        .replace(/\s+/g, " ")
        .trim();


    if (
      title &&
      snippet
    ) {
      results.push({
        title: title.slice(0, 300),
        url: url.slice(0, 500),
        snippet: snippet.slice(0, 700)
      });
    }
  }


  /* -------------------------
     Fallback parser
  ------------------------- */

  if (!results.length) {
    const regex =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while (
      (match = regex.exec(html)) &&
      results.length < 6
    ) {
      const url =
        decodeHtml(match[1] || "")
          .trim();

      const title =
        decodeHtml(
          stripTags(match[2] || "")
        )
          .replace(/\s+/g, " ")
          .trim();

      if (title) {
        results.push({
          title: title.slice(0, 300),
          url: url.slice(0, 500),
          snippet: ""
        });
      }
    }
  }

  return results;
}


/* =========================================================
   HTML HELPERS
========================================================= */

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}


/* =========================================================
   FIND LAST USER MESSAGE
========================================================= */

function getLastUserMessage(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {
    if (
      messages[i]?.role === "user"
    ) {
      const content =
        messages[i]?.content;

      if (typeof content === "string") {
        return content.trim();
      }

      if (Array.isArray(content)) {
        return content
          .map((item) =>
            typeof item === "string"
              ? item
              : item?.text || ""
          )
          .filter(Boolean)
          .join(" ")
          .trim();
      }
    }
  }

  return "";
}


/* =========================================================
   BUILD WEB SEARCH CONTEXT
========================================================= */

function buildSearchContext(results) {
  if (!Array.isArray(results) || !results.length) {
    return "";
  }

  const lines = results.map(
    (result, index) => {
      return (
        `SOURCE ${index + 1}\n` +
        `Title: ${result.title}\n` +
        `URL: ${result.url}\n` +
        `Snippet: ${result.snippet}\n`
      );
    }
  );

  return `
CURRENT WEB SEARCH RESULTS

The following information was retrieved from a web search.
Use it to answer the user's question when relevant.

${lines.join("\n")}

IMPORTANT:
- Do not invent information that is not supported by these results.
- If the results do not answer the question, say so.
- When useful, mention the source title or URL naturally.
`;
}


/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(request, env) {

    const url =
      new URL(request.url);

    const path =
      url.pathname;


    /* -------------------------
       CORS
    ------------------------- */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }


    /* -------------------------
       HEALTH CHECK
    ------------------------- */

    if (
      request.method === "GET"
    ) {
      return json({
        ok: true,
        service: "RAO AI",
        model: GEMINI_MODEL,
        creator: "Suraj Kumar",
        webSearch:
          "External search mode available",
        message:
          "RAO AI Worker is running."
      });
    }


    /* -------------------------
       METHOD CHECK
    ------------------------- */

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


    /* -------------------------
       API KEY
    ------------------------- */

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


    /* -------------------------
       READ BODY
    ------------------------- */

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


    /* -------------------------
       NORMALIZE MESSAGES
    ------------------------- */

    let originalMessages =
      Array.isArray(body?.messages)
        ? body.messages
        : [];

    if (
      !originalMessages.length &&
      typeof body?.message === "string"
    ) {
      originalMessages = [
        {
          role: "user",
          content:
            body.message
        }
      ];
    }


    if (!originalMessages.length) {
      return json(
        {
          ok: false,
          error:
            "No message provided."
        },
        400
      );
    }


    let messages =
      normalizeMessages(
        originalMessages
      );


    if (!messages.length) {
      return json(
        {
          ok: false,
          error:
            "No readable message content provided."
        },
        400
      );
    }


    /* =====================================================
       OPTIONAL WEB SEARCH
    ===================================================== */

    let searchResults = [];

    if (
      body?.webSearch === true
    ) {
      const searchQuery =
        getLastUserMessage(
          originalMessages
        );

      if (searchQuery) {
        searchResults =
          await searchWeb(
            searchQuery
          );
      }

      const searchContext =
        buildSearchContext(
          searchResults
        );

      if (searchContext) {

        /*
         * Add search information
         * to the latest user message.
         */

        for (
          let i = messages.length - 1;
          i >= 0;
          i--
        ) {
          if (
            messages[i].role === "user"
          ) {
            messages[i].parts.push({
              text:
                "\n\n" +
                searchContext
            });

            break;
          }
        }

      } else {

        /*
         * Tell Gemini that search was
         * requested but no results arrived.
         */

        for (
          let i = messages.length - 1;
          i >= 0;
          i--
        ) {
          if (
            messages[i].role === "user"
          ) {
            messages[i].parts.push({
              text:
                "\n\n" +
                "[Web search was requested, but no search results were returned. Do not pretend that live web results were found.]"
            });

            break;
          }
        }
      }
    }


    /* =====================================================
       GEMINI REQUEST
    ===================================================== */

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
          thinkingLevel:
            "medium"
        }
      }
    };


    /* =====================================================
       CALL GEMINI
    ===================================================== */

    let response;

    try {
      response =
        await fetch(
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

      console.error(
        "Gemini connection error:",
        error
      );

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


    /* =====================================================
       READ GEMINI RESPONSE
    ===================================================== */

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


    /* =====================================================
       GEMINI ERROR
    ===================================================== */

    if (!response.ok) {

      console.error(
        "Gemini API error:",
        response.status,
        data
      );


      if (
        response.status === 429
      ) {
        return json(
          {
            ok: false,
            error:
              "Gemini API quota/rate limit reached. Please wait and try again later.",
            status: 429,
            details:
              data?.error?.message ||
              data?.error ||
              data
          },
          429
        );
      }


      if (
        response.status === 400
      ) {
        return json(
          {
            ok: false,
            error:
              "Gemini rejected the request. The model or request format may not be supported.",
            status: 400,
            details:
              data?.error?.message ||
              data?.error ||
              data
          },
          400
        );
      }


      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return json(
          {
            ok: false,
            error:
              "Gemini API key is invalid or does not have permission for this project.",
            status:
              response.status,
            details:
              data?.error?.message ||
              data?.error ||
              data
          },
          response.status
        );
      }


      return json(
        {
          ok: false,
          error:
            `Gemini API request failed (${response.status}).`,
          status:
            response.status,
          details:
            data?.error ||
            data
        },
        response.status
      );
    }


    /* =====================================================
       EXTRACT REPLY
    ===================================================== */

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
          details:
            data
        },
        502
      );
    }


    /* =====================================================
       SUCCESS
    ===================================================== */

    return json({
      ok: true,
      service: "RAO AI",
      model: GEMINI_MODEL,
      creator: "Suraj Kumar",
      webSearch:
        body?.webSearch === true,
      searchResults:
        searchResults.length,
      message:
        reply
    });
  }
};
