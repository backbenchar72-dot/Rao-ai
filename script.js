const chat=document.getElementById("chat"),form=document.getElementById("composer"),input=document.getElementById("input"),uploadBtn=document.getElementById("uploadBtn"),micBtn=document.getElementById("micBtn"),fileUpload=document.getElementById("fileUpload"),previewWrap=document.getElementById("previewWrap"),preview=document.getElementById("preview"),filePreviewInfo=document.getElementById("filePreviewInfo"),removeFile=document.getElementById("removeFile"),send=document.getElementById("send"),webSearchBtn=document.getElementById("webSearchBtn"),webSearchNote=document.getElementById("webSearchNote"),statusEl=document.getElementById("status");
let messages=[],selectedImage=null,selectedFile=null,webSearchEnabled=false;

// Voice input (Android Chrome and other browsers that support the Web Speech API)
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null,isListening=false;
if(SpeechRecognition){
  recognition=new SpeechRecognition();
  recognition.lang="hi-IN";
  recognition.continuous=false;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;
  recognition.onstart=()=>{isListening=true;micBtn.classList.add("listening");micBtn.textContent="⏹️";micBtn.title="Stop voice input";input.placeholder="Bolna shuru karo…"};
  recognition.onresult=(event)=>{let transcript="";for(let i=event.resultIndex;i<event.results.length;i++){transcript+=event.results[i][0].transcript;}if(transcript){input.value=transcript;input.dispatchEvent(new Event("input"));}};
  recognition.onerror=(event)=>{if(event.error==="not-allowed"||event.error==="service-not-allowed")alert("Microphone permission allow karo, phir 🎤 dobara dabao.");else if(event.error!=="aborted")alert("Voice input error: "+event.error);};
  recognition.onend=()=>{isListening=false;micBtn.classList.remove("listening");micBtn.textContent="🎤";micBtn.title="Voice input";input.placeholder="Message RAO AI..."};
  micBtn.addEventListener("click",()=>{try{if(isListening)recognition.stop();else recognition.start();}catch(e){}});
}else{micBtn.disabled=true;micBtn.title="Voice input is not supported in this browser";}

function addMessage(text,who,sources=[]){
  const row=document.createElement("div");row.className="msg "+who;
  row.innerHTML=`<div class="avatar">${who==="user"?"You":"✦"}</div><div class="bubble"></div>`;
  const bubble=row.querySelector(".bubble");bubble.textContent=text;
  if(who==="ai"&&sources.length){
    const sourceBox=document.createElement("div");sourceBox.className="sources";
    const title=document.createElement("div");title.className="sources-title";title.textContent="Sources";sourceBox.appendChild(title);
    sources.slice(0,8).forEach((s,i)=>{const a=document.createElement("a");a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=`${i+1}. ${s.title||s.url}`;sourceBox.appendChild(a);});
    bubble.appendChild(sourceBox);
  }
  chat.appendChild(row);chat.scrollTop=chat.scrollHeight;return bubble;
}
function clearWelcome(){const w=chat.querySelector(".welcome");if(w)w.remove()}
function resetAttachment(){selectedImage=null;selectedFile=null;fileUpload.value="";preview.src="";filePreviewInfo.textContent="";previewWrap.classList.add("hidden")}
function showFileInfo(file){filePreviewInfo.innerHTML=`<strong>${file.name}</strong><span>${(file.size/1024/1024).toFixed(2)} MB · ${file.type||"file"}</span>`;previewWrap.classList.remove("hidden")}
function isImage(file){return /^image\/(png|jpeg|webp|gif)$/.test(file.type)}

webSearchBtn.addEventListener("click",()=>{
  webSearchEnabled=!webSearchEnabled;
  webSearchBtn.setAttribute("aria-pressed",String(webSearchEnabled));
  webSearchBtn.textContent=webSearchEnabled?"🌐 Web Search: ON":"🌐 Web Search: OFF";
  webSearchBtn.classList.toggle("active",webSearchEnabled);
  webSearchNote.textContent=webSearchEnabled?"RAO AI will use live web search when answering":"Current web information is off";
});

uploadBtn.addEventListener("click",()=>fileUpload.click());
fileUpload.addEventListener("change",async()=>{const file=fileUpload.files[0];if(!file)return;await handleFile(file)});
removeFile.addEventListener("click",resetAttachment);

