// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// ONE ANSWER ENGINE
// Supabase Knowledge Base + Gemini
//
// 11 LANGUAGES
// am, en, ti, om, sid, wal, kff, sgw, ar, el, he
//
// Flow:
// Question
//   ↓
// Language validation
//   ↓
// Topic detection
//   ↓
// Supabase knowledge retrieval
//   ↓
// Relevance ranking
//   ↓
// Topic-coherent evidence selection
//   ↓
// Gemini structured synthesis
//   ↓
// Detailed Orthodox answer
// ============================================================


// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-2.5-flash"
].filter(
  (value, index, array) =>
    value && array.indexOf(value) === index
);


// ============================================================
// EXACT 11 APP LANGUAGES
// ============================================================

const LANGUAGES = {

  am: {
    name: "Amharic",
    native: "አማርኛ"
  },

  en: {
    name: "English",
    native: "English"
  },

  ti: {
    name: "Tigrinya",
    native: "ትግርኛ"
  },

  om: {
    name: "Afaan Oromoo",
    native: "Afaan Oromoo"
  },

  sid: {
    name: "Sidaamu Afoo",
    native: "Sidaamu Afoo"
  },

  wal: {
    name: "Wolayttatto",
    native: "Wolayttatto"
  },

  kff: {
    name: "Kaffoono",
    native: "Kaffoono"
  },

  sgw: {
    name: "Guragigna",
    native: "ጉራጊኛ"
  },

  ar: {
    name: "Arabic",
    native: "العربية"
  },

  el: {
    name: "Greek",
    native: "Ελληνικά"
  },

  he: {
    name: "Hebrew",
    native: "עברית"
  }

};


// ============================================================
// BASIC TEXT HELPERS
// ============================================================

function clean(value) {

  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

}


