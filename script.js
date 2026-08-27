"use strict";

/* =========================================================
   RAO AI - FRONTEND SCRIPT
   Cloudflare Worker + OpenAI Responses API
   Live Streaming Enabled
========================================================= */

/* =========================
   ELEMENTS
========================= */

const chat = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");

const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const removeFile = document.getElementById("removeFile");

const micBtn = document.getElementById("micBtn");
const webSearchBtn = document.getElementById("webSearchBtn");
const newChatBtn = document.getElementById("newChat");

const sendBtn = document.getElementById("send");

/* =========================
   STATE
========================= */

let messages = [];
let webSearchEnabled = false;

let selectedImage = null;
let selectedFile = null;

let isListening = false;
let isSending = false;

/* =========================================================
   TEXT TO SPEECH
========================================================= */

function speakText(text, button = null) {
  if (!("speechSynthesis" in window)) {
    alert("Aapke browser mein voice support available nahi hai.");
    return;
  }

  if (!text || !String(text).trim()) {
    return;
  }

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();

    if (button) {
      button.textContent = "🔊";
    }

    return;
  }

  const cleanText = String(text)
    .replace(/[*_`#]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);

  /*
   * Hindi/Hinglish voice
   */
  utterance.lang = "hi-IN";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voices = speechSynthesis.getVoices();

  const hindiVoice = voices.find((voice) => {
    return (
      voice.lang &&
      voice.lang.toLowerCase().startsWith("hi")
    );
  });

  if (hindiVoice) {
    utterance.voice = hindiVoice;
  }

  if (button) {
    button.textContent = "⏹️";
  }

  utterance.onend = () => {
    if (button) {
      button.textContent = "🔊";
    }
  };

  utterance.onerror = () => {
    if (button) {
      button.textContent = "🔊";
    }
  };

  speechSynthesis.cancel();

  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 50);
}

if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
  };
}

/* =========================================================
   ADD MESSAGE
========================================================= */

function addMessage(text, who = "assistant") {
  if (!chat) {
    console.error("RAO AI: #chat element not found.");
    return null;
  }

  const row = document.createElement("div");

  row.className = `msg ${who}`;

  row.innerHTML = `
    <div class="avatar">
      ${who === "user" ? "You" : "✦"}
    </div>

    <div class="message-content">
      <div class="bubble"></div>

      ${
        who === "assistant"
          ? `
            <div class="message-actions">
              <button
                type="button"
                class="speak-btn"
                aria-label="Speak this message"
                title="RAO AI ko bolne ke liye dabaye"
              >
                🔊
              </button>
            </div>
          `
          : ""
      }
    </div>
  `;

  const bubble = row.querySelector(".bubble");

  if (bubble) {
    bubble.textContent = text || "";
  }

  chat.appendChild(row);

  chat.scrollTop = chat.scrollHeight;

  if (who === "assistant") {
    const speakBtn = row.querySelector(".speak-btn");

    if (speakBtn && bubble) {
      speakBtn.addEventListener("click", () => {
        speakText(bubble.textContent, speakBtn);
      });
    }
  }

  return bubble;
}

/* =========================================================
   CLEAR WELCOME
========================================================= */

function clearWelcome() {
  if (!chat) return;

  const welcome = chat.querySelector(".welcome");

  if (welcome) {
    welcome.remove();
  }
}

/* =========================================================
   WEB SEARCH
========================================================= */

if (webSearchBtn) {
  webSearchBtn.addEventListener("click", (event) => {
    event.preventDefault();

    webSearchEnabled = !webSearchEnabled;

    webSearchBtn.classList.toggle(
      "active",
      webSearchEnabled
    );

    webSearchBtn.textContent =
      webSearchEnabled
        ? "🌐 Web Search: ON"
        : "🌐 Web Search: OFF";

    const note = document.getElementById("webSearchNote");

    if (note) {
      note.textContent = webSearchEnabled
        ? "Live web information is ON"
        : "Current web information is off";
    }
  });
}

/* =========================================================
   VOICE INPUT
========================================================= */

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (micBtn && SpeechRecognition) {
  const recognition = new SpeechRecognition();

  recognition.lang = "hi-IN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;

    micBtn.classList.add("listening");
    micBtn.textContent = "🔴";
  };

  recognition.onresult = (event) => {
    const transcript =
      event.results?.[0]?.[0]?.transcript || "";

    if (input && transcript) {
      input.value = transcript;

      input.dispatchEvent(
        new Event("input", {
          bubbles: true
        })
      );
    }
  };

  recognition.onerror = (event) => {
    console.error(
      "RAO AI Speech Recognition Error:",
      event?.error
    );

    isListening = false;

    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
  };

  recognition.onend = () => {
    isListening = false;

    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
  };

  micBtn.addEventListener("click", (event) => {
    event.preventDefault();

    try {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    } catch (error) {
      console.error(
        "Speech recognition start error:",
        error
      );
    }
  });
} else if (micBtn) {
  micBtn.addEventListener("click", (event) => {
    event.preventDefault();

    alert(
      "Voice input is not supported in this browser. Chrome browser try karein."
    );
  });
}

/* =========================================================
   FILE UPLOAD
========================================================= */

if (uploadBtn && fileUpload) {
  uploadBtn.addEventListener("click", (event) => {
    event.preventDefault();

    fileUpload.click();
  });

  fileUpload.addEventListener(
    "change",
    async () => {
      const file = fileUpload.files?.[0];

      if (!file) return;

      if (file.size > 15 * 1024 * 1024) {
        alert("File 15 MB se chhoti rakho.");

        resetAttachment();

        return;
      }

      selectedImage = null;

      selectedFile = {
        name: file.name,
        size: file.size,
        type: file.type,
        text: ""
      };

      try {
        const ext =
          file.name
            .toLowerCase()
            .split(".")
            .pop() || "";

        const readable = [
          "txt",
          "md",
          "csv",
          "json",
          "html",
          "htm",
          "js",
          "css",
          "py",
          "xml",
          "log"
        ];

        if (file.type.startsWith("image/")) {
          selectedImage =
            await fileToDataURL(file);
        } else if (readable.includes(ext)) {
          const text = await file.text();

          selectedFile.text =
            text.slice(0, 120000);
        } else if (
          file.type === "application/pdf" ||
          ext === "pdf"
        ) {
          selectedFile.text =
            "PDF file attached: " +
            file.name;
        }

        showAttachmentPreview(file);

      } catch (error) {
        console.error(
          "RAO AI File Read Error:",
          error
        );

        alert("File read nahi ho paayi.");

        resetAttachment();
      }
    }
  );
}

/* =========================================================
   FILE TO DATA URL
========================================================= */

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

/* =========================================================
   ATTACHMENT PREVIEW
========================================================= */

function showAttachmentPreview(file) {
  const previewWrap =
    document.getElementById("previewWrap");

  const preview =
    document.getElementById("preview");

  const info =
    document.getElementById("filePreviewInfo");

  if (!previewWrap || !info) {
    return;
  }

  previewWrap.classList.remove("hidden");

  info.innerHTML = `
    <strong>${escapeHtml(file.name)}</strong>
    <span>${formatFileSize(file.size)}</span>
  `;

  if (
    preview &&
    file.type.startsWith("image/") &&
    selectedImage
  ) {
    preview.src = selectedImage;

    preview.style.display = "block";
  } else if (preview) {
    preview.removeAttribute("src");

    preview.style.display = "none";
  }
}

/* =========================================================
   FILE SIZE
========================================================= */

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================================================
   RESET ATTACHMENT
========================================================= */

function resetAttachment() {
  selectedImage = null;
  selectedFile = null;

  if (fileUpload) {
    fileUpload.value = "";
  }

  const previewWrap =
    document.getElementById("previewWrap");

  const preview =
    document.getElementById("preview");

  const info =
    document.getElementById("filePreviewInfo");

  if (previewWrap) {
    previewWrap.classList.add("hidden");
  }

  if (preview) {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }

  if (info) {
    info.textContent = "";
  }
}

if (removeFile) {
  removeFile.addEventListener(
    "click",
    (event) => {
      event.preventDefault();

      resetAttachment();
    }
  );
}

/* =========================================================
   CREATE REQUEST MESSAGE
========================================================= */

function createCurrentUserMessage(displayText) {
  const currentMessage = {
    role: "user",
    content: displayText
  };

  /*
   * Image is sent separately in body.images.
   * Worker already supports body.images.
   */

  return currentMessage;
}

/* =========================================================
   BUILD REQUEST BODY
========================================================= */

function buildRequestBody() {
  const body = {
    messages: messages,
    webSearch: webSearchEnabled,
    stream: true
  };

  /*
   * Send image separately because Worker supports:
   *
   * body.images = [...]
   */

  if (selectedImage) {
    body.images = [selectedImage];
  }

  /*
   * Send file information.
   *
   * Worker currently understands message content,
   * so text files are included in the user message.
   */

  return body;
}

/* =========================================================
   STREAM RESPONSE
========================================================= */

async function readStreamingResponse(response, loadingBubble) {
  if (!response.body) {
    throw new Error(
      "Browser streaming response support nahi karta."
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder("utf-8");

  let fullText = "";
  let buffer = "";

  while (true) {
    const { value, done } =
      await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(
      value,
      {
        stream: true
      }
    );

    /*
     * Responses API streaming normally sends
     * Server-Sent Events.
     */

    const lines =
      buffer.split(/\r?\n/);

    buffer =
      lines.pop() || "";

    for (const line of lines) {
      const trimmed =
        line.trim();

      if (!trimmed) {
        continue;
      }

      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const dataText =
        trimmed.slice(5).trim();

      if (!dataText) {
        continue;
      }

      if (dataText === "[DONE]") {
        continue;
      }

      let eventData;

      try {
        eventData =
          JSON.parse(dataText);
      } catch {
        /*
         * Ignore incomplete/non-JSON SSE lines.
         */
        continue;
      }

      /*
       * OpenAI Responses API text delta
       */

      if (
        eventData.type ===
        "response.output_text.delta"
      ) {
        const delta =
          typeof eventData.delta === "string"
            ? eventData.delta
            : "";

        if (delta) {
          fullText += delta;

          if (loadingBubble) {
            loadingBubble.textContent =
              fullText;

            chat.scrollTop =
              chat.scrollHeight;
          }
        }
      }

      /*
       * Some proxy formats may send:
       * delta / text / output_text
       */

      else if (
        typeof eventData.delta === "string"
      ) {
        fullText +=
          eventData.delta;

        if (loadingBubble) {
          loadingBubble.textContent =
            fullText;

          chat.scrollTop =
            chat.scrollHeight;
        }
      }

      else if (
        typeof eventData.text === "string"
      ) {
        fullText +=
          eventData.text;

        if (loadingBubble) {
          loadingBubble.textContent =
            fullText;

          chat.scrollTop =
            chat.scrollHeight;
        }
      }
    }
  }

  /*
   * Flush decoder
   */

  buffer += decoder.decode();

  /*
   * If Worker returned no streamed delta,
   * try JSON fallback from accumulated data.
   */

  if (!fullText.trim()) {
    throw new Error(
      "RAO AI ne koi text response nahi diya."
    );
  }

  return fullText.trim();
}

/* =========================================================
   NORMAL JSON RESPONSE
========================================================= */

async function readNormalResponse(response) {
  const rawText =
    await response.text();

  if (!rawText.trim()) {
    throw new Error(
      "Worker ne empty response bheja."
    );
  }

  let data;

  try {
    data =
      JSON.parse(rawText);
  } catch (error) {
    console.error(
      "Invalid JSON from Worker:",
      rawText
    );

    throw new Error(
      "Worker ne invalid response bheja."
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Server error (${response.status})`
    );
  }

  const reply =
    data?.message ||
    data?.reply ||
    data?.output_text ||
    "";

  if (
    typeof reply !== "string" ||
    !reply.trim()
  ) {
    throw new Error(
      "RAO AI ne koi text response nahi diya."
    );
  }

  return reply.trim();
}

