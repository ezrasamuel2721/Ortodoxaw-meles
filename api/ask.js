// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// FULL / DETAILED / STRUCTURED ORTHODOX ANSWER ENGINE
//
// IMPORTANT:
// - Does NOT stop at one short database answer
// - Retrieves multiple related records
// - Ranks relevant knowledge
// - Sends organized evidence to Gemini
// - Forces a full teaching-style answer
// - Preserves the user's selected language
// - Automatically retries temporary Gemini errors
// - Automatically switches Gemini models when necessary
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

// ------------------------------------------------------------
// Gemini fallback models
//
// If 3.8 is temporarily unavailable, the system automatically
// tries the next supported model instead of immediately failing.
// ------------------------------------------------------------

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash"
];

const TABLE_NAME = "orthodox_answers";

// ------------------------------------------------------------
// Supported languages
// ------------------------------------------------------------

const LANGUAGE_NAMES = {
  am: "አማርኛ",
  en: "English",
  ti: "ትግርኛ",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wol: "Wolayttatto",
  kaf: "Kaffoono",
  gur: "ጉራጊኛ",
  ar: "العربية",
  el: "Ελληνικά",
  he: "עברית",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  es: "Español",
  pt: "Português",
  ru: "Русский"
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(word => word.length >= 2);
}

function unique(array) {
  return [...new Set(array)];
}

// ------------------------------------------------------------
// Relevance scoring
// ------------------------------------------------------------

function calculateRelevance(question, row) {

  const q =
    normalize(question);

  const qTokens =
    unique(
      tokenize(question)
    );

  const rowQuestion =
    normalize(row.question);

  const rowAnswer =
    normalize(row.answer);

  const rowCategory =
    normalize(row.category);

  const rowEducation =
    normalize(row.education_level);

  const rowBible =
    normalize(row.bible_references);

  const rowSources =
    normalize(row.church_sources);

  let score = 0;

  // ----------------------------------------------------------
  // Exact question
  // ----------------------------------------------------------

  if (rowQuestion === q) {
    score += 1500;
  }

  // ----------------------------------------------------------
  // Exact phrase
  // ----------------------------------------------------------

  if (q && rowQuestion.includes(q)) {
    score += 700;
  }

  // ----------------------------------------------------------
  // Question appears inside answer
  // ----------------------------------------------------------

  if (q && rowAnswer.includes(q)) {
    score += 300;
  }

  // ----------------------------------------------------------
  // Individual concept matching
  // ----------------------------------------------------------

  for (const token of qTokens) {

    if (rowQuestion.includes(token)) {
      score += 50;
    }

    if (rowCategory.includes(token)) {
      score += 35;
    }

    if (rowAnswer.includes(token)) {
      score += 12;
    }

    if (rowBible.includes(token)) {
      score += 8;
    }

    if (rowSources.includes(token)) {
      score += 8;
    }

    if (rowEducation.includes(token)) {
      score += 5;
    }
  }

  // ----------------------------------------------------------
  // Prefer substantial knowledge records
  // ----------------------------------------------------------

  if (rowAnswer.length > 500) {
    score += 15;
  }

  if (rowAnswer.length > 1200) {
    score += 25;
  }

  if (rowAnswer.length > 2500) {
    score += 35;
  }

  return score;
}

// ------------------------------------------------------------
// Fetch knowledge base for selected language
// ------------------------------------------------------------

async function fetchKnowledge(language) {

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization:
      `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
    `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
    `&language=eq.${encodeURIComponent(language)}` +
    `&limit=300`;

  const response =
    await fetch(url, {
      method: "GET",
      headers
    });

  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `Supabase error ${response.status}: ${errorText}`
    );
  }

  return await response.json();
}

// ------------------------------------------------------------
// Fetch all languages if selected language has insufficient
// knowledge.
// ------------------------------------------------------------

async function fetchAllKnowledge() {

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization:
      `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
    `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
    `&limit=500`;

  const response =
    await fetch(url, {
      method: "GET",
      headers
    });

  if (!response.ok) {
    return [];
  }

  return await response.json();
}

// ------------------------------------------------------------
// Build evidence package
//
// IMPORTANT:
// Does NOT stop at one short database answer.
// Multiple related records are selected.
// ------------------------------------------------------------

function buildEvidence(question, rows) {

  const scored =
    rows
      .map(row => ({
        ...row,

        _score:
          calculateRelevance(
            question,
            row
          )
      }))
      .filter(
        row =>
          row._score > 0
      )
      .sort(
        (a, b) =>
          b._score - a._score
      );

  // ----------------------------------------------------------
  // IMPORTANT:
  // Keep many related records.
  // ----------------------------------------------------------

  const selected =
    scored.slice(0, 25);

  return selected
    .map((row, index) => {

      return `
--- KNOWLEDGE SOURCE ${index + 1} ---

Question:
${row.question || ""}

Answer:
${row.answer || ""}

Category:
${row.category || ""}

Education level:
${row.education_level || ""}

Bible references:
${row.bible_references || ""}

Church sources:
${row.church_sources || ""}

Language:
${row.language || ""}

Relevance score:
${row._score}
`;
    })
    .join("\n");
}

