RAO AI - Cloudflare Pages Functions version

1. Upload this project to a GitHub repository.
2. In Cloudflare: Workers & Pages -> Create application -> Pages -> Connect to Git.
3. Select the GitHub repository.
4. Build command: exit 0
5. Build output directory: .
6. Deploy.
7. Open the project -> Settings -> Variables and Secrets -> add OPENAI_API_KEY as a secret for Production.
8. Redeploy after saving the secret.

The frontend calls /chat, which is handled by functions/chat.js.
Do not put the OpenAI API key in index.html or script.js.
