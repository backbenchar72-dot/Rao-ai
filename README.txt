RAO AI - Netlify Ready

Features:
- Normal AI chat
- Image reading
- PDF/text file reading
- Voice input (browser Web Speech API)
- Optional Web Search using the OpenAI Responses API built-in web search tool

DEPLOY:
1. Upload the contents of this folder to Netlify (index.html must be at the site root).
2. In Netlify: Project configuration -> Environment variables.
3. Add OPENAI_API_KEY with your OpenAI API key. Keep it server-side; do not paste it into index.html/script.js.
4. Redeploy the site after setting the variable.
5. Open RAO AI. Tap "Web Search: OFF" to turn it ON, then ask a current question.

NOTE:
Web Search uses OpenAI's built-in Responses API web-search tool. Web-search requests may incur OpenAI API/tool usage charges according to your account. Normal chat, image/PDF reading and voice input remain available when Web Search is OFF.
