// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL ORTHODOX ANSWER ENGINE
//
// 15 LANGUAGES
// STRICT LANGUAGE MATCH
// STRICT TOPIC LOCK
// SUPABASE KNOWLEDGE BASE
// GEMINI DEEP THEOLOGICAL ANSWER
// SAFE SAME-TOPIC FALLBACK
//
// IMPORTANT:
// index.html አይቀየርም.
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

const TABLE_NAME = "orthodox_answers";

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const MAX_SOURCES = 6;


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
  am: ["am", "amh", "amharic", "አማርኛ"],
  ti: ["ti", "tir", "tigrinya", "ትግርኛ"],
  om: ["om", "orm", "oromo", "afaan oromoo", "afaan oromo"],
  sid: ["sid", "sidaamu", "sidaama", "sidaamu afoo", "sidaama afoo"],
  wal: ["wal", "wolaytta", "wolayttatto", "wolayta", "wolayt", "wolaytto"],
  kaa: ["kaa", "kaf", "kaffa", "kafa", "kaffoono", "kaffoo"],
  gez: ["gez", "gur", "guragie", "guragigna", "gurage", "ጉራጊኛ"],
  so: ["so", "som", "somali", "soomaali", "ሶማልኛ"],
  aa: ["aa", "aar", "afar", "afaraf", "አፋርኛ"],
  had: ["had", "hadiyya", "hadiyyigna", "hadiyyisa", "ሐዲይኛ"],
  kmb: ["kmb", "kembata", "kembatigna", "kambata", "kembatigna", "ከምባታኛ"],
  gamo: ["gamo", "gma", "ጋሞኛ"],
  en: ["en", "eng", "english"],
  ar: ["ar", "ara", "arabic", "العربية"],
  zh: ["zh", "chi", "chinese", "中文"]
};


// ============================================================
// SCRIPT GROUPS
// ============================================================

const ETHIOPIC_LANGUAGES = new Set([
  "am",
  "ti",
  "gez"
]);

const LATIN_LANGUAGES = new Set([
  "om",
  "sid",
  "wal",
  "kaa",
  "so",
  "aa",
  "had",
  "kmb",
  "gamo",
  "en"
]);


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

  if (!text) return [];

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
  return cleanText(
    row.language ??
    row.lang ??
    row.lang_code ??
    ""
  );
}

function rowCategory(row) {
  return cleanText(row.category ?? "");
}

function rowEducation(row) {
  return cleanText(row.education_level ?? "");
}

function rowBible(row) {
  return cleanText(row.bible_references ?? "");
}

function rowChurch(row) {
  return cleanText(row.church_sources ?? "");
}

function rowComparison(row) {
  return cleanText(row.comparison_group ?? "");
}


// ============================================================
// LANGUAGE RESOLUTION
// ============================================================

function resolveLanguage(value) {
  const normalized = normalize(value);

  if (!normalized) return null;

  for (const code of Object.keys(LANGUAGE_ALIASES)) {
    const aliases = LANGUAGE_ALIASES[code];

    if (
      aliases.some(
        alias => normalize(alias) === normalized
      )
    ) {
      return code;
    }
  }

  return null;
}

function languageMatches(rowLang, requested) {
  const value = normalize(rowLang);

  if (!value || !requested) return false;

  const aliases = LANGUAGE_ALIASES[requested] || [];

  return aliases.some(alias => {
    const a = normalize(alias);

    return (
      value === a ||
      value.includes(a) ||
      a.includes(value)
    );
  });
}