async function handleFile(file){
  if(file.size>15*1024*1024){alert("File 15 MB se chhoti rakho.");resetAttachment();return}
  if(isImage(file)){
    const reader=new FileReader();reader.onload=()=>{selectedImage=reader.result;selectedFile={name:file.name,size:file.size,type:file.type};preview.src=selectedImage;filePreviewInfo.innerHTML=`<strong>${file.name}</strong><span>${(file.size/1024/1024).toFixed(2)} MB · image</span>`;previewWrap.classList.remove("hidden")};reader.readAsDataURL(file);return;
  }
  const ext=file.name.toLowerCase().split(".").pop();
  if(ext==="pdf"){
    selectedFile={name:file.name,size:file.size,type:file.type||"application/pdf",status:"reading",text:""};showFileInfo(file);filePreviewInfo.innerHTML+=`<span id="fileReadStatus">Reading PDF…</span>`;
    try{selectedFile.text=await extractPdfText(file);selectedFile.status="ready";document.getElementById("fileReadStatus").textContent=`${selectedFile.text.length.toLocaleString()} characters extracted`;}catch(e){selectedFile=null;alert("PDF read nahi ho paaya: "+e.message);resetAttachment()}return;
  }
  const readable=["txt","md","csv","json","html","htm","js","css","py","xml","log"];
  if(readable.includes(ext)){
    try{const text=await file.text();if(!text.trim())throw new Error("File khaali hai.");selectedFile={name:file.name,size:file.size,type:file.type||"text/plain",status:"ready",text:text.slice(0,120000)};showFileInfo(file);filePreviewInfo.innerHTML+=`<span>${Math.min(text.length,120000).toLocaleString()} characters loaded</span>`;}catch(e){alert("File read nahi ho paayi: "+e.message);resetAttachment()}return;
  }
  alert("Is file type ko abhi support nahi kiya gaya. PDF, TXT, MD, CSV, JSON, HTML, JS, CSS, PY, XML ya LOG use karo.");resetAttachment();
}

async function extractPdfText(file){
  const pdfjs=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const buffer=await file.arrayBuffer();const pdf=await pdfjs.getDocument({data:buffer}).promise;let out="";const maxPages=Math.min(pdf.numPages,100);
  for(let i=1;i<=maxPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();const text=content.items.map(x=>x.str||"").join(" ");out+=`\n\n--- Page ${i} ---\n${text}`;if(out.length>=120000)break;}
  if(pdf.numPages>maxPages)out+=`\n\n[Only first ${maxPages} pages were read.]`;return out.slice(0,120000).trim();
}

form.addEventListener("submit",async e=>{
  e.preventDefault();const text=input.value.trim();if(!text&&!selectedImage&&!selectedFile)return;clearWelcome();
  const displayText=text||(selectedImage?"Please analyze this image.":"Please read this file and summarize it.");
  addMessage((selectedImage||selectedFile)?displayText+" 📎":displayText,"user");
  const loading=addMessage(webSearchEnabled?"Searching the web and thinking…":selectedFile?.status==="ready"?"Reading file and thinking…":selectedImage?"Analyzing image…":"Thinking…","ai");
  send.disabled=true;uploadBtn.disabled=true;micBtn.disabled=true;webSearchBtn.disabled=true;statusEl.textContent=webSearchEnabled?"Searching…":"Thinking…";
  try{
    const current={role:"user",content:displayText};if(selectedImage)current.image=selectedImage;if(selectedFile?.status==="ready")current.file={name:selectedFile.name,type:selectedFile.type,text:selectedFile.text};
    const r=await fetch("/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[...messages,current],webSearch:webSearchEnabled})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"Request failed");
    loading.textContent=data.reply||"No response.";
    if(data.sources?.length){const sourceBox=document.createElement("div");sourceBox.className="sources";const title=document.createElement("div");title.className="sources-title";title.textContent="Sources";sourceBox.appendChild(title);data.sources.slice(0,8).forEach((s,i)=>{const a=document.createElement("a");a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent=`${i+1}. ${s.title||s.url}`;sourceBox.appendChild(a);});loading.appendChild(sourceBox);}
    messages.push(current);messages.push({role:"assistant",content:data.reply||"No response."});input.value="";resetAttachment();
  }catch(err){loading.textContent="Error: "+err.message}
  finally{send.disabled=false;uploadBtn.disabled=false;micBtn.disabled=!SpeechRecognition;webSearchBtn.disabled=false;statusEl.textContent="Ready";input.focus()}
});

input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,140)+"px"});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
document.getElementById("newChat").onclick=()=>{messages=[];chat.innerHTML=`<div class="welcome"><div class="logo">✦</div><h1>Welcome to RAO AI</h1><p>Ask anything, upload an image/PDF/file, speak, or turn on Web Search for current information.</p></div>`;resetAttachment();input.value="";input.focus()};
