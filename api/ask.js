// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// 15-LANGUAGE ORTHODOX ANSWER ENGINE
// Supabase Knowledge Base + Gemini
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const TABLE_NAME = "orthodox_answers";

/* ============================================================
   15 LANGUAGES
   ============================================================ */

const LANGUAGE_NAMES = {
  am: "አማርኛ",
  ti: "ትግርኛ",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolayttatto",
  kaa: "Kaffoono",
  gez: "ጉራጊኛ",
  so: "ሶማልኛ",
  aa: "አፋርኛ",
  had: "ሐዲይኛ",
  kmb: "ከምባታኛ",
  gamo: "ጋሞኛ",
  en: "English",
  ar: "العربية",
  zh: "中文"
};

/* ============================================================
   LANGUAGE ALIASES
   ============================================================ */

const LANGUAGE_ALIASES = {
  am: [
    "am",
    "amh",
    "amharic",
    "አማርኛ"
  ],

  ti: [
    "ti",
    "tir",
    "tigrinya",
    "ትግርኛ"
  ],

  om: [
    "om",
    "orm",
    "oromo",
    "afaan oromoo",
    "afaan oromo"
  ],

  sid: [
    "sid",
    "sidaamu",
    "sidaama",
    "sidaamu afoo",
    "sidaama afoo"
  ],

  wal: [
    "wal",
    "wolaytta",
    "wolayttatto",
    "wolayita",
    "wolaytta afoo"
  ],

  kaa: [
    "kaa",
    "kaf",
    "kafa",
    "kaffoono",
    "kafa afoo"
  ],

  gez: [
    "gez",
    "gur",
    "guragie",
    "guragigna",
    "gurage",
    "ጉራጊኛ"
  ],

  so: [
    "so",
    "som",
    "somali",
    "ሶማልኛ"
  ],

  aa: [
    "aa",
    "aar",
    "afar",
    "afaraf",
    "አፋርኛ"
  ],

  had: [
    "had",
    "hadiyya",
    "hadiyyigna",
    "ሐዲይኛ"
  ],

  kmb: [
    "kmb",
    "kembata",
    "kambata",
    "kembatigna",
    "ከምባታኛ"
  ],

  gamo: [
    "gamo",
    "gma",
    "gamogna",
    "ጋሞኛ"
  ],

  en: [
    "en",
    "eng",
    "english"
  ],

  ar: [
    "ar",
    "ara",
    "arabic",
    "العربية"
  ],

  zh: [
    "zh",
    "chi",
    "zho",
    "chinese",
    "中文"
  ]
};

/* ============================================================
   TOPIC GROUPS
   ============================================================ */

const TOPIC_GROUPS = [

  {
    key: "baptism",

    terms: [
      "ጥምቀት",
      "ጥምቀትን",
      "ተጠመቀ",
      "መጠመቅ",
      "ሕፃን ጥምቀት",
      "በጥምቀት",

      "baptism",
      "baptize",
      "baptized",
      "baptismal",

      "التعميد",
      "المعمودية",

      "洗礼"
    ]
  },

  {
    key: "communion",

    terms: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "ሥጋው",
      "ደሙ",

      "holy communion",
      "communion",
      "eucharist",

      "الإفخارستيا",
      "التناول"
    ]
  },

  {
    key: "repentance",

    terms: [
      "ንስሐ",
      "ንስሐ ገባ",
      "ኃጢአት",
      "ንስሐ መግባት",

      "repentance",
      "repent",
      "sin",

      "التوبة"
    ]
  },

  {
    key: "mary",

    terms: [
      "ማርያም",
      "ድንግል",
      "ቅድስት ድንግል",
      "የእመቤታችን",

      "mary",
      "virgin mary",

      "مريم",
      "العذراء"
    ]
  },

  {
    key: "cross",

    terms: [
      "መስቀል",
      "የጌታ መስቀል",

      "cross",
      "holy cross",

      "الصليب"
    ]
  },

  {
    key: "incarnation",

    terms: [
      "ሥጋዌ",
      "ተዋሕዶ",
      "ወልድ ሰው ሆነ",

      "incarnation",
      "tewahedo",

      "التجسد"
    ]
  }

];

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value) {

  const text = normalize(value);

  if (!text) {
    return [];
  }

  return [
    ...new Set(
      text
        .split(/\s+/)
        .filter(word => word.length >= 2)
    )
  ];
}