function isSameLanguage(row, language) {
  return languageMatches(
    rowLanguage(row),
    language
  );
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
      "ተጠመቀ",
      "ማጥመቅ",
      "ሕፃን ጥምቀት",
      "baptism",
      "baptize",
      "baptized"
    ]
  },

  {
    name: "communion",
    terms: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "communion",
      "eucharist"
    ]
  },

  {
    name: "repentance",
    terms: [
      "ንስሐ",
      "ንስሐ መግባት",
      "ንስሐ ገባ",
      "ከኃጢአት መመለስ",
      "repentance",
      "repent",
      "confession"
    ]
  },

  {
    name: "sin",
    terms: [
      "ኃጢአት",
      "ኃጢአተኛ",
      "sin",
      "sinner"
    ]
  },

  {
    name: "prayer",
    terms: [
      "ጸሎት",
      "መጸለይ",
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
      "ሥጋ ሆነ",
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
// TOPIC ANCHORS
// ============================================================

const TOPIC_ANCHORS = {
  baptism: [
    "ጥምቀት",
    "ተጠመቀ",
    "ማጥመቅ",
    "baptism",
    "baptize",
    "baptized"
  ],

  communion: [
    "ቁርባን",
    "ቅዱስ ቁርባን",
    "communion",
    "eucharist"
  ],

  repentance: [
    "ንስሐ",
    "ንስሐ መግባት",
    "ከኃጢአት መመለስ",
    "repentance",
    "repent",
    "confession"
  ],

  sin: [
    "ኃጢአት",
    "ኃጢአተኛ",
    "sin",
    "sinner"
  ],

  prayer: [
    "ጸሎት",
    "መጸለይ",
    "prayer",
    "pray"
  ],

  fasting: [
    "ጾም",
    "መጾም",
    "ጾመ",
    "fasting",
    "fast"
  ],

  mary: [
    "ማርያም",
    "ድንግል",
    "እመቤታችን",
    "mary",
    "virgin mary"
  ],

  trinity: [
    "ሥላሴ",
    "መንፈስ ቅዱስ",
    "trinity"
  ],

  incarnation: [
    "ሥጋዌ",
    "ሥጋ ሆነ",
    "incarnation"
  ],

  cross: [
    "መስቀል",
    "ቅዱስ መስቀል",
    "cross"
  ],

  ark: [
    "ታቦት",
    "ታቦተ ጽዮን",
    "ark"
  ],

  faith: [
    "ሃይማኖት",
    "እምነት",
    "faith",
    "religion",
    "belief"
  ],

  church: [
    "ቤተ ክርስቲያን",
    "ቤተክርስቲያን",
    "church"
  ],

  christ: [
    "ኢየሱስ ክርስቶስ",
    "ክርስቶስ",
    "jesus christ",
    "christ"
  ]
};


// ============================================================
// TOPIC DETECTION
// ============================================================

function detectTopic(question) {
  const q = normalize(question);

  if (!q) return null;

  let bestTopic = null;
  let bestScore = 0;

  for (const group of TOPIC_GROUPS) {
    let score = 0;

    for (const term of group.terms) {
      const t = normalize(term);

      if (!t) continue;

      if (q.includes(t)) {
        score += t.length >= 8 ? 12 : 6;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = group.name;
    }
  }

  return bestTopic;
}


// ============================================================
// TOPIC SCORE
// ============================================================

function topicMatchScore(row, topic) {
  if (!topic) return 0;

  const anchors = TOPIC_ANCHORS[topic] || [];

  const questionText = normalize(rowQuestion(row));
  const categoryText = normalize(rowCategory(row));
  const answerText = normalize(rowAnswer(row));
  const bibleText = normalize(rowBible(row));
  const churchText = normalize(rowChurch(row));

  let score = 0;

  for (const anchor of anchors) {
    const a = normalize(anchor);

    if (!a) continue;

    if (questionText.includes(a)) score += 10;
    if (categoryText.includes(a)) score += 8;
    if (answerText.includes(a)) score += 3;
    if (bibleText.includes(a)) score += 2;
    if (churchText.includes(a)) score += 2;
  }

  return score;
}

function rowMatchesTopic(row, topic) {
  if (!topic) return true;

  return topicMatchScore(row, topic) > 0;
}

function rowStronglyMatchesTopic(row, topic) {
  if (!topic) return true;

  const anchors = TOPIC_ANCHORS[topic] || [];

  const questionText = normalize(rowQuestion(row));
  const categoryText = normalize(rowCategory(row));
  const answerText = normalize(rowAnswer(row));

  let questionHits = 0;
  let answerHits = 0;

  for (const anchor of anchors) {
    const a = normalize(anchor);

    if (!a) continue;

    if (
      questionText.includes(a) ||
      categoryText.includes(a)
    ) {
      questionHits++;
    }

    if (answerText.includes(a)) {
      answerHits++;
    }
  }

  // Strong match:
  // title/category contains the topic.
  if (questionHits > 0) {
    return true;
  }

  // If title is not explicit,
  // answer must contain at least one topic anchor.
  return answerHits >= 1;
}


// ============================================================
// ROW SEARCH TEXT
// ============================================================

function rowSearchText(row) {
  return normalize([
    rowQuestion(row),
    rowAnswer(row),
    rowCategory(row),
    rowBible(row),
    rowChurch(row),
    rowComparison(row),
    rowEducation(row)
  ].join(" "));
}


// ============================================================
// SCORING
// ============================================================

function scoreRow(row, question, requestedLanguage) {
  if (!isSameLanguage(row, requestedLanguage)) {
    return -100000;
  }

  const q = normalize(question);
  const rq = normalize(rowQuestion(row));
  const ra = normalize(rowAnswer(row));
  const category = normalize(rowCategory(row));

  if (!rq && !ra) return 0;

  const topic = detectTopic(question);

  let score = 2000;

  // ----------------------------------------------------------
  // Exact question
  // ----------------------------------------------------------

  if (rq === q) {
    score += 15000;
  }

  // ----------------------------------------------------------
  // Question contains the whole query
  // ----------------------------------------------------------

  if (q.length >= 5 && rq.includes(q)) {
    score += 7000;
  }

  // ----------------------------------------------------------
  // Word matching
  // ----------------------------------------------------------

  const qWords = getWords(question)
    .filter(word => !STOP_WORDS.has(word));

  let hits = 0;

  for (const word of qWords) {
    let found = false;

    if (rq.includes(word)) {
      score += 600;
      found = true;
    }

    if (category.includes(word)) {
      score += 350;
      found = true;
    }

    if (ra.includes(word)) {
      score += 120;
      found = true;
    }

    if (found) hits++;
  }

  if (qWords.length > 0) {
    score += Math.round(
      (hits / qWords.length) * 1500
    );
  }

  // ----------------------------------------------------------
  // Topic lock
  // ----------------------------------------------------------

  if (topic) {
    const topicScore = topicMatchScore(
      row,
      topic
    );

    if (topicScore <= 0) {
      return -100000;
    }

    score += topicScore * 500;

    if (
      rowStronglyMatchesTopic(
        row,
        topic
      )
    ) {
      score += 2500;
    }
  }

  return score;
}


// ============================================================
// SUPABASE GET
// ============================================================

async function supabaseGet(path) {
  if (!SUPABASE_KEY) {
    throw new Error(
      "SUPABASE_KEY_MISSING"
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",

      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Accept: "application/json"
      }
    }
  );

  const text = await response.text();

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
      data?.error_description ||
      `Supabase error ${response.status}`
    );
  }

  return data;
}


