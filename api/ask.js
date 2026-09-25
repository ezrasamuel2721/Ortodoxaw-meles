export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { question, language = "am" } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const languageNames = {
      am: "Amharic",
      en: "English",
      ti: "Tigrinya",
      om: "Afaan Oromoo",
      ar: "Arabic",
      fr: "French",
      de: "German",
      it: "Italian",
      es: "Spanish",
      pt: "Portuguese",
      ru: "Russian"
    };

    const answerLanguage =
      languageNames[language] || "Amharic";

    const prompt = `
You are "Orthodox Answer", a spiritual question-answer assistant.

Answer the user's question according to Ethiopian Orthodox Tewahedo Christian teaching.

Important rules:
- Give respectful, clear and useful answers.
- Do not invent Bible verses, church teachings, fathers, books or sources.
- When appropriate, mention the Bible or recognized Orthodox Christian sources.
- If the question is outside your reliable knowledge, say so honestly.
- Do not present guesses as church doctrine.
- Answer in ${answerLanguage}.
- The answer should be understandable and reasonably concise.

User question:
${question}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.8-flash",
          input: prompt
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Gemini API request failed"
      });
    }

    let answer = "";

    if (typeof data.output_text === "string") {
      answer = data.output_text;
    }

    if (!answer && Array.isArray(data.outputs)) {
      answer = data.outputs
        .map(item => {
          if (typeof item === "string") return item;

          if (typeof item?.text === "string") {
            return item.text;
          }

          if (Array.isArray(item?.content)) {
            return item.content
              .map(c => c?.text || "")
              .join("");
          }

          return "";
        })
        .join("")
        .trim();
    }

    if (!answer) {
      console.error("Unexpected Gemini response:", data);

      return res.status(500).json({
        error: "Gemini returned no answer"
      });
    }

    return res.status(200).json({
      answer,
      source: "Gemini AI – Orthodox Christian Context",
      language
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error"
    });
  }
}