/* =========================================================
   SEND MESSAGE
========================================================= */

async function sendMessage() {
  if (isSending) {
    return;
  }

  const text =
    input?.value?.trim() || "";

  if (
    !text &&
    !selectedImage &&
    !selectedFile
  ) {
    return;
  }

  isSending = true;

  clearWelcome();

  let displayText = text;

  if (!displayText) {
    if (selectedImage) {
      displayText =
        "Please analyze this image.";
    } else {
      displayText =
        "Please read this file.";
    }
  }

  /*
   * If a readable file is attached,
   * include its text in the message.
   */

  if (
    selectedFile &&
    selectedFile.text &&
    !selectedFile.text.startsWith(
      "PDF file attached:"
    )
  ) {
    displayText =
      `${displayText}\n\nAttached file: ${selectedFile.name}\n\n${selectedFile.text}`;
  }

  addMessage(
    displayText,
    "user"
  );

  if (input) {
    input.value = "";
    input.style.height = "auto";
  }

  const loading =
    addMessage(
      "▌",
      "assistant"
    );

  setUIBusy(true);

  let userMessageAdded = false;

  try {
    const currentMessage =
      createCurrentUserMessage(
        displayText
      );

    messages.push(
      currentMessage
    );

    userMessageAdded = true;

    const requestBody =
      buildRequestBody();

    /*
     * IMPORTANT:
     *
     * This uses the same-origin Cloudflare Worker:
     *
     * POST /chat
     *
     * No OpenAI API key is exposed.
     */

    const response =
      await fetch(
        "/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "text/event-stream, application/json"
          },

          body:
            JSON.stringify(
              requestBody
            )
        }
      );

    /*
     * Server error
     */

    if (!response.ok) {
      let errorText = "";

      try {
        errorText =
          await response.text();
      } catch {
        errorText = "";
      }

      let errorData = null;

      if (errorText.trim()) {
        try {
          errorData =
            JSON.parse(
              errorText
            );
        } catch {
          errorData = null;
        }
      }

      throw new Error(
        errorData?.error ||
        errorData?.details ||
        `Server error (${response.status})`
      );
    }

    /*
     * Worker stream response
     */

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    let reply = "";

    if (
      contentType.includes(
        "text/event-stream"
      )
    ) {
      reply =
        await readStreamingResponse(
          response,
          loading
        );
    } else {
      /*
       * JSON fallback
       */
      reply =
        await readNormalResponse(
          response
        );

      if (loading) {
        loading.textContent =
          reply;
      }
    }

    if (!reply.trim()) {
      throw new Error(
        "RAO AI ne koi text response nahi diya."
      );
    }

    /*
     * Save assistant response
     */

    messages.push({
      role: "assistant",
      content: reply
    });

    if (loading) {
      loading.textContent =
        reply;
    }

  } catch (error) {
    console.error(
      "RAO AI ERROR:",
      error
    );

    /*
     * Remove failed user message
     */

    if (
      userMessageAdded &&
      messages.length &&
      messages[
        messages.length - 1
      ]?.role === "user"
    ) {
      messages.pop();
    }

    if (loading) {
      loading.textContent =
        "❌ Error: " +
        (
          error?.message ||
          "RAO AI se response nahi mila."
        );
    }

  } finally {
    resetAttachment();

    setUIBusy(false);

    isSending = false;

    if (input) {
      input.focus();
    }
  }
}

