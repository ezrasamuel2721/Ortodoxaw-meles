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
     * ========================================================
     * 1. PREPARE SEARCH TERMS
     * ========================================================
     */

    const cleanedQuestion = question
      .trim()
      .replace(/[^\p{L}\p{N}\s]/gu, " ");

    const searchTerms = [
      ...new Set(
        cleanedQuestion
          .split(/\s+/)
          .filter(word => word.length >= 2)
          .slice(0, 8)
      )
    ];

    /*
     * ========================================================
     * 2. SEARCH SUPABASE KNOWLEDGE BASE
     * ========================================================
     */

    let knowledge = [];

    const orConditions = [];

    for (const term of searchTerms) {
      const safeTerm = term
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");

      orConditions.push(`topic.ilike.%${safeTerm}%`);
      orConditions.push(`keywords.ilike.%${safeTerm}%`);
      orConditions.push(`section_title.ilike.%${safeTerm}%`);
      orConditions.push(`content.ilike.%${safeTerm}%`);
    }

    if (orConditions.length > 0) {
      const supabaseSearchUrl =
        `${supabaseUrl}/rest/v1/orthodox_source_chunks` +
        `?select=id,source_id,section_title,content,topic,keywords,language,verified,source_label` +
        `&or=(${orConditions.join(",")})` +
        `&limit=40`;

      try {
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
          console.error(
            "Supabase search error:",
            await supabaseResponse.text()
          );
        }
      } catch (error) {
        console.error(
          "Supabase request failed:",
          error
        );
      }
    }

    /*
     * ========================================================
     * 3. RANK SEARCH RESULTS
     * ========================================================
     */

    const normalizedQuestion =
      cleanedQuestion.toLowerCase();

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

        /*
         * Exact phrase matches
         */

        if (
          topic &&
          normalizedQuestion.includes(topic)
        ) {
          score += 30;
        }

        if (
          title &&
          normalizedQuestion.includes(title)
        ) {
          score += 20;
        }

        /*
         * Individual term matches
         */

        for (const term of searchTerms) {
          const t = term.toLowerCase();

          if (topic.includes(t)) {
            score += 10;
          }

          if (title.includes(t)) {
            score += 8;
          }

          if (keywords.includes(t)) {
            score += 6;
          }

          if (content.includes(t)) {
            score += 2;
          }
        }

        /*
         * Verified material
         */

        if (item.verified === true) {
          score += 5;
        }

        /*
         * Requested language
         */

        if (
          item.language &&
          item.language === language
        ) {
          score += 5;
        }

        return {
          ...item,
          _score: score
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 25);

    /*
     * ========================================================
     * 4. BUILD KNOWLEDGE CONTEXT
     * ========================================================
     */

    const knowledgeContext = knowledge
      .map((item, index) => {
        return `
SOURCE ${index + 1}

Topic:
${item.topic || ""}

Section:
${item.section_title || ""}

Source:
${item.source_label || ""}

Language:
${item.language || ""}

Verified:
${item.verified ? "Yes" : "No"}

Content:
${item.content || ""}
`;
      })
      .join("\n-------------------------\n");

    /*
     * ========================================================
     * 5. ORTHODOX ANSWER PROMPT
     * ========================================================
     */

    const prompt = `
You are "Orthodox Answer" (ኦርቶዶክሳዊ መልስ),
an Ethiopian Orthodox Tewahedo Christian educational
question-answer assistant.

USER QUESTION:
${question.trim()}

ANSWER LANGUAGE:
${answerLanguage}

RELEVANT VERIFIED TEACHING MATERIAL:
${knowledgeContext || "No directly matching verified material was found."}

YOUR TASK:

Give the most complete, accurate and educational answer
possible according to Ethiopian Orthodox Tewahedo teaching.

The answer must be written for both:
1. an ordinary Christian reader, and
2. a reader who wants deeper theological understanding.

IMPORTANT RULES:

1. Do not give a short answer when the question requires
   detailed explanation.

2. Explain the subject from its meaning, theological
   significance, biblical foundation, Church teaching,
   historical background and practical meaning when
   the available evidence supports these.

3. For theological questions, use this structure when
   appropriate:

   መግቢያ

   የቃሉ ትርጉም

   ዋና የሥነ መለኮት ትምህርት

   የብሉይ ኪዳን ማስረጃ

   የሐዲስ ኪዳን ማስረጃ

   የሐዋርያት ትምህርት

   የቅዱሳን አበው ትምህርት

   የኢትዮጵያ ሊቃውንት ትምህርት

   የቤተክርስቲያን ሥርዓትና ትውፊት

   ማብራሪያና ምሳሌ

   መደምደሚያ

4. Do not force sections that are unrelated to the
   particular question.

5. Use all relevant supplied teaching material rather
   than relying on only one source.

6. Scripture references must be accurate.

7. Never invent Bible verses, chapter numbers or verse
   numbers.

8. Never invent Church Fathers or Ethiopian scholars.

9. Never invent book titles.

10. Never invent page numbers.

11. Never invent quotations.

12. If the supplied material contains an exact quotation,
    preserve it accurately and identify its source.

13. If the supplied material contains only a summary of
    a Father's or scholar's teaching, present it as a
    summary, NOT as a direct quotation.

14. If a page number is supplied in the source material,
    include it.

15. If a page number is NOT supplied, do not create one.

16. Distinguish clearly, when relevant, between:

    - Holy Scripture
    - Church doctrine
    - liturgical tradition
    - patristic teaching
    - Ethiopian tradition
    - historical information
    - explanatory interpretation

17. If the available material is insufficient to establish
    an exact historical or patristic claim, say so rather
    than inventing information.

18. For major doctrines, explain not only WHAT the Church
    teaches but also WHY it teaches it.

19. For sacramental questions, explain the biblical,
    theological, liturgical and spiritual dimensions when
    supported by the available sources.

20. When Old Testament passages foreshadow a New Testament
    fulfillment, explain the connection clearly when
    supported by the material.

21. Do not mix unrelated subjects into the answer.

22. If comparing Orthodox Tewahedo teaching with another
    religion or Christian denomination, explain the
    difference respectfully and accurately.

23. Do not insult Muslims, Protestants, Catholics,
    Jehovah's Witnesses, atheists, or any other group.

24. Do not claim that every supplied statement is official
    Church dogma. Identify the nature of the teaching when
    the evidence permits.

25. Do not mention:
    Supabase
    database
    AI
    prompt
    system prompt
    API
    software
    internal technical processes

26. The final answer must be entirely in the requested
    language except for necessary proper names, traditional
    book titles and Scripture references.

27. Avoid unnecessary repetition.

28. Prefer accuracy and depth over decorative language.

29. Do not make the answer artificially short.

30. Do not fabricate scholarly citations simply to make
    the answer appear academic.

Now write the final answer.
`;

    /*
     * ========================================================
     * 6. GEMINI GENERATION
     * ========================================================
     *
     * Primary model:
     * gemini-3.8-flash
     *
     * Low thinking level is intentionally used to reduce
     * waiting time while preserving good reasoning.
     */

    const models = [
      "gemini-3.8-flash",
      "gemini-3.5-flash"
    ];

    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey
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
                maxOutputTokens: 10000,

                thinkingConfig: {
                  thinkingLevel: "low"
                }
              }
            })
          }
        );

        const data = await response.json();

        /*
         * ====================================================
         * TEMPORARY CAPACITY ERRORS
         * ====================================================
         */

        if (
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          console.error(
            `Gemini ${model} unavailable:`,
            data
          );

          lastError =
            data?.error?.message ||
            `Gemini ${model} unavailable`;

          continue;
        }

        /*
         * ====================================================
         * OTHER API ERRORS
         * ====================================================
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
         * ====================================================
         * EXTRACT ANSWER
         * ====================================================
         */

        let answer = "";

        if (
          Array.isArray(data.candidates)
        ) {
          answer = data.candidates
            .flatMap(
              candidate =>
                candidate?.content?.parts || []
            )
            .map(
              part =>
                typeof part?.text === "string"
                  ? part.text
                  : ""
            )
            .join("")
            .trim();
        }

        if (!answer) {
          lastError =
            "Gemini returned an empty answer.";

          continue;
        }

        /*
         * ====================================================
         * SUCCESS
         * ====================================================
         */

        return res.status(200).json({
          answer,

          source:
            knowledge.length > 0
              ? "Orthodox Knowledge Base + Gemini AI"
              : "Gemini AI – Orthodox Christian Context",

          language,

          knowledge_count:
            knowledge.length,

          model
        });

      } catch (error) {
        console.error(
          `Gemini ${model} request error:`,
          error
        );

        lastError =
          error?.message ||
          "Gemini request failed";

        continue;
      }
    }

    /*
     * ========================================================
     * 7. SUPABASE FALLBACK
     * ========================================================
     *
     * If Gemini is temporarily unavailable but relevant
     * knowledge exists, do not leave the user with an empty
     * answer.
     */

    if (knowledge.length > 0) {
      const fallbackAnswer = knowledge
        .slice(0, 10)
        .map(item => {
          return `
### ${item.section_title || item.topic || "ትምህርት"}

${item.content || ""}
`;
        })
        .join("\n")
        .trim();

      return res.status(200).json({
        answer: fallbackAnswer,

        source:
          "Orthodox Knowledge Base",

        language,

        knowledge_count:
          knowledge.length,

        model:
          "supabase-fallback"
      });
    }

    /*
     * ========================================================
     * 8. FINAL ERROR
     * ========================================================
     */

    return res.status(503).json({
      error:
        "የመልስ አገልግሎቱ ለጊዜው አልተገኘም። እባክዎ እንደገና ይሞክሩ።",

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