// ============================================================
// GET ALL KNOWLEDGE
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
      await supabaseGet(path);

    if (
      !Array.isArray(page) ||
      page.length === 0
    ) {
      break;
    }

    allRows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return allRows;
}


// ============================================================
// SOURCE BUILDER
// ============================================================

function buildSources(ranked) {
  return ranked.map(item => ({
    score: item.score,

    question:
      rowQuestion(item.row),

    answer:
      rowAnswer(item.row)
        .slice(0, 14000),

    language:
      rowLanguage(item.row),

    category:
      rowCategory(item.row),

    education_level:
      rowEducation(item.row),

    bible_references:
      rowBible(item.row),

    church_sources:
      rowChurch(item.row),

    comparison_group:
      rowComparison(item.row)
  }));
}


// ============================================================
// GEMINI CONTEXT
// ============================================================

function makeContext(sources) {
  if (!sources.length) {
    return `
NO DIRECTLY MATCHING ORTHODOX KNOWLEDGE SOURCE WAS FOUND.
`;
  }

  return sources.map(
    (source, index) => `
==================================================
ORTHODOX KNOWLEDGE SOURCE ${index + 1}
==================================================

Question:
${source.question || "N/A"}

Category:
${source.category || "N/A"}

Bible References:
${source.bible_references || "N/A"}

Church Sources:
${source.church_sources || "N/A"}

Comparison:
${source.comparison_group || "N/A"}

Educational Level:
${source.education_level || "N/A"}

Knowledge Content:
${source.answer || "N/A"}

==================================================
`
  ).join("\n");
}


