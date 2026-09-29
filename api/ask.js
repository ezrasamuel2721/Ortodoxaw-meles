// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// 15-LANGUAGE ORTHODOX ANSWER ENGINE
//
// FLOW:
//
// User Question
//      ↓
// Language validation
//      ↓
// Main topic detection
//      ↓
// Supabase knowledge base
//      ↓
// Strict topic filtering
//      ↓
// Relevant source ranking
//      ↓
// Gemini detailed synthesis
//      ↓
// Structured Orthodox answer
//      ↓
// Safe single-row fallback
//
// IMPORTANT:
// This file is designed to work with the existing
// orthodox_answers table.
//
// Expected columns:
//
// id
// question
// answer
// language
// category
// education_level
// bible_references
// church_sources
// comparison_group
// ============================================================


/* ============================================================
   CONFIGURATION
   ============================================================ */

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


/*
 * Current Gemini model.
 *
 * Can be changed in Vercel by setting:
 *
 * GEMINI_MODEL
 *
 * Example:
 *
 * gemini-3.8-flash
 */

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";


const TABLE_NAME =
  "orthodox_answers";


/* ============================================================
   EXACT 15 LANGUAGES
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
    "afaan oromoo"
  ],

  sid: [
    "sid",
    "sidaamu",
    "sidaama",
    "sidaamu afoo"
  ],

  wal: [
    "wal",
    "wolaytta",
    "wolayttatto"
  ],

  kaa: [
    "kaa",
    "kaf",
    "kafa",
    "kaffoono"
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
    "soomaali"
  ],

  aa: [
    "aa",
    "aar",
    "afar",
    "afaraf"
  ],

  had: [
    "had",
    "hadiyya",
    "hadiyyigna"
  ],

  kmb: [
    "kmb",
    "kembata",
    "kambata"
  ],

  gamo: [
    "gamo",
    "gma"
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
    "chinese",
    "中文"
  ]

};


/* ============================================================
   TEXT HELPERS
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

  const text =
    normalize(value);

  if (!text) {
    return [];
  }

  return [
    ...new Set(
      text
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 2
        )
    )
  ];

}


/* ============================================================
   LANGUAGE NORMALIZATION
   ============================================================ */

function canonicalLanguage(value) {

  const normalized =
    normalize(value);

  for (
    const [code, aliases]
    of Object.entries(
      LANGUAGE_ALIASES
    )
  ) {

    if (
      aliases
        .map(normalize)
        .includes(normalized)
    ) {

      return code;

    }

  }

  return normalized;

}


function languageMatches(
  rowLanguageValue,
  requestedLanguage
) {

  const rowLang =
    normalize(
      rowLanguageValue
    );

  const aliases =
    LANGUAGE_ALIASES[
      requestedLanguage
    ] || [
      requestedLanguage
    ];

  return aliases
    .map(normalize)
    .includes(rowLang);

}


/* ============================================================
   DATABASE FIELD HELPERS
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

  return normalize(
    row.language ??
    row.lang ??
    row.lang_code ??
    ""
  );

}


/* ============================================================
   MAIN TOPIC DICTIONARY
   ============================================================ */

const TOPIC_TERMS = {

  baptism: [

    "ጥምቀት",
    "ጥምቀታ",
    "ተጠምቀ",
    "baptism",
    "baptize",
    "baptized",
    "baptismal",
    "tiqmet",
    "cuuphaa",
    "cuuphamuu",
    "sidaamu",
    "wolaytta",
    "kaf"

  ],

  communion: [

    "ቁርባን",
    "ቅዱስ ቁርባን",
    "ሥጋና ደም",
    "eucharist",
    "communion",
    "holy communion",
    "body and blood",
    "sacrament"

  ],

  mary: [

    "ማርያም",
    "ድንግል",
    "ቅድስት ድንግል",
    "mother of god",
    "mary",
    "virgin mary",
    "theotokos"

  ],

  trinity: [

    "ሥላሴ",
    "አብ",
    "ወልድ",
    "መንፈስ ቅዱስ",
    "trinity",
    "father son holy spirit",
    "holy spirit"

  ],

  repentance: [

    "ንስሐ",
    "ኃጢአት",
    "ንስሃ",
    "repentance",
    "repent",
    "confession",
    "sin"

  ],

  prayer: [

    "ጸሎት",
    "ጸልይ",
    "መጸለይ",
    "prayer",
    "pray",
    "praying"

  ],

  fasting: [

    "ጾም",
    "መጾም",
    "fasting",
    "fast",
    "lent"

  ],

  cross: [

    "መስቀል",
    "ቅዱስ መስቀል",
    "cross",
    "holy cross"

  ],

  incarnation: [

    "ሥጋዌ",
    "ሰው መሆን",
    "incarnation",
    "incarnate",
    "word became flesh"

  ],

  faith: [

    "እምነት",
    "ሃይማኖት",
    "faith",
    "belief",
    "religion"

  ],

  church: [

    "ቤተ ክርስቲያን",
    "ቤተክርስቲያን",
    "church",
    "christian church"

  ],

  saints: [

    "ቅዱሳን",
    "ቅዱስ",
    "ቅድስት",
    "saints",
    "saint"

  ],

  holy_spirit: [

    "መንፈስ ቅዱስ",
    "holy spirit",
    "holy ghost"

  ],

  salvation: [

    "ድኅነት",
    "ድህነት",
    "መዳን",
    "salvation",
    "saved",
    "save"

  ]

};


