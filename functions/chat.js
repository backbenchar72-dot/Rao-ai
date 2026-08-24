const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.4-mini";

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function makeInput(messages) {
  return messages.map((message) => {
    const content = [];

    if (message?.image) {
      content.push({
        type: "input_image",
        image_url: String(message.image)
      });
    }

    if (message?.file?.text) {
      content.push({
        type: "input_text",
        text:
          `FILE CONTENT (${message.filename || "uploaded file"}):\n\n` +
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
  if (!data) return "";

  if (
    typeof data.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }

  const parts = [];

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;

      for (const part of item.content) {
        if (
          typeof part?.text === "string" &&
          part.text.trim()
        ) {
          parts.push(part.text);
        }
      }
    }
  }

  return parts.join("\n").trim();
}

function sseResponse(stream) {
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

function createSSEStream(openaiResponse) {
  const reader = openaiResponse.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) break;

          buffer += decoder.decode(value, {
            stream: true
          });

          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const event of events) {
            const lines = event.split("\n");

            let eventName = "";
            let dataText = "";

            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              }

              if (line.startsWith("data:")) {
                dataText += line.slice(5).trim();
              }
            }

            if (!dataText) continue;

            if (dataText === "[DONE]") {
              controller.enqueue(
                encoder.encode("data: [DONE]\n\n")
              );
              continue;
            }

            let data;

            try {
              data = JSON.parse(dataText);
            } catch {
              continue;
            }

            // Live text token
            if (eventName === "response.output_text.delta") {
              const delta =
                typeof data.delta === "string"
                  ? data.delta
                  : "";

              if (delta) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "delta",
                      text: delta
                    })}\n\n`
                  )
                );
              }
            }

            // Completed response
            if (eventName === "response.completed") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "done"
                  })}\n\n`
                )
              );
            }

            // OpenAI error event
            if (eventName === "error") {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "error",
                    error:
                      data?.error?.message ||
                      "OpenAI streaming error."
                  })}\n\n`
                )
              );
            }
          }
        }

        controller.enqueue(
          encoder.encode("data: [DONE]\n\n")
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error:
                error?.message ||
                "Streaming connection failed."
            })}\n\n`
          )
        );

        controller.close();
      }
    },

    cancel() {
      reader.cancel().catch(() => {});
    }
  });
}

export default {
  async fetch(request, env) {
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization",
          "Access-Control-Allow-Methods":
            "GET, POST, OPTIONS"
        }
      });
    }

    // Health check
    if (request.method === "GET") {
      return jsonResponse(200, {
        ok: true,
        service: "RAO AI",
        message: "RAO AI Worker is running."
      });
    }

    // Only POST for chat
    if (request.method !== "POST") {
      return jsonResponse(405, {
        error: "Method not allowed."
      });
    }

    try {
      // API KEY CHECK
      if (!env.OPENAI_API_KEY) {
        return jsonResponse(500, {
          error: "OPENAI_API_KEY is not configured."
        });
      }

      // READ REQUEST
      let body;

      try {
        body = await request.json();
      } catch {
        return jsonResponse(400, {
          error: "Invalid JSON request."
        });
      }

      const messages = Array.isArray(body?.messages)
        ? body.messages
        : [];

      if (!messages.length) {
        return jsonResponse(400, {
          error: "No messages were provided."
        });
      }

      /*
       * STREAMING
       *
       * Existing frontend:
       *   stream = false / omitted
       *   => normal JSON reply
       *
       * Live-chat frontend:
       *   stream = true
       *   => token-by-token SSE response
       */
      const stream = body?.stream === true;

      // CALL OPENAI
      const response = await fetch(OPENAI_URL, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization":
            `Bearer ${env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: MODEL,
          input: makeInput(messages),
          store: false,
          stream
        })
      });

      // STREAMING RESPONSE
      if (stream) {
        if (!response.ok) {
          const rawError = await response.text();

          let errorData = {};

          try {
            errorData = rawError
              ? JSON.parse(rawError)
              : {};
          } catch {
            // Keep empty error object
          }

          return jsonResponse(response.status, {
            error:
              errorData?.error?.message ||
              "OpenAI API request failed."
          });
        }

        if (!response.body) {
          return jsonResponse(502, {
            error:
              "OpenAI returned an empty streaming response."
          });
        }

        return sseResponse(
          createSSEStream(response)
        );
      }

      // NORMAL NON-STREAMING RESPONSE
      const rawText = await response.text();

      let data;

      try {
        data = rawText
          ? JSON.parse(rawText)
          : {};
      } catch {
        return jsonResponse(502, {
          error:
            "OpenAI returned an invalid response.",
          details: rawText.slice(0, 500)
        });
      }

      // OPENAI ERROR
      if (!response.ok) {
        return jsonResponse(response.status, {
          error:
            data?.error?.message ||
            "OpenAI API request failed."
        });
      }

      // EXTRACT ANSWER
      const reply = extractReply(data);

      if (!reply) {
        return jsonResponse(502, {
          error:
            "OpenAI returned no text response."
        });
      }

      // SUCCESS
      return jsonResponse(200, {
        reply,
        output_text: reply
      });

    } catch (error) {
      return jsonResponse(500, {
        error:
          error?.message ||
          "Internal server error."
      });
    }
  }
};
