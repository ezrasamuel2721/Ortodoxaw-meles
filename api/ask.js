// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL ORTHODOX ANSWER ENGINE
//
// index.html አይቀየርም
//
// 15 Languages
// Supabase Knowledge Base
// Topic Matching
// Gemini Detailed Answer
// Safe fallback
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

const SUPABASE_KEY =
  SUPABASE_SERVICE_ROLE_KEY ||
  SUPABASE_ANON_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-1.5-flash";

const TABLE_NAME =
  "orthodox_answers";


// ============================================================
// EXACT 15 LANGUAGES
// ============================================================

const LANGUAGES = {

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


// ============================================================
// LANGUAGE ALIASES
// ============================================================

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
    "wolayttatto",
    "wolayta"
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
    "ከምባታኛ"
  ],

  gamo: [
    "gamo",
    "gma",
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
    "chinese",
    "中文"
  ]

};


// ============================================================
// TEXT HELPERS
// ============================================================

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


function getWords(value) {

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


// ============================================================
// ROW HELPERS
// ============================================================

function rowQuestion(row) {

  return cleanText(
    row.question ??
    row.Question ??
    row.question_text ??
    row.title ??
    row.q ??
    ""
  );

}


function rowAnswer(row) {

  return cleanText(
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


function rowCategory(row) {

  return cleanText(
    row.category ??
    ""
  );

}


function rowEducation(row) {

  return cleanText(
    row.education_level ??
    ""
  );

}


function rowBible(row) {

  return cleanText(
    row.bible_references ??
    ""
  );

}


function rowChurch(row) {

  return cleanText(
    row.church_sources ??
    ""
  );

}


function rowComparison(row) {

  return cleanText(
    row.comparison_group ??
    ""
  );

}


// ============================================================
// LANGUAGE MATCH
// ============================================================

function languageMatches(
  rowLang,
  requested
) {

  const aliases =
    LANGUAGE_ALIASES[requested] || [];

  const value =
    normalize(rowLang);

  return aliases.includes(value);

}


// ============================================================
// STOP WORDS
//
// These prevent very common words from dominating search.
// ============================================================

const STOP_WORDS = new Set([

  "ምን",
  "ነው",
  "እንዴት",
  "ስለ",
  "የ",
  "እና",
  "ነገር",
  "ማለት",

  "what",
  "is",
  "the",
  "how",
  "why",
  "about",
  "and",
  "of",
  "to",

  "من",
  "ما",
  "هو",
  "كيف",
  "لماذا"

]);


// ============================================================
// IMPORTANT TOPIC TERMS
//
// Helps keep related records together.
// ============================================================

const TOPIC_GROUPS = [

  {
    name: "baptism",
    terms: [
      "ጥምቀት",
      "baptism",
      "ተጠመቀ",
      "ተጠምቆ",
      "ጥምቀትን"
    ]
  },

  {
    name: "communion",
    terms: [
      "ቁርባን",
      "ሥጋ",
      "ደም",
      "communion",
      "eucharist"
    ]
  },

  {
    name: "repentance",
    terms: [
      "ንስሐ",
      "ኃጢአት",
      "repentance",
      "confession"
    ]
  },

  {
    name: "prayer",
    terms: [
      "ጸሎት",
      "መጸለይ",
      "prayer"
    ]
  },

  {
    name: "fasting",
    terms: [
      "ጾም",
      "መጾም",
      "fasting",
      "fast"
    ]
  },

  {
    name: "mary",
    terms: [
      "ማርያም",
      "ድንግል",
      "እመቤታችን",
      "mary",
      "virgin"
    ]
  },

  {
    name: "trinity",
    terms: [
      "ሥላሴ",
      "አብ",
      "ወልድ",
      "መንፈስ",
      "trinity"
    ]
  },

  {
    name: "incarnation",
    terms: [
      "ሥጋዌ",
      "ኢየሱስ",
      "ክርስቶስ",
      "incarnation"
    ]
  },

  {
    name: "cross",
    terms: [
      "መስቀል",
      "cross"
    ]
  },

  {
    name: "ark",
    terms: [
      "ታቦት",
      "ark"
    ]
  }

];


// ============================================================
// DETECT TOPIC
// ============================================================

function detectTopic(question) {

  const q =
    normalize(question);

  let best =
    null;

  let bestScore =
    0;

  for (
    const group of TOPIC_GROUPS
  ) {

    let score =
      0;

    for (
      const term of group.terms
    ) {

      const normalizedTerm =
        normalize(term);

      if (
        q.includes(normalizedTerm)
      ) {

        score +=
          normalizedTerm.length >= 4
            ? 5
            : 3;

      }

    }

    if (
      score > bestScore
    ) {

      bestScore =
        score;

      best =
        group.name;

    }

  }

  return best;

}


// ============================================================
// SCORE ROW
// ============================================================

function scoreRow(
  row,
  question,
  requestedLanguage
) {

  const q =
    normalize(question);

  const qWords =
    getWords(question)
      .filter(
        word =>
          !STOP_WORDS.has(word)
      );

  const rq =
    normalize(
      rowQuestion(row)
    );

  const ra =
    normalize(
      rowAnswer(row)
    );

  const category =
    normalize(
      rowCategory(row)
    );

  const bible =
    normalize(
      rowBible(row)
    );

  const church =
    normalize(
      rowChurch(row)
    );

  const comparison =
    normalize(
      rowComparison(row)
    );

  const rowLang =
    rowLanguage(row);

  if (
    !rq &&
    !ra
  ) {

    return 0;

  }

  let score =
    0;


  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  if (
    languageMatches(
      rowLang,
      requestedLanguage
    )
  ) {

    score +=
      1000;

  } else {

    // Different-language rows are strongly penalized.
    score -=
      350;

  }


  // ----------------------------------------------------------
  // EXACT QUESTION
  // ----------------------------------------------------------

  if (
    rq === q
  ) {

    score +=
      3000;

  }


  // ----------------------------------------------------------
  // EXACT PHRASE
  // ----------------------------------------------------------

  if (
    q.length >= 4 &&
    rq.includes(q)
  ) {

    score +=
      1500;

  }


  // ----------------------------------------------------------
  // WORD MATCH
  // ----------------------------------------------------------

  let hits =
    0;

  for (
    const word of qWords
  ) {

    let found =
      false;

    if (
      rq.includes(word)
    ) {

      score +=
        180;

      found =
        true;

    }

    if (
      category.includes(word)
    ) {

      score +=
        120;

      found =
        true;

    }

    if (
      ra.includes(word)
    ) {

      score +=
        45;

      found =
        true;

    }

    if (
      bible.includes(word)
    ) {

      score +=
        30;

      found =
        true;

    }

    if (
      church.includes(word)
    ) {

      score +=
        30;

      found =
        true;

    }

    if (
      comparison.includes(word)
    ) {

      score +=
        10;

      found =
        true;

    }

    if (found) {
      hits++;
    }

  }


  // ----------------------------------------------------------
  // COVERAGE
  // ----------------------------------------------------------

  if (
    qWords.length > 0
  ) {

    score +=
      Math.round(
        (
          hits /
          qWords.length
        ) * 500
      );

  }


  // ----------------------------------------------------------
  // TOPIC BONUS
  // ----------------------------------------------------------

  const requestedTopic =
    detectTopic(question);

  if (
    requestedTopic
  ) {

    const allRowText =
      normalize(
        [
          rowQuestion(row),
          rowAnswer(row),
          rowCategory(row),
          rowBible(row),
          rowChurch(row)
        ].join(" ")
      );

    const topicGroup =
      TOPIC_GROUPS.find(
        group =>
          group.name ===
          requestedTopic
      );

    if (
      topicGroup
    ) {

      let topicHits =
        0;

      for (
        const term of topicGroup.terms
      ) {

        if (
          allRowText.includes(
            normalize(term)
          )
        ) {

          topicHits++;

        }

      }

      score +=
        topicHits *
        150;

    }

  }


  return score;

}


// ============================================================
// SUPABASE GET
// ============================================================

async function supabaseGet(
  path
) {

  if (
    !SUPABASE_KEY
  ) {

    throw new Error(
      "SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is missing."
    );

  }


  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {

        method:
          "GET",

        headers: {

          apikey:
            SUPABASE_KEY,

          Authorization:
            `Bearer ${SUPABASE_KEY}`,

          Accept:
            "application/json"

        }

      }
    );


  const text =
    await response.text();

  let data =
    null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data =
      null;

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


// ============================================================
// LOAD KNOWLEDGE BASE
//
// IMPORTANT:
// Use the columns that belong to the current
// orthodox_answers table.
// ============================================================

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
    )}&limit=1000`;


  return await supabaseGet(
    path
  );

}


// ============================================================
// BUILD SOURCES
// ============================================================

function buildSources(
  ranked
) {

  return ranked.map(
    item => {

      const row =
        item.row;

      return {

        score:
          item.score,

        question:
          rowQuestion(row),

        answer:
          rowAnswer(row)
            .slice(0, 9000),

        language:
          rowLanguage(row),

        category:
          rowCategory(row),

        education_level:
          rowEducation(row),

        bible_references:
          rowBible(row),

        church_sources:
          rowChurch(row),

        comparison_group:
          rowComparison(row)

      };

    }
  );

}


// ============================================================
// FORMAT SOURCES FOR GEMINI
// ============================================================

function makeContext(
  sources
) {

  if (
    !sources.length
  ) {

    return (
      "No directly matching knowledge-base source was found."
    );

  }


  return sources
    .map(
      (source, index) => {

        return `

==============================
RELEVANT SOURCE ${index + 1}
==============================

Question:
${source.question}

Language:
${source.language}

Category:
${source.category}

Education:
${source.education_level}

Bible references:
${source.bible_references}

Church sources:
${source.church_sources}

Comparison:
${source.comparison_group}

Content:
${source.answer}

`;

      }
    )
    .join("\n");

}


// ============================================================
// GEMINI SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(
  language,
  question
) {

  const languageName =
    LANGUAGES[language];

  const topic =
    detectTopic(question);


  return `

You are the theological answer engine of
"ኦርቶዶክሳዊ መልስ".

Your task is to provide a complete,
accurate, educational answer according to
the Ethiopian Orthodox Tewahedo understanding.

==================================================
LANGUAGE
==================================================

The requested language is:

${languageName}

The ENTIRE answer MUST be written in:

${languageName}

Do not switch to Amharic.

Do not switch to English.

Do not mix languages.

Only use another language when an exact
proper name or Biblical reference requires it.

==================================================
QUESTION
==================================================

${question}

==================================================
TOPIC
==================================================

Detected topic:

${topic || "general Orthodox theological question"}

Stay strictly on this topic.

Do NOT combine unrelated subjects.

For example, if the question is about:

ጥምቀት

do not add unrelated sections about:

ጾም
ጸሎት
ቁርባን
ጋብቻ
ንስሐ

unless they are directly necessary for answering
the baptism question.

==================================================
ORTHODOX POSITION
==================================================

Explain the Ethiopian Orthodox Tewahedo teaching.

Be respectful and theological.

If comparison with another religion or denomination
is explicitly requested, explain both positions fairly,
then clearly explain the Ethiopian Orthodox Tewahedo
position.

Do not attack other religions.

==================================================
KNOWLEDGE BASE
==================================================

Use the supplied knowledge-base sources as evidence.

Prefer sources that are directly related to the question.

Do not combine unrelated sources simply because
they exist in the database.

Do not invent:

- Bible references
- Church Fathers
- Ethiopian scholars
- books
- quotations
- page numbers
- historical facts

If a source is uncertain, do not pretend it is verified.

==================================================
ANSWER QUALITY
==================================================

The answer must NOT be a one-paragraph database copy.

Write a full teaching.

The answer should normally contain:

1. ቀጥተኛ መልስ
2. የቃሉ ትርጉም / ትርጓሜ
3. የመጽሐፍ ቅዱስ መሠረት
4. የኦርቶዶክስ ተዋሕዶ ትምህርት
5. የቤተ ክርስቲያን ትውፊት
6. ዝርዝር ማብራሪያ
7. ምሳሌ ካስፈለገ
8. የተሳሳቱ ግንዛቤዎች ማስተካከያ
9. መደምደሚያ

Use only the sections that actually fit the question.

The answer should be readable by:

- a beginner
- a student
- a serious learner
- a knowledgeable reader

Move from simple explanation to deeper explanation.

==================================================
BIBLE
==================================================

When Biblical evidence is relevant,
give accurate references.

Never invent a verse.

If the knowledge base supplies references,
use them when relevant.

==================================================
SOURCES
==================================================

Do not write vague claims such as:

"የኢትዮጵያ ሊቃውንት እንዲህ ይላሉ"

unless a specific source is actually supplied.

Do not invent the writings of St. Yared,
Abba Giyorgis,
St. Athanasius,
St. Cyril,
or any other Father.

==================================================
FINAL RULE
==================================================

Return ONLY the final theological answer.

Do not mention:

AI
Gemini
Supabase
database
API
prompt
system
knowledge base
retrieval

Do not describe how you generated the answer.

`;

}


// ============================================================
// GEMINI GENERATION
// ============================================================

async function generateWithGemini(
  question,
  language,
  sources
) {

  if (
    !GEMINI_API_KEY
  ) {

    throw new Error(
      "GEMINI_API_KEY is missing."
    );

  }


  const systemPrompt =
    buildSystemPrompt(
      language,
      question
    );


  const context =
    makeContext(
      sources
    );


  const userPrompt = `

QUESTION:

${question}

RELEVANT ORTHODOX SOURCES:

${context}

Now write the final answer.

Important:

- Write only in ${LANGUAGES[language]}.
- Stay on the exact question.
- Use the relevant sources.
- Do not merge unrelated topics.
- Explain the teaching fully.
- Organize the answer clearly.
- Include Biblical references where appropriate.
- Do not invent quotations or sources.
- End with a clear conclusion.

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
                    systemPrompt
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
                      userPrompt
                  }

                ]

              }

            ],

            generationConfig: {

              temperature:
                0.20,

              topP:
                0.85,

              maxOutputTokens:
                7000

            }

          })

      }
    );


  const text =
    await response.text();


  let data =
    null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data =
      null;

  }


  if (
    !response.ok
  ) {

    throw new Error(
      data?.error?.message ||
      `Gemini error ${response.status}`
    );

  }


  const parts =
    data?.candidates?.[0]
      ?.content?.parts || [];


  const answer =
    parts
      .map(
        part =>
          part?.text || ""
      )
      .join("\n")
      .trim();


  if (
    !answer
  ) {

    throw new Error(
      "Gemini returned an empty answer."
    );

  }


  return answer;

}


