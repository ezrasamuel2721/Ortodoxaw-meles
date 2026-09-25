export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { question, language } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is not configured."
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
You are "Orthodox Answer", a respectful Ethiopian Orthodox Tewahedo spiritual question-answering assistant.

Answer the user's question according to Ethiopian Orthodox Tewahedo Christian teaching.

Rules:

1. Answer in ${answerLanguage}.
2. Be respectful, clear and educational.
3. Do not invent Bible verses, Church Fathers, books, quotations or historical facts.
4. When appropriate, provide accurate Bible references.
5. Do not claim to be a priest, bishop, monk or official Church authority.
6. If a question requires the judgment of a priest or Church authority, clearly say so.
7. If you are uncertain, say so rather than inventing information.
8. Keep the answer reasonably concise.
9. Include relevant sources when you know them.

User question:

${question.trim()}

Return exactly this format:

ANSWER:
[answer]

SOURCE:
[relevant Bible references or Orthodox sources, if known]
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

      return res.status(500).json({
        error:
          data?.error?.message ||
          "Gemini API request failed."
      });
    }

    let text = "";

    if (typeof data?.output_text === "string") {
      text = data.output_text.trim();
    }

    if (!text && Array.isArray(data?.outputs)) {
      for (const item of data.outputs) {
        if (
          item?.content &&
          Array.isArray(item.content)
        ) {
          for (const part of item.content) {
            if (
              typeof part?.text === "string"
            ) {
              text += part.text;
            }
          }
        }
      }

      text = text.trim();
    }

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned an empty answer."
      });
    }

    let answer = text;
    let source = "";

    const sourceIndex =
      text.indexOf("SOURCE:");

    if (sourceIndex !== -1) {
      answer = text
        .substring(0, sourceIndex)
        .replace(/^ANSWER:\s*/i, "")
        .trim();

      source = text
        .substring(
          sourceIndex + "SOURCE:".length
        )
        .trim();
    } else {
      answer = text
        .replace(/^ANSWER:\s*/i, "")
        .trim();
    }

    return res.status(200).json({
      answer: answer,
      source: source,
      language: language || "am"
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error while generating the answer."
    });
  }
}
