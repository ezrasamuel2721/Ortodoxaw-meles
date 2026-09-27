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

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Supabase environment variables are not configured"
      });
    }

    if (!geminiKey) {
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

    /*
     * ---------------------------------------------------------
     * 1. SEARCH SUPABASE KNOWLEDGE BASE
     * ---------------------------------------------------------
     *
     * We search orthodox_source_chunks directly.
     * This avoids limiting the application to orthodox_answers.
     */

    const searchTerms = question
      .trim()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(word => word.length >= 2)
      .slice(0, 12);

    const orConditions = [];

    for (const term of searchTerms) {
      const safeTerm = term
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");

      orConditions.push(`topic.ilike.%${safeTerm}%`);
      orConditions.push(`keywords.ilike.%${safeTerm}%`);
      orConditions.push(`content.ilike.%${safeTerm}%`);
      orConditions.push(`section_title.ilike.%${safeTerm}%`);
    }

    let knowledge = [];

    if (orConditions.length > 0) {
      const supabaseSearchUrl =
        `${supabaseUrl}/rest/v1/orthodox_source_chunks` +
        `?select=id,source_id,section_title,content,topic,keywords,language,verified,source_label` +
        `&or=(${orConditions.join(",")})` +
        `&limit=50`;

      const supabaseResponse = await fetch(
        supabaseSearchUrl,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (supabaseResponse.ok) {
        knowledge = await supabaseResponse.json();
      } else {
        const errorText = await supabaseResponse.text();

        console.error(
          "Supabase search error:",
          errorText
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * 2. RANK RESULTS
     * ---------------------------------------------------------
     *
     * Give higher priority to exact topic/title/keyword matches.
     */

    const normalizedQuestion =
      question.trim().toLowerCase();

    knowledge = knowledge
      .map(item => {
        let score = 0;

        const topic =
          String(item.topic || "").toLowerCase();

        const title =
          String(item.section_title || "").toLowerCase();

        const keywords =
          String(item.keywords || "").toLowerCase();

        const content =
          String(item.content || "").toLowerCase();

        if (
          topic &&
          normalizedQuestion.includes(topic)
        ) {
          score += 20;
        }

        if (
          title &&
          normalizedQuestion.includes(title)
        ) {
          score += 15;
        }

        for (const term of searchTerms) {
          const t = term.toLowerCase();

          if (topic.includes(t)) score += 8;
          if (title.includes(t)) score += 6;
          if (keywords.includes(t)) score += 5;
          if (content.includes(t)) score += 1;
        }

        if (item.verified === true) {
          score += 3;
        }

        return {
          ...item,
          _score: score
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 35);

    /*
     * ---------------------------------------------------------
     * 3. BUILD KNOWLEDGE CONTEXT
     * ---------------------------------------------------------
     */

    const knowledgeContext = knowledge
      .map((item, index) => {
        return `
SOURCE ${index + 1}
Topic: ${item.topic || ""}
Section: ${item.section_title || ""}
Source: ${item.source_label || ""}
Verified: ${item.verified ? "Yes" : "No"}

Content:
${item.content || ""}
`;
      })
      .join("\n-------------------------\n");

    /*
     * ---------------------------------------------------------
     * 4. GEMINI PROMPT
     * ---------------------------------------------------------
     */

    const prompt = `
You are "Orthodox Answer" (ኦርቶዶክሳዊ መልስ),
an Ethiopian Orthodox Tewahedo Christian educational
question-answer assistant.

The answer must be based primarily on the Supabase
Orthodox knowledge supplied below.

USER QUESTION:
${question.trim()}

ANSWER LANGUAGE:
${answerLanguage}

SUPABASE KNOWLEDGE:
${knowledgeContext || "No directly matching Supabase knowledge was found."}

IMPORTANT RULES:

1. Answer the question according to Ethiopian Orthodox
   Tewahedo Christian teaching.

2. Give a FULL and WELL-ORGANIZED answer.
   Do not give only 2 or 3 sentences.

3. Prefer this structure when appropriate:

   • መግቢያ
   • ዋና ትምህርት
   • የመጽሐፍ ቅዱስ ማጣቀሻ
   • የቤተክርስቲያን አባቶች/ሊቃውንት ትምህርት
   • የኢትዮጵያ ተዋሕዶ ትውፊት ከሚመለከተው
     ከሆነ
   • ማብራሪያና ምሳሌ
   • መደምደሚያ

   Use only the sections that genuinely fit the question.

4. Make the answer detailed enough for both an ordinary
   reader and a person who wants deeper theological
   understanding.

5. Use the Supabase knowledge as the primary source.
   Do not ignore relevant supplied material.

6. If several Supabase sources are relevant, synthesize
   them instead of mentioning only one.

7. Do NOT invent Bible verses, chapter numbers,
   quotations, Church Fathers, Ethiopian scholars,
   book titles, page numbers, or quotations.

8. A source summary must NOT be presented as a direct
   quotation.

9. If the supplied knowledge identifies a Church Father
   or Ethiopian scholar, explain the teaching accurately
   as a summary unless an exact quotation is provided.

10. When citing Scripture, give the Bible book and
    chapter/verse only when you are confident it is
    correct.

11. Do not fabricate references merely to make the answer
    look scholarly.

12. If the Supabase knowledge does not contain enough
    information for a precise claim, clearly say that
    the available knowledge base does not provide enough
    verified information instead of inventing it.

13. Do not mix unrelated subjects into the answer.

14. If the question is controversial between Orthodox
    Tewahedo and another Christian/religious tradition,
    explain the Ethiopian Orthodox Tewahedo position
    respectfully and clearly.

15. Do not attack Muslims, Protestants, Catholics,
    Jehovah's Witnesses, atheists, or any other group.
    Explain differences in doctrine respectfully.

16. Do not claim that every statement in the supplied
    knowledge is an official dogma. Distinguish between
    Scripture, established Church teaching, canonical/
    liturgical sources, patristic teaching, historical
    tradition, and explanatory material when possible.

17. Do not mention "Supabase", "database", "AI prompt",
    "system prompt", or internal technical details
    in the final answer.

18. Do not say "I searched the database".

19. The final answer must be written entirely in the
    requested language unless a proper name, book title,
    or necessary reference requires another language.

20. Do not unnecessarily repeat the same explanation.

21. Prefer depth and clarity over extreme brevity.

Now produce the best complete answer possible.
`;

    /*
     * ---------------------------------------------------------
     * 5. GEMINI MODELS
     * ---------------------------------------------------------
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
              "x-goog-api-key": geminiKey
            },
            body: JSON.stringify({
              model,
              input: prompt
            })
          }
        );

        const data = await response.json();

        if (
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          console.error(
            `Gemini ${model} temporarily unavailable:`,
            data
          );

          lastError =
            data?.error?.message ||
            `Model ${model} unavailable`;

          continue;
        }

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

        let answer = "";

        /*
         * Standard output
         */
        if (
          typeof data.output_text === "string"
        ) {
          answer = data.output_text.trim();
        }

        /*
         * Backup: outputs
         */
        if (
          !answer &&
          Array.isArray(data.outputs)
        ) {
          answer = data.outputs
            .map(item => {
              if (typeof item === "string") {
                return item;
              }

              if (
                typeof item?.text === "string"
              ) {
                return item.text;
              }

              if (
                Array.isArray(item?.content)
              ) {
                return item.content
                  .map(content =>
                    content?.text || ""
                  )
                  .join("");
              }

              return "";
            })
            .join("")
            .trim();
        }

        /*
         * Backup: steps
         */
        if (
          !answer &&
          Array.isArray(data.steps)
        ) {
          answer = data.steps
            .map(step => {
              if (
                typeof step?.text === "string"
              ) {
                return step.text;
              }

              if (
                Array.isArray(step?.content)
              ) {
                return step.content
                  .map(content =>
                    content?.text || ""
                  )
                  .join("");
              }

              return "";
            })
            .join("")
            .trim();
        }

        if (!answer) {
          lastError =
            "Gemini returned no answer";

          continue;
        }

        /*
         * -----------------------------------------------------
         * 6. RETURN ANSWER
         * -----------------------------------------------------
         */

        return res.status(200).json({
          answer,
          source:
            knowledge.length > 0
              ? "Orthodox Knowledge Base + Gemini AI"
              : "Gemini AI – Orthodox Christian Context",
          language,
          knowledge_count: knowledge.length,
          model
        });

      } catch (modelError) {
        console.error(
          `Error using ${model}:`,
          modelError
        );

        lastError =
          modelError?.message ||
          "Model error";

        continue;
      }
    }

    return res.status(503).json({
      error:
        "Gemini AI is temporarily unavailable. Please try again shortly.",
      details:
        lastError ||
        "All Gemini models were unavailable."
    });

  } catch (error) {
    console.error(
      "Server error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error"
    });
  }
}
