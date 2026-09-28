// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Detailed / Structured / Topic-Coherent Orthodox Answer Engine
//
// FIXED:
// - topic.matches / topic.keywords mismatch
// - safe Array handling
// - multilingual language normalization
// - Supabase failure fallback
// - Gemini failure fallback
// - safer request validation
// - detailed source-grounded prompting
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-1.5-flash";

const SUPABASE_TABLE = "orthodox_answers";

const MAX_QUESTION_LENGTH = 3000;

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

const LANGUAGE_ALIASES = {
  amh: "am",
  amharic: "am",

  eng: "en",
  english: "en",

  tir: "ti",
  tigrinya: "ti",

  or: "om",
  oromo: "om",
  afaan_oromoo: "om",

  sidaamu: "sid",
  sidaamu_afoo: "sid",
  sidaami: "sid",
  sidaama: "sid",

  wolaytta: "wal",
  wolaita: "wal",
  wolayttatto: "wal",
  wolayta: "wal",

  kafa: "kaa",
  kaficho: "kaa",
  kafaa: "kaa",

  guragie: "gez",
  gurage: "gez",
  guragigna: "gez",
  guragena: "gez",
  "ጉራጊኛ": "gez",

  arabic: "ar",
  ara: "ar",

  french: "fr",
  fra: "fr",

  german: "de",
  deu: "de",

  italian: "it",
  ita: "it",

  spanish: "es",
  spa: "es",

  portuguese: "pt",
  por: "pt",

  russian: "ru",
  rus: "ru"
};

// ============================================================
// LANGUAGE HELPERS
// ============================================================

function normalizeLanguage(value) {
  const raw = String(value || "am")
    .trim()
    .toLowerCase();

  if (LANGUAGES[raw]) {
    return raw;
  }

  if (LANGUAGE_ALIASES[raw]) {
    return LANGUAGE_ALIASES[raw];
  }

  return "am";
}

function languageName(language) {
  return LANGUAGES[language] || LANGUAGES.am;
}

