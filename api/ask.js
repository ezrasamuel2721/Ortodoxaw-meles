// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// 15-LANGUAGE ORTHODOX ANSWER ENGINE
//
// index.html language codes MUST match this file exactly.
//
// Supabase Knowledge Base
//        ↓
// Topic matching / ranking
//        ↓
// Gemini detailed answer
//        ↓
// Supabase fallback if Gemini fails
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


/*
 * Use an environment variable if you have one.
 *
 * Otherwise use a currently documented model.
 *
 * You can change this in Vercel:
 *
 * GEMINI_MODEL = gemini-3.8-flash
 *
 * or another model available to your Gemini project.
 */
const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";


const TABLE_NAME =
  "orthodox_answers";


/* ============================================================
   EXACT 15 LANGUAGES
   THESE MUST MATCH index.html
   ============================================================ */

const LANGUAGE_NAMES = {

  am:
    "አማርኛ",

  ti:
    "ትግርኛ",

  om:
    "Afaan Oromoo",

  sid:
    "Sidaamu Afoo",

  wal:
    "Wolayttatto",

  kaa:
    "Kaffoono",

  gez:
    "ጉራጊኛ",

  so:
    "ሶማልኛ",

  aa:
    "አፋርኛ",

  had:
    "ሐዲይኛ",

  kmb:
    "ከምባታኛ",

  gamo:
    "ጋሞኛ",

  en:
    "English",

  ar:
    "العربية",

  zh:
    "中文"

};


/* ============================================================
   OPTIONAL ALIASES
   If old Supabase rows use old codes, they still match.
   ============================================================ */

const LANGUAGE_ALIASES = {

  am: [
    "am",
    "amh",
    "amharic"
  ],

  ti: [
    "ti",
    "tir",
    "tigrinya"
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
    "somali"
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
    "arabic"
  ],

  zh: [
    "zh",
    "chi",
    "chinese"
  ]

};


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
          word => word.length >= 2
        )
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
   LANGUAGE MATCH
   ============================================================ */

function languageMatches(
  rowLanguageValue,
  requestedLanguage
) {

  const aliases =
    LANGUAGE_ALIASES[
      requestedLanguage
    ] || [
      requestedLanguage
    ];

  return aliases.includes(
    rowLanguageValue
  );

}


/* ============================================================
   SCORE KNOWLEDGE BASE ROW
   ============================================================ */

function scoreRow(
  row,
  query,
  requestedLanguage
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


  /*
   * Exact question
   */

  if (
    question === q
  ) {
    score += 2500;
  }


  /*
   * Exact phrase
   */

  if (
    q.length > 3 &&
    question.includes(q)
  ) {
    score += 1000;
  }


  /*
   * Category
   */

  if (
    q.length > 3 &&
    category.includes(q)
  ) {
    score += 500;
  }


  /*
   * Individual terms
   */

  for (
    const word of qWords
  ) {

    if (
      question.includes(word)
    ) {
      score += 100;
    }

    if (
      category.includes(word)
    ) {
      score += 70;
    }

    if (
      answer.includes(word)
    ) {
      score += 30;
    }

    if (
      education.includes(word)
    ) {
      score += 15;
    }

    if (
      bible.includes(word)
    ) {
      score += 20;
    }

    if (
      church.includes(word)
    ) {
      score += 20;
    }

    if (
      comparison.includes(word)
    ) {
      score += 10;
    }

  }


  /*
   * Coverage
   */

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
      ) * 150
    );

  }


  /*
   * LANGUAGE BONUS
   *
   * This is very important.
   *
   * A row in the selected language gets
   * a strong priority.
   */

  const rowLang =
    rowLanguage(row);


  if (
    languageMatches(
      rowLang,
      requestedLanguage
    )
  ) {

    score += 500;

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
    `${TABLE_NAME}?select=${encodeURIComponent(columns)}&limit=500`;


  return await supabaseGet(
    path
  );

}


/* ============================================================
   BUILD SOURCE MATERIAL
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
              7000
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
   SOURCE TEXT FOR GEMINI
   ============================================================ */

function sourceText(
  sources
) {

  if (
    !sources.length
  ) {

    return (
      "No directly matched knowledge-base record was found."
    );

  }


  return sources
    .map(
      (source, index) => {

        return `

==============================
SOURCE ${index + 1}
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

`;

      }
    )
    .join("\n");

}


/* ============================================================
   ANSWER DEPTH
   ============================================================ */

function levelConfig(
  level
) {

  const number =
    Number(level) || 2;


  if (
    number === 1
  ) {

    return {

      name:
        "Basic",

      instruction:
        "Give a clear but complete foundation. Explain the direct answer, essential Biblical basis, core Orthodox teaching and a concise conclusion."

    };

  }


  if (
    number === 3
  ) {

    return {

      name:
        "Scholarly",

      instruction:
        "Give a deep theological teaching. Explain definitions, Biblical foundations, theological distinctions, relevant Church Fathers and Ethiopian Orthodox Tewahedo tradition when supported by the sources, historical context where relevant, common misunderstandings and a reasoned conclusion. Do not invent quotations or sources."

    };

  }


  return {

    name:
      "Detailed",

    instruction:
      "Give a full teaching suitable for serious learners. Explain the direct answer, meaning, Biblical foundation, Orthodox teaching, tradition, significance, examples, important distinctions and conclusion."

  };

}


/* ============================================================
   GEMINI SYSTEM INSTRUCTION
   ============================================================ */