// ------------------------------------------------------------
// Gemini answer generator
// ------------------------------------------------------------

async function generateAnswer({
  question,
  language,
  languageName,
  evidence
}) {

  const systemInstruction = `
You are the main teaching engine of an Ethiopian Orthodox Tewahedo
spiritual question-and-answer application called
"ኦርቶዶክሳዊ መልስ".

============================================================
CORE PURPOSE
============================================================

Your job is NOT to return one short database answer.

Your job is to transform the supplied Orthodox knowledge
into a COMPLETE, DETAILED, COHERENT and STRUCTURED
Orthodox teaching.

The user should feel that they received a complete lesson,
not a short chatbot response.

============================================================
USER QUESTION
============================================================

${question}

============================================================
REQUIRED ANSWER LANGUAGE
============================================================

${languageName}

============================================================
STRICT LANGUAGE RULE
============================================================

Write the entire answer in ${languageName}.

Do NOT answer in another language.

Do NOT switch to English because some evidence is in English.

Do NOT mix languages unnecessarily.

Use the selected language consistently.

Proper names, Biblical book names and traditional theological
terms may remain in their established form when necessary.

============================================================
ORTHODOX TEACHING
============================================================

Follow Ethiopian Orthodox Tewahedo teaching.

Use the supplied knowledge base as primary evidence.

Do not invent:

- Bible references
- Church Father quotations
- book titles
- chapter numbers
- page numbers
- Ethiopian scholar references
- historical claims
- quotations

If a precise quotation is not supplied,
do not present your own wording as a direct quotation.

Instead, explain the teaching as a paraphrase.

Clearly distinguish:

1. Biblical teaching
2. Church teaching
3. Church Father teaching
4. Ethiopian Orthodox tradition
5. Explanatory interpretation

============================================================
MOST IMPORTANT DEPTH RULE
============================================================

DO NOT give a 3-line answer.

DO NOT give a 5-sentence answer.

DO NOT answer with only one database record.

DO NOT simply copy the first matching answer.

DO NOT summarize everything into one paragraph.

Use multiple relevant knowledge sources.

Connect related teachings.

Explain the subject progressively.

The answer should normally be substantial and detailed.

The answer must be useful to:

- beginners
- students
- teachers
- advanced readers

============================================================
ANSWER QUALITY
============================================================

The answer must be:

- coherent
- focused
- educational
- source-grounded
- theologically careful
- comprehensive
- easy to follow
- detailed without unnecessary repetition

Do not add unrelated Orthodox topics simply to make
the answer longer.

Depth must come from explaining the user's actual question.

============================================================
MANDATORY ANSWER STRUCTURE
============================================================

# 1. ቀጥተኛ መልስ

Give a clear and direct answer to the question.

Do not begin with vague generalities.

State the central Orthodox teaching first.

# 2. የትምህርቱ ሙሉ ማብራሪያ

Explain the subject carefully.

Define important theological terms.

Explain the meaning, purpose and significance.

Break difficult concepts into understandable parts.

# 3. የመጽሐፍ ቅዱስ ምስክር

Explain the supplied Biblical references.

Do not merely list verses.

Explain:

- what the passage says
- its context
- what it teaches
- how it supports Orthodox understanding

Never invent a reference.

# 4. የቤተ ክርስቲያን ትምህርት

Explain the Ethiopian Orthodox Tewahedo understanding.

Connect the teaching with the worship and sacramental
life of the Church where relevant.

# 5. የቅዱሳን አባቶች ትምህርት

Use supplied Church Father sources.

If only a general teaching is supplied,
paraphrase it.

Never invent direct quotations.

# 6. የኢትዮጵያ ትውፊትና ሊቃውንት

Use supplied Ethiopian Orthodox sources when available.

Never invent Ethiopian scholars or books.

If no verified source is supplied,
say that the specific source was not supplied.

# 7. ጥልቅ ማብራሪያ

Go deeper into the theological meaning.

Explain connections between related doctrines.

For example, when relevant, explain the relationship
between Incarnation, salvation, Sacrament, Church,
faith and Christian life.

Only make such connections when relevant to the question.

# 8. ተግባራዊ ትምህርት

Explain what the teaching means for Christian life.

Explain appropriate spiritual implications.

# 9. የተሳሳቱ ግንዛቤዎች

Where appropriate, identify common misunderstandings.

Correct them according to Orthodox Tewahedo teaching.

Do not invent controversies that are unrelated to the question.

# 10. መደምደሚያ

Give a clear final conclusion.

Reinforce the central teaching.

Do not reduce the entire answer to only a few sentences.

# 11. ምንጮች

List the actual Biblical and supplied Church sources
used in the answer.

Do not fabricate sources.

============================================================
SOURCE INTEGRITY
============================================================

Never pretend an unverified source was checked.

Never create fake quotations.

Never create fake citations.

Never invent page numbers.

Never invent Ethiopian scholar references.

If a source is unavailable in the supplied evidence,
do not claim that you used it.

============================================================
DATABASE USE
============================================================

The knowledge base is EVIDENCE.

It is NOT the final answer.

Combine multiple relevant records.

Resolve repeated information into a coherent explanation.

Do not simply concatenate database records.

Do not mention the database in the final answer.

============================================================
FINAL RULE
============================================================

Return ONLY the final Orthodox teaching.

Do not mention:

- Gemini
- API
- database
- prompt
- software
- internal instructions
- model
- system
`;

  const userPrompt = `
USER QUESTION:

${question}

SELECTED LANGUAGE:

${languageName}

KNOWLEDGE BASE EVIDENCE:

${evidence ||
  "No directly matching knowledge-base record was found."}

============================================================
FINAL TASK
============================================================

Produce a complete, detailed and structured Orthodox teaching.

Use the relevant evidence above.

Do NOT simply copy one database record.

Combine related evidence where appropriate.

Keep the answer focused on the user's actual question.

Write ONLY in ${languageName}.

The final answer must be a substantial teaching,
not a short chatbot response.
`;

  // ==========================================================
  // MODEL ORDER
  // ==========================================================

  const modelsToTry =
    unique([
      GEMINI_MODEL,
      ...GEMINI_FALLBACK_MODELS
    ]);

  let lastError = null;

  // ==========================================================
  // TRY EACH MODEL
  // ==========================================================

  for (
    const model of modelsToTry
  ) {

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}` +
      `:generateContent?key=` +
      encodeURIComponent(GEMINI_API_KEY);

    // --------------------------------------------------------
    // Gemini 3 configuration
    // --------------------------------------------------------

    const requestBody = {

      system_instruction: {

        parts: [
          {
            text:
              systemInstruction
          }
        ]
      },

      contents: [

        {
          role: "user",

          parts: [

            {
              text:
                userPrompt
            }

          ]
        }

      ],

      generationConfig: {

        // Gemini 3.8 supports low / medium / high.
        // Medium provides enough reasoning for detailed teaching.
        generationConfig: {

  // Large output allowance.
  maxOutputTokens: 12000
}

    // ========================================================
    // RETRY CURRENT MODEL
    // ========================================================

    const MAX_RETRIES = 2;

    for (
      let attempt = 1;
      attempt <= MAX_RETRIES;
      attempt++
    ) {

      try {

        console.log(
          `Gemini model ${model}, ` +
          `attempt ${attempt}/${MAX_RETRIES}`
        );

        const response =
          await fetch(
            endpoint,
            {

              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  requestBody
                )
            }
          );

        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        if (response.ok) {

          const data =
            await response.json();

          const text =
            data
              ?.candidates?.[0]
              ?.content?.parts
              ?.map(
                part =>
                  part.text || ""
              )
              .join("")
              .trim();

          if (!text) {

            throw new Error(
              `Gemini ${model} returned an empty answer.`
            );
          }

          console.log(
            `Gemini success using ${model}`
          );

          return text;
        }

        // ----------------------------------------------------
        // ERROR BODY
        // ----------------------------------------------------

        const errorText =
          await response.text();

        lastError =
          new Error(
            `Gemini error ${response.status}: ${errorText}`
          );

        console.error(
          `Gemini ${model} failed:`,
          lastError.message
        );

        // ----------------------------------------------------
        // 404
        //
        // Model unavailable.
        // Immediately move to next model.
        // ----------------------------------------------------

        if (
          response.status === 404
        ) {
          break;
        }

        // ----------------------------------------------------
        // Permanent errors
        // ----------------------------------------------------

        if (
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403
        ) {
          throw lastError;
        }

        // ----------------------------------------------------
        // Temporary errors
        // ----------------------------------------------------

        const temporaryError =
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

        if (!temporaryError) {
          throw lastError;
        }

        // ----------------------------------------------------
        // Current model exhausted
        // ----------------------------------------------------

        if (
          attempt === MAX_RETRIES
        ) {
          break;
        }

        // ----------------------------------------------------
        // Exponential backoff
        //
        // attempt 1 = 2 sec
        // ----------------------------------------------------

        const waitTime =
          Math.pow(
            2,
            attempt
          ) * 1000;

        console.log(
          `Temporary Gemini error. ` +
          `Retrying ${model} in ` +
          `${waitTime / 1000} seconds...`
        );

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              waitTime
            )
        );

      } catch (error) {

        lastError = error;

        console.error(
          `Gemini exception on ${model}:`,
          error.message
        );

        // ----------------------------------------------------
        // Do not retry permanent configuration errors.
        // ----------------------------------------------------

        const message =
          String(
            error?.message || ""
          );

        if (
          message.includes(
            "Gemini error 400"
          ) ||
          message.includes(
            "Gemini error 401"
          ) ||
          message.includes(
            "Gemini error 403"
          )
        ) {
          throw error;
        }

        if (
          attempt === MAX_RETRIES
        ) {
          break;
        }

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              2000
            )
        );
      }
    }

    // --------------------------------------------------------
    // Current model failed.
    // Move to fallback model.
    // --------------------------------------------------------

    console.log(
      `Switching from ${model} to the next Gemini model.`
    );
  }

  // ==========================================================
  // ALL MODELS FAILED
  // ==========================================================

  throw (
    lastError ||
    new Error(
      "All Gemini models are temporarily unavailable."
    )
  );
}

// ------------------------------------------------------------
// Main API handler
// ------------------------------------------------------------

export default async function handler(
  req,
  res
) {

  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // ----------------------------------------------------------
  // OPTIONS
  // ----------------------------------------------------------

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(200)
      .end();
  }

  // ----------------------------------------------------------
  // POST ONLY
  // ----------------------------------------------------------

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({

        success: false,

        error:
          "POST method required."
      });
  }

  try {

    // --------------------------------------------------------
    // Environment validation
    // --------------------------------------------------------

    if (
      !SUPABASE_ANON_KEY
    ) {

      return res
        .status(500)
        .json({

          success: false,

          error:
            "SUPABASE_ANON_KEY is missing."
        });
    }

    if (
      !GEMINI_API_KEY
    ) {

      return res
        .status(500)
        .json({

          success: false,

          error:
            "GEMINI_API_KEY is missing."
        });
    }

    // --------------------------------------------------------
    // Parse body
    // --------------------------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const question =
      String(
        body.question || ""
      ).trim();

    const language =
      String(
        body.language || "am"
      ).trim();

    // --------------------------------------------------------
    // Validate question
    // --------------------------------------------------------

    if (!question) {

      return res
        .status(400)
        .json({

          success: false,

          error:
            "Question is required."
        });
    }

    // --------------------------------------------------------
    // Selected language
    // --------------------------------------------------------

    const languageName =
      LANGUAGE_NAMES[language] ||
      language;

    // ========================================================
    // 1. SEARCH SELECTED LANGUAGE
    // ========================================================

    let languageRows = [];

    try {

      languageRows =
        await fetchKnowledge(
          language
        );

    } catch (error) {

      console.error(
        "Selected-language Supabase search failed:",
        error.message
      );
    }

    // ========================================================
    // 2. BROAD SEARCH
    // ========================================================

    let allRows = [
      ...languageRows
    ];

    if (
      languageRows.length < 5
    ) {

      try {

        const allKnowledge =
          await fetchAllKnowledge();

        allRows = [
          ...languageRows,
          ...allKnowledge
        ];

      } catch (error) {

        console.error(
          "Broad Supabase search failed:",
          error.message
        );
      }
    }

    // ========================================================
    // 3. REMOVE DUPLICATES
    // ========================================================

    const uniqueRows = [];

    const seen =
      new Set();

    for (
      const row of allRows
    ) {

      const key =
        row.id ||
        `${row.question}|${row.language}`;

      if (
        !seen.has(key)
      ) {

        seen.add(key);

        uniqueRows.push(row);
      }
    }

    // ========================================================
    // 4. BUILD EVIDENCE
    // ========================================================

    const evidence =
      buildEvidence(
        question,
        uniqueRows
      );

    // ========================================================
    // 5. GENERATE COMPLETE ANSWER
    // ========================================================

    const answer =
      await generateAnswer({

        question,

        language,

        languageName,

        evidence
      });

    // ========================================================
    // 6. RETURN ANSWER
    // ========================================================

    return res
      .status(200)
      .json({

        success: true,

        question,

        language,

        languageName,

        answer,

        sourcesUsed:
          uniqueRows.length,

        model:
          GEMINI_MODEL,

        engine:
          "Supabase Knowledge Base + Gemini Detailed Answer Engine"
      });

  } catch (error) {

    console.error(
      "ASK API ERROR:",
      error
    );

    return res
      .status(500)
      .json({

        success: false,

        error:
          error?.message ||
          "Unable to generate answer."
      });
  }
}