/* ============================================================
   CANONICAL LANGUAGE
   ============================================================ */

function canonicalLanguage(value) {

  const normalized = normalize(value);

  if (!normalized) {
    return "am";
  }

  if (LANGUAGE_NAMES[normalized]) {
    return normalized;
  }

  for (const [code, aliases] of Object.entries(
    LANGUAGE_ALIASES
  )) {

    for (const alias of aliases) {

      if (
        normalize(alias) ===
        normalized
      ) {
        return code;
      }

    }

  }

  return "";
}

/* ============================================================
   ROW HELPERS
   ============================================================ */

function rowQuestion(row) {

  return (
    row.question ??
    row.Question ??
    row.question_text ??
    row.title ??
    row.title_am ??
    row.q ??
    ""
  );
}

function rowAnswer(row) {

  return (
    row.answer ??
    row.Answer ??
    row.response ??
    row.lesson ??
    row.content ??
    row.text ??
    ""
  );
}

function rowLanguage(row) {

  return (
    row.language ??
    row.lang ??
    row.lang_code ??
    ""
  );
}

function languageMatches(
  value,
  requestedLanguage
) {

  return (
    canonicalLanguage(value) ===
    requestedLanguage
  );
}

/* ============================================================
   TOPIC DETECTION
   ============================================================ */

function detectTopics(query) {

  const q = normalize(query);

  return TOPIC_GROUPS
    .filter(group =>
      group.terms.some(term =>
        q.includes(
          normalize(term)
        )
      )
    )
    .map(group => group.key);
}

/* ============================================================
   TOPIC MATCH
   ============================================================ */

function rowMatchesTopic(
  row,
  topicKey
) {

  const group =
    TOPIC_GROUPS.find(
      item =>
        item.key === topicKey
    );

  if (!group) {
    return false;
  }

  const searchable =
    normalize([
      rowQuestion(row),
      rowAnswer(row),
      row.category,
      row.bible_references,
      row.church_sources,
      row.comparison_group
    ].join(" "));

  return group.terms.some(term =>
    searchable.includes(
      normalize(term)
    )
  );
}

/* ============================================================
   SCORE
   ============================================================ */

function scoreRow(
  row,
  query,
  requestedLanguage,
  topics
) {

  const q =
    normalize(query);

  const qWords =
    words(query);

  const question =
    normalize(rowQuestion(row));

  const answer =
    normalize(rowAnswer(row));

  const category =
    normalize(row.category);

  const bible =
    normalize(row.bible_references);

  const church =
    normalize(row.church_sources);

  const comparison =
    normalize(row.comparison_group);

  if (
    !question &&
    !answer &&
    !category
  ) {
    return 0;
  }

  let score = 0;

  /* Exact question */

  if (question === q) {
    score += 5000;
  }

  /* Exact phrase */

  if (
    q.length >= 3 &&
    question.includes(q)
  ) {
    score += 1800;
  }

  /* Category */

  if (
    q.length >= 3 &&
    category.includes(q)
  ) {
    score += 900;
  }

  /* Word matching */

  for (const word of qWords) {

    if (question.includes(word)) {
      score += 180;
    }

    if (category.includes(word)) {
      score += 110;
    }

    if (answer.includes(word)) {
      score += 45;
    }

    if (bible.includes(word)) {
      score += 35;
    }

    if (church.includes(word)) {
      score += 35;
    }

    if (comparison.includes(word)) {
      score += 15;
    }

  }

  /* Coverage */

  const fields = [
    question,
    answer,
    category,
    bible,
    church,
    comparison
  ];

  if (qWords.length) {

    const hits =
      qWords.filter(word =>
        fields.some(field =>
          field.includes(word)
        )
      ).length;

    score += Math.round(
      (hits / qWords.length) *
      300
    );

  }

  /* Requested language */

  if (
    languageMatches(
      rowLanguage(row),
      requestedLanguage
    )
  ) {
    score += 1400;
  }

  /* Main topic */

  for (const topic of topics) {

    if (
      rowMatchesTopic(
        row,
        topic
      )
    ) {
      score += 1200;
    }

  }

  return score;
}

