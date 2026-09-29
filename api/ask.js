// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// 15-LANGUAGE ORTHODOX ANSWER ENGINE
//
// 15 languages:
// am  - አማርኛ
// ti  - ትግርኛ
// om  - Afaan Oromoo
// sid - Sidaamu Afoo
// wal - Wolayttatto
// kaa - Kaffoono
// gez - ጉራጊኛ
// so  - ሶማልኛ
// aa  - አፋርኛ
// had - ሐዲይኛ
// kmb - ከምባታኛ
// gamo- ጋሞኛ
// en  - English
// ar  - العربية
// zh  - 中文
//
// Supabase
//    ↓
// broad topic matching
//    ↓
// language-aware ranking
//    ↓
// Gemini 3.8 Flash
//    ↓
// multilingual fallback
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const TABLE_NAME = "orthodox_answers";

/* ============================================================
   EXACT 15 LANGUAGES
   DO NOT REMOVE ANY OF THESE
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
  am: ["am", "amh", "amharic", "አማርኛ"],
  ti: ["ti", "tir", "tigrinya", "ትግርኛ"],
  om: ["om", "orm", "oromo", "afaan oromoo"],
  sid: ["sid", "sidaamu", "sidaama", "sidaamu afoo"],
  wal: ["wal", "wolaytta", "wolayttatto", "wolayita"],
  kaa: ["kaa", "kaf", "kafa", "kaffoono"],
  gez: [
    "gez",
    "gur",
    "guragie",
    "guragigna",
    "gurage",
    "guragigna",
    "ጉራጊኛ"
  ],
  so: ["so", "som", "somali", "ሶማልኛ"],
  aa: ["aa", "aar", "afar", "afaraf", "አፋርኛ"],
  had: ["had", "hadiyya", "hadiyyigna", "ሐዲይኛ"],
  kmb: ["kmb", "kembata", "kambata", "ከምባታኛ"],
  gamo: ["gamo", "gma", "ጋሞኛ"],
  en: ["en", "eng", "english"],
  ar: ["ar", "ara", "arabic", "العربية"],
  zh: ["zh", "chi", "zho", "chinese", "中文"]
};

/* ============================================================
   TOPIC SYNONYMS
   Helps one question find related records.
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

  if (!text) return [];

  return [
    ...new Set(
      text
        .split(/\s+/)
        .filter(word => word.length >= 2)
    )
  ];
}

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
  return normalize(
    row.language ??
    row.lang ??
    row.lang_code ??
    ""
  );
}

/* ============================================================
   LANGUAGE MATCHING
   ============================================================ */

function languageMatches(rowLanguageValue, requestedLanguage) {
  const value = normalize(rowLanguageValue);

  const aliases =
    LANGUAGE_ALIASES[requestedLanguage] ||
    [requestedLanguage];

  return aliases.some(alias =>
    normalize(alias) === value
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
        q.includes(normalize(term))
      )
    )
    .map(group => group.key);
}

