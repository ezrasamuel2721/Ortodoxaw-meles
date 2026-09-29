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
// Multi-source Retrieval
// Gemini Detailed Answer
// Strong Language Control
// Safe Fallback
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
  "gemini-3.8-flash";

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
    "wolayta",
    "wolayt"
  ],

  kaa: [
    "kaa",
    "kaf",
    "kaffa",
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
    "kembatigna",
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

  const value =
    normalize(rowLang);

  const aliases =
    LANGUAGE_ALIASES[requested] || [];

  if (
    aliases.includes(value)
  ) {
    return true;
  }

  return aliases.some(
    alias =>
      value.includes(alias) ||
      alias.includes(value)
  );

}


// ============================================================
// CANONICAL LANGUAGE
// ============================================================

function resolveLanguage(value) {

  const normalized =
    normalize(value);

  for (
    const code of Object.keys(LANGUAGE_ALIASES)
  ) {

    if (
      LANGUAGE_ALIASES[code].includes(
        normalized
      )
    ) {

      return code;

    }

  }

  return null;

}


// ============================================================
// STOP WORDS
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
  "እንደ",
  "ከ",
  "ላይ",
  "ውስጥ",

  "what",
  "is",
  "the",
  "how",
  "why",
  "about",
  "and",
  "of",
  "to",
  "does",
  "do",
  "are",
  "for",

  "من",
  "ما",
  "هو",
  "كيف",
  "لماذا",
  "عن",
  "في",
  "هل"

]);


// ============================================================
// TOPIC GROUPS
// ============================================================

