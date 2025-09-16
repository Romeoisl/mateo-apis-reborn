const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = {
  config: {
    name: "googleai",
    description: "Generate text using Google Gemini AI (via Google Generative AI API)",
    params: ["prompt"],
    usage: "POST /api/config.googleai { \"prompt\": \"Your question here\" }",
    methods: ["get", "post", "delete", "put", "patch"]
  },
  async post({ prompt }, req, res) {
    if (!process.env.GOOGLE_GEMINI_API_KEY) throw new Error("Google Gemini API key not set.");
    if (!prompt) throw new Error("Prompt is required.");

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const result = await model.generateContent(prompt);
    const text = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text
      || result?.response?.text
      || "No response from Gemini.";
    return { result: text };
  },
  get(params, req, res) {
    return { usage: this.config.usage };
  },
  delete() {
    throw new Error("DELETE not supported for this API.");
  },
  async api(params, req, res) {
    return { note: "Fallback handler called" };
  },
  homePage() {
    return `
      <div class="widget">
        <h4>🔮 Google Gemini AI</h4>
        <form method="POST" action="/api/config.googleai" onsubmit="event.preventDefault(); googleAsk(this);">
          <input name="prompt" placeholder="Ask Google AI..." style="width:70%" required>
          <button>Ask</button>
        </form>
        <pre id="googleai-result" style="white-space:pre-wrap"></pre>
        <script>
          async function googleAsk(form) {
            const prompt = form.prompt.value;
            if(!prompt) return;
            const res = await fetch('/api/config.googleai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            document.getElementById('googleai-result').textContent = data.result?.result || data.error || '';
          }
        </script>
      </div>
    `;
  }
};