/* ============================================================
   SUPABASE GET
   ============================================================ */

async function supabaseGet(path) {

  if (!SUPABASE_ANON_KEY) {

    throw new Error(
      "SUPABASE_ANON_KEY is missing in Vercel."
    );

  }

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        method: "GET",

        headers: {
          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${SUPABASE_ANON_KEY}`,

          Accept:
            "application/json"
        }
      }
    );

  const raw =
    await response.text();

  let data = null;

  try {
    data =
      raw
        ? JSON.parse(raw)
        : null;
  } catch {
    data = null;
  }

  if (!response.ok) {

    throw new Error(
      data?.message ||
      data?.hint ||
      `Supabase error ${response.status}`
    );

  }

  return data;
}

/* ============================================================
   LOAD KNOWLEDGE BASE
   ============================================================ */

async function getLessons() {

  const columns = [
    "id",
    "question",
    "answer",
    "language",
    "category",
    "education_level",
    "bible_references",
    "church_sources",
    "comparison_group"
  ].join(",");

  const path =
    `${TABLE_NAME}?select=${encodeURIComponent(
      columns
    )}&limit=5000`;

  return await supabaseGet(path);
}

/* ============================================================
   BUILD SOURCES
   ============================================================ */

function buildSources(items) {

  return items.map(
    ({ row }) => ({

      question:
        cleanText(
          rowQuestion(row)
        ),

      answer:
        cleanText(
          rowAnswer(row)
        ).slice(
          0,
          14000
        ),

      language:
        cleanText(
          rowLanguage(row)
        ),

      category:
        cleanText(
          row.category
        ),

      education_level:
        cleanText(
          row.education_level
        ),

      bible_references:
        cleanText(
          row.bible_references
        ),

      church_sources:
        cleanText(
          row.church_sources
        ),

      comparison_group:
        cleanText(
          row.comparison_group
        )

    })
  );
}

/* ============================================================
   SOURCE TEXT
   ============================================================ */

function sourceText(sources) {

  if (!sources.length) {

    return `
No directly matched knowledge-base
material was found.
`;

  }

  return sources
    .map(
      (source, index) => `

==============================
KNOWLEDGE SOURCE ${index + 1}
==============================

Question:
${source.question}

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

Comparison group:
${source.comparison_group}

Answer:
${source.answer}
`
    )
    .join("\n");
}

/* ============================================================
   ANSWER LEVEL
   ============================================================ */

function levelConfig(level) {

  const n =
    Number(level);

  if (n === 1) {

    return {

      name: "Basic",

      instruction:
        "Explain clearly for a beginner, but answer the actual question completely."

    };

  }

  if (n === 3) {

    return {

      name: "Scholarly",

      instruction:
        "Give deep theological treatment, distinctions, Biblical foundations, historical or patristic context only when supported by the supplied sources, and a careful conclusion."

    };

  }

  return {

    name: "Detailed",

    instruction:
      "Give a full, coherent teaching suitable for serious learners. Do not stop at a short definition."

  };
}

/* ============================================================
   SYSTEM INSTRUCTION
   ============================================================ */

function systemInstruction(
  language,
  level
) {

  const languageName =
    LANGUAGE_NAMES[language];

  const config =
    levelConfig(level);

  return `

You are the theological answer engine
for the application:

"ኦርቶዶክሳዊ መልስ"

============================================================
OUTPUT LANGUAGE
============================================================

The final answer MUST be written entirely
in:

${languageName}

This rule is absolute.

Do NOT answer in Amharic merely because
the source material is in Amharic.

Do NOT answer in English.

Do NOT mix languages.

Translate the meaning of the supplied
knowledge into the requested language.

============================================================
TOPIC COHERENCE
============================================================

First understand the exact subject of
the user's question.

Answer ONLY that subject.

Combine multiple sources ONLY when they
belong to the same subject or directly
help explain it.

Do not mix unrelated teachings.

Example:

If the user asks about baptism:

Discuss baptism, its meaning, Biblical
foundation, Christian life, child baptism,
faith, repentance, Trinitarian baptism,
Ethiopian Orthodox Tewahedo teaching,
and relevant supplied sources.

Do NOT suddenly discuss unrelated subjects
such as fasting, marriage or prayer.

============================================================
KNOWLEDGE BASE
============================================================

The supplied knowledge-base is the primary
source of the answer.

Do not simply copy one database record.

Synthesize the relevant records into one
clear teaching.

You may use records written in another
language as supporting knowledge.

However, the final answer MUST remain
entirely in:

${languageName}

============================================================
ACCURACY
============================================================

Never invent:

- quotations
- Bible references
- Church Fathers
- Ethiopian scholars
- books
- page numbers
- historical claims
- citations

If a source does not provide a quotation,
DO NOT manufacture a quotation.

If a specific claim is not supported by
the supplied material, present it carefully
without pretending that a source supplied it.

============================================================
ORTHODOX FRAME
============================================================

Explain the subject according to the
Ethiopian Orthodox Tewahedo understanding
represented by the supplied material.

============================================================
ANSWER DEPTH
============================================================

Answer level:

${config.name}

${config.instruction}

The answer must be substantial.

Do not give only two or three sentences.

============================================================
RECOMMENDED STRUCTURE
============================================================

When appropriate, organize the answer as:

1. ቀጥተኛ መልስ
2. ትርጉምና ፍቺ
3. መጽሐፍ ቅዱሳዊ መሠረት
4. የኢትዮጵያ ኦርቶዶክስ
   ተዋሕዶ ትምህርት
5. የቤተ ክርስቲያን
   ትውፊትና ምንጮች
6. ዝርዝር ማብራሪያ
7. አስፈላጊ ልዩነቶች
8. ምሳሌዎች
9. የተሳሳቱ ግንዛቤዎች
10. መደምደሚያ

Do not force a heading when it is
not relevant to the question.

============================================================
SELF-CONTAINED ANSWER
============================================================

The reader should understand the answer
without needing to see the database.

Use paragraphs, lists and headings when
they improve clarity.

============================================================
DO NOT REVEAL INTERNAL SYSTEMS
============================================================

Never mention:

AI
Gemini
Supabase
API
database
prompt
retrieval
system instructions
fallback
server
programming

Return ONLY the final theological answer.

`;
}

/* ============================================================
   GEMINI TEXT
   ============================================================ */

function extractGeminiText(data) {

  const parts =
    data?.candidates?.[0]
      ?.content?.parts ||
    [];

  return parts
    .map(part =>
      typeof part?.text === "string"
        ? part.text
        : ""
    )
    .join("\n")
    .trim();
}

/* ============================================================
   GEMINI REQUEST
   ============================================================ */

async function callGemini(
  model,
  question,
  language,
  sources,
  level
) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(
      model
    )}:generateContent`;

  const prompt = `

USER QUESTION:

${question}

REQUESTED OUTPUT LANGUAGE:

${LANGUAGE_NAMES[language]}

RELEVANT KNOWLEDGE:

${sourceText(sources)}

TASK:

Write the final answer to the user's
question.

The answer MUST be entirely in:

${LANGUAGE_NAMES[language]}

The answer must be:

- detailed
- organized
- coherent
- self-contained
- Orthodox in theological perspective
- strictly related to the question

Combine relevant knowledge sources.

Do not simply copy one source.

Do not invent citations.

Do not invent quotations.

Return ONLY the final answer.
`;

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "x-goog-api-key":
            GEMINI_API_KEY

        },

        body:
          JSON.stringify({

            systemInstruction: {

              parts: [
                {
                  text:
                    systemInstruction(
                      language,
                      level
                    )
                }
              ]

            },

            contents: [

              {
                role: "user",

                parts: [
                  {
                    text:
                      prompt
                  }
                ]
              }

            ],

            generationConfig: {

              temperature:
                0.25,

              maxOutputTokens:
                12000,

              thinkingConfig: {
                thinkingLevel:
                  "medium"
              }

            }

          })
      }
    );

  const raw =
    await response.text();

  let data = null;

  try {

    data =
      raw
        ? JSON.parse(raw)
        : null;

  } catch {

    data = null;

  }

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
      `Gemini error ${response.status}`
    );

  }

  const answer =
    extractGeminiText(data);

  if (!answer) {

    throw new Error(
      "Gemini returned an empty answer."
    );

  }

  return answer;
}