function normalize(value) {

  return clean(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

}


function words(value) {

  return [
    ...new Set(
      normalize(value)
        .split(" ")
        .filter(
          word => word.length >= 2
        )
    )
  ];

}


// ============================================================
// DATABASE FIELD HELPERS
// ============================================================

function getQuestion(row) {

  return clean(
    row.question ??
    row.Question ??
    row.question_text ??
    row.title ??
    row.title_am ??
    row.q ??
    ""
  );

}


function getAnswer(row) {

  return clean(
    row.answer ??
    row.Answer ??
    row.response ??
    row.lesson ??
    row.content ??
    row.text ??
    ""
  );

}


function getLanguage(row) {

  return clean(
    row.language ??
    row.lang ??
    row.lang_code ??
    row.locale ??
    ""
  ).toLowerCase();

}


function getCategory(row) {

  return clean(
    row.category ??
    row.topic ??
    row.subject ??
    ""
  );

}


function getSource(row) {

  return clean(
    row.source ??
    row.church_sources ??
    row.sources ??
    ""
  );

}


function getReference(row) {

  return clean(
    row.reference ??
    row.bible_references ??
    row.bible_reference ??
    ""
  );

}


// ============================================================
// LANGUAGE ALIASES
// ============================================================

function languageMatches(
  rowLanguage,
  requestedLanguage
) {

  const value =
    normalize(rowLanguage);

  const requested =
    normalize(requestedLanguage);

  if (!value) {
    return false;
  }

  if (value === requested) {
    return true;
  }

  const aliases = {

    am: [
      "amh",
      "amharic"
    ],

    en: [
      "eng",
      "english"
    ],

    ti: [
      "tir",
      "tigrinya"
    ],

    om: [
      "orm",
      "oromo",
      "afaan oromoo"
    ],

    sid: [
      "sidaamu",
      "sidaamu afoo",
      "sidama"
    ],

    wal: [
      "wolaytta",
      "wolayttatto",
      "wolaita"
    ],

    kff: [
      "kaf",
      "kafa",
      "kafino",
      "kaffoono"
    ],

    sgw: [
      "gur",
      "gurage",
      "guragie",
      "guragigna"
    ],

    ar: [
      "ara",
      "arabic"
    ],

    el: [
      "gre",
      "greek"
    ],

    he: [
      "heb",
      "hebrew"
    ]

  };

  return (
    aliases[requested] || []
  ).includes(value);

}


// ============================================================
// ORTHODOX TOPIC DETECTION
// ============================================================

const TOPICS = {

  baptism: [
    "ጥምቀት",
    "መጠመቅ",
    "ተጠመቀ",
    "baptism",
    "baptize",
    "baptized"
  ],

  mary: [
    "ማርያም",
    "እመቤታችን",
    "ድንግል",
    "mary",
    "maryam",
    "theotokos"
  ],

  cross: [
    "መስቀል",
    "መስቀሉ",
    "cross",
    "crucifixion"
  ],

  eucharist: [
    "ቁርባን",
    "ሥጋ",
    "ደም",
    "eucharist",
    "communion"
  ],

  faith: [
    "ሃይማኖት",
    "እምነት",
    "faith",
    "religion",
    "belief"
  ],

  tabot: [
    "ታቦት",
    "ታቦታት",
    "tabot",
    "ark"
  ],

  trinity: [
    "ሥላሴ",
    "አንድ አምላክ",
    "trinity",
    "triune"
  ],

  christ: [
    "ክርስቶስ",
    "ኢየሱስ",
    "christ",
    "jesus",
    "messiah"
  ],

  church: [
    "ቤተ ክርስቲያን",
    "ቤተክርስቲያን",
    "church"
  ],

  prayer: [
    "ጸሎት",
    "ጸልይ",
    "prayer",
    "pray"
  ],

  scripture: [
    "መጽሐፍ ቅዱስ",
    "መጽሐፍ",
    "bible",
    "scripture"
  ],

  salvation: [
    "ድኅነት",
    "መዳን",
    "salvation",
    "saved"
  ],

  fasting: [
    "ጾም",
    "መጾም",
    "fasting",
    "fast"
  ],

  repentance: [
    "ንስሐ",
    "ንስሃ",
    "repentance",
    "repent"
  ],

  saints: [
    "ቅዱሳን",
    "ቅዱስ",
    "ሰማዕታት",
    "saints",
    "saint",
    "martyr"
  ]

};


// ============================================================
// DETECT TOPICS
// ============================================================

function detectTopics(question) {

  const normalizedQuestion =
    normalize(question);

  const detected = [];

  for (
    const [topic, keywords]
    of Object.entries(TOPICS)
  ) {

    const found =
      keywords.some(
        keyword =>
          normalizedQuestion.includes(
            normalize(keyword)
          )
      );

    if (found) {
      detected.push(topic);
    }

  }

  return detected;

}


// ============================================================
// SCORE KNOWLEDGE ROW
// ============================================================

function scoreRow(
  row,
  question,
  requestedLanguage
) {

  const q =
    normalize(question);

  const qWords =
    words(question);

  const rowQuestion =
    normalize(
      getQuestion(row)
    );

  const rowAnswer =
    normalize(
      getAnswer(row)
    );

  const category =
    normalize(
      getCategory(row)
    );

  const source =
    normalize(
      getSource(row)
    );

  const reference =
    normalize(
      getReference(row)
    );

  if (!rowQuestion && !rowAnswer) {
    return 0;
  }

  let score = 0;
  let hits = 0;


  // Exact question
  if (
    rowQuestion === q
  ) {
    score += 3000;
  }


  // Question contains answer title
  if (
    rowQuestion &&
    q.includes(rowQuestion)
  ) {
    score += 1000;
  }


  // Stored question contains user's question
  if (
    rowQuestion &&
    rowQuestion.includes(q)
  ) {
    score += 1200;
  }


  // Individual query terms
  for (
    const word of qWords
  ) {

    if (
      rowQuestion.includes(word)
    ) {
      score += 120;
      hits++;
    }

    if (
      category.includes(word)
    ) {
      score += 70;
      hits++;
    }

    if (
      rowAnswer.includes(word)
    ) {
      score += 35;
      hits++;
    }

    if (
      source.includes(word)
    ) {
      score += 20;
    }

    if (
      reference.includes(word)
    ) {
      score += 20;
    }

  }


  // Query coverage
  if (qWords.length) {

    score += Math.round(
      (
        hits /
        qWords.length
      ) * 300
    );

  }


  // Language
  if (
    languageMatches(
      getLanguage(row),
      requestedLanguage
    )
  ) {
    score += 700;
  }


  // Topic coherence
  const topics =
    detectTopics(question);

  const rowTopicText =
    normalize(
      [
        getQuestion(row),
        getCategory(row),
        getAnswer(row)
      ].join(" ")
    );


  for (
    const topic of topics
  ) {

    const keywords =
      TOPICS[topic] || [];

    if (
      keywords.some(
        keyword =>
          rowTopicText.includes(
            normalize(keyword)
          )
      )
    ) {

      score += 350;

    }

  }


  // Source/reference bonus
  if (source) {
    score += 10;
  }

  if (reference) {
    score += 10;
  }


  return score;

}


// ============================================================
// SUPABASE GET
// ============================================================

async function supabaseGet(path) {

  if (!SUPABASE_ANON_KEY) {

    throw new Error(
      "SUPABASE_ANON_KEY is missing."
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


  if (!response.ok) {

    throw new Error(
      data?.message ||
      data?.hint ||
      `Supabase error ${response.status}`
    );

  }


  return data;

}


// ============================================================
// LOAD ORTHODOX KNOWLEDGE
// ============================================================

async function loadKnowledge() {

  const columns = [
    "id",
    "question",
    "answer",
    "language",
    "category",
    "education_level",
    "bible_references",
    "church_sources",
    "comparison_group",
    "source",
    "reference"
  ].join(",");


  const path =
    `orthodox_answers?select=${encodeURIComponent(
      columns
    )}&limit=1000`;


  const data =
    await supabaseGet(path);


  return Array.isArray(data)
    ? data
    : [];

}


// ============================================================
// BUILD SOURCE OBJECTS
// ============================================================

function buildSources(
  ranked,
  limit
) {

  return ranked
    .slice(0, limit)
    .map(item => {

      const row =
        item.row;

      return {

        score:
          item.score,

        question:
          getQuestion(row),

        answer:
          getAnswer(row),

        language:
          getLanguage(row),

        category:
          getCategory(row),

        education_level:
          clean(
            row.education_level
          ),

        bible_references:
          clean(
            row.bible_references
          ),

        church_sources:
          clean(
            row.church_sources
          ),

        source:
          getSource(row),

        reference:
          getReference(row),

        comparison_group:
          clean(
            row.comparison_group
          )

      };

    });

}


// ============================================================
// CONVERT SOURCES TO GEMINI CONTEXT
// ============================================================

function sourcesToText(
  sources
) {

  if (!sources.length) {

    return `
NO RELEVANT KNOWLEDGE WAS FOUND.
DO NOT INVENT SOURCES.
`;

  }


  return sources
    .map(
      (source, index) => `

================ SOURCE ${index + 1} ================

Relevance score:
${source.score}

Knowledge language:
${source.language}

Question / title:
${source.question}

Category:
${source.category}

Education level:
${source.education_level}

Bible references:
${source.bible_references}

Church sources:
${source.church_sources}

Additional source:
${source.source}

Reference:
${source.reference}

Comparison group:
${source.comparison_group}

Knowledge:
${source.answer}

================ END SOURCE ${index + 1} ================

`
    )
    .join("\n");

}


// ============================================================
// GEMINI SYSTEM INSTRUCTION
// ============================================================

function buildInstruction(
  language,
  answerLevel
) {

  const languageInfo =
    LANGUAGES[language] ||
    LANGUAGES.am;


  let depth;


  if (
    Number(answerLevel) === 1
  ) {

    depth = `
Give a clear foundational explanation.
Normally 450–750 words when the topic requires detail.
`;

  }

  else if (
    Number(answerLevel) === 3
  ) {

    depth = `
Give a comprehensive scholarly explanation.
Normally 1800–3000 words when the topic requires depth.
Discuss Scripture, theology, Church Fathers,
Ethiopian Orthodox tradition, historical context,
important distinctions and objections when relevant.
`;

  }

  else {

    depth = `
Give a detailed educational explanation.
Normally 900–1600 words when the topic requires depth.
`;

  }


  return `

You are the theological answer engine of:

"ኦርቶዶክሳዊ መልስ"

============================================================
LANGUAGE
============================================================

The final answer MUST be written ONLY in:

${languageInfo.name}
(${languageInfo.native})

NEVER switch to Amharic or English simply because
the source material is written in another language.

============================================================
ORTHODOX FOUNDATION
============================================================

Answer according to the Ethiopian Orthodox Tewahedo
Church's Scripture, faith, doctrine and tradition.

The supplied knowledge base is the PRIMARY evidence source.

Use it carefully and faithfully.

============================================================
TOPIC COHERENCE
============================================================

The answer MUST remain centered on the user's question.

Do NOT combine unrelated topics.

If the question is about:

- baptism → remain focused on baptism
- Mary → remain focused on Mary
- Eucharist → remain focused on Eucharist
- Cross → remain focused on the Cross

Related evidence may be included,
but unrelated teachings must not dominate the answer.

============================================================
DEPTH
============================================================

${depth}

Do not give a shallow three-line answer
when the question requires theological explanation.

============================================================
COMPREHENSIVE STRUCTURE
============================================================

When relevant, organize the answer through:

1. Direct answer
2. Definition and meaning
3. Biblical foundation
4. Old Testament foundation
5. New Testament foundation
6. Orthodox theological understanding
7. Church Fathers
8. Ethiopian Orthodox Tewahedo tradition
9. Ethiopian scholars and traditional teaching
10. Historical context
11. Spiritual meaning
12. Practical Christian application
13. Common misunderstandings
14. Comparison with other views, ONLY when requested
15. Conclusion
16. Sources / references

Do not force sections that do not apply.

============================================================
EVIDENCE
============================================================

Use the supplied sources.

If Bible references are supplied,
use them accurately.

If Church Fathers or Ethiopian scholars are supplied,
represent their teaching accurately.

If a book or source is supplied,
do not invent additional quotations.

NEVER fabricate:

- Bible verses
- quotations
- scholars
- Fathers
- books
- page numbers
- historical events
- citations

If evidence is missing,
say that the supplied knowledge does not provide
enough evidence rather than inventing it.

============================================================
OTHER RELIGIONS / VIEWPOINTS
============================================================

Only compare Orthodox teaching with:

- Protestant
- Catholic
- Muslim
- Jehovah's Witness
- "Only Jesus"
- atheist
- other Christian traditions

when the user asks for comparison
or when the question clearly requires it.

Always explain the Orthodox position clearly and respectfully.

============================================================
STYLE
============================================================

Use:

- clear headings
- numbered sections
- bullet points when useful
- readable paragraphs
- theological precision
- explanatory examples when supported

The answer should be understandable to:

students,
ordinary readers,
teachers,
and advanced learners.

============================================================
DO NOT REVEAL INTERNAL SYSTEMS
============================================================

Never mention:

AI
Gemini
Supabase
database
API
prompt
model
system instruction
internal processing

Return ONLY the final answer.
`;

}


// ============================================================
// GEMINI RESPONSE EXTRACTION
// ============================================================

function extractGeminiText(
  data
) {

  const parts =
    data?.candidates?.[0]
      ?.content
      ?.parts || [];


  return parts
    .map(
      part =>
        part?.text || ""
    )
    .join("\n")
    .trim();

}


// ============================================================
// GEMINI GENERATION
// ============================================================

async function generateAnswer(
  question,
  language,
  sources,
  answerLevel
) {

  if (!GEMINI_API_KEY) {

    throw new Error(
      "GEMINI_API_KEY is not configured."
    );

  }


  const instruction =
    buildInstruction(
      language,
      answerLevel
    );


  const knowledge =
    sourcesToText(
      sources
    );


  let lastError = null;


  for (
    const model of MODELS
  ) {

    try {

      const response =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(
            GEMINI_API_KEY
          )}`,
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json"

            },

            body: JSON.stringify({

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

                      text: `

USER QUESTION:
${question}

REQUESTED LANGUAGE:
${LANGUAGES[language]?.name || language}

DETECTED TOPICS:
${detectTopics(question).join(", ") || "none"}

KNOWLEDGE BASE:
${knowledge}

IMPORTANT:
Synthesize ONLY the relevant evidence.
Keep the answer centered on the user's question.
Do not invent unsupported sources.

`

                    }

                  ]

                }

              ],

              generationConfig: {

                temperature:
                  0.20,

                topP:
                  0.90,

                maxOutputTokens:
                  6500,

                responseMimeType:
                  "text/plain"

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


      if (response.ok) {

        const answer =
          extractGeminiText(
            data
          );


        if (answer) {

          return answer;

        }

      }


      lastError =
        new Error(
          data?.error?.message ||
          `Gemini error ${response.status}`
        );


    } catch (error) {

      lastError =
        error;

    }

  }


  throw (
    lastError ||
    new Error(
      "Unable to generate answer."
    )
  );

}


// ============================================================
// SUPABASE FALLBACK
// ============================================================

function fallbackAnswer(
  ranked
) {

  if (!ranked.length) {
    return "";
  }


  const best =
    ranked[0].row;


  return getAnswer(
    best
  );

}


// ============================================================
// MAIN VERCEL HANDLER
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


  // OPTIONS
  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(204)
      .end();

  }


  // Only POST
  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({

        error:
          "Method not allowed"

      });

  }


  try {

    const body =
      req.body || {};


    const question =
      clean(
        body.question
      );


    const language =
      clean(
        body.language || "am"
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


    // ========================================================
    // VALIDATION
    // ========================================================

    if (!question) {

      return res
        .status(400)
        .json({

          error:
            "Question is required"

        });

    }


    if (
      question.length > 5000
    ) {

      return res
        .status(400)
        .json({

          error:
            "Question is too long"

        });

    }


    // ========================================================
    // LANGUAGE VALIDATION
    // ========================================================

    if (
      !LANGUAGES[language]
    ) {

      return res
        .status(400)
        .json({

          error:
            "Unsupported language",

          supportedLanguages:
            Object.keys(
              LANGUAGES
            )

        });

    }


    // ========================================================
    // DETECT TOPICS
    // ========================================================

    const topics =
      detectTopics(
        question
      );


    // ========================================================
    // LOAD KNOWLEDGE
    // ========================================================

    const rows =
      await loadKnowledge();


    // ========================================================
    // RANK KNOWLEDGE
    // ========================================================

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


    // ========================================================
    // SELECT EVIDENCE
    // ========================================================

    const sourceLimit =
      answerLevel === 1
        ? 6
        : answerLevel === 3
          ? 15
          : 10;


    const selected =
      buildSources(
        ranked,
        sourceLimit
      );


    // ========================================================
    // GENERATE ANSWER
    // ========================================================

    let answer = "";

    let generatedBy =
      "supabase";


    try {

      answer =
        await generateAnswer(
          question,
          language,
          selected,
          answerLevel
        );


      generatedBy =
        "supabase+gemini";


    } catch (generationError) {

      console.error(
        "Gemini generation failed:",
        generationError
      );


      answer =
        fallbackAnswer(
          ranked
        );


      generatedBy =
        "supabase-fallback";

    }


    // ========================================================
    // NOTHING FOUND
    // ========================================================

    if (!answer) {

      return res
        .status(404)
        .json({

          error:
            "No relevant Orthodox knowledge was found.",

          language,

          topics,

          matchedCount:
            0

        });

    }


    // ========================================================
    // SUCCESS RESPONSE
    // ========================================================

    return res
      .status(200)
      .json({

        success:
          true,

        answer,

        language,

        languageName:
          LANGUAGES[
            language
          ].name,

        nativeLanguage:
          LANGUAGES[
            language
          ].native,

        answerLevel,

        generatedBy,

        topics,

        matchedCount:
          selected.length,

        sources:
          selected.map(
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
                source.church_sources,

              source:
                source.source,

              reference:
                source.reference,

              comparison_group:
                source.comparison_group

            })
          )

      });


  } catch (error) {

    console.error(
      "/api/ask error:",
      error
    );


    return res
      .status(500)
      .json({

        error:
          "Unable to answer the question right now.",

        details:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined

      });

  }

};