// ============================================================
// LANGUAGE VALIDATION
// ============================================================

function answerHasWrongLanguage(
  answer,
  language
) {
  const text = cleanText(answer);

  if (!text) return true;

  if (language === "zh") {
    return (
      (text.match(/[\u4e00-\u9fff]/g) || [])
        .length < 5
    );
  }

  if (language === "ar") {
    return (
      (text.match(/[\u0600-\u06ff]/g) || [])
        .length < 5
    );
  }

  if (
    ETHIOPIC_LANGUAGES.has(language)
  ) {
    return (
      (text.match(/[\u1200-\u137f]/g) || [])
        .length < 5
    );
  }

  if (
    LATIN_LANGUAGES.has(language)
  ) {
    return (
      (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [])
        .length < 5
    );
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

Your task is to provide a COMPLETE,
DETAILED, EDUCATIONAL and THEOLOGICALLY
GROUNDED answer.

The answer must be suitable for:
- ordinary believers
- students
- teachers
- serious theological readers

Do NOT produce a short three-line answer.

==================================================
LANGUAGE RULE
==================================================

Requested language:
${languageName}

Write the ENTIRE final answer ONLY in:
${languageName}

Do not provide bilingual output.

Do not translate headings into another language.

Do not switch language in the middle of the answer.

==================================================
TOPIC LOCK
==================================================

Detected topic:
${topic || "general"}

The answer MUST remain focused on the user's
actual question.

Do NOT mix unrelated subjects.

For example:

If the question is about repentance,
do not turn the answer into a general lesson
about fasting, prayer, baptism or communion.

If the question is about baptism,
stay focused on baptism.

Related theological subjects may be mentioned
ONLY when they directly explain the requested topic.

==================================================
SOURCE RULE
==================================================

The supplied Orthodox knowledge sources are
the primary evidence.

Use them carefully.

Do NOT invent:
- Bible references
- quotations
- Church Fathers
- Ethiopian scholars
- book titles
- historical facts
- theological claims

If a reference is not contained in the supplied
knowledge, do not pretend that the source supplied it.

When Bible references are supplied, explain them
in relation to the question.

When Church sources are supplied, explain their
relevance.

==================================================
ORTHODOX PERSPECTIVE
==================================================

Answer from the Ethiopian Orthodox Tewahedo
Christian theological perspective.

Do not present Protestant, Catholic, Islamic,
Jehovah's Witness, atheist or other teachings
as though they were Ethiopian Orthodox doctrine.

If comparison is directly relevant to the user's
question and comparison information exists in the
provided sources, explain the difference fairly
and accurately.

==================================================
ANSWER STRUCTURE
==================================================

Organize the answer naturally with clear sections.

Use the following structure when appropriate:

1. Direct Answer
2. Detailed Theological Explanation
3. Biblical Foundation
4. Ethiopian Orthodox Tewahedo Tradition
5. Teachings of the Fathers / Ethiopian Scholars
6. Practical Spiritual Meaning
7. Important Clarification
8. Conclusion

Do not force a section if there is no source
material for it.

==================================================
QUALITY
==================================================

The answer should be:
- comprehensive
- coherent
- logically organized
- educational
- spiritually useful
- faithful to the supplied Orthodox sources
- directly related to the question

Avoid repetition.

Do not concatenate unrelated database answers.

Synthesize the relevant information into ONE
coherent theological answer.

==================================================
TECHNICAL PRIVACY
==================================================

Never mention:
AI
Gemini
Supabase
database
API
prompt
fallback
source score
software
programming
internal processing

Return ONLY the final theological answer.
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
      "GEMINI_API_KEY_MISSING"
    );
  }

  if (!sources.length) {
    throw new Error(
      "NO_KNOWLEDGE_SOURCES"
    );
  }

  const systemPrompt =
    buildSystemPrompt(
      language,
      question
    );

  const context =
    makeContext(sources);

  const userPrompt = `
USER QUESTION:
${question}

==================================================
RELEVANT ETHIOPIAN ORTHODOX KNOWLEDGE
==================================================

${context}

==================================================

Now write ONE complete theological answer
to the user's question.

Use the relevant sources together only when
they address the SAME subject.

Do not combine unrelated subjects.

Do not mention internal systems.

Return ONLY the final answer.
`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}` +
    `:generateContent`;

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

        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemPrompt
              }
            ]
          },

          contents: [
            {
              role: "user",
              parts: [
                {
                  text: userPrompt
                }
              ]
            }
          ],

          generationConfig: {
            maxOutputTokens: 24000,
            temperature: 0.30,
            topP: 0.90
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

  const candidates =
    Array.isArray(data?.candidates)
      ? data.candidates
      : [];

  const parts =
    candidates[0]?.content?.parts ||
    [];

  const answer =
    parts
      .map(part => part?.text || "")
      .join("\n")
      .trim();

  if (!answer) {
    throw new Error(
      "EMPTY_GENERATED_ANSWER"
    );
  }

  if (
    answerHasWrongLanguage(
      answer,
      language
    )
  ) {
    throw new Error(
      `LANGUAGE_VALIDATION_FAILED:${LANGUAGES[language]}`
    );
  }

  return answer;
}


// ============================================================
// SAFE FALLBACK
//
// IMPORTANT:
// This fallback NEVER concatenates unrelated subjects.
//
// It selects ONE strongest SAME-TOPIC knowledge
// record and returns its original teaching.
//
// No internal "fallback-single" value is returned.
// ============================================================

function fallbackAnswer(
  ranked,
  language,
  question
) {
  const topic =
    detectTopic(question);

  let candidates =
    ranked.filter(item =>
      isSameLanguage(
        item.row,
        language
      )
    );

  if (topic) {
    candidates =
      candidates.filter(item =>
        rowStronglyMatchesTopic(
          item.row,
          topic
        )
      );
  }

  candidates =
    candidates
      .filter(item =>
        item.score >= 120
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!candidates.length) {
    return "";
  }

  const best =
    candidates[0].row;

  const answer =
    rowAnswer(best).trim();

  if (!answer) {
    return "";
  }

  return answer;
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
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
}


// ============================================================
// ERROR MESSAGE
// ============================================================

function getErrorMessage(error) {
  return error?.message
    ? String(error.message)
    : "Unknown API error.";
}


// ============================================================
// SAFE PUBLIC SOURCE LABEL
//
// Never expose:
// fallback-single
// gemini
// supabase
// api
// database
// etc.
// ============================================================

function publicSourceLabel() {
  return "የኦርቶዶክሳዊ እውቀት መሠረት";
}


// ============================================================
// MAIN HANDLER
// ============================================================

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

    // --------------------------------------------------------
    // METHOD
    // --------------------------------------------------------

    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error:
          "Only POST requests are allowed."
      });
    }

    try {

      // ------------------------------------------------------
      // REQUEST
      // ------------------------------------------------------

      const body =
        getRequestBody(req);

      const question =
        cleanText(
          body.question
        );

      const requestedLanguage =
        cleanText(
          body.language || "am"
        ).toLowerCase();

      const language =
        resolveLanguage(
          requestedLanguage
        );

      // ------------------------------------------------------
      // QUESTION VALIDATION
      // ------------------------------------------------------

      if (!question) {
        return res.status(400).json({
          success: false,
          error:
            "ጥያቄዎን ያስገቡ።"
        });
      }

      if (question.length > 3000) {
        return res.status(400).json({
          success: false,
          error:
            "ጥያቄው ከ3000 ፊደል መብለጥ የለበትም።"
        });
      }

      // ------------------------------------------------------
      // LANGUAGE VALIDATION
      // ------------------------------------------------------

      if (
        !language ||
        !LANGUAGES[language]
      ) {
        return res.status(400).json({
          success: false,
          error:
            `Unsupported language: ${requestedLanguage}`
        });
      }

      // ------------------------------------------------------
      // TOPIC
      // ------------------------------------------------------

      const topic =
        detectTopic(question);

      // ------------------------------------------------------
      // LOAD SUPABASE KNOWLEDGE
      // ------------------------------------------------------

      let rows = [];

      try {

        rows =
          await getLessons();

      } catch (supabaseError) {

        console.error(
          "KNOWLEDGE LOAD ERROR:",
          getErrorMessage(
            supabaseError
          )
        );

        return res.status(503).json({
          success: false,
          answer: "",
          language,
          languageName:
            LANGUAGES[language],
          source:
            publicSourceLabel(),
          topic,
          error:
            "የእውቀት መረጃውን ማግኘት አልተቻለም።"
        });
      }

      // ------------------------------------------------------
      // RANK KNOWLEDGE
      // ------------------------------------------------------

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
          .filter(item =>
            item.score > 0
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );

      // ------------------------------------------------------
      // STRICT TOPIC LOCK
      // ------------------------------------------------------

      if (topic) {

        const strictTopicRows =
          ranked.filter(item =>
            rowStronglyMatchesTopic(
              item.row,
              topic
            )
          );

        // If same-topic records exist,
        // use ONLY those records.
        if (
          strictTopicRows.length > 0
        ) {
          ranked =
            strictTopicRows;
        } else {
          // No same-topic source.
          ranked = [];
        }
      }

      // ------------------------------------------------------
      // STRICT LANGUAGE LOCK AGAIN
      // ------------------------------------------------------

      ranked =
        ranked.filter(item =>
          isSameLanguage(
            item.row,
            language
          )
        );

      // ------------------------------------------------------
      // TOP SOURCES
      // ------------------------------------------------------

      const topRanked =
        ranked.slice(
          0,
          MAX_SOURCES
        );

      const sources =
        buildSources(
          topRanked
        );

      // ------------------------------------------------------
      // GENERATE DEEP ANSWER
      // ------------------------------------------------------

      let finalAnswer = "";

      let generationWorked =
        false;

      if (sources.length > 0) {

        try {

          finalAnswer =
            await generateWithGemini(
              question,
              language,
              sources
            );

          generationWorked =
            Boolean(finalAnswer);

        } catch (geminiError) {

          console.error(
            "ANSWER GENERATION ERROR:",
            getErrorMessage(
              geminiError
            )
          );

          finalAnswer = "";
        }
      }

      // ------------------------------------------------------
      // SAFE FALLBACK
      // ------------------------------------------------------

      if (!finalAnswer) {

        finalAnswer =
          fallbackAnswer(
            ranked,
            language,
            question
          );
      }

      // ------------------------------------------------------
      // NOTHING FOUND
      // ------------------------------------------------------

      if (!finalAnswer) {

        return res.status(404).json({
          success: false,
          answer: "",
          language,
          languageName:
            LANGUAGES[language],

          source:
            publicSourceLabel(),

          topic,

          sourcesCount: 0,

          error:
            "ይህንን ጥያቄ የሚመለስ ተዛማጅ የኦርቶዶክሳዊ እውቀት መረጃ አልተገኘም።"
        });
      }

      // ------------------------------------------------------
      // FINAL LANGUAGE CHECK
      // ------------------------------------------------------

      if (
        answerHasWrongLanguage(
          finalAnswer,
          language
        )
      ) {

        console.error(
          "FINAL LANGUAGE CHECK FAILED"
        );

        // If generated answer has wrong language,
        // safely use the original same-language source.
        const safeFallback =
          fallbackAnswer(
            ranked,
            language,
            question
          );

        if (safeFallback) {
          finalAnswer =
            safeFallback;
        } else {
          return res.status(422).json({
            success: false,
            answer: "",
            language,
            languageName:
              LANGUAGES[language],
            source:
              publicSourceLabel(),
            topic,
            error:
              "በተመረጠው ቋንቋ ትክክለኛ መልስ ማዘጋጀት አልተቻለም።"
          });
        }
      }

      // ------------------------------------------------------
      // FINAL RESPONSE
      //
      // IMPORTANT:
      // No "fallback-single" is returned.
      // No internal technical status is exposed.
      // ------------------------------------------------------

      return res.status(200).json({

        success: true,

        answer:
          finalAnswer,

        language,

        languageName:
          LANGUAGES[language],

        source:
          publicSourceLabel(),

        topic,

        sourcesCount:
          sources.length

      });

    } catch (error) {

      console.error(
        "HANDLER ERROR:",
        getErrorMessage(error)
      );

      return res.status(500).json({
        success: false,

        error:
          "የመልስ ማዘጋጀት ላይ ችግር ተፈጥሯል።"
      });
    }
  };