/* ============================================================
   GEMINI GENERATION
   ============================================================ */

async function generateWithGemini(
  question,
  language,
  sources,
  level
) {

  if (!GEMINI_API_KEY) {

    throw new Error(
      "GEMINI_API_KEY is missing in Vercel."
    );

  }

  const models = [
    GEMINI_MODEL
  ];

  let lastError = null;

  for (
    const model of models
  ) {

    try {

      return await callGemini(
        model,
        question,
        language,
        sources,
        level
      );

    } catch (error) {

      lastError =
        error;

      console.error(
        `Gemini model ${model} failed:`,
        error?.message ||
        error
      );

    }

  }

  throw (
    lastError ||
    new Error(
      "Gemini generation failed."
    )
  );
}

/* ============================================================
   FALLBACK
   ============================================================ */

function fallbackAnswer(
  ranked,
  language
) {

  const matching =
    ranked.filter(item =>
      languageMatches(
        rowLanguage(item.row),
        language
      )
    );

  if (!matching.length) {
    return "";
  }

  const unique = [];

  const seen =
    new Set();

  for (
    const item of matching
  ) {

    const answer =
      cleanText(
        rowAnswer(item.row)
      );

    if (!answer) {
      continue;
    }

    const key =
      normalize(answer);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    unique.push(
      item.row
    );

    if (
      unique.length >= 8
    ) {
      break;
    }

  }

  if (!unique.length) {
    return "";
  }

  return unique
    .map(
      (row, index) => {

        let block =
          cleanText(
            rowAnswer(row)
          );

        const bible =
          cleanText(
            row.bible_references
          );

        const church =
          cleanText(
            row.church_sources
          );

        if (bible) {

          block +=
            `\n\n${bible}`;

        }

        if (church) {

          block +=
            `\n\n${church}`;

        }

        if (
          unique.length > 1
        ) {

          return (
            `### ${index + 1}\n` +
            block
          );

        }

        return block;

      }
    )
    .join("\n\n");
}

