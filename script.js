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
   TEXT TO SPEECH
   AI MESSAGE KO TAB BOLEGA
   JAB USER SPEAKER BUTTON DABAYEGA
========================= */

let currentSpeech = null;

function speakText(text, button = null) {
  if (!("speechSynthesis" in window)) {
    alert("Aapke browser mein voice support available nahi hai.");
    return;
  }

  if (!text || !text.trim()) return;

  // Agar pehle se bol raha hai to stop
  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();

    if (button) {
      button.textContent = "🔊";
    }

    currentSpeech = null;
    return;
  }

  const cleanText = text
    .replace(/[*_`#]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);

  // Hindi ke liye Hindi voice
  utterance.lang = "hi-IN";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voices = speechSynthesis.getVoices();

  const hindiVoice =
    voices.find(v =>
      v.lang &&
      v.lang.toLowerCase().startsWith("hi")
    );

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

    currentSpeech = null;
  };

  utterance.onerror = () => {
    if (button) {
      button.textContent = "🔊";
    }

    currentSpeech = null;
  };

  currentSpeech = utterance;

  speechSynthesis.cancel();

  // Thoda delay mobile browser compatibility ke liye
  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 50);
}

/* Browser voices load hone do */
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
  };
}

/* =========================
   CHAT MESSAGE
========================= */

function addMessage(text, who = "assistant") {
  const row = document.createElement("div");
  row.className = `msg ${who}`;

  row.innerHTML = `
    <div class="avatar">${who === "user" ? "You" : "✦"}</div>

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

  bubble.textContent = text;

  chat.appendChild(row);

  chat.scrollTop = chat.scrollHeight;

  // AI message ke speaker button ko connect karo
  if (who === "assistant") {
    const speakBtn = row.querySelector(".speak-btn");

    if (speakBtn) {
      speakBtn.addEventListener("click", () => {
        speakText(bubble.textContent, speakBtn);
      });
    }
  }

  return bubble;
}

/* =========================
   CLEAR WELCOME
========================= */

function clearWelcome() {
  const welcome = chat.querySelector(".welcome");

  if (welcome) {
    welcome.remove();
  }
}

/* =========================
   WEB SEARCH BUTTON
========================= */

if (webSearchBtn) {
  webSearchBtn.addEventListener("click", () => {
    webSearchEnabled = !webSearchEnabled;

    webSearchBtn.classList.toggle(
      "active",
      webSearchEnabled
    );

    webSearchBtn.textContent =
      webSearchEnabled
        ? "🌐 Web Search: ON"
        : "🌐 Web Search: OFF";
  });
}

/* =========================
   VOICE INPUT
   USER MIC SE BOLEGA
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
      event.results?.[0]?.[0]?.transcript || "";

    if (input && transcript) {
      input.value = transcript;

      input.dispatchEvent(
        new Event("input")
      );
    }
  };

  recognition.onerror = (event) => {
    console.error(
      "Speech recognition error:",
      event?.error
    );

    isListening = false;

    micBtn.classList.remove(
      "listening"
    );

    micBtn.textContent = "🎤";
  };

  recognition.onend = () => {
    isListening = false;

    micBtn.classList.remove(
      "listening"
    );

    micBtn.textContent = "🎤";
  };

  micBtn.addEventListener("click", () => {
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
}

/* =========================
   BROWSER DOES NOT SUPPORT
   SPEECH RECOGNITION
========================= */

else if (micBtn) {
  micBtn.addEventListener("click", () => {
    alert(
      "Voice input is not supported in this browser. Chrome browser try karein."
    );
  });
}

/* =========================
   FILE UPLOAD
========================= */

if (uploadBtn && fileUpload) {
  uploadBtn.addEventListener("click", () => {
    fileUpload.click();
  });

  fileUpload.addEventListener(
    "change",
    async () => {
      const file =
        fileUpload.files?.[0];

      if (!file) return;

      if (
        file.size >
        15 * 1024 * 1024
      ) {
        alert(
          "File 15 MB se chhoti rakho."
        );

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
          const text =
            await file.text();

          selectedFile.text =
            text.slice(
              0,
              120000
            );
        }

        else if (
          file.type.startsWith(
            "image/"
          )
        ) {
          selectedImage =
            await fileToDataURL(file);
        }

        addMessage(
          `📎 ${file.name} attached`,
          "assistant"
        );

      } catch (error) {
        console.error(
          "File read error:",
          error
        );

        alert(
          "File read nahi ho paayi. TXT, PDF, image ya supported file try karo."
        );

        resetAttachment();
      }
    }
  );
}

/* =========================
   FILE TO DATA URL
========================= */

function fileToDataURL(file) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () =>
        resolve(reader.result);

      reader.onerror = reject;

      reader.readAsDataURL(file);
    }
  );
}

/* =========================