function rowMatchesTopic(row, topicKey) {
  const group =
    TOPIC_GROUPS.find(
      item => item.key === topicKey
    );

  if (!group) return false;

  const searchable = normalize([
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
   SCORE ROW
   ============================================================ */

function scoreRow(row, query, requestedLanguage) {
  const q = normalize(query);
  const qWords = words(query);

  const question = normalize(rowQuestion(row));
  const answer = normalize(rowAnswer(row));
  const category = normalize(row.category);
  const education = normalize(row.education_level);
  const bible = normalize(row.bible_references);
  const church = normalize(row.church_sources);
  const comparison = normalize(row.comparison_group);

  const fields = [
    question,
    answer,
    category,
    education,
    bible,
    church,
    comparison
  ];

  if (!fields.some(Boolean)) {
    return 0;
  }

  let score = 0;

  /* Exact question */
  if (question === q) {
    score += 3000;
  }

  /* Exact phrase */
  if (q.length >= 3 && question.includes(q)) {
    score += 1200;
  }

  /* Category */
  if (q.length >= 3 && category.includes(q)) {
    score += 700;
  }

  /* Query words */
  for (const word of qWords) {
    if (question.includes(word)) {
      score += 140;
    }

    if (category.includes(word)) {
      score += 90;
    }

    if (answer.includes(word)) {
      score += 40;
    }

    if (bible.includes(word)) {
      score += 30;
    }

    if (church.includes(word)) {
      score += 30;
    }

    if (comparison.includes(word)) {
      score += 15;
    }
  }

  /* Coverage */
  if (qWords.length) {
    const hits =
      qWords.filter(word =>
        fields.some(field =>
          field.includes(word)
        )
      ).length;

    score += Math.round(
      (hits / qWords.length) * 250
    );
  }

  /* Selected language */
  if (
    languageMatches(
      rowLanguage(row),
      requestedLanguage
    )
  ) {
    score += 1000;
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
          apikey: SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${SUPABASE_ANON_KEY}`,
          Accept:
            "application/json"
        }
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
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
   LOAD ALL AVAILABLE RECORDS
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

  /*
   * 5000 is intentionally larger than the old 500.
   * This does not change any database data.
   */

  const path =
    `${TABLE_NAME}?select=${encodeURIComponent(
      columns
    )}&limit=5000`;

  return await supabaseGet(path);
}

/* ============================================================
   BUILD SOURCE MATERIAL
   ============================================================ */

function buildSources(ranked) {
  return ranked.map(item => {
    const row = item.row;

    return {
      question:
        cleanText(
          rowQuestion(row)
        ),

      answer:
        cleanText(
          rowAnswer(row)
        ).slice(0, 12000),

      language:
        cleanText(
          row.language
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
    };
  });
}

/* ============================================================
   SOURCE TEXT
   ============================================================ */

function sourceText(sources) {
  if (!sources.length) {
    return "No directly matched knowledge-base record was found.";
  }

  return sources
    .map((source, index) => `
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
`)
    .join("\n");
}

/* ============================================================
   ANSWER LEVEL
   ============================================================ */

function levelConfig(level) {
  const number = Number(level) || 2;

  if (number === 1) {
    return {
      name: "Basic",
      instruction:
        "Give a clear foundation while still answering the question completely."
    };
  }

  if (number === 3) {
    return {
      name: "Scholarly",
      instruction:
        "Give a deep theological teaching with definitions, Biblical foundations, theological distinctions, Church Fathers and Ethiopian Orthodox Tewahedo sources only when actually supplied, historical context where relevant, common misunderstandings and a reasoned conclusion."
    };
  }

  return {
    name: "Detailed",
    instruction:
      "Give a full, coherent teaching suitable for serious learners. Do not stop after a short definition."
  };
}

/* ============================================================
   SYSTEM INSTRUCTION
   ============================================================ */

function systemInstruction(language, level) {
  const languageName =
    LANGUAGE_NAMES[language];

  const config =
    levelConfig(level);

  return `
You are the theological answer engine for
"ኦርቶዶክሳዊ መልስ".

SELECTED OUTPUT LANGUAGE:
${languageName}

STRICT LANGUAGE RULE:

The final answer MUST be entirely in:
${languageName}

Never switch to Amharic merely because the sources are
written in Amharic.

Never switch to English.

Never mix languages.

The selected language has the highest priority for output.

TOPIC RULE:

Answer ONLY the subject asked by the user.

Identify the main theological topic first.

Use related knowledge-base records about the SAME topic.

Do not combine unrelated topics.

For example, if the question is about baptism,
do not turn the answer into a general lesson about prayer,
fasting, marriage or unrelated subjects.

KNOWLEDGE-BASE RULE:

The supplied knowledge-base is the primary source.

Combine multiple relevant records into ONE coherent answer.

Do not simply copy one record.

Do not invent information that is not supported by the supplied
sources or universally established Biblical information.

Do not invent:

- quotations
- Bible references
- Church Fathers
- Ethiopian scholars
- books
- page numbers
- historical claims
- citations

If a source does not provide a quotation, do not manufacture one.

ORTHODOX PERSPECTIVE:

Explain the teaching according to the Ethiopian Orthodox
Tewahedo understanding represented by the supplied sources.

ANSWER DEPTH:

${config.name}

${config.instruction}

REQUIRED STRUCTURE WHEN APPROPRIATE:

1. Direct answer
2. Definition / meaning
3. Biblical foundation
4. Ethiopian Orthodox Tewahedo teaching
5. Church tradition and supplied sources
6. Detailed explanation
7. Important distinctions
8. Examples where useful
9. Common misunderstandings
10. Conclusion

Do not force every heading if the question does not need it.

The answer must be self-contained.

Never mention:

AI
Gemini
Supabase
database
API
prompt
retrieval
system instructions

Return ONLY the final answer.
`;
}

/* ============================================================
   GEMINI TEXT EXTRACTION
   ============================================================ */

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]
      ?.content?.parts || [];

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
   GEMINI
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

  const instruction =
    systemInstruction(
      language,
      level
    );

  const prompt = `
USER QUESTION:

${question}

RELEVANT KNOWLEDGE-BASE MATERIAL:

${sourceText(sources)}

TASK:

Answer the user's question in ${LANGUAGE_NAMES[language]}.

Use the relevant sources above.

Combine related records into one coherent teaching.

Stay strictly on the user's topic.

Do not invent citations or quotations.

The final response must be detailed enough to teach the subject,
not merely define it.

Return only the final answer.
`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

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
                    instruction
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
              maxOutputTokens: 12000,

              thinkingConfig: {
                thinkingLevel: "medium"
              }
            }
          })
      }
    );

  const text =
    await response.text();

  let data = null;

  try {
    data = text
      ? JSON.parse(text)
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

  /*
   * Combine several related records instead of
   * returning only ONE short database answer.
   */

  const unique = [];

  const seen = new Set();

  for (const item of matching) {
    const answer =
      cleanText(
        rowAnswer(item.row)
      );

    if (!answer) continue;

    const key =
      normalize(answer);

    if (seen.has(key)) continue;

    seen.add(key);

    unique.push({
      answer,
      question:
        cleanText(
          rowQuestion(item.row)
        ),
      bible:
        cleanText(
          item.row.bible_references
        ),
      church:
        cleanText(
          item.row.church_sources
        )
    });

    if (unique.length >= 8) {
      break;
    }
  }

  if (!unique.length) {
    return "";
  }

  return unique
    .map(item => {
      let block = item.answer;

      if (item.bible) {
        block +=
          `\n\n${item.bible}`;
      }

      if (item.church) {
        block +=
          `\n\n${item.church}`;
      }

      return block;
    })
    .join("\n\n");
}

/* ============================================================
   HANDLER
   ============================================================ */

module.exports =
async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  if (req.method !== "POST") {
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

    const language =
      cleanText(
        body.language ||
        "am"
      ).toLowerCase();

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

    /* ========================================================
       QUESTION VALIDATION
       ======================================================== */

    if (!question) {
      return res
        .status(400)
        .json({
          error:
            "ጥያቄዎን ያስገቡ።"
        });
    }

    if (question.length > 3000) {
      return res
        .status(400)
        .json({
          error:
            "ጥያቄው ከ3000 ፊደል መብለጥ የለበትም።"
        });
    }

    /* ========================================================
       LANGUAGE VALIDATION
       ======================================================== */

    if (!LANGUAGE_NAMES[language]) {
      return res
        .status(400)
        .json({
          error:
            `Unsupported language: ${language}`
        });
    }

    /* ========================================================
       LOAD SUPABASE
       ======================================================== */

    const loaded =
      await getLessons();

    const rows =
      Array.isArray(loaded)
        ? loaded
        : [];

    /* ========================================================
       DETECT MAIN TOPIC
       ======================================================== */

    const detectedTopics =
      detectTopics(question);

    /* ========================================================
       RANK ALL RECORDS
       ======================================================== */

    let ranked =
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
            item.score > 0
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    /* ========================================================
       TOPIC BOOST
       ======================================================== */

    if (detectedTopics.length) {
      ranked =
        ranked
          .map(item => {
            let score =
              item.score;

            for (
              const topic
              of detectedTopics
            ) {
              if (
                rowMatchesTopic(
                  item.row,
                  topic
                )
              ) {
                score += 900;
              }
            }

            if (
              languageMatches(
                rowLanguage(item.row),
                language
              )
            ) {
              score += 1000;
            }

            return {
              row: item.row,
              score
            };
          })
          .sort(
            (a, b) =>
              b.score -
              a.score
          );
    }

    /* ========================================================
       LANGUAGE-FIRST SOURCE SELECTION
       ======================================================== */

    const languageRows =
      ranked.filter(item =>
        languageMatches(
          rowLanguage(item.row),
          language
        )
      );

    const otherRows =
      ranked.filter(item =>
        !languageMatches(
          rowLanguage(item.row),
          language
        )
      );

    /*
     * For Gemini, prefer selected-language records.
     * Other-language records are used only as supporting
     * knowledge when needed.
     */

    const selected =
      [
        ...languageRows.slice(0, 12),
        ...otherRows.slice(0, 4)
      ];

    /* Remove duplicates by row id */
    const uniqueSelected = [];

    const rowIds = new Set();

    for (const item of selected) {
      const id =
        item.row.id ??
        `${rowQuestion(item.row)}-${rowLanguage(item.row)}`;

      if (rowIds.has(id)) continue;

      rowIds.add(id);

      uniqueSelected.push(item);
    }

    const sources =
      buildSources(
        uniqueSelected
      );

    /* ========================================================
       GEMINI
       ======================================================== */

    let answer = "";

    let source = "supabase";

    if (GEMINI_API_KEY) {
      try {
        answer =
          await generateWithGemini(
            question,
            language,
            sources,
            answerLevel
          );

        source =
          "supabase+gemini";

      } catch (generationError) {
        console.error(
          "Gemini generation failed:",
          generationError?.message ||
          generationError
        );

        answer =
          fallbackAnswer(
            ranked,
            language
          );

        source =
          "supabase-fallback";
      }
    } else {
      answer =
        fallbackAnswer(
          ranked,
          language
        );

      source =
        "supabase-fallback";
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
          source: "none",
          matchedCount:
            uniqueSelected.length,

          detectedTopics,

          message:
            "No answer was generated."
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
        source,

        matchedCount:
          uniqueSelected.length,

        detectedTopics,

        sources:
          sources.map(item => ({
            question:
              item.question,

            language:
              item.language,

            category:
              item.category,

            education_level:
              item.education_level,

            bible_references:
              item.bible_references,

            church_sources:
              item.church_sources
          }))
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
