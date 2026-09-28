// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Stable / Safe / Multilingual / Topic-Coherent
//
// FIXES:
// - Removes unsafe .some() usage
// - Safe arrays everywhere
// - Safe topic matching
// - Safe Supabase response handling
// - Safe Gemini response handling
// - Multilingual language normalization
// - Sidaamu Afoo / Wolaytta / Kafa / Guragie support
// - Supabase fallback
// - Gemini fallback
// - Detailed Orthodox answer structure
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const SUPABASE_TABLE = "orthodox_answers";

const MAX_QUESTION_LENGTH = 3000;
const MAX_ROWS = 300;
const MAX_SELECTED_SOURCES = 10;

// ============================================================
// SUPPORTED LANGUAGES
// ============================================================

const LANGUAGES = {
  am: "Amharic",
  en: "English",
  ti: "Tigrinya",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolaytta",
  kaa: "Kafa",
  gez: "Guragie",
  ar: "Arabic",
  fr: "French",
  de: "German",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian"
};

// ============================================================
// LANGUAGE ALIASES
// ============================================================

const LANGUAGE_ALIASES = {
  amh: "am",
  amharic: "am",

  eng: "en",
  english: "en",

  tir: "ti",
  tigrinya: "ti",

  or: "om",
  orm: "om",
  oromo: "om",
  afaanoromoo: "om",
  afaan_oromoo: "om",

  sid: "sid",
  sidaamu: "sid",
  sidaami: "sid",
  sidaama: "sid",
  sidaamu_afoo: "sid",
  sidaami_afoo: "sid",

  wal: "wal",
  wolaytta: "wal",
  wolaita: "wal",
  wolayta: "wal",
  wolayttatto: "wal",

  kaa: "kaa",
  kafa: "kaa",
  kafaa: "kaa",
  kaficho: "kaa",

  gez: "gez",
  guragie: "gez",
  gurage: "gez",
  guragigna: "gez",
  guragena: "gez",

  ar: "ar",
  ara: "ar",
  arabic: "ar",

  fr: "fr",
  fra: "fr",
  french: "fr",

  de: "de",
  deu: "de",
  german: "de",

  it: "it",
  ita: "it",
  italian: "it",

  es: "es",
  spa: "es",
  spanish: "es",

  pt: "pt",
  por: "pt",
  portuguese: "pt",

  ru: "ru",
  rus: "ru",
  russian: "ru"
};

// ============================================================
// LANGUAGE HELPERS
// ============================================================

function normalizeLanguage(value) {
  const raw = String(value || "am")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (Object.prototype.hasOwnProperty.call(LANGUAGES, raw)) {
    return raw;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      LANGUAGE_ALIASES,
      raw
    )
  ) {
    return LANGUAGE_ALIASES[raw];
  }

  return "am";
}

function languageName(language) {
  const normalized = normalizeLanguage(language);

  return (
    LANGUAGES[normalized] ||
    LANGUAGES.am
  );
}

// ============================================================
// SAFE ARRAY
// ============================================================

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

// ============================================================
// SAFE STRING
// ============================================================

function safeString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}

// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeText(value) {
  return safeString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, " ")
    .replace(
      /[.,!?;:()[\]{}<>/\\|+=*_~^$#@%&-]/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// TOKENIZATION
// ============================================================

function tokenize(value) {
  const text = normalizeText(value);

  if (!text) {
    return [];
  }

  return text
    .split(/\s+/)
    .filter(
      token =>
        token &&
        token.length >= 2
    );
}

// ============================================================
// STOP WORDS
// ============================================================

const STOP_WORDS = new Set([
  "ስለ",
  "ምን",
  "ለምን",
  "እንዴት",
  "ማን",
  "መቼ",
  "የት",
  "ነው",
  "ናት",
  "ናቸው",
  "የሚለው",
  "የሆነ",
  "እንደ",
  "እና",
  "ወይም",
  "ነገር",
  "ስለዚህ",
  "እኔ",
  "እኛ",
  "እርሷ",
  "እርሱ",

  "what",
  "why",
  "how",
  "who",
  "when",
  "where",
  "which",
  "is",
  "are",
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "for",
  "about",
  "does",
  "do",
  "this",
  "that"
]);

// ============================================================
// TOPICS
// ============================================================

const TOPICS = [
  {
    name: "mary",
    keywords: [
      "ማርያም",
      "ማርያ",
      "ድንግል",
      "እመቤታችን",
      "ቅድስት ድንግል",
      "የአምላክ እናት",
      "theotokos",
      "mary",
      "maria",
      "virgin mary",
      "mother of god",
      "ብፅዕት"
    ]
  },

  {
    name: "baptism",
    keywords: [
      "ጥምቀት",
      "መጠመቅ",
      "ተጠመቀ",
      "ሕፃን ጥምቀት",
      "child baptism",
      "infant baptism",
      "baptism",
      "baptize",
      "water baptism",
      "በውሃ",
      "ዮሐንስ መጥምቁ"
    ]
  },

  {
    name: "cross",
    keywords: [
      "መስቀል",
      "የመስቀል",
      "መስቀሉ",
      "cross",
      "crucifixion",
      "ስቅለት",
      "ጎልጎታ"
    ]
  },

  {
    name: "eucharist",
    keywords: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "ቅዱስ ሥጋ",
      "ደሙ",
      "ሥጋው",
      "communion",
      "eucharist",
      "holy communion"
    ]
  },

  {
    name: "faith",
    keywords: [
      "ሃይማኖት",
      "እምነት",
      "ኦርቶዶክስ",
      "ተዋሕዶ",
      "faith",
      "religion",
      "orthodox",
      "tawahido",
      "tewahedo"
    ]
  },

  {
    name: "tabot",
    keywords: [
      "ታቦት",
      "ጽላት",
      "tabot",
      "ark",
      "ark of covenant",
      "ኪዳነ ምሕረት",
      "ታቦተ ጽዮን"
    ]
  },

  {
    name: "trinity",
    keywords: [
      "ሥላሴ",
      "አብ",
      "ወልድ",
      "መንፈስ ቅዱስ",
      "trinity",
      "father son holy spirit"
    ]
  },

  {
    name: "christ",
    keywords: [
      "ኢየሱስ",
      "ክርስቶስ",
      "ጌታ",
      "አዳኝ",
      "jesus",
      "christ",
      "savior",
      "messiah"
    ]
  },

  {
    name: "prayer",
    keywords: [
      "ጸሎት",
      "ጸልይ",
      "መጸለይ",
      "ምልጃ",
      "prayer",
      "pray",
      "intercession"
    ]
  },

  {
    name: "church",
    keywords: [
      "ቤተ ክርስቲያን",
      "ቤተክርስቲያን",
      "church",
      "ቅዱሳን",
      "saints"
    ]
  },

  {
    name: "scripture",
    keywords: [
      "መጽሐፍ ቅዱስ",
      "ቅዱሳት መጻሕፍት",
      "ሃያ ሰባት",
      "ሰማንያ አንድ",
      "bible",
      "scripture",
      "holy scripture"
    ]
  }
];

// ============================================================
// SAFE KEYWORD EXTRACTION
// ============================================================

function topicKeywords(topic) {
  if (
    !topic ||
    typeof topic !== "object"
  ) {
    return [];
  }

  return safeArray(topic.keywords)
    .map(item =>
      normalizeText(item)
    )
    .filter(Boolean);
}

// ============================================================
// TOPIC DETECTION
// ============================================================

function detectTopics(question) {
  const text = normalizeText(question);

  if (!text) {
    return [];
  }

  const found = [];

  for (const topic of safeArray(TOPICS)) {
    const keywords =
      topicKeywords(topic);

    if (keywords.length === 0) {
      continue;
    }

    const matches = [];

    for (const keyword of keywords) {
      if (
        keyword &&
        text.includes(keyword)
      ) {
        matches.push(keyword);
      }
    }

    if (matches.length > 0) {
      found.push({
        name: safeString(topic.name),
        keywords,
        matches
      });
    }
  }

  return found;
}

// ============================================================
// ROW TEXT
// ============================================================

function rowText(row) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return "";
  }

  const values = [
    row.question,
    row.answer,
    row.language,
    row.category,
    row.education_level,
    row.bible_references,
    row.church_sources,
    row.comparison_group
  ];

  return normalizeText(
    values
      .map(safeString)
      .filter(Boolean)
      .join(" ")
  );
}

// ============================================================
// CHECK TOPIC MATCH SAFELY
// ============================================================

function rowMatchesTopic(
  row,
  topic
) {
  const text = rowText(row);

  if (!text) {
    return false;
  }

  const keywords =
    topicKeywords(topic);

  if (keywords.length === 0) {
    return false;
  }

  for (const keyword of keywords) {
    if (
      keyword &&
      text.includes(keyword)
    ) {
      return true;
    }
  }

  return false;
}

