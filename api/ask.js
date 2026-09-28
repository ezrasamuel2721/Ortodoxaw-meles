// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Topic-Coherent Detailed Orthodox Answer Engine
//
// SUPPORTED TABLE COLUMNS ONLY:
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
    "baptized",
    "baptizing"
  ],

  mary: [
    "ማርያም",
    "ድንግል",
    "እመቤታችን",
    "ብፅዕት",
    "theotokos",
    "mary",
    "maryam",
    "virgin mary"
  ],

  cross: [
    "መስቀል",
    "መስቀሉ",
    "መስቀል ክርስቶስ",
    "cross",
    "crucifixion",
    "crucified"
  ],

  eucharist: [
    "ቁርባን",
    "ሥጋ",
    "ደም",
    "ቅዱስ ቁርባን",
    "eucharist",
    "communion",
    "holy communion"
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
    "ark",
    "ark of covenant"
  ],

  trinity: [
    "ሥላሴ",
    "አንድ አምላክ",
    "አብ ወልድ መንፈስ ቅዱስ",
    "trinity",
    "triune"
  ],

  christ: [
    "ክርስቶስ",
    "ኢየሱስ",
    "ጌታ",
    "አዳኝ",
    "christ",
    "jesus",
    "messiah",
    "savior"
  ],

  church: [
    "ቤተ ክርስቲያን",
    "ቤተክርስቲያን",
    "church"
  ],

  prayer: [
    "ጸሎት",
    "ጸልይ",
    "መጸለይ",
    "prayer",
    "pray"
  ],

  scripture: [
    "መጽሐፍ ቅዱስ",
    "መጽሐፍ",
    "ቅዱሳት መጻሕፍት",
    "bible",
    "scripture"
  ],

  salvation: [
    "ድኅነት",
    "መዳን",
    "መድኃኒት",
    "salvation",
    "saved"
  ],

  fasting: [
    "ጾም",
    "መጾም",
    "የጾም",
    "fasting",
    "fast"
  ],

  repentance: [
    "ንስሐ",
    "ንስሃ",
    "ንስሐ ገባ",
    "repentance",
    "repent"
  ],

  saints: [
    "ቅዱሳን",
    "ቅዱስ",
    "ሰማዕታት",
    "ሰማዕት",
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


function includesNormalized(
  text,
  value
) {

  const a = normalize(text);
  const b = normalize(value);

  if (!a || !b) {
    return false;
  }

  return a.includes(b);

}


// ============================================================
// DATABASE FIELD HELPERS
// ============================================================

function getQuestion(row) {
  return clean(row?.question);
}


function getAnswer(row) {
  return clean(row?.answer);
}


function getLanguage(row) {
  return clean(row?.language).toLowerCase();
}


function getCategory(row) {
  return clean(row?.category);
}


function getEducationLevel(row) {
  return clean(row?.education_level);
}


function getBibleReferences(row) {
  return clean(row?.bible_references);
}


function getChurchSources(row) {
  return clean(row?.church_sources);
}


function getComparisonGroup(row) {
  return clean(row?.comparison_group);
}


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

  en: [
    "en",
    "eng",
    "english"
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
    "sidama",
    "sidaamu",
    "sidaamu afoo"
  ],

  wal: [
    "wal",
    "wolaytta",
    "wolayttatto",
    "wolaita"
  ],

  kff: [
    "kff",
    "kafa",
    "kafino",
    "kaffoono"
  ],

  sgw: [
    "sgw",
    "gurage",
    "guragigna",
    "guragie",
    "ጉራጊኛ"
  ],

  ar: [
    "ar",
    "ara",
    "arabic",
    "العربية"
  ],

  el: [
    "el",
    "gre",
    "greek",
    "ελληνικά",
    "ελληνικα"
  ],

  he: [
    "he",
    "heb",
    "hebrew",
    "עברית"
  ]

};


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

  if (
    !row ||
    !requested
  ) {

    return false;

  }


  if (
    row === requested
  ) {

    return true;

  }


  const aliases =
    LANGUAGE_ALIASES[
      requested
    ] || [];


  return aliases.some(
    alias =>
      normalize(alias) === row
  );

}


// ============================================================
// FILTER TO REQUESTED LANGUAGE
// ============================================================

