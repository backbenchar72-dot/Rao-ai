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
  if (
    data &&
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const parts = [];

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const part of item.content) {
        if (typeof part?.text === "string") {
          parts.push(part.text);
        }
      }
    }
  }

  return parts.join("\n").trim();
}

function extractSources(data) {
  const sources = [];
  const seen = new Set();

  if (!Array.isArray(data?.output)) {
    return sources;
  }

  for (const item of data.output) {
    if (!Array.isArray(item?.content)) continue;

    for (const part of item.content) {
      if (!Array.isArray(part?.annotations)) continue;

      for (const annotation of part.annotations) {
        const url = annotation?.url;

        if (
          annotation?.type === "url_citation" &&
          typeof url === "string" &&
          url &&
          !seen.has(url)
        ) {
          seen.add(url);

          sources.push({
            url: url,
            title: annotation?.title || url
          });
        }
      }
    }
  }

  return sources.slice(0, 8);
}

async function callOpenAI(apiKey, requestBody) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  const raw = await response.text();

  let data;

  if (!raw.trim()) {
    data = {
      error: {
        message: "OpenAI returned an empty response."
      }
    };
  } else {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: {
          message: raw.slice(0, 2000)
        }
      };
    }
  }

  return {
    response,
    data
  };
}

export async function onRequestPost(context) {
  try {
    const request = context.request;
    const env = context.env || {};

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, {
        error: "Request body is not valid JSON."
      });
    }

    const messages = Array.isArray(body?.messages)
      ? body.messages
      : [];

    if (!messages.length) {
      return jsonResponse(400, {
        error: "No message supplied."
      });
    }

    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      return jsonResponse(500, {
        error: "OPENAI_API_KEY is not configured in Cloudflare."
      });
    }

    const webSearch = Boolean(body?.webSearch);

    const requestBody = {
      model: MODEL,
      input: makeInput(messages),
      reasoning: {
        effort: "low"
      },
      max_output_tokens: 4096
    };

    if (webSearch) {
      requestBody.tools = [
        {
          type: "web_search_preview",
          user_location: {
            type: "approximate",
            country: "IN"
          },
          search_context_size: "low"
        }
      ];

      requestBody.instructions =
        "Use web search when the user asks for current, latest, recent, live, or time-sensitive information. Prefer reliable sources.";
    }

    let result = await callOpenAI(apiKey, requestBody);

    if (!result.response.ok && webSearch) {
      const retryBody = {
        ...requestBody
      };

      delete retryBody.tools;
      delete retryBody.instructions;

      result = await callOpenAI(apiKey, retryBody);
    }

    if (!result.response.ok) {
      return jsonResponse(result.response.status, {
        error:
          result.data?.error?.message ||
          `OpenAI request failed with HTTP ${result.response.status}.`
      });
    }

    const reply = extractReply(result.data);

    if (!reply) {
      return jsonResponse(502, {
        error: "OpenAI returned no readable text response."
      });
    }

    return jsonResponse(200, {
      reply: reply,
      sources: extractSources(result.data)
    });

  } catch (error) {
    return jsonResponse(500, {
      error: error?.message || "Unexpected server error."
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }

  if (context.request.method === "OPTIONS") {
    return onRequestOptions();
  }

  return jsonResponse(405, {
    error: "Method not allowed."
  });
}