// ============================================================
// SCORE ROW
// ============================================================

function scoreRow(
  row,
  question,
  language
) {
  if (
    !row ||
    typeof row !== "object"
  ) {
    return 0;
  }

  const qText =
    normalizeText(question);

  const qTokens =
    tokenize(question);

  const rText =
    rowText(row);

  if (!qText || !rText) {
    return 0;
  }

  let score = 0;

  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  if (
    normalizeLanguage(row.language) ===
    language
  ) {
    score += 30;
  }

  // ----------------------------------------------------------
  // EXACT QUESTION
  // ----------------------------------------------------------

  const rowQuestion =
    normalizeText(row.question);

  if (rowQuestion) {
    if (
      qText === rowQuestion
    ) {
      score += 100;
    }

    if (
      qText.includes(rowQuestion)
    ) {
      score += 60;
    }

    if (
      rowQuestion.includes(qText)
    ) {
      score += 55;
    }
  }

  // ----------------------------------------------------------
  // TOKEN MATCH
  // ----------------------------------------------------------

  for (const token of qTokens) {
    if (
      !token ||
      STOP_WORDS.has(token)
    ) {
      continue;
    }

    if (
      rText.includes(token)
    ) {
      score += 5;
    }
  }

  // ----------------------------------------------------------
  // TOPIC MATCH
  // ----------------------------------------------------------

  const questionTopics =
    detectTopics(question);

  for (
    const topic of safeArray(
      questionTopics
    )
  ) {
    if (
      rowMatchesTopic(
        row,
        topic
      )
    ) {
      score += 40;
    }
  }

  // ----------------------------------------------------------
  // SOURCE QUALITY
  // ----------------------------------------------------------

  if (
    safeString(
      row.bible_references
    ).trim()
  ) {
    score += 5;
  }

  if (
    safeString(
      row.church_sources
    ).trim()
  ) {
    score += 5;
  }

  if (
    safeString(
      row.comparison_group
    ).trim()
  ) {
    score += 2;
  }

  return score;
}

// ============================================================
// SUPABASE LOAD
// ============================================================

async function getLessons() {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is missing"
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is missing"
    );
  }

  const url =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?select=id,created_at,question,answer,language,category,education_level,bible_references,church_sources,comparison_group` +
    `&order=id.asc` +
    `&limit=${MAX_ROWS}`;

  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        apikey:
          SUPABASE_ANON_KEY,

        Authorization:
          `Bearer ${SUPABASE_ANON_KEY}`,

        Accept:
          "application/json"
      }
    });

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${raw}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "Supabase returned invalid JSON"
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Supabase returned non-array data"
    );
  }

  return data;
}

// ============================================================
// SELECT COHERENT ROWS
// ============================================================

function selectCoherentRows(
  ranked,
  question,
  limit
) {
  const safeRanked =
    safeArray(ranked);

  const safeLimit =
    Number.isInteger(limit) &&
    limit > 0
      ? limit
      : MAX_SELECTED_SOURCES;

  const topics =
    detectTopics(question);

  // ----------------------------------------------------------
  // NO DETECTED TOPIC
  // ----------------------------------------------------------

  if (topics.length === 0) {
    return safeRanked
      .slice(0, safeLimit)
      .map(item =>
        item &&
        item.row
          ? item.row
          : null
      )
      .filter(Boolean);
  }

  // ----------------------------------------------------------
  // TOPIC + GENERAL
  // ----------------------------------------------------------

  const topicRows = [];
  const generalRows = [];

  for (
    const item of safeRanked
  ) {
    if (
      !item ||
      !item.row
    ) {
      continue;
    }

    let belongs = false;

    for (
      const topic of topics
    ) {
      if (
        rowMatchesTopic(
          item.row,
          topic
        )
      ) {
        belongs = true;
        break;
      }
    }

    if (belongs) {
      topicRows.push(item);
    } else {
      generalRows.push(item);
    }
  }

  return [
    ...topicRows,
    ...generalRows
  ]
    .slice(0, safeLimit)
    .map(item =>
      item && item.row
        ? item.row
        : null
    )
    .filter(Boolean);
}

// ============================================================
// BUILD SOURCES
// ============================================================

function buildSources(
  rows,
  limit
) {
  const safeRows =
    safeArray(rows);

  const safeLimit =
    Number.isInteger(limit) &&
    limit > 0
      ? limit
      : MAX_SELECTED_SOURCES;

  return safeRows
    .slice(0, safeLimit)
    .filter(Boolean)
    .map(row => ({
      question:
        safeString(row.question),

      answer:
        safeString(row.answer),

      language:
        normalizeLanguage(
          row.language
        ),

      category:
        safeString(
          row.category
        ),

      education_level:
        safeString(
          row.education_level
        ),

      bible_references:
        safeString(
          row.bible_references
        ),

      church_sources:
        safeString(
          row.church_sources
        ),

      comparison_group:
        safeString(
          row.comparison_group
        )
    }));
}

// ============================================================
// FORMAT SOURCES
// ============================================================

function formatSources(
  sources
) {
  const safeSources =
    safeArray(sources);

  if (
    safeSources.length === 0
  ) {
    return (
      "No direct knowledge-base " +
      "entries matched."
    );
  }

  return safeSources
    .map(
      (source, index) => `