/* ============================================================
   HANDLER
   ============================================================ */

module.exports =
async function handler(
  req,
  res
) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  /* POST ONLY */

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({
        error:
          "Only POST requests are allowed."
      });

  }

  try {

    const body =
      req.body || {};

    const question =
      cleanText(
        body.question
      );

    /*
     * IMPORTANT:
     * Accept both language code and
     * language name.
     */

    const language =
      canonicalLanguage(
        body.language ||
        "am"
      );

    const answerLevel =
      [1, 2, 3].includes(
        Number(
          body.answerLevel
        )
      )
        ? Number(
            body.answerLevel
          )
        : 2;

    /* QUESTION */

    if (!question) {

      return res
        .status(400)
        .json({
          error:
            "ጥያቄዎን ያስገቡ።"
        });

    }

    if (
      question.length >
      3000
    ) {

      return res
        .status(400)
        .json({
          error:
            "ጥያቄው ከ3000 ፊደል መብለጥ የለበትም።"
        });

    }

    /* LANGUAGE */

    if (
      !language ||
      !LANGUAGE_NAMES[language]
    ) {

      return res
        .status(400)
        .json({
          error:
            "የተመረጠው ቋንቋ አይደገፍም።"
        });

    }

    /* LOAD DATABASE */

    const loaded =
      await getLessons();

    const rows =
      Array.isArray(loaded)
        ? loaded
        : [];

    /* DETECT TOPIC */

    const detectedTopics =
      detectTopics(
        question
      );

    /* RANK */

    let ranked =
      rows
        .map(row => ({

          row,

          score:
            scoreRow(
              row,
              question,
              language,
              detectedTopics
            )

        }))
        .filter(item =>
          item.score > 0
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    /*
     * Same-language sources first.
     */

    const sameLanguage =
      ranked.filter(item =>
        languageMatches(
          rowLanguage(item.row),
          language
        )
      );

    /*
     * Other-language sources are
     * supporting knowledge for Gemini.
     */

    const otherLanguage =
      ranked.filter(item =>
        !languageMatches(
          rowLanguage(item.row),
          language
        )
      );

    /*
     * 16 same-language +
     * 8 supporting sources.
     */

    const selected = [

      ...sameLanguage.slice(
        0,
        16
      ),

      ...otherLanguage.slice(
        0,
        8
      )

    ];

    /* REMOVE DUPLICATES */

    const uniqueSelected = [];

    const seenIds =
      new Set();

    for (
      const item of selected
    ) {

      const id =
        String(
          item.row.id ??
          `${rowQuestion(item.row)}|${rowLanguage(item.row)}`
        );

      if (
        seenIds.has(id)
      ) {
        continue;
      }

      seenIds.add(id);

      uniqueSelected.push(
        item
      );

    }

    /* SOURCES */

    const sources =
      buildSources(
        uniqueSelected
      );

    /* ========================================================
       GEMINI FIRST
       ======================================================== */

    let answer = "";

    let generationError =
      null;

    if (
      GEMINI_API_KEY &&
      sources.length
    ) {

      try {

        answer =
          await generateWithGemini(
            question,
            language,
            sources,
            answerLevel
          );

      } catch (error) {

        generationError =
          error;

        console.error(
          "Gemini generation failed:",
          error?.message ||
          error
        );

      }

    }

    /* ========================================================
       FALLBACK
       ======================================================== */

    if (!answer) {

      answer =
        fallbackAnswer(
          ranked,
          language
        );

    }

    /* ========================================================
       NO ANSWER
       ======================================================== */

    if (!answer) {

      return res
        .status(200)
        .json({

          answer: "",

          language,

          matchedCount:
            uniqueSelected.length,

          detectedTopics,

          message:
            generationError
              ? "Answer generation failed."
              : "No matching answer was found."

        });

    }

    /* ========================================================
       SUCCESS
       ======================================================== */

    return res
      .status(200)
      .json({

        answer,

        language,

        matchedCount:
          uniqueSelected.length,

        detectedTopics,

        /*
         * Diagnostic information.
         * The index.html can ignore these fields.
         */

        diagnostics: {

          geminiConfigured:
            Boolean(
              GEMINI_API_KEY
            ),

          geminiUsed:
            !generationError &&
            Boolean(
              GEMINI_API_KEY
            ),

          fallbackUsed:
            Boolean(
              generationError
            ),

          selectedLanguageSources:
            sameLanguage.length,

          supportingLanguageSources:
            otherLanguage.length,

          totalKnowledgeRows:
            rows.length

        },

        sources:
          sources.map(
            source => ({

              question:
                source.question,

              language:
                source.language,

              category:
                source.category,

              education_level:
                source.education_level,

              bible_references:
                source.bible_references,

              church_sources:
                source.church_sources

            })
          )

      });

  } catch (error) {

    console.error(
      "API ASK ERROR:",
      error
    );

    return res
      .status(500)
      .json({

        error:
          error?.message ||
          "Unknown API error."

      });

  }

};
