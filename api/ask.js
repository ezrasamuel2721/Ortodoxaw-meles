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
${question.trim()}
`;

    /*
     * Try the newest model first.
     * If it is temporarily busy, automatically try
     * the next available model.
     */
    const models = [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash"
    ];

    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
              model,
              input: prompt
            })
          }
        );

        const data = await response.json();

        /*
         * If the model is temporarily overloaded,
         * automatically continue with the next model.
         */
        if (
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          console.error(
            `Gemini model ${model} temporarily unavailable:`,
            data
          );

          lastError =
            data?.error?.message ||
            `Model ${model} temporarily unavailable`;

          continue;
        }

        /*
         * Permanent API error.
         */
        if (!response.ok) {
          console.error(
            `Gemini API error (${model}):`,
            data
          );

          return res.status(response.status).json({
            error:
              data?.error?.message ||
              "Gemini API request failed"
          });
        }

        /*
         * Interactions API normally provides output_text.
         */
        let answer = "";

        if (typeof data.output_text === "string") {
          answer = data.output_text.trim();
        }

        /*
         * Backup response parsing.
         */
        if (!answer && Array.isArray(data.outputs)) {
          answer = data.outputs
            .map((item) => {
              if (typeof item === "string") {
                return item;
              }

              if (typeof item?.text === "string") {
                return item.text;
              }

              if (Array.isArray(item?.content)) {
                return item.content
                  .map((content) => content?.text || "")
                  .join("");
              }

              return "";
            })
            .join("")
            .trim();
        }

        /*
         * Another possible response structure.
         */
        if (!answer && Array.isArray(data.steps)) {
          answer = data.steps
            .map((step) => {
              if (typeof step?.text === "string") {
                return step.text;
              }

              if (Array.isArray(step?.content)) {
                return step.content
                  .map((content) => content?.text || "")
                  .join("");
              }

              return "";
            })
            .join("")
            .trim();
        }

        if (!answer) {
          console.error(
            `No answer returned from ${model}:`,
            data
          );

          lastError = "Gemini returned no answer";
          continue;
        }

        /*
         * Success
         */
        return res.status(200).json({
          answer,
          source: "Gemini AI – Orthodox Christian Context",
          language,
          model
        });
      } catch (modelError) {
        console.error(
          `Error while using ${model}:`,
          modelError
        );

        lastError = modelError?.message || "Model error";

        /*
         * Continue to the next model.
         */
        continue;
      }
    }

    /*
     * All models failed.
     */
    return res.status(503).json({
      error:
        "Gemini AI is temporarily unavailable. Please try again shortly.",
      details: lastError || "All Gemini models were unavailable."
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