SOURCE ${index + 1}

Question:
${safeString(source.question)}

Answer:
${safeString(source.answer)}

Language:
${safeString(source.language)}

Category:
${safeString(source.category)}

Education level:
${safeString(source.education_level)}

Bible references:
${safeString(source.bible_references)}

Church sources:
${safeString(source.church_sources)}

Comparison:
${safeString(source.comparison_group)}
`
    )
    .join(
      "\n-------------------------\n"
    );
}

// ============================================================
// GEMINI SYSTEM INSTRUCTION
// ============================================================

function buildSystemInstruction(
  language
) {
  const lang =
    languageName(language);

  return `
You are the primary theological answer engine
for the application "ኦርቶዶክሳዊ መልስ".

Your task is to answer spiritual and theological
questions according to Orthodox Christian theology
and especially the Ethiopian Orthodox Tewahedo
tradition.

TARGET OUTPUT LANGUAGE:
${lang}

LANGUAGE RULE:
The complete answer must be written in ${lang}.

Do not randomly switch to English or Amharic.

The user's selected language has priority.

KNOWLEDGE BASE:
The supplied Supabase knowledge-base material is
the primary source context.

Use it carefully.

Do not combine unrelated subjects.

If the question is about Mary, stay focused on Mary.

If the question is about baptism, stay focused
on baptism.

If the question is about the Cross, stay focused
on the Cross.

Only introduce another subject when it is directly
necessary to explain the requested topic.

THEOLOGICAL ACCURACY:
Do not invent Bible references.

Do not invent Church Father quotations.

Do not invent Ethiopian scholar quotations.

Do not pretend that a source says something unless
the supplied context supports it.

If a precise citation is unavailable, explain the
teaching without fabricating a citation.

ANSWER STRUCTURE:

1. Direct Answer
Answer the exact question immediately.

2. Meaning and Definition
Explain the subject clearly.

3. Biblical Foundation
Give relevant biblical teaching and references
only when reasonably supported.

4. Orthodox Teaching
Explain the teaching according to Orthodox theology.

5. Ethiopian Orthodox Tewahedo Tradition
Explain the Ethiopian Orthodox perspective when
relevant.

6. Church Fathers and Orthodox Sources
Use them only when supported by the context.

7. Comparison
If the question asks for comparison, explain
differences respectfully with relevant traditions.

Do not insult or attack other religions.

8. Practical / Spiritual Meaning
Explain the spiritual significance for Christian life.

9. Conclusion
Finish with a clear theological conclusion.

STYLE:
- Detailed
- Structured
- Educational
- Respectful
- Coherent
- Source-grounded
- Not a three-line answer
- No unrelated topic mixing

The answer should be useful to a beginner,
student, teacher, or researcher.
`;
}

// ============================================================
// GEMINI USER PROMPT
// ============================================================

function buildUserPrompt(
  question,
  language,
  sources
) {
  return `
USER QUESTION:

${question}

TARGET LANGUAGE:

${languageName(language)}

KNOWLEDGE BASE:

${formatSources(sources)}

INSTRUCTIONS:

Answer the exact user question.

Write the complete answer in
${languageName(language)}.

Use the knowledge base as grounding.

Keep the answer focused on the requested subject.

Do not merge unrelated subjects.

Provide a substantial and well-organized Orthodox
Christian explanation.