// ============================================================
// SAFE FALLBACK
//
// IMPORTANT:
// Never concatenate unrelated database answers.
//
// Return only ONE highly relevant row.
// ============================================================

function fallbackAnswer(
  ranked,
  language
) {

  const matching =
    ranked.find(
      item =>
        item.score >= 120 &&
        languageMatches(
          rowLanguage(item.row),
          language
        )
    );


  if (
    !matching
  ) {

    return "";

  }


  return rowAnswer(
    matching.row
  );

}


// ============================================================
// HANDLER
// ============================================================

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


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

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
      !LANGUAGES[language]
    ) {

      return res
        .status(400)
        .json({

          error:
            `Unsupported language: ${language}`

        });

    }


    // --------------------------------------------------------
    // LOAD SUPABASE
    // --------------------------------------------------------

    const loaded =
      await getLessons();


    const rows =
      Array.isArray(
        loaded
      )
        ? loaded
        : [];


    // --------------------------------------------------------
    // RANK
    // --------------------------------------------------------

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
          (a, b) =>
            b.score -
            a.score
        );


    // --------------------------------------------------------
    // ONLY KEEP STRONGLY RELATED SOURCES
    //
    // This prevents the "8 unrelated answers" problem.
    // --------------------------------------------------------

    const strong =
      ranked.filter(
        item =>
          item.score >= 120
      );


    const selected =
      strong.slice(
        0,
        8
      );


    const sources =
      buildSources(
        selected
      );


    // --------------------------------------------------------
    // GEMINI
    // --------------------------------------------------------

    let answer =
      "";

    let source =
      "none";


    if (
      GEMINI_API_KEY
    ) {

      try {

        answer =
          await generateWithGemini(
            question,
            language,
            sources
          );

        source =
          "supabase+gemini";

      } catch (
        geminiError
      ) {

        console.error(
          "GEMINI ERROR:",
          geminiError?.message ||
          geminiError
        );


        answer =
          fallbackAnswer(
            ranked,
            language
          );


        source =
          answer
            ? "supabase-fallback"
            : "none";

      }

    } else {

      answer =
        fallbackAnswer(
          ranked,
          language
        );


      source =
        answer
          ? "supabase-fallback"
          : "none";

    }


    // --------------------------------------------------------
    // NO ANSWER
    // --------------------------------------------------------

    if (
      !answer
    ) {

      return res
        .status(200)
        .json({

          success:
            false,

          answer:
            "",

          language,

          source:
            "none",

          matchedCount:
            selected.length,

          message:
            "No sufficiently relevant answer was found."

        });

    }


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return res
      .status(200)
      .json({

        success:
          true,

        answer,

        language,

        source,

        topic:
          detectTopic(question),

        matchedCount:
          selected.length,

        sources:
          sources.map(
            source => ({

              question:
                source.question,

              language:
                source.language,

              category:
                source.category,

              bible_references:
                source.bible_references,

              church_sources:
                source.church_sources

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

        success:
          false,

        error:
          error?.message ||
          "Unknown API error."

      });

  }

};