const TOPIC_GROUPS = [

  {
    name: "baptism",

    terms: [
      "ጥምቀት",
      "ጥምቀትን",
      "ጥምቀት ምንድን",
      "ተጠመቀ",
      "ተጠምቆ",
      "ማጥመቅ",
      "ሕፃን ጥምቀት",
      "baptism",
      "baptize",
      "baptized",
      "christening"
    ]

  },

  {
    name: "communion",

    terms: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "ሥጋ",
      "ደም",
      "communion",
      "eucharist",
      "holy communion"
    ]

  },

  {
    name: "repentance",

    terms: [
      "ንስሐ",
      "ኃጢአት",
      "ኃጢአተኛ",
      "ንስሐ መግባት",
      "repentance",
      "repent",
      "confession"
    ]

  },

  {
    name: "prayer",

    terms: [
      "ጸሎት",
      "መጸለይ",
      "ጸሎት ማድረግ",
      "prayer",
      "pray"
    ]

  },

  {
    name: "fasting",

    terms: [
      "ጾም",
      "መጾም",
      "ጾመ",
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
      "ቅድስት ማርያም",
      "mary",
      "virgin mary"
    ]

  },

  {
    name: "trinity",

    terms: [
      "ሥላሴ",
      "አብ",
      "ወልድ",
      "መንፈስ ቅዱስ",
      "trinity",
      "father son holy spirit"
    ]

  },

  {
    name: "incarnation",

    terms: [
      "ሥጋዌ",
      "ሰው መሆን",
      "ኢየሱስ",
      "ክርስቶስ",
      "incarnation"
    ]

  },

  {
    name: "cross",

    terms: [
      "መስቀል",
      "ቅዱስ መስቀል",
      "cross",
      "holy cross"
    ]

  },

  {
    name: "ark",

    terms: [
      "ታቦት",
      "ታቦተ ጽዮን",
      "ark",
      "ark of covenant"
    ]

  },

  {
    name: "faith",

    terms: [
      "ሃይማኖት",
      "እምነት",
      "faith",
      "religion",
      "belief"
    ]

  },

  {
    name: "church",

    terms: [
      "ቤተ ክርስቲያን",
      "ቤተክርስቲያን",
      "church",
      "orthodox church"
    ]

  },

  {
    name: "christ",

    terms: [
      "ኢየሱስ ክርስቶስ",
      "ክርስቶስ",
      "ጌታ",
      "jesus christ",
      "christ"
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
          normalizedTerm.length >= 5
            ? 8
            : 4;

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
// TOPIC TERMS
// ============================================================

function getTopicTerms(topic) {

  const group =
    TOPIC_GROUPS.find(
      item =>
        item.name === topic
    );

  return group
    ? group.terms
    : [];

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

    score += 1500;

  } else {

    score -= 1200;

  }


  // ----------------------------------------------------------
  // EXACT QUESTION
  // ----------------------------------------------------------

  if (
    rq === q
  ) {

    score += 5000;

  }


  // ----------------------------------------------------------
  // PHRASE
  // ----------------------------------------------------------

  if (
    q.length >= 4 &&
    rq.includes(q)
  ) {

    score += 2200;

  }


  // ----------------------------------------------------------
  // QUESTION WORD MATCH
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

      score += 260;

      found = true;

    }

    if (
      category.includes(word)
    ) {

      score += 180;

      found = true;

    }

    if (
      ra.includes(word)
    ) {

      score += 70;

      found = true;

    }

    if (
      bible.includes(word)
    ) {

      score += 35;

      found = true;

    }

    if (
      church.includes(word)
    ) {

      score += 35;

      found = true;

    }

    if (
      comparison.includes(word)
    ) {

      score += 15;

      found = true;

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
        ) * 700
      );

  }


  // ----------------------------------------------------------
  // TOPIC MATCH
  // ----------------------------------------------------------

  const topic =
    detectTopic(question);

  if (
    topic
  ) {

    const topicTerms =
      getTopicTerms(topic);

    const allText =
      normalize(
        [
          rowQuestion(row),
          rowAnswer(row),
          rowCategory(row),
          rowBible(row),
          rowChurch(row),
          rowComparison(row)
        ].join(" ")
      );

    let topicHits =
      0;

    for (
      const term of topicTerms
    ) {

      const normalizedTerm =
        normalize(term);

      if (
        normalizedTerm &&
        allText.includes(
          normalizedTerm
        )
      ) {

        topicHits++;

      }

    }

    score +=
      topicHits *
      220;

  }


  // ----------------------------------------------------------
  // CATEGORY BONUS
  // ----------------------------------------------------------

  const topic =
    detectTopic(question);

  if (
    topic &&
    category.includes(
      normalize(topic)
    )
  ) {

    score +=
      500;

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
// Loads a larger window so topic-related lessons are not
// limited to only the first few records.
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
    )}&order=id.asc&limit=5000`;


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
            .slice(0, 14000),

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

==================================================
ORTHODOX SOURCE ${index + 1}
==================================================

Question:
${source.question || "N/A"}

Language:
${source.language || "N/A"}

Category:
${source.category || "N/A"}

Education level:
${source.education_level || "N/A"}

Bible references:
${source.bible_references || "N/A"}

Church sources:
${source.church_sources || "N/A"}

Comparison group:
${source.comparison_group || "N/A"}

Content:
${source.answer || "N/A"}

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

You are the official theological answer engine
for the Ethiopian Orthodox Tewahedo educational
application "ኦርቶዶክሳዊ መልስ".

Your task is to answer the user's question accurately,
carefully, comprehensively, and educationally from
the Ethiopian Orthodox Tewahedo perspective.

==================================================
ABSOLUTE LANGUAGE RULE
==================================================

The requested output language is:

${languageName}

The FINAL ANSWER MUST BE ENTIRELY IN:

${languageName}

Do not translate the answer into Amharic.

Do not switch to English.

Do not mix languages.

Do not produce a bilingual answer.

Only preserve exact proper names, Biblical book names,
or established theological terms when translation would
make them inaccurate.

==================================================
USER QUESTION
==================================================

${question}

==================================================
DETECTED TOPIC
==================================================

${topic || "general Orthodox theological question"}

Stay focused on this topic.

If the question is about baptism, answer baptism.

Do NOT automatically add unrelated teachings about
prayer, fasting, communion, marriage, repentance,
Mary, or other subjects.

A related doctrine may be mentioned only when it is
necessary to explain the actual question.

==================================================
ORTHODOX THEOLOGICAL POSITION
==================================================

Explain the Ethiopian Orthodox Tewahedo understanding
clearly and respectfully.

Do not attack Muslims, Protestants, Catholics,
Jehovah's Witnesses, atheists, or any other group.

If the user explicitly asks for a comparison,
explain the differences accurately and respectfully.

==================================================
USE OF SOURCES
==================================================

The supplied sources are the primary evidence.

Use the most relevant sources first.

Synthesize several relevant sources when they discuss
the same topic.

Do NOT simply paste the database answers together.

Do NOT combine unrelated database records.

Do NOT invent:

- Bible verses
- Bible references
- Church Fathers
- Ethiopian scholars
- books
- quotations
- page numbers
- historical claims
- theological citations

If the supplied sources do not establish a claim,
do not pretend that the claim has been verified.

==================================================
ANSWER STRUCTURE
==================================================

Write a COMPLETE TEACHING, not a short database answer.

When appropriate, organize the answer with clear
headings such as:

1. ቀጥተኛ መልስ
2. ትርጉምና ትርጓሜ
3. የመጽሐፍ ቅዱስ መሠረት
4. የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ትምህርት
5. የቤተ ክርስቲያን ትውፊት
6. ዝርዝር ማብራሪያ
7. ምሳሌ
8. የተሳሳቱ ግንዛቤዎች
9. መደምደሚያ

Do not force every heading if it does not fit.

The answer should move from simple explanation
to deeper theological explanation.

It should be useful to:

- beginners
- students
- serious learners
- knowledgeable readers

==================================================
BIBLICAL REFERENCES
==================================================

Use Biblical references supplied by the sources when
they are relevant.

Never fabricate a verse or reference.

If the source gives a reference but not the full verse,
refer to the passage rather than inventing the wording.

==================================================
ETHIOPIAN ORTHODOX SOURCES
==================================================

When a specific source is supplied, use it accurately.

Do not write:

"የኢትዮጵያ ሊቃውንት እንዲህ ይላሉ"

unless an actual relevant source has been supplied.

Never fabricate teachings attributed to:

St. Yared,
Abba Giyorgis,
St. Athanasius,
St. Cyril,
or any other Father or Ethiopian scholar.

==================================================
FINAL ANSWER
==================================================

Return ONLY the theological answer.

Do not mention:

AI
Gemini
Supabase
API
database
prompt
system
retrieval
fallback
source ranking

Do not explain how the answer was generated.

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

USER QUESTION:

${question}

RELEVANT ORTHODOX KNOWLEDGE:

${context}

==================================================
FINAL INSTRUCTIONS
==================================================

Write the final answer now.

Required:

- Entire answer in ${LANGUAGES[language]}.
- Stay strictly focused on the user's question.
- Use the supplied relevant sources.
- Synthesize the sources instead of copying them.
- Give a detailed educational explanation.
- Include relevant Biblical references when supported.
- Clearly explain the Ethiopian Orthodox Tewahedo position.
- Do not invent citations or quotations.
- Do not mention AI, Gemini, Supabase, database, API,
  prompt, retrieval, or system instructions.
- Finish with a clear conclusion.

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
                0.18,

              topP:
                0.90,

              maxOutputTokens:
                12000

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
// FALLBACK
//
// If Gemini fails, combine ONLY highly relevant rows from
// the SAME language and SAME topic.
//
// This is intentionally conservative.
// ============================================================

function fallbackAnswer(
  ranked,
  language,
  question
) {

  const topic =
    detectTopic(question);


  const languageRows =
    ranked.filter(
      item =>
        languageMatches(
          rowLanguage(item.row),
          language
        )
    );


  if (
    !languageRows.length
  ) {

    return "";

  }


  const topicRows =
    topic
      ? languageRows.filter(
          item => {

            const text =
              normalize(
                [
                  rowQuestion(item.row),
                  rowAnswer(item.row),
                  rowCategory(item.row),
                  rowBible(item.row),
                  rowChurch(item.row)
                ].join(" ")
              );

            return getTopicTerms(topic)
              .some(
                term =>
                  text.includes(
                    normalize(term)
                  )
              );

          }
        )
      : languageRows;


  const usable =
    (
      topicRows.length
        ? topicRows
        : languageRows
    )
      .filter(
        item =>
          item.score >= 120
      )
      .slice(
        0,
        3
      );


  if (
    !usable.length
  ) {

    return "";

  }


  const parts =
    usable.map(
      item =>
        rowAnswer(item.row)
    )
      .filter(Boolean);


  return [
    ...new Set(parts)
  ]
    .join("\n\n");

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


  // ----------------------------------------------------------
  // METHOD
  // ----------------------------------------------------------

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({

        success:
          false,

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


    const requestedLanguage =
      cleanText(
        body.language ||
        "am"
      ).toLowerCase();


    const language =
      resolveLanguage(
        requestedLanguage
      );


    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (
      !question
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

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

          success:
            false,

          error:
            "ጥያቄው ከ3000 ፊደል መብለጥ የለበትም።"

        });

    }


    if (
      !language ||
      !LANGUAGES[language]
    ) {

      return res
        .status(400)
        .json({

          success:
            false,

          error:
            `Unsupported language: ${requestedLanguage}`

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
    // RANK ALL RECORDS
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
    // STRONG MATCHES
    // --------------------------------------------------------

    const strong =
      ranked.filter(
        item =>
          item.score >= 120
      );


    // --------------------------------------------------------
    // PREFER SAME LANGUAGE
    // --------------------------------------------------------

    const sameLanguage =
      strong.filter(
        item =>
          languageMatches(
            rowLanguage(item.row),
            language
          )
      );


    const candidatePool =
      sameLanguage.length
        ? sameLanguage
        : strong;


    // --------------------------------------------------------
    // TOPIC FILTER
    //
    // If a clear topic is detected, prefer records
    // belonging to that topic.
    // --------------------------------------------------------

    const topic =
      detectTopic(question);


    let topicCandidates =
      candidatePool;


    if (
      topic
    ) {

      const terms =
        getTopicTerms(topic);

      const topicMatches =
        candidatePool.filter(
          item => {

            const text =
              normalize(
                [
                  rowQuestion(item.row),
                  rowAnswer(item.row),
                  rowCategory(item.row),
                  rowBible(item.row),
                  rowChurch(item.row)
                ].join(" ")
              );

            return terms.some(
              term =>
                text.includes(
                  normalize(term)
                )
            );

          }
        );


      if (
        topicMatches.length
      ) {

        topicCandidates =
          topicMatches;

      }

    }


    // --------------------------------------------------------
    // SELECT SOURCES
    //
    // Up to 10 highly relevant sources.
    // --------------------------------------------------------

    const selected =
      topicCandidates
        .slice(
          0,
          10
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
            language,
            question
          );


        source =
          answer
            ? "supabase-fallback"
            : "none";

      }

    } else {

      console.error(
        "GEMINI_API_KEY is missing."
      );


      answer =
        fallbackAnswer(
          ranked,
          language,
          question
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

          topic:
            topic,

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

        languageName:
          LANGUAGES[language],

        source,

        topic,

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
                item.church_sources,

              comparison_group:
                item.comparison_group

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