Where relevant include:
- direct answer
- definition
- Bible
- Orthodox teaching
- Ethiopian Orthodox Tewahedo tradition
- Church Fathers / Orthodox sources
- comparison
- spiritual application
- conclusion

Do not fabricate quotations or references.
`;
}

// ============================================================
// GEMINI MODEL CANDIDATES
// ============================================================

function getModelCandidates() {
  const candidates = [
    GEMINI_MODEL,
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ];

  const result = [];

  for (
    const model of candidates
  ) {
    const clean =
      safeString(model).trim();

    if (
      clean &&
      !result.includes(clean)
    ) {
      result.push(clean);
    }
  }

  return result;
}

// ============================================================
// GEMINI CALL
// ============================================================

async function callGemini(
  model,
  systemInstruction,
  userPrompt
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing"
    );
  }

  const cleanModel =
    safeString(model).trim();

  if (!cleanModel) {
    throw new Error(
      "Gemini model is empty"
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(cleanModel)}` +
    `:generateContent`;

  const response =
    await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

        "x-goog-api-key":
          GEMINI_API_KEY
      },

      body: JSON.stringify({
        systemInstruction: {
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
          temperature: 0.2,
          topP: 0.85,
          maxOutputTokens: 5000
        }
      })
    });

  const raw =
    await response.text();

  let data = null;

  try {
    data =
      JSON.parse(raw);
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    const message =
      data &&
      data.error &&
      data.error.message
        ? data.error.message
        : raw ||
          `HTTP ${response.status}`;

    throw new Error(
      `Gemini ${response.status}: ${message}`
    );
  }

  const candidates =
    data &&
    Array.isArray(
      data.candidates
    )
      ? data.candidates
      : [];

  if (
    candidates.length === 0
  ) {
    throw new Error(
      "Gemini returned no candidates"
    );
  }

  const first =
    candidates[0];

  const content =
    first &&
    first.content
      ? first.content
      : null;

  const parts =
    content &&
    Array.isArray(
      content.parts
    )
      ? content.parts
      : [];

  const texts = [];

  for (
    const part of parts
  ) {
    if (
      part &&
      typeof part.text === "string" &&
      part.text.trim()
    ) {
      texts.push(
        part.text.trim()
      );
    }
  }

  const answer =
    texts.join("\n").trim();

  if (!answer) {
    throw new Error(
      "Gemini returned empty text"
    );
  }

  return answer;
}

// ============================================================
// GENERATE WITH GEMINI
// ============================================================

