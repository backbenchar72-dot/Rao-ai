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
AI TAB BOLEGA JAB USER
SPEAKER BUTTON DABAYEGA
========================= */

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
.replace(/[_`#]/g, "")
.replace(/[(.?)](.*?)/g, "$1")
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

/* =========================
CHAT MESSAGE
========================= */

function addMessage(text, who = "assistant") {
const row = document.createElement("div");

row.className = msg ${who};

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
const welcome = chat?.querySelector(".welcome");

if (welcome) {
welcome.remove();
}
}

/* =========================
WEB SEARCH
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

const note = document.getElementById("webSearchNote");  

if (note) {  
  note.textContent = webSearchEnabled  
    ? "Live web information is ON"  
    : "Current web information is off";  
}

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

      selectedFile.text =  
        text.slice(0, 120000);  
    } else if (  
      file.type.startsWith("image/")  
    ) {  
      selectedImage =  
        await fileToDataURL(file);  
    } else if (  
      file.type === "application/pdf" ||  
      ext === "pdf"  
    ) {  
      /*  
       * Browser PDF text extraction is not  
       * enabled here yet. File metadata is  
       * still preserved so the UI does not break.  
       */  
      selectedFile.text =  
        "PDF file attached: " + file.name;  
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

/* =========================
FILE TO DATA URL
========================= */

function fileToDataURL(file) {
return new Promise(
(resolve, reject) => {
const reader = new FileReader();

reader.onload = () => {  
    resolve(reader.result);  
  };  

  reader.onerror = reject;  

  reader.readAsDataURL(file);  
}

);
}

/* =========================
ATTACHMENT PREVIEW
========================= */

function showAttachmentPreview(file) {
const previewWrap =
document.getElementById("previewWrap");

const preview =
document.getElementById("preview");

const info =
document.getElementById("filePreviewInfo");

if (!previewWrap || !info) return;

previewWrap.classList.remove("hidden");

info.innerHTML =   <strong>${escapeHtml(file.name)}</strong>   <span>${formatFileSize(file.size)}</span>  ;

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

function formatFileSize(bytes) {
if (!Number.isFinite(bytes)) {
return "";
}

if (bytes < 1024) {
return ${bytes} B;
}

if (bytes < 1024 * 1024) {
return ${(bytes / 1024).toFixed(1)} KB;
}

return ${(bytes / (1024 * 1024)).toFixed(1)} MB;
}

function escapeHtml(value) {
return String(value)
.replace(/&/g, "&")
.replace(/</g, "<")
.replace(/>/g, ">")
.replace(/"/g, """)
.replace(/'/g, "'");
}

/* =========================
RESET ATTACHMENT
========================= */

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

/* =========================
SEND MESSAGE
CLOUDflare Worker -> GEMINI
========================= */

if (form) {
form.addEventListener(
"submit",
async (event) => {
event.preventDefault();

const text =  
    input?.value?.trim() || "";  

  if (  
    !text &&  
    !selectedImage &&  
    !selectedFile  
  ) {  
    return;  
  }  

  clearWelcome();  

  const displayText =  
    text ||  
    (  
      selectedImage  
        ? "Please analyze this image."  
        : "Please read this file."  
    );  

  addMessage(  
    displayText,  
    "user"  
  );  

  input.value = "";  

  const loading =  
    addMessage(  
      "Thinking...",  
      "assistant"  
    );  

  const sendBtn =  
    document.getElementById("send");  

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
    webSearchBtn.disabled = true;  
  }  

  try {  
    const currentMessage = {  
      role: "user",  
      content: displayText  
    };  

    /*  
     * Keep image/file information in the  
     * frontend conversation state.  
     */  
    if (selectedImage) {  
      currentMessage.image =  
        selectedImage;  
    }  

    if (selectedFile) {  
      currentMessage.file =  
        selectedFile;  
    }  

    messages.push(  
      currentMessage  
    );  

    /*  
     * IMPORTANT:  
     * Your Worker endpoint is /chat.  
     * Gemini API key stays inside the  
     * Cloudflare Worker secret.  
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

          body: JSON.stringify({  
            messages: messages,  
            webSearch:  
              webSearchEnabled  
          })  
        }  
      );  

    const rawText =  
      await response.text();  

    let data = null;  

    if (rawText.trim()) {  
      try {  
        data =  
          JSON.parse(  
            rawText  
          );  
      } catch (jsonError) {  
        console.error(  
          "Invalid JSON from Worker:",  
          rawText  
        );  

        throw new Error(  
          "Worker ne invalid response bheja."  
        );  
      }  
    }  

    if (!response.ok) {  
      throw new Error(  
        data?.error ||  
          `Server error (${response.status})`  
      );  
    }  

    /*  
     * Your Worker currently returns:  
     *  
     * {  
     *   ok: true,  
     *   message: "Gemini reply"  
     * }  
     *  
     * So message is checked first.  
     */  
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
        "Gemini se empty response mila."  
      );  
    }  

    loading.textContent =  
      reply;  

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
     * Remove the user message from  
     * conversation state if the request  
     * failed, so a retry does not create  
     * duplicate history.  
     */  
    if (  
      messages.length &&  
      messages[messages.length - 1]  
        ?.role === "user"  
    ) {  
      messages.pop();  
    }  

    loading.textContent =  
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

    input?.focus();  
  }  
}

);
}

/* =========================
ENTER TO SEND
========================= */

if (input) {
input.addEventListener(
"keydown",
(event) => {
if (
event.key === "Enter" &&
!event.shiftKey
) {
event.preventDefault();

if (!input.disabled) {  
      form?.requestSubmit();  
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

/* =========================
NEW CHAT
========================= */

if (newChatBtn) {
newChatBtn.addEventListener(
"click",
() => {
if (
"speechSynthesis" in window
) {
speechSynthesis.cancel();
}

messages = [];  

  selectedImage = null;  
  selectedFile = null;  

  webSearchEnabled = false;  

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

/* =========================
PAGE READY
========================= */

window.addEventListener(
"load",
() => {
if (input) {
input.focus();
}
}
);
