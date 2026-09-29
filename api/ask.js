// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL ORTHODOX ANSWER ENGINE
//
// 15 LANGUAGES
// STRICT LANGUAGE MATCHING
// STRICT TOPIC LOCK
// SINGLE BEST FALLBACK
// SUPABASE KNOWLEDGE BASE
// GEMINI DETAILED ANSWER
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
  kmb: ["kmb", "kembata", "kembatigna", "kambata", "ከምባታኛ"],
  gamo: ["gamo", "gma", "ጋሞኛ"],
  en: ["en", "eng", "english"],
  ar: ["ar", "ara", "arabic", "العربية"],
  zh: ["zh", "chi", "chinese", "中文"]
};


// ============================================================
// LANGUAGE SCRIPT RULES
// ============================================================
//
// IMPORTANT FIX:
// Not all Ethiopian languages use Ethiopic script.
//
// Ethiopic:
// am, ti, gez
//
// Latin:
// om, sid, wal, kaa, so, aa, had, kmb, gamo, en
//
// Arabic:
// ar
//
// Chinese:
// zh
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
// LANGUAGE
// ============================================================

function resolveLanguage(value) {
  const normalized = normalize(value);

  if (!normalized) return null;

  for (const code of Object.keys(LANGUAGE_ALIASES)) {
    if (
      LANGUAGE_ALIASES[code].some(
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

  const aliases =
    LANGUAGE_ALIASES[requested] || [];

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
      "communion",
      "eucharist",
      "holy communion"
    ]
  },

  {
    name: "repentance",
    terms: [
      "ንስሐ",
      "ንስሐ መግባት",
      "ንስሐ ገባ",
      "ንስሐ መግባት",
      "ከኃጢአት መመለስ",
      "ኃጢአት መተው",
      "ከኃጢአት መራቅ",
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
      "ኃጢአት ምንድን",
      "sin",
      "sinner"
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
        // Longer phrases are much stronger.
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


function getTopicTerms(topic) {
  const group =
    TOPIC_GROUPS.find(
      item => item.name === topic
    );

  return group
    ? group.terms
    : [];
}


// ============================================================
// TOPIC ANCHORS
// ============================================================
//
// These are the strongest words for each topic.
// This prevents generic words such as "ኃጢአት"
// from pulling unrelated material into a repentance answer.
// ============================================================

const TOPIC_ANCHORS = {
  baptism: [
    "ጥምቀት",
    "ተጠመቀ",
    "ማጥመቅ",
    "baptism",
    "baptize"
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
    "ኃጢአት መተው",
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
    "incarnation"
  ],

  cross: [
    "መስቀል",
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


function countTopicAnchors(text, topic) {
  const normalizedText = normalize(text);

  const anchors =
    TOPIC_ANCHORS[topic] || [];

  let count = 0;

  for (const anchor of anchors) {
    const a = normalize(anchor);

    if (a && normalizedText.includes(a)) {
      count++;
    }
  }

  return count;
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
// STRICT TOPIC MATCH
// ============================================================

function rowMatchesTopic(row, topic) {
  if (!topic) return true;

  const text = rowSearchText(row);

  const anchorHits =
    countTopicAnchors(text, topic);

  // A detected topic must have at least
  // one strong topic anchor.

  if (anchorHits < 1) {
    return false;
  }

  return true;
}


// ============================================================
// STRONG TOPIC MATCH
// ============================================================

function rowStronglyMatchesTopic(row, topic) {
  if (!topic) return true;

  const questionText =
    normalize(rowQuestion(row));

  const categoryText =
    normalize(rowCategory(row));

  const answerText =
    normalize(rowAnswer(row));

  const anchors =
    TOPIC_ANCHORS[topic] || [];

  // Prefer the QUESTION and CATEGORY.
  const questionHits =
    anchors.filter(anchor => {
      const a = normalize(anchor);

      return (
        questionText.includes(a) ||
        categoryText.includes(a)
      );
    }).length;

  if (questionHits > 0) {
    return true;
  }

  // Otherwise allow strong answer evidence.
  const answerHits =
    anchors.filter(anchor => {
      const a = normalize(anchor);

      return answerText.includes(a);
    }).length;

  return answerHits >= 1;
}


// ============================================================
// SCORE ROW
// ============================================================

function scoreRow(
  row,
  question,
  requestedLanguage
) {
  if (!isSameLanguage(row, requestedLanguage)) {
    return -100000;
  }

  const q = normalize(question);

  const rq = normalize(rowQuestion(row));
  const ra = normalize(rowAnswer(row));
  const category = normalize(rowCategory(row));
  const bible = normalize(rowBible(row));
  const church = normalize(rowChurch(row));
  const comparison = normalize(rowComparison(row));

  if (!rq && !ra) return 0;

  const topic = detectTopic(question);

  let score = 0;

  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  score += 2000;

  // ----------------------------------------------------------
  // EXACT QUESTION
  // ----------------------------------------------------------

  if (rq === q) {
    score += 10000;
  }

  // ----------------------------------------------------------
  // QUESTION CONTAINS USER QUESTION
  // ----------------------------------------------------------

  if (
    q.length >= 5 &&
    rq.includes(q)
  ) {
    score += 5000;
  }

  // ----------------------------------------------------------
  // USER WORD MATCH
  // ----------------------------------------------------------

  const qWords =
    getWords(question)
      .filter(
        word =>
          !STOP_WORDS.has(word)
      );

  let hits = 0;

  for (const word of qWords) {
    let found = false;

    if (rq.includes(word)) {
      score += 500;
      found = true;
    }

    if (category.includes(word)) {
      score += 300;
      found = true;
    }

    if (ra.includes(word)) {
      score += 100;
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

    if (found) hits++;
  }

  if (qWords.length) {
    score += Math.round(
      (hits / qWords.length) * 1200
    );
  }

  // ----------------------------------------------------------
  // STRICT TOPIC
  // ----------------------------------------------------------

  if (topic) {
    if (!rowMatchesTopic(row, topic)) {
      return -100000;
    }

    const anchorHits =
      countTopicAnchors(
        rowSearchText(row),
        topic
      );

    score += anchorHits * 800;

    if (
      rowStronglyMatchesTopic(
        row,
        topic
      )
    ) {
      score += 1500;
    }
  }

  // ----------------------------------------------------------
  // CATEGORY
  // ----------------------------------------------------------

  if (
    topic &&
    category.includes(
      normalize(topic)
    )
  ) {
    score += 1000;
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

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_KEY,

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
// LOAD KNOWLEDGE BASE
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
// BUILD SOURCES
// ============================================================

function buildSources(ranked) {
  return ranked.map(item => {
    const row = item.row;

    return {
      score: item.score,

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
  });
}


// ============================================================
// GEMINI CONTEXT
// ============================================================

function makeContext(sources) {
  if (!sources.length) {
    return "No directly matching knowledge-base source was found.";
  }

  return sources
    .map((source, index) => `
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

`)
    .join("\n");
}


// ============================================================
// LANGUAGE VALIDATION
// ============================================================
//
// IMPORTANT:
// Do not require Ethiopic script from Latin-script
// Ethiopian languages.
// ============================================================

function answerHasWrongLanguage(answer, language) {
  const text = cleanText(answer);

  if (!text) return true;

  if (language === "zh") {
    const chinese =
      (
        text.match(
          /[\u4e00-\u9fff]/g
        ) || []
      ).length;

    return chinese < 5;
  }

  if (language === "ar") {
    const arabic =
      (
        text.match(
          /[\u0600-\u06ff]/g
        ) || []
      ).length;

    return arabic < 5;
  }

  if (ETHIOPIC_LANGUAGES.has(language)) {
    const ethiopic =
      (
        text.match(
          /[\u1200-\u137f]/g
        ) || []
      ).length;

    return ethiopic < 5;
  }

  if (LATIN_LANGUAGES.has(language)) {
    const latin =
      (
        text.match(
          /[A-Za-zÀ-ÖØ-öø-ÿ]/g
        ) || []
      ).length;

    return latin < 5;
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

Your responsibility is to provide a complete,
accurate, coherent and educational answer from
the Ethiopian Orthodox Tewahedo perspective.

==================================================
LANGUAGE
==================================================

Requested language:
${languageName}

Write the FINAL ANSWER ONLY in ${languageName}.

Do not answer in Amharic unless Amharic was requested.

Do not provide bilingual output.

Do not translate the same answer into several languages.

==================================================
USER QUESTION
==================================================

${question}

==================================================
TOPIC
==================================================

Detected topic:
${topic || "general"}

Stay strictly focused on this topic.

If the question is about repentance,
answer repentance.

Do NOT turn a repentance question into a general
lesson about fasting, prayer, communion, baptism,
Mary, marriage or another subject.

Only mention another subject when it is genuinely
necessary to explain the requested topic.

==================================================
KNOWLEDGE SOURCE
==================================================

The supplied Orthodox knowledge-base material is
the primary source.

Synthesize relevant material into ONE coherent lesson.

Never concatenate database records.

Never invent:

- Bible references
- quotations
- Church Fathers
- Ethiopian scholars
- books
- page numbers
- historical claims
- theological citations

If the supplied sources do not establish a detail,
do not invent a citation.

==================================================
ORTHODOX APPROACH
==================================================

Explain the Ethiopian Orthodox Tewahedo teaching
clearly and respectfully.

Do not insult other religions or denominations.

When comparison is explicitly requested, explain
differences respectfully.

==================================================
ANSWER QUALITY
==================================================

Give a substantial, book-like answer.

Explain the subject from basic concepts to deeper
theological meaning.

Do not repeat sentences merely to increase length.

Do not invent information merely to make the answer long.

Use clear headings and paragraphs.

==================================================
STRUCTURE
==================================================

When appropriate, organize the answer as:

1. Direct answer
2. Meaning of the subject
3. Main teaching
4. Detailed explanation
5. Biblical foundation
6. Ethiopian Orthodox Tewahedo teaching
7. Church tradition
8. Practical application
9. Common misunderstandings
10. Conclusion

Only use sections that genuinely fit the question.

==================================================
FINAL
==================================================

Return ONLY the theological answer.

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
      "GEMINI_API_KEY_MISSING"
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
RELEVANT ORTHODOX KNOWLEDGE
==================================================

${context}

==================================================
FINAL INSTRUCTION
==================================================

Write the final answer in:

${LANGUAGES[language]}

Stay strictly focused on:

${detectTopic(question) || "the user's question"}

Do not mix unrelated subjects.

Use the supplied knowledge as the primary evidence.

Create one coherent educational answer.

Use headings, detailed explanations, Biblical foundation,
Ethiopian Orthodox Tewahedo teaching, practical meaning
and conclusion when relevant.

Do not invent citations or sources.

Return only the final theological answer.
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
            temperature: 0.35,
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
    candidates[0]
      ?.content
      ?.parts || [];

  const answer =
    parts
      .map(part => part?.text || "")
      .join("\n")
      .trim();

  if (!answer) {
    throw new Error(
      "Gemini returned an empty answer."
    );
  }

  // Do NOT reject an otherwise valid answer
  // merely because it is under 2500 characters.
  //
  // The old 2500-character rule caused valid
  // multilingual answers to be thrown away.

  if (
    answerHasWrongLanguage(
      answer,
      language
    )
  ) {
    throw new Error(
      `GEMINI_LANGUAGE_VALIDATION_FAILED: ${LANGUAGES[language]}`
    );
  }

  return answer;
}


// ============================================================
// SINGLE-SOURCE FALLBACK
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
      .filter(
        item =>
          item.score >= 120
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!candidates.length) {
    return "";
  }

  // VERY IMPORTANT:
  // Return ONE source only.
  // Never concatenate unrelated answers.

  return rowAnswer(
    candidates[0].row
  ).trim();
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
// ERROR
// ============================================================

function getErrorMessage(error) {
  if (error?.message) {
    return String(error.message);
  }

  return "Unknown API error.";
}


// ============================================================
// HANDLER
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

  // ----------------------------------------------------------
  // METHOD
  // ----------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error:
        "Only POST requests are allowed."
    });
  }

  try {

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // TOPIC
    // --------------------------------------------------------

    const topic =
      detectTopic(question);

    // --------------------------------------------------------
    // SUPABASE
    // --------------------------------------------------------

    let rows = [];

    try {

      rows =
        await getLessons();

    } catch (supabaseError) {

      console.error(
        "SUPABASE ERROR:",
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
          "supabase-error",
        topic,
        error:
          getErrorMessage(
            supabaseError
          )
      });
    }

    // --------------------------------------------------------
    // RANK
    // --------------------------------------------------------

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
            b.score - a.score
        );

    // --------------------------------------------------------
    // STRICT TOPIC POOL
    // --------------------------------------------------------

    if (topic) {

      const strictTopicRows =
        ranked.filter(
          item =>
            rowStronglyMatchesTopic(
              item.row,
              topic
            )
        );

      // If topic-specific rows exist,
      // unrelated rows are completely removed.

      if (strictTopicRows.length) {
        ranked =
          strictTopicRows;
      } else {
        // Do not use unrelated answers.

        ranked = [];
      }
    }

    // --------------------------------------------------------
    // TOP SOURCES
    // --------------------------------------------------------

    const selected =
      ranked.slice(
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
    let source = "none";

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

      } catch (geminiError) {

        console.error(
          "GEMINI ERROR:",
          getErrorMessage(
            geminiError
          )
        );

        // Safe single-source fallback.
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
    // FINAL LANGUAGE CHECK
    // --------------------------------------------------------

    if (
      answer &&
      answerHasWrongLanguage(
        answer,
        language
      )
    ) {

      console.error(
        "FINAL LANGUAGE VALIDATION FAILED"
      );

      // Do not return an answer in the wrong language.
      answer = "";

      source = "none";
    }

    // --------------------------------------------------------
    // NO ANSWER
    // --------------------------------------------------------

    if (!answer) {

      return res.status(200).json({
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

    return res.status(200).json({

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
            item.church_sources,

          comparison_group:
            item.comparison_group
        }))
    });

  } catch (error) {

    console.error(
      "API ASK ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      answer: "",

      error:
        getErrorMessage(
          error
        )
    });
  }
};
