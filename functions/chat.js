export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  const json = (statusCode, payload) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const webSearch = Boolean(body.webSearch);

    if (!messages.length) {
      return json(400, { error: "No message supplied" });
    }

    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
      return json(500, {
        error: "OPENAI_API_KEY is not configured in Cloudflare"
      });
    }

    const input = messages.map((m) => {
      if (m.image || m.file) {
        const content = [
          {
            type: "input_text",
            text: m.content || "Please analyze the attachment."
          }
        ];

        if (m.image) {
          content.push({
            type: "input_image",
            image_url: m.image
          });
        }

        if (m.file?.text) {
          content.push({
            type: "input_text",
            text: `FILE CONTENT (${m.file.name || "uploaded file"}):\n\n${m.file.text}`
          });
        }

        return {
          role: "user",
          content
        };
      }

      return {
        role: m.role,
        content: m.content
      };
    });

    const requestBody = {
      model: "gpt-5.4-mini",
      input,
      reasoning: { effort: "low" },
      max_output_tokens: 4096,
      text: { format: { type: "text" } }
    };

    if (webSearch) {
      requestBody.tools = [
        {
          type: "web_search",
          user_location: {
            type: "approximate",
            country: "IN"
          },
          search_context_size: "low"
        }
      ];

      requestBody.instructions =
        "Use web search for current or time-sensitive information. Prefer reliable primary sources. When web search is used, answer with concise citations/sources.";
    }

    let response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    let data = await response.json();

    if (
      !response.ok &&
      webSearch &&
      /web_search/i.test(data?.error?.message || "")
    ) {
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

      response = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        }
      );

      data = await response.json();
    }

    if (!response.ok) {
      return json(response.status, {
        error: data?.error?.message || "OpenAI request failed"
      });
    }

    const reply =
      data.output_text ||
      data.output
        ?.filter((item) => item.type === "message")
        ?.flatMap((item) => item.content || [])
        ?.filter((item) => item.type === "output_text")
        ?.map((item) => item.text)
        ?.join("\n")
        ?.trim() ||
      "No response received.";

    const sources = [];
    const seen = new Set();

    for (const item of data.output || []) {
      for (const part of item.content || []) {
        for (const ann of part.annotations || []) {
          if (
            ann.type === "url_citation" &&
            ann.url &&
            !seen.has(ann.url)
          ) {
            seen.add(ann.url);
            sources.push({
              url: ann.url,
              title: ann.title || ann.url
            });
          }
        }
      }
    }

    return json(200, {
      reply,
      sources
    });
  } catch (error) {
    return json(500, {
      error: error?.message || "Server error"
    });
  }
}

export async function onRequest(context) {
  if (context.request.method === "POST") {
    return onRequestPost(context);
  }

  return new Response("Method not allowed", {
    status: 405
  });
}
