export default async function handler(req, res) {
  // Only POST is allowed
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

    const langNames = {
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
      langNames[language] || "Amharic";

    const prompt = `
You are "Orthodox Answer", a respectful Ethiopian Orthodox Tewahedo spiritual question-answering assistant.

Answer the user's question according to Ethiopian Orthodox Tewahedo Christian teaching.

Important rules:

1. Answer in ${answerLanguage}.
2. Be respectful, clear and educational.
3. Do not invent Bible verses, Church Fathers, books, quotations or historical facts.
4. If you know a relevant Bible verse, give the book, chapter and verse accurately.
5. If the question requires the authoritative judgment of a priest, monk, bishop or church authority, clearly say so.
6. Do not present yourself as a priest, bishop or official Church authority.
7. Do not claim that an answer is an official ruling of the Ethiopian Orthodox Tewahedo Church unless there is a reliable basis.
8. Keep the answer understandable and reasonably concise.
9. When appropriate, include a short "Source" section with Bible references or known Orthodox sources.
10. If you are uncertain, say that you are uncertain instead of inventing information.

User question:

${question.trim()}

Return your response in this format:

ANSWER:
[Your answer]

SOURCE:
[Relevant Bible references or Orthodox sources, if known]
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1800
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(500).json({
        error:
          data?.error?.message ||
          "Gemini could not generate an answer."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned an empty answer."
      });
    }

    let answer = text;
    let source = "";

    const sourceIndex = text.indexOf("SOURCE:");

    if (sourceIndex !== -1) {
      answer = text
        .substring(0, sourceIndex)
        .replace(/^ANSWER:\s*/i, "")
        .trim();

      source = text
        .substring(sourceIndex + "SOURCE:".length)
        .trim();
    } else {
      answer = text
        .replace(/^ANSWER:\s*/i, "")
        .trim();
    }

    return res.status(200).json({
      answer,
      source,
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