// ============================================================
// TEXT HELPERS
// ============================================================

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, " ")
    .replace(/[.,!?;:()[\]{}<>/\\|+=*_~^$#@%&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const text = normalizeText(value);

  if (!text) {
    return [];
  }

  return text
    .split(/\s+/)
    .filter(token => token.length >= 2);
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
  "do"
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
      "baptism",
      "baptize",
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
      "tawahido"
    ]
  },

  {
    name: "tabot",
    keywords: [
      "ታቦት",
      "ጽላት",
      "tabot",
      "ark",
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
// TOPIC DETECTION
// ============================================================

function detectTopics(question) {
  const text = normalizeText(question);
  const found = [];

  for (const topic of TOPICS) {
    const keywords = Array.isArray(topic?.keywords)
      ? topic.keywords
      : [];

    const matches = keywords.filter(keyword =>
      text.includes(normalizeText(keyword))
    );

    if (matches.length > 0) {
      found.push({
        name: topic.name,
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
  if (!row || typeof row !== "object") {
    return "";
  }

  return normalizeText(
    [
      row.question,
      row.answer,
      row.language,
      row.category,
      row.education_level,
      row.bible_references,
      row.church_sources,
      row.comparison_group
    ]
      .filter(Boolean)
      .join(" ")
  );
}

// ============================================================
// ROW SCORING
// ============================================================

function scoreRow(row, question, language) {
  if (!row || typeof row !== "object") {
    return 0;
  }

  const qText = normalizeText(question);
  const qTokens = tokenize(question);
  const rText = rowText(row);

  if (!rText) {
    return 0;
  }

  let score = 0;

  // ----------------------------------------------------------
  // Language match
  // ----------------------------------------------------------

  if (normalizeLanguage(row.language) === language) {
    score += 18;
  }

  // ----------------------------------------------------------
  // Exact / partial question match
  // ----------------------------------------------------------

  const rowQuestion = normalizeText(row.question);

  if (rowQuestion && qText.includes(rowQuestion)) {
    score += 50;
  }

  if (rowQuestion && rowQuestion.includes(qText)) {
    score += 45;
  }

  // ----------------------------------------------------------
  // Token match
  // ----------------------------------------------------------

  for (const token of qTokens) {
    if (STOP_WORDS.has(token)) {
      continue;
    }

    if (rText.includes(token)) {
      score += 4;
    }
  }

  // ----------------------------------------------------------
  // Topic match
  // ----------------------------------------------------------

  const questionTopics = detectTopics(question);

  for (const topic of questionTopics) {
    const keywords = Array.isArray(topic?.keywords)
      ? topic.keywords
      : [];

    if (
      keywords.some(keyword =>
        rText.includes(normalizeText(keyword))
      )
    ) {
      score += 35;
    }
  }

  // ----------------------------------------------------------
  // Source quality bonus
  // ----------------------------------------------------------

  if (row.bible_references) {
    score += 3;
  }

  if (row.church_sources) {
    score += 3;
  }

  if (row.comparison_group) {
    score += 2;
  }

  return score;
}

// ============================================================
// SUPABASE LOAD
// ============================================================

async function getLessons() {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is missing");
  }

  const url =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?select=id,created_at,question,answer,language,category,education_level,bible_references,church_sources,comparison_group` +
    `&order=id.asc&limit=300`;

  const response = await fetch(url, {
    method: "GET",

    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Supabase ${response.status}: ${body}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Supabase returned invalid data");
  }

  return data;
}

// ============================================================
// COHERENT ROW SELECTION
// ============================================================

function selectCoherentRows(ranked, question, limit) {
  if (!Array.isArray(ranked)) {
    return [];
  }

  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : 10;

  const topics = detectTopics(question);

  if (topics.length === 0) {
    return ranked
      .slice(0, safeLimit)
      .map(item => item?.row)
      .filter(Boolean);
  }

  const topicRows = [];
  const generalRows = [];

  for (const item of ranked) {
    if (!item || !item.row) {
      continue;
    }

    const text = rowText(item.row);

    const belongs = topics.some(topic => {
      const matches = Array.isArray(topic?.matches)
        ? topic.matches
        : [];

      return matches.some(keyword =>
        text.includes(normalizeText(keyword))
      );
    });

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
    .map(item => item?.row)
    .filter(Boolean);
}

// ============================================================
// SOURCE BUILDING
// ============================================================

function buildSources(rows, limit) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const safeLimit =
    Number.isInteger(limit) && limit > 0
      ? limit
      : 10;

  return rows
    .slice(0, safeLimit)
    .filter(Boolean)
    .map(row => ({
      question: row.question || "",
      answer: row.answer || "",
      language: normalizeLanguage(row.language),
      category: row.category || "",
      education_level: row.education_level || "",
      bible_references: row.bible_references || "",
      church_sources: row.church_sources || "",
      comparison_group: row.comparison_group || ""
    }));
}

// ============================================================
// SOURCE FORMATTING
// ============================================================

function formatSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return "No direct knowledge-base entries matched.";
  }

  return sources
    .map((source, index) => `
SOURCE ${index + 1}

Question:
${source.question}

Answer:
${source.answer}

Language:
${source.language}

Category:
${source.category}

Education level:
${source.education_level}

Bible references:
${source.bible_references}

Church sources:
${source.church_sources}

Comparison:
${source.comparison_group}
`)
    .join("\n-------------------------\n");
}

// ============================================================
// GEMINI SYSTEM INSTRUCTION
// ============================================================

function buildSystemInstruction(language) {
  const lang = languageName(language);

  return `
You are the primary theological answer engine for
"ኦርቶዶክሳዊ መልስ".

Your purpose is to provide a detailed, coherent,
educational and respectful answer according to
Orthodox Christian theology and Ethiopian Orthodox
Tewahedo tradition.

OUTPUT LANGUAGE
The complete answer MUST be written in:

${lang}

Do not switch to another language unless the user
explicitly asks for another language.

IMPORTANT:
Use the supplied database context as the primary
grounding material.

Do not mix unrelated topics.

If the database contains material about the requested
topic, use it carefully and coherently.

If information is not present in the database,
you may provide general theological explanation,
but do not invent quotations or references.

RESPONSE STRUCTURE

1. Direct Orthodox Answer
Give the direct answer first.

2. Definition and Explanation
Explain the meaning of the subject clearly.

3. Biblical Foundations
Use relevant Old and New Testament references.
Do not invent Bible references.

4. Orthodox Theological Teaching
Explain the doctrine according to Orthodox theology.

5. Church Fathers and Ethiopian Tradition
Where relevant, discuss Church Fathers and Ethiopian
Orthodox scholars and tradition.

Never fabricate quotations.

6. Ethiopian Orthodox Tewahedo Perspective
Explain the Ethiopian Orthodox understanding where
relevant.

7. Comparative Explanation
Where the question requires it, respectfully explain
differences with Protestantism, Catholicism, Islam,
or other relevant positions.

Do not attack other religions.

8. Spiritual and Practical Application
Explain how the teaching relates to Christian life.

9. Conclusion
Give a concise final theological conclusion.

QUALITY RULES

- Keep the entire answer focused on the user's question.
- Do not combine unrelated database records.
- Do not invent citations.
- Do not invent quotations.
- Do not claim that a source says something unless the
  supplied context supports it.
- Prefer accurate explanation over unsupported detail.
- Use headings and readable paragraphs.
- Give a substantial answer, not a three-line response.
`;
}

// ============================================================
// GEMINI USER PROMPT
// ============================================================

function buildUserPrompt(question, language, sources) {
  return `
USER QUESTION:

${question}

TARGET LANGUAGE:

${languageName(language)}

DATABASE KNOWLEDGE BASE:

${formatSources(sources)}

TASK:

Answer the user's question comprehensively in
${languageName(language)}.

Use the database context as grounding.

The answer should be:

- Orthodox
- coherent
- detailed
- educational
- respectful
- scripturally grounded
- relevant to the exact question

Do not merge unrelated topics.

If comparative theology is relevant, explain the
differences accurately and respectfully.

Do not fabricate Bible verses, quotations,
Church Father statements, or Ethiopian scholar
references.
`;
}

// ============================================================
// GEMINI MODEL CANDIDATES
// ============================================================

function getModelCandidates() {
  const candidates = [
    GEMINI_MODEL,
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash"
  ];

  return [
    ...new Set(
      candidates.filter(Boolean)
    )
  ];
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
      "GEMINI_API_KEY is missing in Environment Variables"
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(model)}:generateContent` +
    `?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      systemInstruction: {
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
        temperature: 0.2,
        topP: 0.85,
        maxOutputTokens: 4000
      }
    })
  });

  const raw = await response.text();

  let data = null;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      `Gemini ${response.status}: ` +
      `${data?.error?.message || raw}`
    );
  }

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text || "")
      .join("")
      .trim();

  if (!answer) {
    throw new Error(
      "Gemini returned empty answer"
    );
  }

  return answer;
}

// ============================================================
// GEMINI GENERATION
// ============================================================

async function generateWithGemini(
  question,
  language,
  sources
) {
  const systemInstruction =
    buildSystemInstruction(language);

  const userPrompt =
    buildUserPrompt(
      question,
      language,
      sources
    );

  let lastError = null;

  for (const model of getModelCandidates()) {
    try {
      console.log(
        `Trying Gemini model: ${model}`
      );

      return await callGemini(
        model,
        systemInstruction,
        userPrompt
      );

    } catch (error) {
      lastError = error;

      console.error(
        `Model ${model} failed:`,
        error?.message || error
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini model candidates failed."
    )
  );
}

// ============================================================
// DATABASE FALLBACK
// ============================================================

function fallbackAnswer(
  coherentRows,
  language
) {
  if (
    !Array.isArray(coherentRows) ||
    coherentRows.length === 0
  ) {
    return "";
  }

  const targetLanguageRows =
    coherentRows.filter(
      row =>
        normalizeLanguage(row?.language) === language
    );

  const targetRows =
    targetLanguageRows.length > 0
      ? targetLanguageRows
      : coherentRows;

  return targetRows
    .slice(0, 3)
    .map(row => row?.answer || "")
    .filter(Boolean)
    .join("\n\n");
}

// ============================================================
// REQUEST BODY
// ============================================================

function getBody(req) {
  if (
    req &&
    typeof req.body === "object" &&
    req.body !== null
  ) {
    return req.body;
  }

  return {};
}

// ============================================================
// MAIN HANDLER
// ============================================================

module.exports = async function handler(req, res) {

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
    "Content-Type"
  );

  // ----------------------------------------------------------
  // OPTIONS
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // ----------------------------------------------------------
  // METHOD
  // ----------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

    const body = getBody(req);

    const question =
      String(body.question || "").trim();

    const language =
      normalizeLanguage(
        body.language || "am"
      );

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!question) {
      return res.status(400).json({
        error:
          "እባክዎ ጥያቄ ያስገቡ።"
      });
    }

    if (
      question.length >
      MAX_QUESTION_LENGTH
    ) {
      return res.status(400).json({
        error:
          "ጥያቄው በጣም ረጅም ነው።"
      });
    }

    // --------------------------------------------------------
    // SUPABASE
    // --------------------------------------------------------

    let loadedRows = [];

    try {

      loadedRows =
        await getLessons();

      console.log(
        `Supabase rows loaded: ${loadedRows.length}`
      );

    } catch (supabaseError) {

      console.warn(
        "Supabase load failed:",
        supabaseError?.message ||
        supabaseError
      );

      loadedRows = [];
    }

    // --------------------------------------------------------
    // RANKING
    // --------------------------------------------------------

    const rows =
      Array.isArray(loadedRows)
        ? loadedRows
        : [];

    const ranked =
      rows
        .map(row => ({
          row,
          score:
            scoreRow(
              row,
              question,
              language
            )
        }))
        .filter(
          item =>
            item &&
            item.score > 0
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );

    // --------------------------------------------------------
    // TOPIC COHERENCE
    // --------------------------------------------------------

    const coherentRows =
      selectCoherentRows(
        ranked,
        question,
        10
      );

    // --------------------------------------------------------
    // SOURCES
    // --------------------------------------------------------

    const selected =
      buildSources(
        coherentRows,
        10
      );

    // --------------------------------------------------------
    // GENERATION
    // --------------------------------------------------------

    let answer = "";

    let generationUsed = false;

    // --------------------------------------------------------
    // GEMINI
    // --------------------------------------------------------

    if (GEMINI_API_KEY) {

      try {

        answer =
          await generateWithGemini(
            question,
            language,
            selected
          );

        generationUsed = true;

      } catch (geminiError) {

        console.error(
          "Gemini failed:",
          geminiError?.message ||
          geminiError
        );

        answer =
          fallbackAnswer(
            coherentRows,
            language
          );
      }

    } else {

      // ------------------------------------------------------
      // NO GEMINI KEY
      // ------------------------------------------------------

      answer =
        fallbackAnswer(
          coherentRows,
          language
        );
    }

    // --------------------------------------------------------
    // NO ANSWER
    // --------------------------------------------------------

    if (!answer) {

      return res.status(503).json({
        error:
          "የተጠየቀውን ጥያቄ ለማስተናገድ የመረጃ ምንጭ ማግኘት አልተቻለም።",

        language,

        languageName:
          languageName(language),

        generationUsed: false,

        sources: selected
      });
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return res.status(200).json({

      answer,

      language,

      languageName:
        languageName(language),

      generationUsed,

      sources: selected
    });

  } catch (error) {

    // --------------------------------------------------------
    // INTERNAL ERROR
    // --------------------------------------------------------

    console.error(
      "/api/ask internal error:",
      error
    );

    return res.status(500).json({

      error:
        "የሰርቨር ስህተት አጋጥሟል",

      errorMessage:
        error?.message ||
        "Unknown server error",

      ...(process.env.NODE_ENV === "development"
        ? {
            stack:
              error?.stack
          }
        : {})
    });
  }
};
