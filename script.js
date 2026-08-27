Complete script.js

/* =========================================================
   RAO AI - COMPLETE FRONTEND SCRIPT
   =========================================================
   Features:
   - Chat
   - Live streaming
   - Image upload
   - Text/code file upload
   - Web Search
   - Voice input
   - Text to Speech
   - New Chat
   - Duplicate script-load protection
   - No page refresh on submit
========================================================= */


/* =========================================================
   DUPLICATE SCRIPT LOAD PROTECTION
========================================================= */

if (window.__RAO_AI_SCRIPT_LOADED__) {
  console.warn("RAO AI script already loaded. Skipping duplicate load.");
} else {
  window.__RAO_AI_SCRIPT_LOADED__ = true;

  /* =======================================================
     DOM
  ======================================================= */

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

  /* =======================================================
     STATE
  ======================================================= */

  let messages = [];
  let webSearchEnabled = false;

  let selectedImage = null;
  let selectedFile = null;

  let isListening = false;
  let isSending = false;

  let recognition = null;


  /* =======================================================
     TEXT TO SPEECH
  ======================================================= */

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

    /*
      Hindi/Hinglish friendly.
    */
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


  /* =======================================================
     ADD NORMAL MESSAGE
  ======================================================= */

  function addMessage(text, who = "assistant") {
    if (!chat) return null;

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


  /* =======================================================
     CREATE STREAMING ASSISTANT MESSAGE
  ======================================================= */

  function createStreamingMessage() {
    if (!chat) return null;

    const row = document.createElement("div");

    row.className = "msg assistant";

    row.innerHTML = `
      <div class="avatar">✦</div>

      <div class="message-content">

        <div class="bubble"></div>

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

      </div>
    `;

    chat.appendChild(row);

    chat.scrollTop = chat.scrollHeight;

    const bubble = row.querySelector(".bubble");
    const speakBtn = row.querySelector(".speak-btn");

    if (speakBtn && bubble) {
      speakBtn.addEventListener("click", () => {
        speakText(bubble.textContent, speakBtn);
      });
    }

    return bubble;
  }


  /* =======================================================
     CLEAR WELCOME
  ======================================================= */

  function clearWelcome() {
    if (!chat) return;

    const welcome = chat.querySelector(".welcome");

    if (welcome) {
      welcome.remove();
    }
  }


  /* =======================================================
     WEB SEARCH
  ======================================================= */

  if (webSearchBtn) {
    webSearchBtn.addEventListener("click", () => {
      if (isSending) return;

      webSearchEnabled = !webSearchEnabled;

      webSearchBtn.classList.toggle(
        "active",
        webSearchEnabled
      );

      webSearchBtn.textContent =
        webSearchEnabled
          ? "🌐 Web Search: ON"
          : "🌐 Web Search: OFF";

      const note =
        document.getElementById("webSearchNote");

      if (note) {
        note.textContent = webSearchEnabled
          ? "Live web information is ON"
          : "Current web information is off";
      }
    });
  }


  /* =======================================================
     VOICE INPUT
  ======================================================= */

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (micBtn && SpeechRecognition) {

    recognition = new SpeechRecognition();

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
        "Speech recognition error:",
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

    micBtn.addEventListener("click", () => {

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
    });

  } else if (micBtn) {

    micBtn.addEventListener("click", () => {
      alert(
        "Voice input is not supported in this browser. Chrome browser try karein."
      );
    });

  }


  /* =======================================================
     FILE UPLOAD
  ======================================================= */

  if (uploadBtn && fileUpload) {

    uploadBtn.addEventListener("click", () => {

      if (isSending) return;

      fileUpload.click();
    });


    fileUpload.addEventListener(
      "change",
      async () => {

        const file =
          fileUpload.files?.[0];

        if (!file) return;


        if (file.size > 15 * 1024 * 1024) {

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
            "log",
            "ts",
            "jsx",
            "tsx",
            "java",
            "c",
            "cpp",
            "h",
            "hpp",
            "sql",
            "php",
            "sh"
          ];


          /*
            IMAGE
          */

          if (file.type.startsWith("image/")) {

            selectedImage =
              await fileToDataURL(file);

          }


          /*
            TEXT / CODE FILE
          */

          else if (readable.includes(ext)) {

            const text =
              await file.text();

            selectedFile.text =
              text.slice(0, 120000);

          }


          /*
            PDF
          */

          else if (
            file.type === "application/pdf" ||
            ext === "pdf"
          ) {

            selectedFile.text =
              `PDF file attached: ${file.name}

The frontend has attached this PDF file, but PDF text extraction is not enabled in this browser script yet.`;

          }


          showAttachmentPreview(file);

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


  /* =======================================================
     FILE -> DATA URL
  ======================================================= */

  function fileToDataURL(file) {

    return new Promise(
      (resolve, reject) => {

        const reader =
          new FileReader();

        reader.onload = () => {
          resolve(reader.result);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
      }
    );
  }


  /* =======================================================
     ATTACHMENT PREVIEW
  ======================================================= */

  function showAttachmentPreview(file) {

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


    if (!previewWrap || !info) {
      return;
    }


    previewWrap.classList.remove(
      "hidden"
    );


    info.innerHTML = `
      <strong>${escapeHtml(file.name)}</strong>
      <span>${formatFileSize(file.size)}</span>
    `;


    if (
      preview &&
      file.type.startsWith("image/") &&
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


  /* =======================================================
     FILE SIZE
  ======================================================= */

  function formatFileSize(bytes) {

    if (!Number.isFinite(bytes)) {
      return "";
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }


  /* =======================================================
     ESCAPE HTML
  ======================================================= */

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


  /* =======================================================
     RESET ATTACHMENT
  ======================================================= */

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
      resetAttachment
    );
  }


  /* =======================================================
     BUILD CURRENT USER MESSAGE
  ======================================================= */

  function buildCurrentMessage(text) {

    const content = [];


    /*
      Text
    */

    if (text) {

      content.push({
        type: "input_text",
        text: text
      });

    }


    /*
      Image
    */

    if (selectedImage) {

      content.push({
        type: "input_image",
        image_url: selectedImage
      });

    }


    /*
      File text
    */

    if (
      selectedFile &&
      selectedFile.text
    ) {

      content.push({
        type: "input_text",
        text:
          `Attached file: ${selectedFile.name}

${selectedFile.text}`
      });

    }


    /*
      If absolutely nothing exists
    */

    if (!content.length) {

      content.push({
        type: "input_text",
        text: "Hello"
      });

    }


    return {
      role: "user",
      content
    };
  }


  /* =======================================================
     STREAMING RESPONSE PARSER
  ======================================================= */

  async function readStreamingResponse(
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


    while (true) {

      const {
        value,
        done
      } =
        await reader.read();


      if (done) {
        break;
      }


      buffer +=
        decoder.decode(
          value,
          {
            stream: true
          }
        );


      /*
        SSE events normally end with:

        \n\n
      */

      const events =
        buffer.split(
          /\r?\n\r?\n/
        );


      buffer =
        events.pop() || "";


      for (const eventBlock of events) {

        const lines =
          eventBlock.split(
            /\r?\n/
          );


        let eventName = "";
        let dataLines = [];


        for (const line of lines) {

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


          if (
            line.startsWith(
              "data:"
            )
          ) {

            dataLines.push(
              line
                .slice(5)
                .trimStart()
            );

          }
        }


        if (!dataLines.length) {
          continue;
        }


        const dataText =
          dataLines.join(
            "\n"
          ).trim();


        if (
          !dataText ||
          dataText === "[DONE]"
        ) {
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
            Some SSE chunks can be
            incomplete. Ignore them.
          */

          continue;
        }


        /*
          OPENAI RESPONSES API:

          response.output_text.delta
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


          if (delta) {

            fullText += delta;


            if (bubble) {

              bubble.textContent =
                fullText;

              chat.scrollTop =
                chat.scrollHeight;
            }
          }


          continue;
        }


        /*
          Some compatible endpoints
          may send output_text directly.
        */

        if (
          typeof data.output_text ===
          "string"
        ) {

          fullText =
            data.output_text;


          if (bubble) {

            bubble.textContent =
              fullText;

            chat.scrollTop =
              chat.scrollHeight;
          }

          continue;
        }


        /*
          ERROR EVENT
        */

        if (
          data.type ===
            "response.failed" ||
          data.type ===
            "error"
        ) {

          const errorMessage =
            data.error?.message ||
            data.message ||
            "Streaming request failed.";

          throw new Error(
            errorMessage
          );
        }


        /*
          Completed event
        */

        if (
          data.type ===
          "response.completed"
        ) {

          /*
            Usually all deltas are already
            received. Nothing else needed.
          */

          continue;
        }
      }
    }


    /*
      Flush decoder
    */

    buffer +=
      decoder.decode();


    return fullText.trim();
  }


  /* =======================================================
     DISABLE CONTROLS
  ======================================================= */

  function setSendingState(sending) {

    isSending = sending;


    if (input) {
      input.disabled = sending;
    }


    if (micBtn) {
      micBtn.disabled = sending;
    }


    if (uploadBtn) {
      uploadBtn.disabled = sending;
    }


    if (sendBtn) {
      sendBtn.disabled = sending;
    }


    if (webSearchBtn) {
      webSearchBtn.disabled =
        sending;
    }


    if (removeFile) {
      removeFile.disabled =
        sending;
    }
  }


  /* =======================================================
     SEND MESSAGE
  ======================================================= */

  if (form) {

    form.addEventListener(
      "submit",
      async (event) => {

        /*
          VERY IMPORTANT:
          Prevent browser page refresh.
        */

        event.preventDefault();

        event.stopPropagation();


        /*
          Prevent duplicate submit.
        */

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


        /*
          Display text
        */

        let displayText =
          text;


        if (
          !displayText &&
          selectedImage
        ) {

          displayText =
            "Please analyze this image.";

        } else if (
          !displayText &&
          selectedFile
        ) {

          displayText =
            `Please read this file: ${selectedFile.name}`;
        }


        /*
          Show user message
        */

        addMessage(
          displayText,
          "user"
        );


        /*
          Save input before clearing attachment
        */

        const currentMessage =
          buildCurrentMessage(
            text ||
              displayText
          );


        messages.push(
          currentMessage
        );


        /*
          Clear input
        */

        if (input) {
          input.value = "";
          input.style.height =
            "auto";
        }


        /*
          Create empty assistant bubble.
          Text will appear LIVE.
        */

        const loading =
          createStreamingMessage();


        setSendingState(true);


        try {

          /*
            IMPORTANT:

            Worker endpoint:
            POST /chat
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
                    messages:
                      messages,

                    webSearch:
                      webSearchEnabled,

                    stream: true
                  })
              }
            );


          /*
            If Worker returned normal JSON
            error instead of SSE.
          */

          if (!response.ok) {

            let errorMessage =
              `Server error (${response.status})`;


            try {

              const errorText =
                await response.text();


              if (errorText) {

                try {

                  const errorData =
                    JSON.parse(
                      errorText
                    );


                  errorMessage =
                    errorData?.error ||
                    errorData?.message ||
                    errorMessage;

                } catch {

                  if (
                    errorText.length <
                    1000
                  ) {
                    errorMessage =
                      errorText;
                  }
                }
              }

            } catch {
              /* ignore */
            }


            throw new Error(
              errorMessage
            );
          }


          /*
            Read LIVE SSE stream
          */

          const reply =
            await readStreamingResponse(
              response,
              loading
            );


          /*
            Empty response check
          */

          if (!reply) {

            throw new Error(
              "RAO AI ne koi text response nahi diya."
            );
          }


          /*
            Save assistant response
          */

          messages.push({
            role: "assistant",
            content: reply
          });


        } catch (error) {

          console.error(
            "RAO AI ERROR:",
            error
          );


          /*
            Remove failed user message
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
            Remove failed assistant bubble
            and show error.
          */

          if (loading) {

            loading.textContent =
              "❌ Error: " +
              (
                error?.message ||
                "RAO AI se response nahi mila."
              );

          } else {

            addMessage(
              "❌ Error: " +
                (
                  error?.message ||
                  "RAO AI se response nahi mila."
                ),
              "assistant"
            );
          }


        } finally {

          resetAttachment();

          setSendingState(false);


          if (input) {
            input.focus();
          }
        }
      }
    );
  }


  /* =======================================================
     ENTER TO SEND
  ======================================================= */

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

            /*
              Use requestSubmit so the
              submit handler handles everything.
            */

            if (
              typeof form?.requestSubmit ===
              "function"
            ) {

              form.requestSubmit();

            } else {

              form?.dispatchEvent(
                new Event(
                  "submit",
                  {
                    bubbles: true,
                    cancelable: true
                  }
                )
              );
            }
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


  /* =======================================================
     NEW CHAT
  ======================================================= */

  if (newChatBtn) {

    newChatBtn.addEventListener(
      "click",
      () => {

        if (
          "speechSynthesis" in window
        ) {

          speechSynthesis.cancel();
        }


        /*
          Stop microphone
        */

        if (
          recognition &&
          isListening
        ) {

          try {
            recognition.stop();
          } catch {
            /* ignore */
          }
        }


        messages = [];


        selectedImage = null;

        selectedFile = null;


        webSearchEnabled = false;


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

          input.style.height =
            "auto";

          input.disabled =
            false;

          input.focus();
        }


        setSendingState(false);
      }
    );
  }


  /* =======================================================
     PAGE READY
  ======================================================= */

  window.addEventListener(
    "load",
    () => {

      if (input) {
        input.focus();
      }

    }
  );

       }
