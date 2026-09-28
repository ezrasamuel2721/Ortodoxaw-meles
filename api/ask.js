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
  const q = normalize(question);
  const qTokens = unique(tokenize(question));

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

  // Exact question match
  if (rowQuestion === q) {
    score += 1500;
  }

  // Exact phrase inside stored question
  if (rowQuestion.includes(q)) {
    score += 700;
  }

  // User question appears in answer
  if (rowAnswer.includes(q)) {
    score += 300;
  }

  // Match individual concepts
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

  // Prefer substantial knowledge records
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
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
    `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
    `&language=eq.${encodeURIComponent(language)}` +
    `&limit=300`;

  const response = await fetch(url, {
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
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
    `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
    `&limit=500`;

  const response = await fetch(url, {
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
// ------------------------------------------------------------

function buildEvidence(question, rows) {

  const scored = rows
    .map(row => ({
      ...row,
      _score: calculateRelevance(
        question,
        row
      )
    }))
    .filter(row => row._score > 0)
    .sort(
      (a, b) =>
        b._score - a._score
    );

  // ----------------------------------------------------------
  // IMPORTANT:
  // Do NOT stop at one short database answer.
  // Use many related knowledge records.
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

Your task is NOT to give a short chatbot reply.

Your task is to produce a COMPLETE, DETAILED, ORGANIZED,
SOURCE-GROUNDED Orthodox teaching.

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

Do not answer in another language.

Do not switch to English merely because some source material
is written in English.

Do not mix languages unnecessarily.

Use the selected language consistently throughout the answer.

============================================================
ORTHODOX TEACHING RULE
============================================================

Follow Ethiopian Orthodox Tewahedo teaching.

Use the supplied knowledge base as primary evidence.

Do NOT invent:

- Bible references
- Church Father quotations
- book titles
- chapter numbers
- page numbers
- Ethiopian scholar references
- historical claims
- quotations

If an exact quotation is not supplied,
do not present an invented sentence as a direct quotation.

Instead, explain the teaching in your own words.

Clearly distinguish between:

1. Biblical teaching
2. Church teaching
3. Church Father teaching
4. Ethiopian Orthodox tradition
5. Explanatory interpretation

============================================================
DEPTH REQUIREMENT
============================================================

DO NOT give a 3-line answer.

DO NOT give a 5-sentence answer.

DO NOT summarize the entire subject into one paragraph.

The answer must be a COMPLETE TEACHING.

It should be useful to:

- beginners
- students
- teachers
- advanced readers

The answer should contain substantial paragraphs.

============================================================
MANDATORY ANSWER STRUCTURE
============================================================

# 1. ቀጥተኛ መልስ

Give a clear direct answer to the user's question.

# 2. የትምህርቱ ሙሉ ማብራሪያ

Explain the subject carefully and progressively.

Define important theological terms.

Explain the meaning and purpose of the teaching.

# 3. የመጽሐፍ ቅዱስ ምስክር

Explain the relevant Biblical passages.

Do not merely list references.

Explain what the passages teach and how they support
the Orthodox understanding.

# 4. የቤተ ክርስቲያን ትምህርት

Explain the Ethiopian Orthodox Tewahedo understanding.

Explain how the teaching is understood within the
life and worship of the Church.

# 5. የቅዱሳን አባቶች ትምህርት

Use only supplied Church Father material.

If a precise quotation is not supplied,
paraphrase the teaching.

Never fabricate a direct quotation.

# 6. የኢትዮጵያ ትውፊትና ሊቃውንት

Use supplied Ethiopian Orthodox sources when available.

Never invent a source.

# 7. ጥልቅ ማብራሪያ

Explain difficult theological points step by step.

Connect related concepts where relevant.

Make the explanation understandable to both beginners
and advanced readers.

# 8. ተግባራዊ ትምህርት

Explain what the teaching means for Christian life.

Explain its spiritual significance where appropriate.

# 9. የተሳሳቱ ግንዛቤዎች

Where appropriate, identify common misunderstandings and
correct them according to Orthodox Tewahedo teaching.

# 10. መደምደሚያ

Give a clear and strong conclusion.

Summarize the central teaching without reducing
the whole answer to a short paragraph.

# 11. ምንጮች

List the actual Biblical and supplied Church sources used.

============================================================
SOURCE INTEGRITY
============================================================

Do not pretend that an unverified source was checked.

Do not create fake quotations.

Do not create fake citations.

If the knowledge base does not contain a specific source,
say so naturally rather than inventing it.

============================================================
IMPORTANT
============================================================

Do not simply copy one database record.

Combine relevant knowledge sources when they address
the same subject.

Use the database as evidence, not as a short final answer.

The final response must feel like a complete Orthodox lesson.

Do not mention:

- Gemini
- API
- database
- prompt
- internal instructions
- software implementation

Return ONLY the final answer.
`;

  const userPrompt = `
USER QUESTION:

${question}

SELECTED LANGUAGE:

${languageName}

KNOWLEDGE BASE EVIDENCE:

${evidence || "No directly matching knowledge-base record was found."}

Using the evidence above, produce the complete,
detailed and structured Orthodox teaching.

Do NOT simply repeat one short database record.

Combine related evidence where appropriate.

Keep the answer coherent and focused on the user's question.

Write the final answer ONLY in ${languageName}.
`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}` +
    `:generateContent?key=` +
    encodeURIComponent(GEMINI_API_KEY);

  const requestBody = {

    system_instruction: {
      parts: [
        {
          text: systemInstruction
        }
      ]
    },

    contents: [
      {
        role: "user",

        parts: [
          {
            text: userPrompt
          }
        ]
      }
    ],

    generationConfig: {

      temperature: 0.35,

      topP: 0.9,

      // Large output budget
      maxOutputTokens: 12000
    }
  };

  // ==========================================================
  // GEMINI RETRY SYSTEM
  // ==========================================================

  const MAX_RETRIES = 3;

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_RETRIES;
    attempt++
  ) {

    try {

      console.log(
        `Gemini request attempt ${attempt}/${MAX_RETRIES}`
      );

      const response =
        await fetch(endpoint, {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body:
            JSON.stringify(requestBody)
        });

      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      if (response.ok) {

        const data =
          await response.json();

        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!text) {

          throw new Error(
            "Gemini returned an empty answer."
          );
        }

        return text;
      }

      // ------------------------------------------------------
      // ERROR
      // ------------------------------------------------------

      const errorText =
        await response.text();

      lastError = new Error(
        `Gemini error ${response.status}: ${errorText}`
      );

      console.error(
        `Gemini attempt ${attempt} failed:`,
        lastError.message
      );

      // ------------------------------------------------------
      // Temporary errors that should be retried
      // ------------------------------------------------------

      const shouldRetry =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      // 400 / 401 / 403 / 404 etc.
      // are not temporary retry errors.
      if (!shouldRetry) {
        throw lastError;
      }

      // No attempts remaining
      if (attempt === MAX_RETRIES) {
        break;
      }

      // ------------------------------------------------------
      // Exponential backoff
      //
      // Attempt 1 -> 2 seconds
      // Attempt 2 -> 4 seconds
      // ------------------------------------------------------

      const waitTime =
        Math.pow(2, attempt) * 1000;

      console.log(
        `Gemini temporarily unavailable. ` +
        `Retrying in ${waitTime / 1000} seconds...`
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
        `Gemini exception on attempt ${attempt}:`,
        error.message
      );

      if (
        attempt === MAX_RETRIES
      ) {
        break;
      }

      const waitTime =
        Math.pow(2, attempt) * 1000;

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            waitTime
          )
      );
    }
  }

  // ----------------------------------------------------------
  // All retries failed
  // ----------------------------------------------------------

  throw (
    lastError ||
    new Error(
      "Gemini was temporarily unavailable."
    )
  );
}