function filterByLanguage(
  rows,
  language
) {

  return rows.filter(
    row =>
      languageMatches(
        getLanguage(row),
        language
      )
  );

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
        includesNormalized(
          normalized,
          keyword
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
// TOPIC KEYWORDS
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
// ROW TOPIC MATCH COUNT
// ============================================================

function getTopicMatchCount(
  row,
  topics
) {

  if (
    !topics.length
  ) {

    return 0;

  }


  const fullText = normalize(
    [
      getQuestion(row),
      getAnswer(row),
      getCategory(row),
      getBibleReferences(row),
      getChurchSources(row),
      getComparisonGroup(row)
    ].join(" ")
  );


  let matches = 0;


  for (
    const topic of topics
  ) {

    const keywords =
      TOPICS[topic] || [];


    const found =
      keywords.some(
        keyword =>
          fullText.includes(
            normalize(keyword)
          )
      );


    if (found) {
      matches++;
    }

  }


  return matches;

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
  ]
    .filter(Boolean)
    .join(" ");


  if (
    !rowQuestion &&
    !rowAnswer
  ) {

    return 0;

  }


  // ----------------------------------------------------------
  // LANGUAGE IS A HARD REQUIREMENT
  // ----------------------------------------------------------

  if (
    !languageMatches(
      getLanguage(row),
      requestedLanguage
    )
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

    score += 10000;

  }


  // ----------------------------------------------------------
  // QUESTION CONTAINMENT
  // ----------------------------------------------------------

  if (
    rowQuestion &&
    query.includes(rowQuestion)
  ) {

    score += 3000;

  }


  if (
    rowQuestion &&
    rowQuestion.includes(query)
  ) {

    score += 2500;

  }


  // ----------------------------------------------------------
  // QUERY WORD MATCHING
  // ----------------------------------------------------------

  for (
    const word of queryWords
  ) {

    if (
      rowQuestion.includes(word)
    ) {

      score += 300;
      matchedWords++;

      continue;

    }


    if (
      rowCategory.includes(word)
    ) {

      score += 150;
      matchedWords++;

      continue;

    }


    if (
      rowAnswer.includes(word)
    ) {

      score += 60;
      matchedWords++;

      continue;

    }


    if (
      fullText.includes(word)
    ) {

      score += 25;
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
      ) * 600
    );

  }


  // ----------------------------------------------------------
  // TOPIC COHERENCE
  // ----------------------------------------------------------

  const topicMatchCount =
    getTopicMatchCount(
      row,
      topics
    );


  if (
    topics.length > 0
  ) {

    if (
      topicMatchCount === 0
    ) {

      // Strong penalty:
      // prevent unrelated topics from entering
      // a clearly identified topic answer.

      score -= 3500;

    } else {

      score +=
        topicMatchCount *
        1200;

    }

  }


  // ----------------------------------------------------------
  // CATEGORY
  // ----------------------------------------------------------

  if (
    rowCategory
  ) {

    score += 30;

  }


  // ----------------------------------------------------------
  // SCRIPTURE / CHURCH SOURCES
  // ----------------------------------------------------------

  if (
    rowBible
  ) {

    score += 40;

  }


  if (
    rowSources
  ) {

    score += 40;

  }


  // ----------------------------------------------------------
  // EDUCATION LEVEL
  // ----------------------------------------------------------

  if (
    getEducationLevel(row)
  ) {

    score += 10;

  }


  return Math.max(
    0,
    score
  );

}


// ============================================================
// SUPABASE REQUEST
// ============================================================

