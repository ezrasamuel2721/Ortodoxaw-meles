// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Topic-Coherent Detailed Orthodox Answer Engine
//
// IMPORTANT:
// This version uses ONLY the columns that exist in the
// orthodox_answers table:
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


// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";


// ============================================================
// 11 LANGUAGES
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
// TOPIC KEYWORDS
// ============================================================

const TOPICS = {

  baptism: [
    "ጥምቀት",
    "መጠመቅ",
    "ተጠመቀ",
    "ሕፃን ጥምቀት",
    "baptism",
    "baptize",
    "baptized"
  ],

  mary: [
    "ማርያም",
    "ድንግል",
    "እመቤታችን",
    "theotokos",
    "mary",
    "maryam"
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
// HELPERS
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


function getWords(value) {

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
    row.question
  );

}


function getAnswer(row) {

  return clean(
    row.answer
  );

}


function getLanguage(row) {

  return clean(
    row.language
  ).toLowerCase();

}


function getCategory(row) {

  return clean(
    row.category
  );

}


function getEducationLevel(row) {

  return clean(
    row.education_level
  );

}


function getBibleReferences(row) {

  return clean(
    row.bible_references
  );

}


function getChurchSources(row) {

  return clean(
    row.church_sources
  );

}


function getComparisonGroup(row) {

  return clean(
    row.comparison_group
  );

}


// ============================================================
// LANGUAGE MATCHING
// ============================================================

function languageMatches(
  rowLanguage,
  requestedLanguage
) {

  const row =
    normalize(rowLanguage);

  const requested =
    normalize(requestedLanguage);

  if (!row) {
    return false;
  }

  if (row === requested) {
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
      "sidama",
      "sidaamu",
      "sidaamu afoo"
    ],

    wal: [
      "wolaytta",
      "wolayttatto",
      "wolaita"
    ],

    kff: [
      "kafa",
      "kafino",
      "kaffoono"
    ],

    sgw: [
      "gurage",
      "guragigna",
      "guragie"
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
  ).includes(row);

}


// ============================================================
// TOPIC DETECTION
// ============================================================

function detectTopics(question) {

  const normalized =
    normalize(question);

  const detected = [];

  for (
    const [topic, keywords]
    of Object.entries(TOPICS)
  ) {

    for (
      const keyword of keywords
    ) {

      if (
        normalized.includes(
          normalize(keyword)
        )
      ) {

        detected.push(topic);
        break;

      }

    }

  }

  return [
    ...new Set(detected)
  ];

}


// ============================================================
// TOPIC KEYWORDS FOR A TOPIC
// ============================================================

function getTopicKeywords(
  topics
) {

  const result = [];

  for (
    const topic of topics
  ) {

    result.push(
      ...(TOPICS[topic] || [])
    );

  }

  return [
    ...new Set(result)
  ];

}


// ============================================================
// SCORE ONE KNOWLEDGE ROW
// ============================================================

function scoreRow(
  row,
  question,
  requestedLanguage,
  topics
) {

  const query =
    normalize(question);

  const queryWords =
    getWords(question);

  const rowQuestion =
    normalize(
      getQuestion(row)
    );

  const rowAnswer =
    normalize(
      getAnswer(row)
    );

  const rowCategory =
    normalize(
      getCategory(row)
    );

  const rowSources =
    normalize(
      getChurchSources(row)
    );

  const rowBible =
    normalize(
      getBibleReferences(row)
    );

  const rowComparison =
    normalize(
      getComparisonGroup(row)
    );

  const fullText = [
    rowQuestion,
    rowAnswer,
    rowCategory,
    rowSources,
    rowBible,
    rowComparison
  ].join(" ");


  if (
    !rowQuestion &&
    !rowAnswer
  ) {

    return 0;

  }


  let score = 0;

  let matchedWords = 0;


  // ----------------------------------------------------------
  // EXACT QUESTION
  // ----------------------------------------------------------

  if (
    rowQuestion === query
  ) {

    score += 5000;

  }


  // ----------------------------------------------------------
  // QUESTION CONTAINMENT
  // ----------------------------------------------------------

  if (
    rowQuestion &&
    query.includes(rowQuestion)
  ) {

    score += 1800;

  }


  if (
    rowQuestion &&
    rowQuestion.includes(query)
  ) {

    score += 1600;

  }


  // ----------------------------------------------------------
  // WORD MATCHING
  // ----------------------------------------------------------

  for (
    const word of queryWords
  ) {

    if (
      rowQuestion.includes(word)
    ) {

      score += 180;
      matchedWords++;

    }

    else if (
      rowCategory.includes(word)
    ) {

      score += 100;
      matchedWords++;

    }

    else if (
      rowAnswer.includes(word)
    ) {

      score += 45;
      matchedWords++;

    }

    else if (
      fullText.includes(word)
    ) {

      score += 20;
      matchedWords++;

    }

  }


  // ----------------------------------------------------------
  // QUERY COVERAGE
  // ----------------------------------------------------------

  if (
    queryWords.length > 0
  ) {

    score += Math.round(
      (
        matchedWords /
        queryWords.length
      ) * 400
    );

  }


  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  if (
    languageMatches(
      getLanguage(row),
      requestedLanguage
    )
  ) {

    score += 1000;

  }


  // ----------------------------------------------------------
  // TOPIC COHERENCE
  // ----------------------------------------------------------

  const topicKeywords =
    getTopicKeywords(
      topics
    );


  for (
    const keyword of topicKeywords
  ) {

    const normalizedKeyword =
      normalize(keyword);

    if (
      fullText.includes(
        normalizedKeyword
      )
    ) {

      score += 250;

    }

  }


  // ----------------------------------------------------------
  // CATEGORY
  // ----------------------------------------------------------

  if (
    rowCategory
  ) {

    score += 20;

  }


  // ----------------------------------------------------------
  // SCRIPTURE / CHURCH SOURCES
  // ----------------------------------------------------------

  if (
    rowBible
  ) {

    score += 25;

  }


  if (
    rowSources
  ) {

    score += 25;

  }


  return score;

}


// ============================================================
// SUPABASE REQUEST
// ============================================================

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


  let data;

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

    const message =
      data?.message ||
      data?.hint ||
      data?.details ||
      text ||
      `Supabase HTTP ${response.status}`;

    throw new Error(
      `Supabase: ${message}`
    );

  }


  return data;

}