// ------------------------------------------------------------
// Main API handler
// ------------------------------------------------------------

export default async function handler(req, res) {

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

  if (req.method === "OPTIONS") {
    return res
      .status(200)
      .end();
  }

  // ----------------------------------------------------------
  // POST ONLY
  // ----------------------------------------------------------

  if (req.method !== "POST") {

    return res
      .status(405)
      .json({
        success: false,
        error: "POST method required."
      });
  }

  try {

    // --------------------------------------------------------
    // Environment validation
    // --------------------------------------------------------

    if (!SUPABASE_ANON_KEY) {

      return res
        .status(500)
        .json({
          success: false,
          error:
            "SUPABASE_ANON_KEY is missing."
        });
    }

    if (!GEMINI_API_KEY) {

      return res
        .status(500)
        .json({
          success: false,
          error:
            "GEMINI_API_KEY is missing."
        });
    }

    // --------------------------------------------------------
    // Parse request body
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

    // --------------------------------------------------------
    // 1. Search selected language
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // 2. Broaden search if selected language is insufficient
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // 3. Remove duplicates
    // --------------------------------------------------------

    const uniqueRows = [];

    const seen = new Set();

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

    // --------------------------------------------------------
    // 4. Build relevant evidence
    // --------------------------------------------------------

    const evidence =
      buildEvidence(
        question,
        uniqueRows
      );

    // --------------------------------------------------------
    // 5. Generate complete detailed answer
    // --------------------------------------------------------

    const answer =
      await generateAnswer({

        question,

        language,

        languageName,

        evidence
      });

    // --------------------------------------------------------
    // 6. Return result
    // --------------------------------------------------------

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