/* =========================================================
   UI BUSY STATE
========================================================= */

function setUIBusy(busy) {
  if (input) {
    input.disabled = busy;
  }

  if (micBtn) {
    micBtn.disabled = busy;
  }

  if (uploadBtn) {
    uploadBtn.disabled = busy;
  }

  if (sendBtn) {
    sendBtn.disabled = busy;
  }

  if (webSearchBtn) {
    webSearchBtn.disabled = busy;
  }
}

/* =========================================================
   FORM SUBMIT
   IMPORTANT: PREVENT PAGE REFRESH
========================================================= */

if (form) {
  form.addEventListener(
    "submit",
    (event) => {
      /*
       * THIS STOPS PAGE REFRESH
       */
      event.preventDefault();
      event.stopPropagation();

      sendMessage();
    }
  );
} else {
  console.error(
    "RAO AI ERROR: #composer form nahi mila."
  );
}

/* =========================================================
   SEND BUTTON SAFETY
========================================================= */

if (sendBtn) {
  /*
   * Important:
   * Even if HTML button has wrong type,
   * prevent default and send manually.
   */

  sendBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isSending) {
        sendMessage();
      }
    }
  );
}

/* =========================================================
   ENTER TO SEND
========================================================= */

if (input) {
  input.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        event.stopPropagation();

        if (
          !input.disabled &&
          !isSending
        ) {
          sendMessage();
        }
      }
    }
  );

  input.addEventListener(
    "input",
    () => {
      input.style.height = "auto";

      input.style.height =
        Math.min(
          input.scrollHeight,
          140
        ) + "px";
    }
  );
}

