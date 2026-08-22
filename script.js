const chat = document.getElementById("chat");
const form = document.getElementById("composer");
const input = document.getElementById("input");

const uploadBtn = document.getElementById("uploadBtn");
const fileUpload = document.getElementById("fileUpload");
const removeFile = document.getElementById("removeFile");

const micBtn = document.getElementById("micBtn");
const webSearchBtn = document.getElementById("webSearchBtn");
const newChatBtn = document.getElementById("newChat");

let messages = [];
let webSearchEnabled = false;
let selectedImage = null;
let selectedFile = null;
let isListening = false;

/* =========================
   CHAT MESSAGE
========================= */

function addMessage(text, who = "assistant") {
  const row = document.createElement("div");
  row.className = `msg ${who}`;

  row.innerHTML = `
    <div class="avatar">${who === "user" ? "You" : "✦"}</div>
    <div class="bubble"></div>
  `;

  row.querySelector(".bubble").textContent = text;
  chat.appendChild(row);

  chat.scrollTop = chat.scrollHeight;

  return row.querySelector(".bubble");
}

/* =========================
   CLEAR WELCOME
========================= */

function clearWelcome() {
  const welcome = chat.querySelector(".welcome");
  if (welcome) welcome.remove();
}

/* =========================
   WEB SEARCH BUTTON
========================= */

if (webSearchBtn) {
  webSearchBtn.addEventListener("click", () => {
    webSearchEnabled = !webSearchEnabled;

    webSearchBtn.classList.toggle("active", webSearchEnabled);

    webSearchBtn.textContent = webSearchEnabled
      ? "🌐 Web Search: ON"
      : "🌐 Web Search: OFF";
  });
}

/* =========================
   VOICE INPUT
========================= */

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
      event.results[0][0].transcript;

    if (input) {
      input.value = transcript;
      input.dispatchEvent(new Event("input"));
    }
  };

  recognition.onerror = () => {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
    micBtn.textContent = "🎤";
  };

  micBtn.addEventListener("click", () => {
    try {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    } catch (e) {
      console.log(e);
    }
  });
}

/* =========================
   FILE UPLOAD
========================= */

if (uploadBtn && fileUpload) {
  uploadBtn.addEventListener("click", () => {
    fileUpload.click();
  });

  fileUpload.addEventListener("change", async () => {
    const file = fileUpload.files?.[0];

    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert("File 15 MB se chhoti rakho.");
      resetAttachment();
      return;
    }

    selectedFile = {
      name: file.name,
      size: file.size,
      type: file.type,
      text: ""
    };

    try {
      const ext = file.name
        .toLowerCase()
        .split(".")
        .pop();

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

      if (readable.includes(ext)) {
        const text = await file.text();

        selectedFile.text = text.slice(0, 120000);
      } else if (file.type.startsWith("image/")) {
        selectedImage = await fileToDataURL(file);
      }

      addMessage(
        `📎 ${file.name} attached`,
        "assistant"
      );

    } catch (error) {
      console.error(error);

      alert(
        "File read nahi ho paayi. TXT, PDF, image ya supported file try karo."
      );

      resetAttachment();
    }
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
}

function resetAttachment() {
  selectedImage = null;
  selectedFile = null;

  if (fileUpload) {
    fileUpload.value = "";
  }
}

if (removeFile) {
  removeFile.addEventListener(
    "click",
    resetAttachment
  );
}

/* =========================
   SEND MESSAGE
========================= */

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = input?.value?.trim() || "";

    if (!text && !selectedImage && !selectedFile) {
      return;
    }

    clearWelcome();

    const displayText =
      text ||
      (selectedImage
        ? "Please analyze this image."
        : "Please read this file.");

    addMessage(displayText, "user");

    input.value = "";

    const loading = addMessage(
      webSearchEnabled
        ? "Searching the web and thinking..."
        : "Thinking...",
      "assistant"
    );

    if (input) input.disabled = true;
    if (micBtn) micBtn.disabled = true;
    if (uploadBtn) uploadBtn.disabled = true;

    try {
      const currentMessage = {
        role: "user",
        content: displayText
      };

      if (selectedImage) {
        currentMessage.image = selectedImage;
      }

      if (selectedFile) {
        currentMessage.file = selectedFile;
      }

      messages.push(currentMessage);

      /*
       * IMPORTANT:
       * Cloudflare Worker endpoint
       */
      const response = await fetch("/chat", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          messages: messages
        })
      });

      /*
       * IMPORTANT FIX:
       * response.json() directly use nahi kar rahe.
       * Pehle text read karenge.
       */
      const rawText = await response.text();

      let data = null;

      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText);
        } catch (jsonError) {
          console.error(
            "Invalid JSON from Worker:",
            rawText
          );

          throw new Error(
            "Server ne invalid response bheja."
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
          `Server error (${response.status})`
        );
      }

      const reply =
        data?.reply ||
        data?.output_text ||
        data?.message ||
        "";

      if (!reply.trim()) {
        throw new Error(
          "RAO AI se empty response mila."
        );
      }

      loading.textContent = reply;

      messages.push({
        role: "assistant",
        content: reply
      });

    } catch (error) {
      console.error("RAO AI ERROR:", error);

      loading.textContent =
        "Error: " +
        (error?.message ||
          "RAO AI se response nahi mila.");
    }

    resetAttachment();

    if (input) input.disabled = false;
    if (micBtn) micBtn.disabled = false;
    if (uploadBtn) uploadBtn.disabled = false;

    input?.focus();
  });
}

/* =========================
   ENTER TO SEND
========================= */

if (input) {
  input.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      form?.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";

    input.style.height =
      Math.min(input.scrollHeight, 140) + "px";
  });
}

/* =========================
   NEW CHAT
========================= */

if (newChatBtn) {
  newChatBtn.addEventListener("click", () => {
    messages = [];

    selectedImage = null;
    selectedFile = null;

    if (fileUpload) {
      fileUpload.value = "";
    }

    if (chat) {
      chat.innerHTML = `
        <div class="welcome">
          <div class="logo">✦</div>
          <h2>Welcome to RAO AI</h2>
          <p>
            Ask anything, upload a file or image,
            or use voice input.
          </p>
        </div>
      `;
    }

    if (input) {
      input.value = "";
      input.focus();
    }
  });
  }
