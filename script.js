# script.js — RAO AI Live Streaming

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
let isSending = false;


/* =========================================================
   TEXT TO SPEECH
========================================================= */

function speakText(text, button = null) {
  if (!("speechSynthesis" in window)) {
    alert("Aapke browser mein voice support available nahi hai.");
    return;
  }

  if (!text || !text.trim()) return;

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

  utterance.lang = "hi-IN";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  const voices = speechSynthesis.getVoices();

  const hindiVoice = voices.find(
    (voice) =>
      voice.lang &&
      voice.lang.toLowerCase().startsWith("hi")
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

function addMessage(text = "", who = "assistant") {
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

  bubble.textContent = text || "";

  chat.appendChild(row);

  chat.scrollTop = chat.scrollHeight;

  if (who === "assistant") {
    const speakBtn = row.querySelector(".speak-btn");

    if (speakBtn) {
      speakBtn.addEventListener("click", () => {
        speakText(
          bubble.textContent,
          speakBtn
        );
      });
    }
  }

  return {
    row,
    bubble
  };
}


/* =========================================================
   CLEAR WELCOME
========================================================= */

function clearWelcome() {
  const welcome = chat?.querySelector(".welcome");

  if (welcome) {
    welcome.remove();
  }
}


/* =========================================================
   WEB SEARCH
========================================================= */

if (webSearchBtn) {
  webSearchBtn.addEventListener("click", () => {
    if (isSending) return;

    webSearchEnabled =
      !webSearchEnabled;

    webSearchBtn.classList.toggle(
      "active",
      webSearchEnabled
    );

    webSearchBtn.textContent =
      webSearchEnabled
        ? "🌐 Web Search: ON"
        : "🌐 Web Search: OFF";

    const note =
      document.getElementById(
        "webSearchNote"
      );

    if (note) {
      note.textContent =
        webSearchEnabled
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
  const recognition =
    new SpeechRecognition();

  recognition.lang = "hi-IN";

  recognition.continuous = false;

  recognition.interimResults = false;

  recognition.maxAlternatives = 1;


  recognition.onstart = () => {
    isListening = true;

    micBtn.classList.add(
      "listening"
    );

    micBtn.textContent = "🔴";
  };


  recognition.onresult = (event) => {
    const transcript =
      event.results?.[0]?.[0]
        ?.transcript || "";

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


  micBtn.addEventListener(
    "click",
    () => {
      if (isSending) return;

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
    }
  );

} else if (micBtn) {

  micBtn.addEventListener(
    "click",
    () => {
      alert(
        "Voice input is not supported in this browser. Chrome browser try karein."
      );
    }
  );
}


/* =========================================================
   FILE UPLOAD
========================================================= */

if (uploadBtn && fileUpload) {

  uploadBtn.addEventListener(
    "click",
    () => {
      if (isSending) return;

      fileUpload.click();
    }
  );


  fileUpload.addEventListener(
    "change",
    async () => {

      if (isSending) return;

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


        if (
          readable.includes(ext)
        ) {

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
            await fileToDataURL(
              file
            );
        }


        else if (
          file.type ===
            "application/pdf" ||
          ext === "pdf"
        ) {

          selectedFile.text =
            "PDF file attached: " +
            file.name;
        }


        showAttachmentPreview(
          file
        );

      } catch (error) {

        console.error(
          "File read error:",
          error
        );

        alert(
          "File read nahi ho paayi."
        );

        resetAttachment();
      }
    }
  );
}


/* =========================================================
   FILE TO DATA URL
========================================================= */

function fileToDataURL(file) {
  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload = () => {
        resolve(
          reader.result
        );
      };


      reader.onerror =
        reject;


      reader.readAsDataURL(
        file
      );
    }
  );
}


/* =========================================================
   ATTACHMENT PREVIEW
========================================================= */

function showAttachmentPreview(
  file
) {

  const previewWrap =
    document.getElementById(
      "previewWrap"
    );

  const preview =
    document.getElementById(
      "preview"
    );

  const info =
    document.getElementById(
      "filePreviewInfo"
    );


  if (
    !previewWrap ||
    !info
  ) {
    return;
  }


  previewWrap.classList.remove(
    "hidden"
  );


  info.innerHTML = `
    <strong>${escapeHtml(
      file.name
    )}</strong>
    <span>${formatFileSize(
      file.size
    )}</span>
  `;


  if (
    preview &&
    file.type.startsWith(
      "image/"
    ) &&
    selectedImage
  ) {

    preview.src =
      selectedImage;

    preview.style.display =
      "block";

  } else if (preview) {

    preview.removeAttribute(
      "src"
    );

    preview.style.display =
      "none";
  }
}


/* =========================================================
   FILE SIZE
========================================================= */

function formatFileSize(bytes) {

  if (
    !Number.isFinite(bytes)
  ) {
    return "";
  }


  if (bytes < 1024) {
    return `${bytes} B`;
  }


  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }


  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
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
    document.getElementById(
      "previewWrap"
    );

  const preview =
    document.getElementById(
      "preview"
    );

  const info =
    document.getElementById(
      "filePreviewInfo"
    );


  if (previewWrap) {
    previewWrap.classList.add(
      "hidden"
    );
  }


  if (preview) {
    preview.removeAttribute(
      "src"
    );

    preview.style.display =
      "none";
  }


  if (info) {
    info.textContent = "";
  }
}


if (removeFile) {

  removeFile.addEventListener(
    "click",
    () => {

      if (isSending) return;

      resetAttachment();
    }
  );
}


/* =========================================================
   BUILD MESSAGE FOR WORKER
========================================================= */

function buildUserMessage(
  text
) {

  const content = [];


  if (text && text.trim()) {

    content.push({
      type: "input_text",
      text: text.trim()
    });
  }


  /*
   * IMPORTANT:
   * Image ko custom `image` property
   * mein nahi bhej rahe.
   *
   * Direct Responses API format use
   * kar rahe hain.
   */

  if (selectedImage) {

    content.push({
      type: "input_image",
      image_url:
        selectedImage
    });
  }


  /*
   * Text files ka actual content
   * model ko bhejo.
   */

  if (
    selectedFile &&
    selectedFile.text
  ) {

    content.push({
      type: "input_text",
      text:
        "\n\n[Attached file: " +
        selectedFile.name +
        "]\n\n" +
        selectedFile.text
    });
  }


  /*
   * Agar kuch bhi nahi hai
   * to normal text message.
   */

  if (!content.length) {

    content.push({
      type: "input_text",
      text:
        text ||
        "Please analyze the attachment."
    });
  }


  return {
    role: "user",
    content
  };
}


/* =========================================================
   STREAM RESPONSE FROM CLOUDFLARE WORKER
========================================================= */

async function streamChat(
  response,
  bubble
) {

  if (!response.body) {
    throw new Error(
      "Streaming response body nahi mila."
    );
  }


  const reader =
    response.body.getReader();


  const decoder =
    new TextDecoder(
      "utf-8"
    );


  let buffer = "";

  let fullText = "";


  /*
   * Prevent duplicate chunks.
   */

  let completed = false;


  while (true) {

    const {
      value,
      done
    } = await reader.read();


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
     * SSE events blank line se
     * separate hote hain.
     */

    const events =
      buffer.split(
        "\n\n"
      );


    buffer =
      events.pop() || "";


    for (
      const eventBlock
      of events
    ) {

      const lines =
        eventBlock.split(
          "\n"
        );


      let eventName = "";

      let dataLines = [];


      for (
        const line
        of lines
      ) {

        if (
          line.startsWith(
            "event:"
          )
        ) {

          eventName =
            line
              .slice(6)
              .trim();

        }

        else if (
          line.startsWith(
            "data:"
          )
        ) {

          dataLines.push(
            line
              .slice(5)
              .trim()
          );
        }
      }


      if (!dataLines.length) {
        continue;
      }


      const dataText =
        dataLines.join(
          "\n"
        );


      if (
        dataText ===
        "[DONE]"
      ) {
        completed = true;
        continue;
      }


      let data;


      try {

        data =
          JSON.parse(
            dataText
          );

      } catch {

        /*
         * Non-JSON SSE line ignore.
         */

        continue;
      }


      /*
       * Responses API streaming:
       *
       * response.output_text.delta
       *
       * delta contains only new text.
       */

      if (
        data.type ===
        "response.output_text.delta"
      ) {

        const delta =
          typeof data.delta ===
          "string"
            ? data.delta
            : "";


        if (!delta) {
          continue;
        }


        fullText += delta;


        /*
         * IMPORTANT:
         * textContent = fullText
         *
         * appendChild nahi karna.
         *
         * Isse duplicate reply nahi hoga.
         */

        bubble.textContent =
          fullText;


        chat.scrollTop =
          chat.scrollHeight;

        continue;
      }


      /*
       * Some compatible endpoints may
       * send output_text directly.
       */

      if (
        data.type ===
        "response.output_text.done"
      ) {

        if (
          typeof data.text ===
          "string" &&
          data.text.trim()
        ) {

          /*
           * Sirf tab set karo jab
           * accumulated text empty ho.
           */

          if (!fullText) {

            fullText =
              data.text;

            bubble.textContent =
              fullText;
          }
        }

        continue;
      }


      /*
       * Final response event.
       */

      if (
        data.type ===
        "response.completed"
      ) {

        completed = true;

        continue;
      }


      /*
       * Error event.
       */

      if (
        data.type ===
        "error"
      ) {

        throw new Error(
          data.error?.message ||
          "Streaming API error."
        );
      }
    }
  }


  /*
   * Flush decoder.
   */

  buffer += decoder.decode();


  /*
   * Agar server ne final event nahi bheja
   * phir bhi accumulated text valid hai.
   */

  if (
    !fullText.trim()
  ) {

    throw new Error(
      "RAO AI ne koi text response nahi diya."
    );
  }


  return fullText.trim();
}


/* =========================================================
   SEND MESSAGE
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    async (event) => {

      /*
       * Browser form submit ko
       * page refresh karne se roko.
       */

      event.preventDefault();

      event.stopPropagation();


      if (isSending) {
        return;
      }


      const text =
        input?.value?.trim() ||
        "";


      if (
        !text &&
        !selectedImage &&
        !selectedFile
      ) {
        return;
      }


      clearWelcome();


      isSending = true;


      const displayText =
        text ||
        (
          selectedImage
            ? "Please analyze this image."
            : "Please read this file."
        );


      /*
       * USER MESSAGE
       */

      addMessage(
        displayText,
        "user"
      );


      /*
       * Input clear
       */

      if (input) {
        input.value = "";

        input.style.height =
          "auto";
      }


      /*
       * ASSISTANT EMPTY BUBBLE
       *
       * Streaming text isi bubble
       * mein aayega.
       */

      const assistant =
        addMessage(
          "",
          "assistant"
        );


      const loadingBubble =
        assistant.bubble;


      /*
       * Temporary streaming indicator
       */

      loadingBubble.textContent =
        "Thinking…";


      const sendBtn =
        document.getElementById(
          "send"
        );


      /*
       * Disable controls
       */

      if (input) {
        input.disabled = true;
      }

      if (micBtn) {
        micBtn.disabled = true;
      }

      if (uploadBtn) {
        uploadBtn.disabled = true;
      }

      if (sendBtn) {
        sendBtn.disabled = true;
      }

      if (webSearchBtn) {
        webSearchBtn.disabled =
          true;
      }


      /*
       * Build actual API message
       */

      const userMessage =
        buildUserMessage(
          text
        );


      /*
       * Conversation history mein
       * same message EXACTLY ONCE.
       */

      messages.push(
        userMessage
      );


      try {

        /*
         * Worker ko streaming request.
         */

        const response =
          await fetch(
            "/chat",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({
                  messages,
                  webSearch:
                    webSearchEnabled,

                  /*
                   * IMPORTANT
                   */

                  stream: true
                })
            }
          );


        /*
         * Non-OK response ko JSON se
         * read karne ki koshish.
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


          if (
            errorText.trim()
          ) {

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
            errorText ||
            `Server error (${response.status})`
          );
        }


        /*
         * LIVE STREAM
         */

        const reply =
          await streamChat(
            response,
            loadingBubble
          );


        /*
         * Assistant history mein
         * FINAL COMPLETE reply sirf
         * ek baar add karo.
         */

        messages.push({
          role: "assistant",
          content: [
            {
              type:
                "output_text",
              text: reply
            }
          ]
        });


        /*
         * Ensure final text clean hai.
         */

        loadingBubble.textContent =
          reply;


        chat.scrollTop =
          chat.scrollHeight;


      } catch (error) {

        console.error(
          "RAO AI ERROR:",
          error
        );


        /*
         * Failed user request ko
         * history se remove karo.
         */

        if (
          messages.length &&
          messages[
            messages.length - 1
          ]?.role === "user"
        ) {

          messages.pop();
        }


        /*
         * Agar assistant empty tha
         * to error show karo.
         */

        loadingBubble.textContent =
          "❌ Error: " +
          (
            error?.message ||
            "RAO AI se response nahi mila."
          );


      } finally {

        resetAttachment();


        if (input) {
          input.disabled = false;
        }

        if (micBtn) {
          micBtn.disabled = false;
        }

        if (uploadBtn) {
          uploadBtn.disabled = false;
        }

        if (sendBtn) {
          sendBtn.disabled = false;
        }

        if (webSearchBtn) {
          webSearchBtn.disabled = false;
        }


        isSending = false;


        input?.focus();
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


        if (
          !input.disabled &&
          !isSending
        ) {

          /*
           * requestSubmit()
           * page refresh nahi karega
           * kyunki submit handler preventDefault
           * karta hai.
           */

          form?.requestSubmit();
        }
      }
    }
  );


  input.addEventListener(
    "input",
    () => {

      input.style.height =
        "auto";


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
    () => {

      if (isSending) {
        return;
      }


      if (
        "speechSynthesis" in
        window
      ) {

        speechSynthesis.cancel();
      }


      messages = [];


      selectedImage = null;

      selectedFile = null;


      webSearchEnabled =
        false;


      resetAttachment();


      if (fileUpload) {
        fileUpload.value = "";
      }


      if (webSearchBtn) {

        webSearchBtn.classList.remove(
          "active"
        );


        webSearchBtn.textContent =
          "🌐 Web Search: OFF";


        webSearchBtn.disabled =
          false;
      }


      const note =
        document.getElementById(
          "webSearchNote"
        );


      if (note) {

        note.textContent =
          "Current web information is off";
      }


      if (chat) {

        chat.innerHTML = `
          <div class="welcome">

            <div class="logo">
              ✦
            </div>

            <h1>
              Welcome to RAO AI
            </h1>

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

        input.style.height =
          "auto";

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

    if (input) {
      input.focus();
    }

  }
);