async function supabaseGet(
  path,
  rangeStart,
  rangeEnd
) {

  if (
    !SUPABASE_ANON_KEY
  ) {

    throw new Error(
      "SUPABASE_ANON_KEY is missing in Vercel."
    );

  }


  const headers = {

    apikey:
      SUPABASE_ANON_KEY,

    Authorization:
      `Bearer ${SUPABASE_ANON_KEY}`,

    Accept:
      "application/json",

    "Content-Type":
      "application/json"

  };


  if (
    Number.isInteger(rangeStart) &&
    Number.isInteger(rangeEnd)
  ) {

    headers.Range =
      `${rangeStart}-${rangeEnd}`;

    headers.Prefer =
      "count=none";

  }


  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {

        method: "GET",

        headers

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
// LOAD KNOWLEDGE WITH PAGINATION
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
    "comparison_group"

  ].join(",");


  const pageSize = 1000;

  const maxRows = 10000;

  const allRows = [];


  for (
    let start = 0;
    start < maxRows;
    start += pageSize
  ) {

    const end =
      start + pageSize - 1;


    const path =
      `orthodox_answers?select=${encodeURIComponent(
        columns
      )}&order=id.asc`;


    const rows =
      await supabaseGet(
        path,
        start,
        end
      );


    if (
      !Array.isArray(rows)
    ) {

      throw new Error(
        "Supabase returned invalid knowledge data."
      );

    }


    allRows.push(
      ...rows
    );


    if (
      rows.length < pageSize
    ) {

      break;

    }

  }


  return allRows;

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
      (a, b) => {

        if (
          b.score !== a.score
        ) {

          return (
            b.score -
            a.score
          );

        }


        // Stable preference:
        // exact language already guaranteed.

        return (
          Number(
            a.row.id || 0
          ) -
          Number(
            b.row.id || 0
          )
        );

      }

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
      item =>
        item.row
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
  answerLevel,
  topics
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
Avoid unnecessary repetition.
`;

  }

  else if (
    Number(answerLevel) === 3
  ) {

    depth = `
Give a comprehensive scholarly answer.

Explain the subject carefully from the Ethiopian
Orthodox Tewahedo perspective.

Use biblical, theological, historical and Ethiopian
Orthodox dimensions when the supplied evidence supports them.

Do not become repetitive simply to make the answer longer.
`;

  }

  else {

    depth = `
Give a detailed, well-organized and educational answer.

Do not give a shallow three-line response.

Explain the main issue sufficiently for an ordinary reader,
while retaining theological depth.
`;

  }


  const topicInstruction =
    topics.length
      ? `
The detected main topic(s) are:

${topics.join(", ")}

The answer MUST remain centered on these topic(s).

Do not introduce unrelated doctrines merely because
they appear somewhere in the knowledge base.
`
      : `
No specific predefined topic was detected.

Identify the actual subject from the supplied evidence
and remain focused on the user's question.
`;


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

Do not answer in English unless English was requested.

Do not translate the answer into another language.

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

${topicInstruction}

Stay strictly focused on the user's actual question.

For example:

If the question is about baptism,
focus on baptism.

If the question is about Mary,
focus on Mary.

If the question is about the Cross,
focus on the Cross.

Related evidence is allowed only when it helps explain
the actual question.

Unrelated evidence must not be included.

========================================================
DEPTH
========================================================

${depth}

========================================================
PREFERRED STRUCTURE
========================================================

When relevant, organize the answer using:

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

Do not create empty sections.

========================================================
EVIDENCE RULE
========================================================

Use the supplied knowledge base as evidence.

If a Bible reference is supplied,
use it as supporting evidence when relevant.

If Church sources are supplied,
use them appropriately.

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

If exact evidence is not supplied,
do not pretend that it was supplied.

When necessary, clearly distinguish:
"the supplied sources state..."
from general theological explanation.

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
NO INTERNAL INFORMATION
========================================================

Never mention:

Gemini
Supabase
database
API
model
prompt
system
internal processing
knowledge retrieval

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
      answerLevel,
      topics
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

                    text: `

USER QUESTION:
${question}

DETECTED TOPICS:
${topics.join(", ") || "none"}

KNOWLEDGE BASE:
${knowledgeContext}

IMPORTANT:

Build ONE coherent answer.

Use only knowledge relevant to the question.

Do not mix unrelated subjects.

Do not invent missing evidence.

Write the entire final answer in the requested language.

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
      `Gemini HTTP ${response.status}`
    );

  }


  const parts =
    data
      ?.candidates?.[0]
      ?.content?.parts;


  const answer =
    Array.isArray(parts)

      ? parts
          .map(
            part =>
              part?.text || ""
          )
          .join("\n")
          .trim()

      : "";


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
    !Array.isArray(rows) ||
    !rows.length
  ) {

    return "";

  }


  // IMPORTANT:
  // Fallback is allowed ONLY from the requested language.

  const sameLanguage =
    rows.find(
      row =>
        languageMatches(
          getLanguage(row),
          language
        ) &&
        getAnswer(row)
    );


  if (
    sameLanguage
  ) {

    return getAnswer(
      sameLanguage
    );

  }


  return "";

}


// ============================================================
// FINAL ANSWER LANGUAGE SAFETY
// ============================================================

function basicLanguageSafety(
  answer,
  language
) {

  const text =
    clean(answer);


  if (
    !text
  ) {

    return false;

  }


  // We do NOT attempt unreliable automatic
  // language detection here.

  // Gemini is explicitly instructed to use the
  // requested language, while the Supabase fallback
  // is hard-filtered to the requested language.

  // Therefore this function is intentionally a
  // non-destructive final guard.

  return true;

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
    // LOAD KNOWLEDGE
    // --------------------------------------------------------

    let rows;


    try {

      rows =
        await loadKnowledge();

    } catch (
      supabaseError
    ) {

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
    // HARD LANGUAGE FILTER
    // --------------------------------------------------------

    const languageRows =
      filterByLanguage(
        rows,
        language
      );


    // --------------------------------------------------------
    // IMPORTANT:
    // If there are no rows in the requested language,
    // do NOT return another language.
    // --------------------------------------------------------

    if (
      languageRows.length === 0
    ) {

      return res
        .status(404)
        .json({

          success: false,

          error:
            "No knowledge is available in the selected language.",

          language,

          topics,

          matchedCount: 0

        });

    }


    // --------------------------------------------------------
    // RANK ONLY REQUESTED LANGUAGE
    // --------------------------------------------------------

    const ranked =
      rankKnowledge(
        languageRows,
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
    // NO RELEVANT TOPIC MATCH
    // --------------------------------------------------------

    if (
      selected.length === 0
    ) {

      return res
        .status(404)
        .json({

          success: false,

          error:
            "No relevant knowledge was found for this question.",

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

    } catch (
      geminiError
    ) {

      console.error(
        "GEMINI ERROR:",
        geminiError
      );


      // Gemini failure must NOT destroy
      // the Supabase answer system.

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
      !basicLanguageSafety(
        answer,
        language
      )
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


  } catch (
    error
  ) {

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