// ============================================================
// LOAD KNOWLEDGE
// ============================================================

async function loadKnowledge() {

  // IMPORTANT:
  // ONLY REAL COLUMNS FROM orthodox_answers
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
    `orthodox_answers?select=${encodeURIComponent(
      columns
    )}&limit=1000`;


  const rows =
    await supabaseGet(
      path
    );


  if (
    !Array.isArray(rows)
  ) {

    throw new Error(
      "Supabase returned invalid knowledge data."
    );

  }


  return rows;

}


// ============================================================
// RANK KNOWLEDGE
// ============================================================

function rankKnowledge(
  rows,
  question,
  language,
  topics
) {

  return rows
    .map(
      row => ({

        row,

        score:
          scoreRow(
            row,
            question,
            language,
            topics
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

}


// ============================================================
// SELECT BEST SOURCES
// ============================================================

function selectSources(
  ranked,
  answerLevel
) {

  let limit = 10;

  if (
    Number(answerLevel) === 1
  ) {

    limit = 6;

  }

  if (
    Number(answerLevel) === 3
  ) {

    limit = 18;

  }


  return ranked
    .slice(
      0,
      limit
    )
    .map(
      item => item.row
    );

}


// ============================================================
// BUILD KNOWLEDGE CONTEXT
// ============================================================

function buildKnowledgeContext(
  rows
) {

  if (
    !rows.length
  ) {

    return `
NO RELEVANT KNOWLEDGE WAS FOUND
IN THE SUPABASE KNOWLEDGE BASE.
`;

  }


  return rows
    .map(
      (row, index) => {

        return `

================ KNOWLEDGE ${index + 1} ================

Question:
${getQuestion(row)}

Answer:
${getAnswer(row)}

Language:
${getLanguage(row)}

Category:
${getCategory(row)}

Education level:
${getEducationLevel(row)}

Bible references:
${getBibleReferences(row)}

Church sources:
${getChurchSources(row)}

Comparison group:
${getComparisonGroup(row)}

========================================================

`;

      }
    )
    .join("\n");

}


// ============================================================
// GEMINI INSTRUCTION
// ============================================================

function buildGeminiInstruction(
  language,
  answerLevel
) {

  const lang =
    LANGUAGES[language];


  let depth;

  if (
    Number(answerLevel) === 1
  ) {

    depth = `
Give a clear foundational answer.
Be concise but complete.
`;

  }

  else if (
    Number(answerLevel) === 3
  ) {

    depth = `
Give a very comprehensive scholarly answer.
Cover the relevant theological, biblical,
historical and Ethiopian Orthodox dimensions.
`;

  }

  else {

    depth = `
Give a detailed and well-organized answer.
Do not give a shallow three-line response.
`;

  }


  return `

You are the official theological answer engine
for the application:

ኦርቶዶክሳዊ መልስ

========================================================
LANGUAGE
========================================================

Write the FINAL answer ONLY in:

${lang.name}
(${lang.native})

Do not switch languages.

========================================================
ORTHODOX FOUNDATION
========================================================

Answer according to the Ethiopian Orthodox Tewahedo
understanding of Scripture, doctrine, tradition and teaching.

The supplied knowledge base is the primary evidence.

Do not invent unsupported information.

========================================================
TOPIC DISCIPLINE
========================================================

Stay strictly focused on the user's question.

Do not mix unrelated subjects.

If the question is about baptism,
the answer should remain primarily about baptism.

If the question is about Mary,
remain primarily about Mary.

If the question is about the Cross,
remain primarily about the Cross.

Related evidence is welcome.
Unrelated material is not.

========================================================
DEPTH
========================================================

${depth}

========================================================
WHEN RELEVANT, USE THIS STRUCTURE
========================================================

1. ቀጥተኛ መልስ / Direct answer

2. የቃሉ ትርጉም / Definition

3. የብሉይ ኪዳን ማስረጃ

4. የሐዲስ ኪዳን ማስረጃ

5. የቤተ ክርስቲያን ትምህርት

6. የአበው ትምህርት

7. የኢትዮጵያ ተዋሕዶ ትውፊት

8. ታሪካዊ ማብራሪያ

9. መንፈሳዊ ትርጉም

10. ተግባራዊ ትምህርት

11. የተሳሳቱ ግንዛቤዎች

12. መደምደሚያ

13. ምንጮች / References

Only use sections that genuinely apply.

========================================================
EVIDENCE RULE
========================================================

Use the supplied knowledge.

If a Bible reference is supplied,
use it as supporting evidence.

If Church sources are supplied,
use them.

If Ethiopian Orthodox teaching is supplied,
give it appropriate weight.

Never fabricate:

- Bible quotations
- chapter/verse numbers
- Church Fathers
- Ethiopian scholars
- books
- page numbers
- historical claims
- citations

If the supplied evidence is insufficient,
say so rather than inventing evidence.

========================================================
COMPARATIVE QUESTIONS
========================================================

If the user explicitly asks about:

Protestant
Catholic
Muslim
Jehovah's Witness
Only Jesus
Atheist
or another tradition,

explain the comparison respectfully,
while clearly presenting the Ethiopian Orthodox position.

Do not introduce comparisons unnecessarily.

========================================================
STYLE
========================================================

The answer should be:

clear
deep
organized
educational
theologically careful
respectful
self-contained

It should be understandable to:

students,
ordinary readers,
teachers,
and advanced learners.

Do not mention:

Gemini
Supabase
database
API
model
prompt
system
internal processing

Return ONLY the final answer.
`;

}


// ============================================================
// GEMINI API
// ============================================================

async function callGemini(
  question,
  language,
  topics,
  knowledgeContext,
  answerLevel
) {

  if (
    !GEMINI_API_KEY
  ) {

    throw new Error(
      "GEMINI_API_KEY is missing."
    );

  }


  const instruction =
    buildGeminiInstruction(
      language,
      answerLevel
    );


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent?key=${encodeURIComponent(
      GEMINI_API_KEY
    )}`;


  const response =
    await fetch(
      url,
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

              role: "user",

              parts: [

                {

                  text: `

USER QUESTION:
${question}

DETECTED TOPICS:
${topics.join(", ") || "none"}

KNOWLEDGE BASE:
${knowledgeContext}

IMPORTANT:
Build a single coherent answer from the relevant
knowledge above.

Do not mix unrelated knowledge.

Do not invent missing evidence.

`

                }

              ]

            }

          ],

          generationConfig: {

            temperature: 0.15,

            topP: 0.90,

            maxOutputTokens: 7000

          }

        })

      }
    );


  const text =
    await response.text();


  let data;

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
      `Gemini HTTP ${response.status}`
    );

  }


  const answer =
    data
      ?.candidates?.[0]
      ?.content?.parts
      ?.map(
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
// SUPABASE FALLBACK
// ============================================================

function makeFallbackAnswer(
  rows,
  language
) {

  if (
    !rows.length
  ) {

    return "";

  }


  // Prefer requested-language row
  const sameLanguage =
    rows.find(
      row =>
        languageMatches(
          getLanguage(row),
          language
        )
    );


  const best =
    sameLanguage ||
    rows[0];


  const answer =
    getAnswer(best);


  if (
    !answer
  ) {

    return "";

  }


  return answer;

}


// ============================================================
// MAIN HANDLER
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

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(204)
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
        body.language ||
        "am"
      ).toLowerCase();


    const answerLevel =
      Number(
        body.answerLevel
      ) === 1
        ? 1
        : Number(
            body.answerLevel
          ) === 3
            ? 3
            : 2;


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !question
    ) {

      return res
        .status(400)
        .json({

          success: false,

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

          success: false,

          error:
            "Question is too long"

        });

    }


    if (
      !LANGUAGES[language]
    ) {

      return res
        .status(400)
        .json({

          success: false,

          error:
            "Unsupported language",

          supportedLanguages:
            Object.keys(
              LANGUAGES
            )

        });

    }


    // --------------------------------------------------------
    // TOPICS
    // --------------------------------------------------------

    const topics =
      detectTopics(
        question
      );


    // --------------------------------------------------------
    // LOAD SUPABASE
    // --------------------------------------------------------

    let rows;

    try {

      rows =
        await loadKnowledge();

    } catch (supabaseError) {

      console.error(
        "SUPABASE ERROR:",
        supabaseError
      );


      return res
        .status(500)
        .json({

          success: false,

          error:
            "Knowledge base connection failed.",

          details:
            supabaseError.message

        });

    }


    // --------------------------------------------------------
    // RANK
    // --------------------------------------------------------

    const ranked =
      rankKnowledge(
        rows,
        question,
        language,
        topics
      );


    // --------------------------------------------------------
    // SELECT EVIDENCE
    // --------------------------------------------------------

    const selected =
      selectSources(
        ranked,
        answerLevel
      );


    // --------------------------------------------------------
    // NO MATCH
    // --------------------------------------------------------

    if (
      selected.length === 0
    ) {

      return res
        .status(404)
        .json({

          success: false,

          error:
            "No relevant knowledge was found.",

          language,

          topics,

          matchedCount: 0

        });

    }


    // --------------------------------------------------------
    // BUILD CONTEXT
    // --------------------------------------------------------

    const knowledgeContext =
      buildKnowledgeContext(
        selected
      );


    // --------------------------------------------------------
    // GEMINI
    // --------------------------------------------------------

    let answer = "";

    let generatedBy =
      "supabase-fallback";


    try {

      answer =
        await callGemini(
          question,
          language,
          topics,
          knowledgeContext,
          answerLevel
        );


      generatedBy =
        "supabase+gemini";

    } catch (geminiError) {

      console.error(
        "GEMINI ERROR:",
        geminiError
      );


      // Gemini failure MUST NOT
      // destroy the whole answer system.
      answer =
        makeFallbackAnswer(
          selected,
          language
        );


      generatedBy =
        "supabase-fallback";

    }


    // --------------------------------------------------------
    // FINAL SAFETY
    // --------------------------------------------------------

    if (
      !answer
    ) {

      return res
        .status(500)
        .json({

          success: false,

          error:
            "No answer could be produced.",

          language,

          topics,

          matchedCount:
            selected.length

        });

    }


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return res
      .status(200)
      .json({

        success: true,

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
            row => ({

              question:
                getQuestion(row),

              language:
                getLanguage(row),

              category:
                getCategory(row),

              education_level:
                getEducationLevel(row),

              bible_references:
                getBibleReferences(row),

              church_sources:
                getChurchSources(row),

              comparison_group:
                getComparisonGroup(row)

            })
          )

      });


  } catch (error) {

    console.error(
      "FINAL /api/ask ERROR:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        error:
          "Unable to answer the question right now.",

        details:
          error?.message ||
          "Unknown server error"

      });

  }

};
