// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL ORTHODOX ANSWER ENGINE
// WITH LONG BOOK-LIKE ANSWERS
//
// 15 Languages
// Supabase Knowledge Base
// Strict Language Matching
// Strict Topic Matching
// Single Best Source Selection
// Gemini Detailed Answer (1200-2500+ words)
// Safe Single-Source Fallback
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
  "gemini-2.0-flash";

const TABLE_NAME =
  "orthodox_answers";

const PAGE_SIZE = 1000;

const MAX_ROWS = 20000;

const MAX_SOURCES = 5;


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
  so: "Soomaali",
  aa: "Afaraf",
  had: "Hadiyyisa",
  kmb: "Kembatigna",
  gamo: "Gamo",
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
    "wolayta",
    "wolayt",
    "wolaytto"
  ],
  kaa: [
    "kaa",
    "kaf",
    "kaffa",
    "kafa",
    "kaffoono",
    "kaffoo"
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
    "soomaali",
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
    "hadiyyisa",
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
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function getWords(value) {
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
  const value = normalize(rowLang);

  if (!value || !requested) {
    return false;
  }

  const aliases =
    LANGUAGE_ALIASES[requested] || [];

  if (
    aliases.some(
      alias =>
        normalize(alias) === value
    )
  ) {
    return true;
  }

  return aliases.some(alias => {
    const a = normalize(alias);

    return (
      value === a ||
      value.includes(a) ||
      a.includes(value)
    );
  });
}


// ============================================================
// CANONICAL LANGUAGE
// ============================================================

function resolveLanguage(value) {
  const normalized = normalize(value);

  if (!normalized) {
    return null;
  }

  for (const code of Object.keys(LANGUAGE_ALIASES)) {
    const aliases = LANGUAGE_ALIASES[code];

    if (
      aliases.some(
        alias =>
          normalize(alias) === normalized
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
  "a",
  "an",
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
  const q = normalize(question);

  if (!q) {
    return null;
  }

  let best = null;
  let bestScore = 0;

  for (const group of TOPIC_GROUPS) {
    let score = 0;

    for (const term of group.terms) {
      const t = normalize(term);

      if (t && q.includes(t)) {
        score += t.length >= 5 ? 8 : 4;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = group.name;
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
      item => item.name === topic
    );

  return group ? group.terms : [];
}


// ============================================================
// ROW SEARCH TEXT
// ============================================================

function rowSearchText(row) {
  return normalize(
    [
      rowQuestion(row),
      rowAnswer(row),
      rowCategory(row),
      rowBible(row),
      rowChurch(row),
      rowComparison(row),
      rowEducation(row)
    ].join(" ")
  );
}


// ============================================================
// ROW TOPIC MATCH
// ============================================================

function rowMatchesTopic(
  row,
  topic
) {
  if (!topic) {
    return true;
  }

  const terms = getTopicTerms(topic);

  if (!terms.length) {
    return false;
  }

  const text = rowSearchText(row);

  return terms.some(term => {
    const t = normalize(term);

    return t && text.includes(t);
  });
}


// ============================================================
// STRICT LANGUAGE ROW
// ============================================================

function isSameLanguage(
  row,
  language
) {
  return languageMatches(
    rowLanguage(row),
    language
  );
}


// ============================================================
// SCORE ROW
// ============================================================

function scoreRow(
  row,
  question,
  requestedLanguage
) {
  const q = normalize(question);

  const qWords =
    getWords(question)
      .filter(
        word =>
          !STOP_WORDS.has(word)
      );

  const rq = normalize(
    rowQuestion(row)
  );

  const ra = normalize(
    rowAnswer(row)
  );

  const category = normalize(
    rowCategory(row)
  );

  const bible = normalize(
    rowBible(row)
  );

  const church = normalize(
    rowChurch(row)
  );

  const comparison = normalize(
    rowComparison(row)
  );

  if (!rq && !ra) {
    return 0;
  }

  // IMPORTANT:
  // Wrong language must never compete
  // with the requested language.

  if (
    !isSameLanguage(
      row,
      requestedLanguage
    )
  ) {
    return -100000;
  }

  let score = 0;

  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  score += 2000;

  // ----------------------------------------------------------
  // EXACT QUESTION
  // ----------------------------------------------------------

  if (rq === q) {
    score += 6000;
  }

  // ----------------------------------------------------------
  // FULL PHRASE
  // ----------------------------------------------------------

  if (
    q.length >= 4 &&
    rq.includes(q)
  ) {
    score += 3000;
  }

  // ----------------------------------------------------------
  // QUESTION WORD MATCH
  // ----------------------------------------------------------

  let hits = 0;

  for (const word of qWords) {
    let found = false;

    if (rq.includes(word)) {
      score += 320;
      found = true;
    }

    if (category.includes(word)) {
      score += 220;
      found = true;
    }

    if (ra.includes(word)) {
      score += 80;
      found = true;
    }

    if (bible.includes(word)) {
      score += 40;
      found = true;
    }

    if (church.includes(word)) {
      score += 40;
      found = true;
    }

    if (comparison.includes(word)) {
      score += 20;
      found = true;
    }

    if (found) {
      hits++;
    }
  }

  // ----------------------------------------------------------
  // COVERAGE
  // ----------------------------------------------------------

  if (qWords.length) {
    score += Math.round(
      (hits / qWords.length) * 900
    );
  }

  // ----------------------------------------------------------
  // TOPIC MATCH
  // ----------------------------------------------------------

  const topic = detectTopic(question);

  if (topic) {
    if (rowMatchesTopic(row, topic)) {
      const topicTerms = getTopicTerms(topic);

      const text = rowSearchText(row);

      let topicHits = 0;

      for (const term of topicTerms) {
        const t = normalize(term);

        if (t && text.includes(t)) {
          topicHits++;
        }
      }

      score += topicHits * 350;
    } else {
      // A detected topic exists,
      // therefore unrelated rows are rejected.

      return -100000;
    }
  }

  // ----------------------------------------------------------
  // CATEGORY BONUS
  // ----------------------------------------------------------

  if (
    topic &&
    category.includes(
      normalize(topic)
    )
  ) {
    score += 700;
  }

  return score;
}


// ============================================================
// SUPABASE GET
// ============================================================

async function supabaseGet(
  path
) {
  if (!SUPABASE_KEY) {
    throw new Error(
      "SUPABASE_KEY_MISSING: SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY is not configured."
    );
  }

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        method: "GET",

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
      data?.details ||
      `Supabase error ${response.status}: ${text.slice(0, 500)}`
    );
  }

  return data;
}


// ============================================================
// LOAD KNOWLEDGE BASE WITH PAGINATION
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

  const allRows = [];

  let offset = 0;

  while (offset < MAX_ROWS) {
    const path =
      `${TABLE_NAME}` +
      `?select=${encodeURIComponent(columns)}` +
      `&order=id.asc` +
      `&limit=${PAGE_SIZE}` +
      `&offset=${offset}`;

    const page =
      await supabaseGet(
        path
      );

    if (
      !Array.isArray(page) ||
      !page.length
    ) {
      break;
    }

    allRows.push(
      ...page
    );

    if (
      page.length < PAGE_SIZE
    ) {
      break;
    }

    offset +=
      PAGE_SIZE;
  }

  return allRows;
}


// ============================================================
// BUILD SOURCES
// ============================================================

function buildSources(
  ranked
) {
  return ranked.map(
    item => {
      const row = item.row;

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
// GEMINI CONTEXT
// ============================================================

function makeContext(
  sources
) {
  if (!sources.length) {
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
// LANGUAGE QUALITY CHECK
// ============================================================

function answerHasWrongLanguage(
  answer,
  language
) {
  const text = normalize(answer);

  if (!text) {
    return true;
  }

  // Strong protection for languages
  // where accidental Latin-script output
  // is especially easy to detect.

  if (language === "zh") {
    const chineseChars =
      (answer.match(/[\u4e00-\u9fff]/g) || [])
        .length;

    return chineseChars < 5;
  }

  if (language === "ar") {
    const arabicChars =
      (answer.match(/[\u0600-\u06ff]/g) || [])
        .length;

    return arabicChars < 5;
  }

  if (["am", "ti", "gez", "sid", "wal", "kaa", "om", "aa", "had", "kmb", "gamo"].includes(language)) {
    const ethiopicChars =
      (answer.match(/[\u1200-\u137f]/g) || [])
        .length;

    return ethiopicChars < 5;
  }

  return false;
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

Your task is to provide an accurate, coherent,
detailed and educational answer from the Ethiopian
Orthodox Tewahedo perspective.

==================================================
ABSOLUTE LANGUAGE RULE
==================================================

REQUESTED LANGUAGE:

${languageName}

The final answer MUST be written in ${languageName}.

Do not answer in Amharic unless Amharic was requested.

Do not produce bilingual output.

Do not translate the answer into another language.

Use established Biblical or theological proper names
only when necessary for accuracy.

==================================================
USER QUESTION
==================================================

${question}

==================================================
DETECTED TOPIC
==================================================

${topic || "general"}

Stay strictly focused on this topic.

If the question concerns baptism, answer baptism.

Do not mix baptism with unrelated prayer, fasting,
communion, marriage, repentance, Mary, or other
topics unless they are directly necessary.

==================================================
SOURCE RULE
==================================================

The supplied Orthodox knowledge-base sources are
the primary evidence.

Use the most relevant sources.

Synthesize them into one coherent answer.

Never simply concatenate database records.

Never invent:

- Bible references
- quotations
- Church Father statements
- Ethiopian scholar statements
- book titles
- page numbers
- historical claims
- theological citations

If the supplied material does not establish something,
state it carefully instead of inventing evidence.

==================================================
ORTHODOX POSITION
==================================================

Explain the Ethiopian Orthodox Tewahedo understanding
clearly and respectfully.

Do not insult or attack other religions or denominations.

If the user asks for comparison, explain the differences
respectfully and accurately.

==================================================
ANSWER LENGTH AND DEPTH
==================================================

The answer must be long, detailed, educational and complete.

Do not give a short answer.

Write approximately 1200 to 2500 words when the subject
has enough supporting material.

If the subject is complex, write up to 3500 words.

Explain the subject as if teaching a reader from a book,
not as if answering with a short chat message.

Use many clear paragraphs.

Every important theological idea must be explained fully.

Do not repeat the same sentence merely to increase length.

Do not add unsupported information just to make the answer longer.

If the supplied sources are limited, give a careful detailed
explanation based only on what the sources establish.

==================================================
REQUIRED BOOK-LIKE STRUCTURE
==================================================

Use the following structure whenever it fits the question:

1. Direct answer
2. Meaning of the question
3. Main teaching
4. Detailed explanation
5. Biblical foundation
6. Ethiopian Orthodox Tewahedo teaching
7. Church tradition
8. Practical example or application
9. Common misunderstandings (if relevant)
10. Importance for Christian life
11. Conclusion

Use clear section headings and subheadings.

Do not include every heading if it is unrelated to the question.

Each section should contain real, substantial explanation,
not only one sentence.

Make transitions between sections smooth and logical.

==================================================
PREFERRED STRUCTURE
==================================================

When appropriate:

1. Direct answer
2. Meaning and explanation
3. Biblical foundation
4. Ethiopian Orthodox Tewahedo teaching
5. Church tradition
6. Detailed explanation
7. Example
8. Common misunderstandings
9. Conclusion

Use only sections that actually fit the question.

==================================================
FINAL RULE
==================================================

Return ONLY the final theological answer.

Never mention:

AI
Gemini
Supabase
API
database
prompt
system
retrieval
fallback
ranking

End with a clear conclusion.

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
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY_MISSING: GEMINI_API_KEY is not configured."
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

==================================================
RELEVANT ORTHODOX KNOWLEDGE
==================================================

${context}

==================================================
FINAL ANSWER INSTRUCTIONS
==================================================

Write a complete book-like theological lesson now.

The answer must not be short.

Target length:
- Minimum: approximately 1200 words when sources allow
- Preferred: 1500 to 2500 words
- Maximum: approximately 3500 words

The answer must be written entirely in:

${LANGUAGES[language]}

Do not write the answer in Amharic unless Amharic was requested.

Do not mix languages.

Stay strictly focused on this question and its detected topic.

Explain the subject from simple ideas to deeper theological ideas.

Use clear headings, sections, examples and a final conclusion.

Explain the meaning, purpose, biblical basis, Ethiopian Orthodox
Tewahedo understanding, practical importance and common
misunderstandings whenever these are relevant.

Use the supplied sources as the primary evidence.

You may combine information from the relevant sources,
but do not concatenate the source records.

Do not invent:
- Bible references
- quotations
- Church Fathers
- scholars
- books
- page numbers
- historical facts
- theological citations

If a detail is not supported by the supplied sources,
explain it carefully without inventing a citation.

Never mention:
AI, Gemini, Supabase, API, database, prompt,
system, retrieval, fallback or ranking.

Return only the final theological teaching.

End with a strong and clear conclusion.

`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`;

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
                    systemPrompt
                }
              ]
            },

            contents: [
              {
                role: "user",

                parts: [
                  {
                    text:
                      userPrompt
                  }
                ]
              }
            ],

            generationConfig: {
              maxOutputTokens: 24000,
              temperature: 0.45,
              topP: 0.9
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

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini error ${response.status}`;

    throw new Error(
      `GEMINI_${response.status}: ${message}`
    );
  }

  const candidates =
    Array.isArray(
      data?.candidates
    )
      ? data.candidates
      : [];

  const parts =
    candidates[0]
      ?.content
      ?.parts || [];

  const answer =
    parts
      .map(
        part =>
          part?.text || ""
      )
      .join("\n")
      .trim();

  if (!answer) {
    const finishReason =
      candidates[0]
        ?.finishReason ||
      "UNKNOWN";

    throw new Error(
      `Gemini returned an empty answer. Finish reason: ${finishReason}`
    );
  }

  // Reject unusually short answers.
  // This prevents a one-paragraph answer from being accepted
  // when a long educational answer was requested.
  const answerCharacterCount = answer.length;

  if (answerCharacterCount < 2500) {
    throw new Error(
      `GEMINI_ANSWER_TOO_SHORT: Only ${answerCharacterCount} characters were generated. Expected minimum 2500.`
    );
  }

  if (
    answerHasWrongLanguage(
      answer,
      language
    )
  ) {
    throw new Error(
      `GEMINI_LANGUAGE_VALIDATION_FAILED: Expected ${LANGUAGES[language]}`
    );
  }

  return answer;
}


// ============================================================
// FALLBACK: SELECT SINGLE BEST ANSWER
// ============================================================

function fallbackAnswer(
  ranked,
  language,
  question
) {
  const topic = detectTopic(question);

  // ONLY SAME LANGUAGE

  let candidates =
    ranked.filter(
      item =>
        isSameLanguage(
          item.row,
          language
        )
    );

  // IF TOPIC EXISTS:
  // ONLY SAME TOPIC

  if (topic) {
    candidates =
      candidates.filter(
        item =>
          rowMatchesTopic(
            item.row,
            topic
          )
      );
  }

  // SELECT TOP MATCH BY SCORE
  // (NOT MULTIPLE ANSWERS)

  const best =
    candidates
      .filter(
        item =>
          item.score >= 120
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      )
      .slice(0, 1)
      .map(
        item =>
          rowAnswer(item.row)
      )
      .filter(Boolean)
      [0] || "";

  return best.trim();
}


// ============================================================
// REQUEST BODY
// ============================================================

function getRequestBody(req) {
  if (
    req.body &&
    typeof req.body === "object"
  ) {
    return req.body;
  }

  if (
    typeof req.body === "string"
  ) {
    try {
      return JSON.parse(
        req.body
      );
    } catch {
      return {};
    }
  }

  return {};
}


// ============================================================
// SAFE ERROR MESSAGE
// ============================================================

function getErrorMessage(
  error
) {
  if (
    error?.message
  ) {
    return String(
      error.message
    );
  }

  return "Unknown API error.";
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
        success: false,

        error:
          "Only POST requests are allowed."
      });
  }

  try {
    const body =
      getRequestBody(req);

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

    if (!question) {
      return res
        .status(400)
        .json({
          success: false,

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
          success: false,

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
          success: false,

          error:
            `Unsupported language: ${requestedLanguage}`
        });
    }

    // --------------------------------------------------------
    // LOAD SUPABASE
    // --------------------------------------------------------

    let rows = [];

    try {
      rows =
        await getLessons();
    } catch (
      supabaseError
    ) {
      console.error(
        "SUPABASE ERROR:",
        getErrorMessage(
          supabaseError
        )
      );

      return res
        .status(503)
        .json({
          success: false,

          answer: "",

          language,

          languageName:
            LANGUAGES[language],

          source:
            "supabase-error",

          error:
            getErrorMessage(
              supabaseError
            )
        });
    }

    // --------------------------------------------------------
    // RANK ONLY SAME LANGUAGE
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
    // TOPIC FILTER
    // --------------------------------------------------------

    const topic =
      detectTopic(question);

    let candidatePool =
      ranked;

    if (topic) {
      const topicMatches =
        ranked.filter(
          item =>
            rowMatchesTopic(
              item.row,
              topic
            )
        );

      // If same-language topic records
      // exist, use ONLY those.

      if (
        topicMatches.length
      ) {
        candidatePool =
          topicMatches;
      } else {
        // Do not use unrelated subjects.

        candidatePool = [];
      }
    }

    // --------------------------------------------------------
    // SELECT TOP SOURCES
    // --------------------------------------------------------

    const selected =
      candidatePool
        .slice(
          0,
          MAX_SOURCES
        );

    const sources =
      buildSources(
        selected
      );

    // --------------------------------------------------------
    // GEMINI
    // --------------------------------------------------------

    let answer = "";

    let source =
      "none";

    if (
      GEMINI_API_KEY &&
      sources.length
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
          getErrorMessage(
            geminiError
          )
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
      if (!GEMINI_API_KEY) {
        console.error(
          "GEMINI_API_KEY is missing."
        );
      }

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

    if (!answer) {
      return res
        .status(200)
        .json({
          success: false,

          answer: "",

          language,

          languageName:
            LANGUAGES[language],

          source: "none",

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
        success: true,

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
        success: false,

        answer: "",

        error:
          getErrorMessage(
            error
          )
      });
  }
};