/* ============================================================
   DETECT TOPIC
   ============================================================ */

function detectTopics(
  question
) {

  const q =
    normalize(question);

  const found = [];

  for (
    const [topic, terms]
    of Object.entries(
      TOPIC_TERMS
    )
  ) {

    for (
      const term
      of terms
    ) {

      const t =
        normalize(term);

      if (
        t &&
        q.includes(t)
      ) {

        found.push(topic);

        break;

      }

    }

  }

  return [
    ...new Set(found)
  ];

}


/* ============================================================
   CHECK ROW TOPIC
   ============================================================ */

function rowMatchesTopic(
  row,
  topic
) {

  const combined =
    normalize(
      [
        rowQuestion(row),
        rowAnswer(row),
        row.category,
        row.bible_references,
        row.church_sources,
        row.comparison_group
      ].join(" ")
    );


  const terms =
    TOPIC_TERMS[
      topic
    ] || [];


  return terms.some(
    term =>
      combined.includes(
        normalize(term)
      )
  );

}


/* ============================================================
   SCORE KNOWLEDGE BASE ROW
   ============================================================ */

function scoreRow(
  row,
  query,
  requestedLanguage,
  detectedTopics
) {

  const q =
    normalize(query);

  const qWords =
    words(query);


  const question =
    normalize(
      rowQuestion(row)
    );

  const answer =
    normalize(
      rowAnswer(row)
    );

  const category =
    normalize(
      row.category
    );

  const education =
    normalize(
      row.education_level
    );

  const bible =
    normalize(
      row.bible_references
    );

  const church =
    normalize(
      row.church_sources
    );

  const comparison =
    normalize(
      row.comparison_group
    );


  if (
    !question &&
    !answer
  ) {

    return 0;

  }


  const fields = [
    question,
    answer,
    category,
    education,
    bible,
    church,
    comparison
  ];


  let score = 0;


  /* ----------------------------------------------------------
     EXACT QUESTION
     ---------------------------------------------------------- */

  if (
    question === q
  ) {

    score += 5000;

  }


  /* ----------------------------------------------------------
     EXACT PHRASE
     ---------------------------------------------------------- */

  if (
    q.length >= 4 &&
    question.includes(q)
  ) {

    score += 2000;

  }


  /* ----------------------------------------------------------
     LANGUAGE
     ---------------------------------------------------------- */

  if (
    languageMatches(
      rowLanguage(row),
      requestedLanguage
    )
  ) {

    score += 1000;

  } else {

    score -= 300;

  }


  /* ----------------------------------------------------------
     TOPIC
     ---------------------------------------------------------- */

  for (
    const topic
    of detectedTopics
  ) {

    if (
      rowMatchesTopic(
        row,
        topic
      )
    ) {

      score += 1500;

    }

  }


  /* ----------------------------------------------------------
     CATEGORY
     ---------------------------------------------------------- */

  for (
    const word
    of qWords
  ) {

    if (
      question.includes(word)
    ) {

      score += 150;

    }

    if (
      category.includes(word)
    ) {

      score += 100;

    }

    if (
      answer.includes(word)
    ) {

      score += 35;

    }

    if (
      education.includes(word)
    ) {

      score += 15;

    }

    if (
      bible.includes(word)
    ) {

      score += 25;

    }

    if (
      church.includes(word)
    ) {

      score += 25;

    }

    if (
      comparison.includes(word)
    ) {

      score += 10;

    }

  }


  /* ----------------------------------------------------------
     COVERAGE
     ---------------------------------------------------------- */

  const hits =
    qWords.filter(
      word =>
        fields.some(
          field =>
            field.includes(word)
        )
    ).length;


  if (
    qWords.length
  ) {

    score += Math.round(
      (
        hits /
        qWords.length
      ) * 200
    );

  }


  return score;

}


