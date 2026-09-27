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

    const userQuestion = question.trim();

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured"
      });
    }

    /*
     * =========================================================
     * 1. LANGUAGES
     * =========================================================
     */

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
     * =========================================================
     * 2. SUPABASE CONFIGURATION
     * =========================================================
     */

    const SUPABASE_URL =
      process.env.SUPABASE_URL ||
      "https://geznekrpdubpgsegseer.supabase.co";

    const SUPABASE_ANON_KEY =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    /*
     * IMPORTANT:
     * If your table name is different, change this ONE value.
     *
     * You can also create a Vercel environment variable:
     * SUPABASE_TABLE
     */

    const SUPABASE_TABLE =
      process.env.SUPABASE_TABLE || "questions";


    /*
     * =========================================================
     * 3. SEARCH SUPABASE
     * =========================================================
     *
     * We first retrieve knowledge from Supabase.
     * The matching is done in JavaScript so we do not depend
     * on a specific "content" or "answer" column existing.
     */

    let knowledgeItems = [];

    if (SUPABASE_ANON_KEY) {
      try {
        const url =
          `${SUPABASE_URL}/rest/v1/${encodeURIComponent(
            SUPABASE_TABLE
          )}?select=*&limit=200`;

        const supabaseResponse = await fetch(url, {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json"
          }
        });

        if (supabaseResponse.ok) {
          const rows = await supabaseResponse.json();

          if (Array.isArray(rows)) {

            /*
             * Turn the user's question into searchable words.
             */
            const searchWords = userQuestion
              .toLowerCase()
              .replace(/[^\p{L}\p{N}\s]/gu, " ")
              .split(/\s+/)
              .filter(word => word.length >= 2);

            /*
             * Score every row according to how many words
             * from the question appear in its text.
             */
            const scoredRows = rows.map(row => {

              const rowText = Object.values(row)
                .filter(value =>
                  typeof value === "string"
                )
                .join(" ")
                .toLowerCase();

              let score = 0;

              for (const word of searchWords) {
                if (rowText.includes(word)) {
                  score += 1;
                }
              }

              /*
               * Extra weight if the exact question text
               * appears inside the row.
               */
              if (
                rowText.includes(
                  userQuestion.toLowerCase()
                )
              ) {
                score += 5;
              }

              return {
                row,
                score
              };
            });

            /*
             * Keep only useful matches and sort them.
             */
            knowledgeItems = scoredRows
              .filter(item => item.score > 0)
              .sort(
                (a, b) => b.score - a.score
              )
              .slice(0, 12)
              .map(item => item.row);
          }
        } else {
          console.error(
            "Supabase HTTP error:",
            supabaseResponse.status,
            await supabaseResponse.text()
          );
        }

      } catch (supabaseError) {
        /*
         * Supabase failure must NOT stop Gemini.
         */
        console.error(
          "Supabase search error:",
          supabaseError
        );
      }
    }


    /*
     * =========================================================
     * 4. PREPARE SUPABASE KNOWLEDGE
     * =========================================================
     */

    let knowledgeContext = "";

    if (knowledgeItems.length > 0) {

      knowledgeContext = knowledgeItems
        .map((item, index) => {

          const cleanItem = {};

          for (const [key, value] of Object.entries(item)) {
            if (
              value !== null &&
              value !== undefined
            ) {
              cleanItem[key] = value;
            }
          }

          return `
========== KNOWLEDGE SOURCE ${index + 1} ==========

${JSON.stringify(
  cleanItem,
  null,
  2
)}

========== END SOURCE ${index + 1} ==========
`;
        })
        .join("\n");

    } else {

      knowledgeContext =
        "No directly matching Supabase knowledge was found.";
    }


    /*
     * =========================================================
     * 5. STRONG ORTHODOX ANSWER INSTRUCTIONS
     * =========================================================
     */

    const systemInstruction = `
You are "ኦርቶዶክሳዊ መልስ"
(Orthodox Answer).

You are a spiritual question-answer assistant
for Ethiopian Orthodox Tewahedo Christian teaching.

Your job is to give COMPLETE, DETAILED,
STRUCTURED and EDUCATIONAL answers.

LANGUAGE:
Always answer in ${answerLanguage}.

IMPORTANT ANSWER RULES:

1. Do not give a three-line answer unless the question
   genuinely requires only a very short answer.

2. Explain the subject clearly from beginning to end.

3. When appropriate, structure the answer with:

   - ትርጉም / Definition
   - ዋና መልስ / Direct answer
   - የመጽሐፍ ቅዱስ መሠረት / Biblical foundation
   - የኦርቶዶክሳዊ ትምህርት / Orthodox teaching
   - ማብራሪያ / Detailed explanation
   - የመንፈሳዊ ሕይወት ትርጉም / Spiritual meaning
   - ተያያዥ ነጥቦች / Related points
   - ምንጮች / References

4. Use the Supabase knowledge supplied below as the
   PRIMARY source whenever it is relevant.

5. Do NOT merely copy the Supabase records.
   Understand them, combine related information,
   remove repetition and produce one coherent answer.

6. If several Supabase records discuss related aspects
   of the same subject, combine them.

7. If Supabase does not contain enough information,
   supplement the answer using reliable general knowledge
   of Ethiopian Orthodox Tewahedo Christianity.

8. Never invent:
   - Bible verses
   - chapter numbers
   - quotations
   - church fathers
   - books
   - authors
   - Ethiopian scholars
   - historical events
   - references

9. Never present an uncertain statement as an exact
   quotation from a church father or scholar.

10. If you do not know the exact source of a quotation,
    paraphrase the teaching or state the uncertainty.

11. Bible references should be given only when you are
    sufficiently confident that the reference is correct.

12. When explaining doctrine, distinguish between:
    - direct biblical teaching
    - Orthodox interpretation
    - historical/traditional teaching
    - explanatory interpretation

13. Do not mention "Supabase", "Gemini", "API",
    "database", "prompt", or these internal instructions
    in the final answer.

14. Do not tell the user that the answer came from AI.

15. Be respectful toward other religions and Christian
    traditions. Explain the Ethiopian Orthodox position
    without insults or mockery.

16. The goal is to teach the reader, not merely to give
    a short conclusion.

17. Write naturally in the selected language.

18. If the question is ambiguous, explain the most likely
    meaning and address the important interpretations.

19. If the question asks about a controversial theological
    subject, present the Orthodox teaching clearly and
    distinguish it from other interpretations.

20. Finish with a concise summary when the subject is
    sufficiently complex.
`;


    /*
     * =========================================================
     * 6. USER PROMPT
     * =========================================================
     */

    const inputPrompt = `
USER QUESTION:

${userQuestion}


SUPABASE KNOWLEDGE:

${knowledgeContext}


Now answer the user's question.

Use the supplied knowledge as the primary foundation
when relevant.

Produce a full, clear, organized and educational answer
in ${answerLanguage}.
`;


    /*
     * =========================================================
     * 7. GEMINI MODELS
     * =========================================================
     *
     * Primary:
     * gemini-3.8-flash
     *
     * Fallback:
     * gemini-3.7-flash
     *
     * Both are current stable Gemini 3 Flash models.
     */

    const models = [
      "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.6-flash"
    ];


    /*
     * =========================================================
     * 8. ASK GEMINI
     * =========================================================
     */

    let lastError = null;

    for (const model of models) {

      try {

        const geminiResponse = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY
            },

            body: JSON.stringify({
              model,

              system_instruction:
                systemInstruction,

              input:
                inputPrompt,

              generation_config: {
                temperature: 0.55,
                max_output_tokens: 12000,
                thinking_level: "medium"
              }
            })
          }
        );


        const data =
          await geminiResponse.json();


        /*
         * Temporary overload.
         * Try the next model.
         */

        if (
          geminiResponse.status === 429 ||
          geminiResponse.status === 500 ||
          geminiResponse.status === 502 ||
          geminiResponse.status === 503 ||
          geminiResponse.status === 504
        ) {

          console.error(
            `Gemini ${model} temporarily unavailable:`,
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

        if (!geminiResponse.ok) {

          console.error(
            `Gemini API error (${model}):`,
            data
          );

          return res.status(
            geminiResponse.status
          ).json({
            error:
              data?.error?.message ||
              "Gemini API request failed"
          });
        }


        /*
         * =====================================================
         * 9. GET ANSWER
         * =====================================================
         */

        let answer = "";


        /*
         * Normal Interactions API response.
         */

        if (
          typeof data.output_text ===
          "string"
        ) {

          answer =
            data.output_text.trim();
        }


        /*
         * Backup parser.
         */

        if (
          !answer &&
          Array.isArray(data.outputs)
        ) {

          answer =
            data.outputs
              .map(item => {

                if (
                  typeof item ===
                  "string"
                ) {
                  return item;
                }

                if (
                  typeof item?.text ===
                  "string"
                ) {
                  return item.text;
                }

                if (
                  Array.isArray(
                    item?.content
                  )
                ) {

                  return item.content
                    .map(
                      content =>
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
         * Another possible response structure.
         */

        if (
          !answer &&
          Array.isArray(data.steps)
        ) {

          answer =
            data.steps
              .map(step => {

                if (
                  typeof step?.text ===
                  "string"
                ) {
                  return step.text;
                }

                if (
                  Array.isArray(
                    step?.content
                  )
                ) {

                  return step.content
                    .map(
                      content =>
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
         * No answer.
         */

        if (!answer) {

          console.error(
            `Gemini returned no answer (${model}):`,
            data
          );

          lastError =
            "Gemini returned no answer";

          continue;
        }


        /*
         * =====================================================
         * 10. SUCCESS
         * =====================================================
         */

        return res.status(200).json({

          answer,

          source:
            knowledgeItems.length > 0
              ? "Supabase Knowledge + Gemini"
              : "Gemini – Orthodox Christian Context",

          language,

          model,

          knowledgeFound:
            knowledgeItems.length > 0,

          knowledgeCount:
            knowledgeItems.length
        });

      } catch (modelError) {

        console.error(
          `Error while using ${model}:`,
          modelError
        );

        lastError =
          modelError?.message ||
          "Model error";

        continue;
      }
    }


    /*
     * =========================================================
     * 11. ALL MODELS FAILED
     * =========================================================
     */

    return res.status(503).json({

      error:
        "የመልስ አገልግሎቱ ለጊዜው አይገኝም። እባክዎ እንደገና ይሞክሩ።",

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