async function generateWithGemini(
  question,
  language,
  sources
) {
  const systemInstruction =
    buildSystemInstruction(
      language
    );

  const userPrompt =
    buildUserPrompt(
      question,
      language,
      sources
    );

  let lastError = null;

  const models =
    getModelCandidates();

  for (
    const model of models
  ) {
    try {
      console.log(
        `Trying Gemini model: ${model}`
      );

      const answer =
        await callGemini(
          model,
          systemInstruction,
          userPrompt
        );

      if (
        answer &&
        answer.trim()
      ) {
        return answer.trim();
      }

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini model ${model} failed:`,
        error &&
        error.message
          ? error.message
          : error
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini models failed"
    )
  );
}

// ============================================================
// DATABASE FALLBACK
// ============================================================

function fallbackAnswer(
  rows,
  language
) {
  const safeRows =
    safeArray(rows);

  if (
    safeRows.length === 0
  ) {
    return "";
  }

  const exactLanguageRows =
    safeRows.filter(
      row =>
        normalizeLanguage(
          row &&
          row.language
        ) === language
    );

  const usableRows =
    exactLanguageRows.length > 0
      ? exactLanguageRows
      : safeRows;

  const answers = [];

  for (
    const row of usableRows.slice(0, 3)
  ) {
    const answer =
      safeString(
        row &&
        row.answer
      ).trim();

    if (answer) {
      answers.push(answer);
    }
  }

  return answers
    .join("\n\n")
    .trim();
}

// ============================================================
// REQUEST BODY
// ============================================================

function getBody(req) {
  if (
    req &&
    req.body &&
    typeof req.body === "object" &&
    !Array.isArray(req.body)
  ) {
    return req.body;
  }

  return {};
}

// ============================================================
// MAIN HANDLER
// ============================================================

module.exports =
  async function handler(
    req,
    res
  ) {

    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

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
      "Content-Type"
    );

    // --------------------------------------------------------
    // OPTIONS
    // --------------------------------------------------------

    if (
      req.method === "OPTIONS"
    ) {
      return res
        .status(204)
        .end();
    }

    // --------------------------------------------------------
    // METHOD
    // --------------------------------------------------------

    if (
      req.method !== "POST"
    ) {
      return res
        .status(405)
        .json({
          error:
            "Method not allowed."
        });
    }

    try {

      // ------------------------------------------------------
      // BODY
      // ------------------------------------------------------

      const body =
        getBody(req);

      const question =
        safeString(
          body.question
        ).trim();

      const language =
        normalizeLanguage(
          body.language ||
          "am"
        );

      // ------------------------------------------------------
      // VALIDATION
      // ------------------------------------------------------

      if (!question) {
        return res
          .status(400)
          .json({
            error:
              "እባክዎ ጥያቄ ያስገቡ።"
          });
      }

      if (
        question.length >
        MAX_QUESTION_LENGTH
      ) {
        return res
          .status(400)
          .json({
            error:
              "ጥያቄው በጣም ረጅም ነው።"
          });
      }

      // ------------------------------------------------------
      // LOAD SUPABASE
      // ------------------------------------------------------

      let loadedRows = [];

      try {

        loadedRows =
          await getLessons();

        console.log(
          `Supabase rows loaded: ${loadedRows.length}`
        );

      } catch (
        supabaseError
      ) {

        console.error(
          "Supabase load failed:",
          supabaseError &&
          supabaseError.message
            ? supabaseError.message
            : supabaseError
        );

        loadedRows = [];
      }

      // ------------------------------------------------------
      // SAFE ROWS
      // ------------------------------------------------------

      const rows =
        safeArray(
          loadedRows
        );

      // ------------------------------------------------------
      // RANK
      // ------------------------------------------------------

      const ranked = [];

      for (
        const row of rows
      ) {

        if (
          !row ||
          typeof row !== "object"
        ) {
          continue;
        }

        const score =
          scoreRow(
            row,
            question,
            language
          );

        if (
          Number.isFinite(score) &&
          score > 0
        ) {
          ranked.push({
            row,
            score
          });
        }
      }

      ranked.sort(
        (a, b) =>
          b.score - a.score
      );

      // ------------------------------------------------------
      // COHERENT ROWS
      // ------------------------------------------------------

      const coherentRows =
        selectCoherentRows(
          ranked,
          question,
          MAX_SELECTED_SOURCES
        );

      // ------------------------------------------------------
      // SOURCES
      // ------------------------------------------------------

      const selected =
        buildSources(
          coherentRows,
          MAX_SELECTED_SOURCES
        );

      // ------------------------------------------------------
      // GENERATE
      // ------------------------------------------------------

      let answer = "";

      let generationUsed =
        false;

      // ------------------------------------------------------
      // GEMINI
      // ------------------------------------------------------

      if (
        GEMINI_API_KEY.trim()
      ) {

        try {

          answer =
            await generateWithGemini(
              question,
              language,
              selected
            );

          generationUsed =
            true;

        } catch (
          geminiError
        ) {

          console.error(
            "Gemini failed:",
            geminiError &&
            geminiError.message
              ? geminiError.message
              : geminiError
          );

          answer =
            fallbackAnswer(
              coherentRows,
              language
            );
        }

      } else {

        console.warn(
          "GEMINI_API_KEY is missing. Using Supabase fallback."
        );

        answer =
          fallbackAnswer(
            coherentRows,
            language
          );
      }

      // ------------------------------------------------------
      // NO ANSWER
      // ------------------------------------------------------

      if (
        !answer ||
        !answer.trim()
      ) {

        return res
          .status(503)
          .json({
            error:
              "የተጠየቀውን ጥያቄ ለማስተናገድ በቂ የመረጃ ምንጭ አልተገኘም።",

            language,

            languageName:
              languageName(
                language
              ),

            generationUsed:
              false,

            sources:
              selected
          });
      }

      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      return res
        .status(200)
        .json({
          answer:
            answer.trim(),

          language,

          languageName:
            languageName(
              language
            ),

          generationUsed,

          sources:
            selected
        });

    } catch (
      error
    ) {

      // ------------------------------------------------------
      // INTERNAL ERROR
      // ------------------------------------------------------

      console.error(
        "/api/ask internal error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "የሰርቨር ስህተት አጋጥሟል",

          errorMessage:
            error &&
            error.message
              ? error.message
              : "Unknown server error"
        });
    }
  };