/* ============================================================
   SUPABASE GET
   ============================================================ */

async function supabaseGet(
  path
) {

  if (
    !SUPABASE_ANON_KEY
  ) {

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


  const text =
    await response.text();


  let data = null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data = null;

  }


  if (
    !response.ok
  ) {

    throw new Error(
      data?.message ||
      data?.hint ||
      `Supabase error ${response.status}: ${text}`
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
    `${TABLE_NAME}` +
    `?select=${encodeURIComponent(columns)}` +
    `&limit=1000`;


  return await supabaseGet(
    path
  );

}


/* ============================================================
   BUILD SOURCES
   ============================================================ */

function buildSources(
  ranked
) {

  return ranked
    .map(
      item => {

        const row =
          item.row;


        return {

          question:
            cleanText(
              rowQuestion(row)
            ),

          answer:
            cleanText(
              rowAnswer(row)
            ).slice(
              0,
              9000
            ),

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

      }
    );

}


/* ============================================================
   SOURCE TEXT
   ============================================================ */

function sourceText(
  sources
) {

  if (
    !sources.length
  ) {

    return (
      "No directly matched knowledge-base source was found."
    );

  }


  return sources
    .map(
      (
        source,
        index
      ) => {

        return `

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

Comparison:
${source.comparison_group}

Knowledge:
${source.answer}

`;

      }
    )
    .join("\n");

}


/* ============================================================
   ANSWER LEVEL
   ============================================================ */

function levelConfig(
  level
) {

  if (
    Number(level) === 1
  ) {

    return {

      name:
        "Basic",

      instruction:
        "Give a clear foundational explanation while remaining accurate and complete."

    };

  }


  if (
    Number(level) === 3
  ) {

    return {

      name:
        "Scholarly",

      instruction:
        "Give a deep theological explanation with careful distinctions, Biblical foundations, Church Fathers and Ethiopian Orthodox Tewahedo tradition only where supported by the supplied sources. Do not invent citations."

    };

  }


  return {

    name:
      "Detailed",

    instruction:
      "Give a full, coherent teaching suitable for serious learners. Explain the direct answer, definition, Biblical foundation, Orthodox teaching, theological meaning, practical significance, examples, important distinctions and conclusion."

  };

}


/* ============================================================
   GEMINI SYSTEM INSTRUCTION
   ============================================================ */

function systemInstruction(
  language,
  level,
  topics
) {

  const languageName =
    LANGUAGE_NAMES[language];


  const config =
    levelConfig(level);


  const topicText =
    topics.length
      ? topics.join(", ")
      : "No fixed topic was detected.";


  return `

You are the theological answer engine of
"ኦርቶዶክሳዊ መልስ".

The user selected:

${languageName}

The entire final answer MUST be written ONLY in:

${languageName}

Never answer in another language.

Never mix languages.

Do not translate the question into another language.

------------------------------------------------------------
MAIN TOPIC
------------------------------------------------------------

Detected main topic:

${topicText}

Stay strictly focused on the user's question.

If the topic is baptism, do not turn the answer into a
general lesson about Communion, fasting, prayer, repentance,
Mary or unrelated subjects.

Only mention another subject when it is genuinely necessary
to explain the main question.

------------------------------------------------------------
ORTHODOX POSITION
------------------------------------------------------------

Explain according to the Ethiopian Orthodox Tewahedo
understanding.

Use the supplied knowledge sources as the primary evidence.

Do not invent:

- Bible verses
- quotations
- Church Fathers
- Ethiopian scholars
- books
- page numbers
- historical claims
- citations

If the knowledge source does not contain enough information,
do not pretend that a source exists.

------------------------------------------------------------
ANSWER QUALITY
------------------------------------------------------------

Answer level:

${config.name}

${config.instruction}

The answer must NOT be a short database summary.

The knowledge base is source material.

Your task is to understand the sources and write one
coherent, educational answer.

------------------------------------------------------------
REQUIRED STRUCTURE
------------------------------------------------------------

When appropriate, organize the answer in this order:

1. Direct answer
2. Definition / meaning
3. Biblical foundation
4. Ethiopian Orthodox Tewahedo teaching
5. Detailed theological explanation
6. Church tradition and reliable sources
7. Practical or spiritual significance
8. Examples or clarification
9. Common misunderstandings, if relevant
10. Conclusion

Use natural headings.

Do not repeat the same sentence.

Do not paste several database answers one after another.

Synthesize them into ONE answer.

------------------------------------------------------------
VERY IMPORTANT
------------------------------------------------------------

Return ONE final answer.

Do not say:

AI
Gemini
database
Supabase
API
prompt
knowledge base
retrieval
system instruction

Return ONLY the final theological answer.

`;

}


/* ============================================================
   EXTRACT GEMINI ANSWER
   ============================================================ */

function extractGeminiText(
  data
) {

  const parts =
    data?.candidates?.[0]
      ?.content?.parts || [];


  return parts
    .map(
      part =>
        part?.text || ""
    )
    .join("\n")
    .trim();

}


/* ============================================================
   GEMINI GENERATION
   ============================================================ */

async function generateWithGemini(
  question,
  language,
  sources,
  level,
  topics
) {

  if (
    !GEMINI_API_KEY
  ) {

    throw new Error(
      "GEMINI_API_KEY is missing in Vercel."
    );

  }


  if (
    !sources.length
  ) {

    throw new Error(
      "No relevant knowledge sources were found for Gemini."
    );

  }


  const instruction =
    systemInstruction(
      language,
      level,
      topics
    );


  const prompt = `

USER QUESTION:

${question}


MAIN TOPIC:

${topics.length
  ? topics.join(", ")
  : "Use the exact question to determine the subject."
}


RELEVANT ORTHODOX KNOWLEDGE:

${sourceText(sources)}


TASK:

Write ONE complete and coherent answer to the user's
question.

Use the supplied knowledge as the primary source.

Do not combine unrelated subjects.

Do not copy the sources as separate answers.

Synthesize the relevant material.

The answer must be detailed, educational and self-contained.

Use clear headings where appropriate.

Write the ENTIRE answer only in:

${LANGUAGE_NAMES[language]}

End with a meaningful conclusion.

`;


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;


  const response =
    await fetch(
      url,
      {

        method:
          "POST",

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

                role:
                  "user",

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
                0.2,

              topP:
                0.85,

              maxOutputTokens:
                7000

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


  if (
    !response.ok
  ) {

    const message =
      data?.error?.message ||
      raw ||
      `Gemini HTTP ${response.status}`;


    throw new Error(
      `Gemini ${response.status}: ${message}`
    );

  }


  const answer =
    extractGeminiText(
      data
    );


  if (
    !answer
  ) {

    throw new Error(
      "Gemini returned an empty answer."
    );

  }


  return answer;

}


/* ============================================================
   STRICT FALLBACK
   ============================================================ */

function fallbackAnswer(
  ranked,
  language,
  topics
) {

  /*
   * Only requested-language rows.
   */

  let candidates =
    ranked.filter(
      item =>
        languageMatches(
          rowLanguage(
            item.row
          ),
          language
        )
    );


  if (
    !candidates.length
  ) {

    return "";

  }


  /*
   * Keep the main topic.
   */

  if (
    topics.length
  ) {

    const topicCandidates =
      candidates.filter(
        item =>
          topics.some(
            topic =>
              rowMatchesTopic(
                item.row,
                topic
              )
          )
      );


    if (
      topicCandidates.length
    ) {

      candidates =
        topicCandidates;

    }

  }


  /*
   * IMPORTANT:
   *
   * Return ONE best answer.
   *
   * Never concatenate multiple unrelated
   * Supabase answers.
   */

  const best =
    candidates[0];


  if (!best) {

    return "";

  }


  return cleanText(
    rowAnswer(
      best.row
    )
  );

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


  /* ==========================================================
     METHOD
     ========================================================== */

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


    /* ========================================================
       QUESTION
       ======================================================== */

    const question =
      cleanText(
        body.question
      );


    /* ========================================================
       LANGUAGE
       ======================================================== */

    const language =
      canonicalLanguage(
        body.language ||
        "am"
      );


    /* ========================================================
       ANSWER LEVEL
       ======================================================== */

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
       VALIDATION
       ======================================================== */

    if (
      !question
    ) {

      return res
        .status(400)
        .json({

          error:
            "ጥያቄዎን ያስገቡ።"

        });

    }


    if (
      question.length > 3000
    ) {

      return res
        .status(400)
        .json({

          error:
            "ጥያቄው ከ3000 ፊደል መብለጥ የለበትም።"

        });

    }


    if (
      !LANGUAGE_NAMES[language]
    ) {

      return res
        .status(400)
        .json({

          error:
            `Unsupported language: ${body.language}`

        });

    }


    /* ========================================================
       TOPIC DETECTION
       ======================================================== */

    const detectedTopics =
      detectTopics(
        question
      );


    /* ========================================================
       LOAD SUPABASE
       ======================================================== */

    const loaded =
      await getLessons();


    const rows =
      Array.isArray(
        loaded
      )
        ? loaded
        : [];


    /* ========================================================
       SCORE ALL ROWS
       ======================================================== */

    const ranked =
      rows
        .map(
          row => ({

            row,

            score:
              scoreRow(
                row,
                question,
                language,
                detectedTopics
              )

          })
        )
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
       STRICT TOPIC FILTER
       ======================================================== */

    let relevant =
      ranked;


    if (
      detectedTopics.length
    ) {

      const topicRows =
        ranked.filter(
          item =>
            detectedTopics.some(
              topic =>
                rowMatchesTopic(
                  item.row,
                  topic
                )
            )
        );


      if (
        topicRows.length
      ) {

        relevant =
          topicRows;

      }

    }


    /* ========================================================
       SAME LANGUAGE FIRST
       ======================================================== */

    const sameLanguage =
      relevant.filter(
        item =>
          languageMatches(
            rowLanguage(
              item.row
            ),
            language
          )
      );


    const otherLanguage =
      relevant.filter(
        item =>
          !languageMatches(
            rowLanguage(
              item.row
            ),
            language
          )
      );


    /*
     * Give Gemini mostly same-language sources.
     *
     * Other language sources can help when the selected
     * language has insufficient database material.
     */

    const selected = [

      ...sameLanguage.slice(
        0,
        8
      ),

      ...otherLanguage.slice(
        0,
        2
      )

    ];


    /* ========================================================
       BUILD SOURCES
       ======================================================== */

    const sources =
      buildSources(
        selected
      );


    /* ========================================================
       GEMINI
       ======================================================== */

    let answer =
      "";

    let source =
      "none";

    let geminiError =
      "";


    if (
      GEMINI_API_KEY
    ) {

      try {

        answer =
          await generateWithGemini(
            question,
            language,
            sources,
            answerLevel,
            detectedTopics
          );


        source =
          "supabase+gemini";


      } catch (
        error
      ) {

        geminiError =
          error?.message ||
          String(error);


        console.error(
          "GEMINI FAILED:",
          geminiError
        );

      }

    } else {

      geminiError =
        "GEMINI_API_KEY is missing in Vercel.";

    }


    /* ========================================================
       FALLBACK
       ======================================================== */

    if (
      !answer
    ) {

      answer =
        fallbackAnswer(
          relevant,
          language,
          detectedTopics
        );


      if (
        answer
      ) {

        source =
          "supabase-fallback";

      }

    }


    /* ========================================================
       NO ANSWER
       ======================================================== */

    if (
      !answer
    ) {

      return res
        .status(200)
        .json({

          answer:
            "",

          language,

          source:
            "none",

          matchedCount:
            relevant.length,

          detectedTopics,

          diagnostics: {

            geminiConfigured:
              Boolean(
                GEMINI_API_KEY
              ),

            geminiUsed:
              false,

            fallbackUsed:
              false,

            geminiError,

            totalRows:
              rows.length,

            sameLanguageRows:
              sameLanguage.length,

            relevantRows:
              relevant.length

          },

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
          relevant.length,

        detectedTopics,

        diagnostics: {

          geminiConfigured:
            Boolean(
              GEMINI_API_KEY
            ),

          geminiUsed:
            source ===
            "supabase+gemini",

          fallbackUsed:
            source ===
            "supabase-fallback",

          geminiError,

          totalRows:
            rows.length,

          sameLanguageRows:
            sameLanguage.length,

          relevantRows:
            relevant.length

        },

        sources:
          sources.map(
            item => ({

              question:
                item.question,

              language:
                item.language,

              category:
                item.category,

              bible_references:
                item.bible_references,

              church_sources:
                item.church_sources

            })
          )

      });


  } catch (
    error
  ) {

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