/* =========================================================
   NEW CHAT
========================================================= */

if (newChatBtn) {
  newChatBtn.addEventListener(
    "click",
    (event) => {
      event.preventDefault();

      if (
        "speechSynthesis" in window
      ) {
        speechSynthesis.cancel();
      }

      messages = [];

      selectedImage = null;
      selectedFile = null;

      webSearchEnabled = false;

      isSending = false;

      if (fileUpload) {
        fileUpload.value = "";
      }

      if (webSearchBtn) {
        webSearchBtn.classList.remove(
          "active"
        );

        webSearchBtn.textContent =
          "🌐 Web Search: OFF";

        webSearchBtn.disabled = false;
      }

      const note =
        document.getElementById(
          "webSearchNote"
        );

      if (note) {
        note.textContent =
          "Current web information is off";
      }

      resetAttachment();

      if (chat) {
        chat.innerHTML = `
          <div class="welcome">
            <div class="logo">✦</div>

            <h1>Welcome to RAO AI</h1>

            <p>
              Ask anything, upload an image/PDF/file,
              speak, or turn on Web Search for
              current information.
            </p>
          </div>
        `;
      }

      if (input) {
        input.value = "";
        input.style.height = "auto";
        input.disabled = false;
        input.focus();
      }
    }
  );
}

/* =========================================================
   PAGE READY
========================================================= */

window.addEventListener(
  "load",
  () => {
    console.log(
      "RAO AI frontend loaded successfully."
    );

    if (input) {
      input.focus();
    }
  }
);

/* =========================================================
   GLOBAL ERROR LOGGING
========================================================= */

window.addEventListener(
  "error",
  (event) => {
    console.error(
      "RAO AI JavaScript Error:",
      event.error || event.message
    );
  }
);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    console.error(
      "RAO AI Promise Error:",
      event.reason
    );
  }
);