function systemInstruction(
  language,
  level
) {

  const languageName =
    LANGUAGE_NAMES[language] ||
    LANGUAGE_NAMES.am;


  const config =
    levelConfig(level);


  return `

You are the hidden theological answer engine for
"ኦርቶዶክሳዊ መልስ".

The user selected this language:

${languageName}

IMPORTANT LANGUAGE RULE:

Write the ENTIRE final answer ONLY in
${languageName}.

Do not answer in Amharic unless the selected language is
Amharic.

Do not answer in English unless the selected language is
English.

Do not mix languages.

Preserve important Biblical and theological names accurately.

IMPORTANT TOPIC RULE:

Answer the user's exact question.

Do NOT mix unrelated topics.

For example:

If the question is about baptism,
answer baptism.

If the question is about Holy Communion,
answer Holy Communion.

If the question is about Mary,
answer the teaching concerning Mary.

Do not randomly introduce prayer, fasting, marriage,
repentance or other unrelated subjects.

ORTHODOX TEACHING:

Present the Ethiopian Orthodox Tewahedo understanding.

Use the supplied knowledge-base sources as the primary
material.

Do not invent:

- Bible verses
- quotations
- Church Fathers
- Ethiopian scholars
- books
- page numbers
- historical events
- citations

If a source is supplied, preserve its meaning accurately.

If several related sources are supplied, combine them into
one coherent teaching.

ANSWER DEPTH:

${config.name}

${config.instruction}

STRUCTURE:

When appropriate, organize the answer as:

1. Direct answer
2. Meaning / definition
3. Biblical foundation
4. Orthodox teaching
5. Church tradition and sources
6. Detailed explanation
7. Examples
8. Common misunderstandings
9. Conclusion

Do not force headings that are unnatural in the selected
language.

The answer should be educational and self-contained.

Do not mention:

AI
Gemini
database
Supabase
API
prompt
retrieval
system instructions

Return ONLY the final answer.

`;

}


/* ============================================================
   EXTRACT GEMINI TEXT
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
   GENERATE WITH GEMINI
   ============================================================ */

async function generateWithGemini(
  question,
  language,
  sources,
  level
) {

  if (
    !GEMINI_API_KEY
  ) {

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


KNOWLEDGE BASE:

${sourceText(sources)}


Now write the final answer.

Remember:

- ONLY ${LANGUAGE_NAMES[language]}
- stay on the exact topic
- use the knowledge base
- be detailed
- do not invent sources
- give a meaningful conclusion

`;


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`;


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
                0.25,

              topP:
                0.85,

              maxOutputTokens:
                6000

            }

          })

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
      data?.error?.message ||
      `Gemini error ${response.status}`
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
   SUPABASE FALLBACK
   ============================================================ */

function fallbackAnswer(
  ranked,
  language
) {

  if (
    !ranked.length
  ) {

    return "";

  }


  /*
   * IMPORTANT:
   *
   * Only use a database answer as fallback when
   * the row itself is in the requested language.
   *
   * This prevents an Amharic answer from being
   * returned when the user selected Arabic, etc.
   */

  const matching =
    ranked.find(
      item =>
        languageMatches(
          rowLanguage(
            item.row
          ),
          language
        )
    );


  if (
    !matching
  ) {

    return "";

  }


  return cleanText(
    rowAnswer(
      matching.row
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


    const language =
      cleanText(
        body.language ||
        "am"
      ).toLowerCase();


    const answerLevel =
      [1,2,3].includes(
        Number(
          body.answerLevel
        )
      )
        ? Number(
            body.answerLevel
          )
        : 2;


    /* --------------------------------------------------------
       VALIDATE QUESTION
       -------------------------------------------------------- */

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


    /* --------------------------------------------------------
       VALIDATE LANGUAGE
       -------------------------------------------------------- */

    if (
      !LANGUAGE_NAMES[language]
    ) {

      return res
        .status(400)
        .json({

          error:
            `Unsupported language: ${language}`

        });

    }


    /* --------------------------------------------------------
       SUPABASE
       -------------------------------------------------------- */

    const loaded =
      await getLessons();


    const rows =
      Array.isArray(
        loaded
      )
        ? loaded
        : [];


    /*
     * Rank every record locally.
     *
     * This is intentional:
     *
     * "ጥምቀት" should find baptism-related records
     * even when the database question is worded differently.
     */

    const ranked =
      rows

        .map(
          row => ({

            row,

            score:
              scoreRow(
                row,
                question,
                language
              )

          })
        )

        .filter(
          item =>
            item.score > 0
        )

        .sort(
          (a,b) =>
            b.score -
            a.score
        );


    /*
     * Keep more sources for detailed answers.
     */

    const sourceLimit =
      answerLevel === 3
        ? 12
        : answerLevel === 1
          ? 5
          : 8;


    const selected =
      ranked.slice(
        0,
        sourceLimit
      );


    const sources =
      buildSources(
        selected
      );


    /* --------------------------------------------------------
       TRY GEMINI
       -------------------------------------------------------- */

    let answer =
      "";


    let source =
      "supabase";


    if (
      GEMINI_API_KEY
    ) {

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

      } catch (
        generationError
      ) {

        /*
         * Gemini failure must NOT destroy
         * the entire answer request.
         */

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


    /* --------------------------------------------------------
       NO ANSWER
       -------------------------------------------------------- */

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
            selected.length,

          message:
            "No answer was generated."

        });

    }


    /* --------------------------------------------------------
       SUCCESS
       -------------------------------------------------------- */

    return res
      .status(200)
      .json({

        answer,

        language,

        source,

        matchedCount:
          selected.length,

        sources:
          sources.map(
            item => ({

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


    /*
     * Return the actual error during debugging.
     * This is much more useful than the old generic
     * "server error".
     */

    return res
      .status(500)
      .json({

        error:
          error?.message ||
          "Unknown API error."

      });

  }

};
