// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// STABLE ORTHODOX ANSWER ENGINE V2
//
// - EXACT 15 LANGUAGES
// - STRICT LANGUAGE MATCH
// - STRICT TOPIC LOCK
// - SMART SOURCE RANKING
// - SUPABASE KNOWLEDGE BASE
// - GROUNDED GEMINI ANSWER
// - LANGUAGE VALIDATION
// - TOPIC VALIDATION
// - SAFE SAME-TOPIC FALLBACK
// - NO UNRELATED SOURCE MIXING
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

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash";

const TABLE_NAME =
  "orthodox_answers";

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;

const MAX_CANDIDATES = 30;
const MAX_SOURCES = 4;

const MAX_SOURCE_ANSWER_LENGTH = 16000;
const MAX_CONTEXT_LENGTH = 60000;


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


function containsTerm(
  text,
  term
) {
  const source =
    normalize(text);

  const target =
    normalize(term);

  if (!source || !target) {
    return false;
  }

  if (target.length <= 3) {
    return source
      .split(/\s+/)
      .includes(target);
  }

  return source.includes(target);
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
// LANGUAGE
// ============================================================

function resolveLanguage(value) {
  const normalized =
    normalize(value);

  if (!normalized) {
    return null;
  }

  for (
    const code of
    Object.keys(LANGUAGE_ALIASES)
  ) {

    if (
      LANGUAGE_ALIASES[code].some(
        alias =>
          normalize(alias) ===
          normalized
      )
    ) {
      return code;
    }
  }

  return null;
}


function languageMatches(
  rowLang,
  requested
) {
  const value =
    normalize(rowLang);

  if (!value || !requested) {
    return false;
  }

  const aliases =
    LANGUAGE_ALIASES[requested] ||
    [];

  return aliases.some(
    alias => {
      const a =
        normalize(alias);

      // Exact match is preferred.
      if (value === a) {
        return true;
      }

      // Support values such as:
      // "am - አማርኛ"
      // but avoid matching short codes
      // inside unrelated words.
      if (a.length >= 4) {
        return (
          value.includes(a)
        );
      }

      return false;
    }
  );
}


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
// STOP WORDS
// ============================================================

const STOP_WORDS =
  new Set([
    // Amharic
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
    "ለ",
    "በ",
    "እንዲህ",

    // English
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
    "in",
    "on",
    "with",

    // Arabic
    "من",
    "ما",
    "هو",
    "هي",
    "كيف",
    "لماذا",
    "عن",
    "في",
    "هل",
    "ماهو",
    "ماهي"
  ]);


// ============================================================
// TOPIC DEFINITIONS
//
// IMPORTANT:
// Terms are intentionally conservative.
// We should NOT invent uncertain translations.
// Database category/question matching remains
// an additional retrieval layer.
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
      "baptized",
      "infant baptism",
      "baptism of infants",
      "christening",
      "معمودية",
      "المعمودية",
      "洗礼"
    ]
  },

  {
    name: "communion",

    terms: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "communion",
      "holy communion",
      "eucharist",
      "holy eucharist",
      "الإفخارستيا",
      "التناول",
      "تناول",
      "圣餐",
      "圣体"
    ]
  },

  {
    name: "repentance",

    terms: [
      "ንስሐ",
      "ንስሐ መግባት",
      "ንስሐ ገባ",
      "ከኃጢአት መመለስ",
      "ንስሐ አባት",
      "repentance",
      "repent",
      "confession",
      "sacrament of repentance",
      "التوبة",
      "اعتراف",
      "悔改"
    ]
  },

  {
    name: "sin",

    terms: [
      "ኃጢአት",
      "ኃጢአተኛ",
      "ኃጢአት ምንድነው",
      "sin",
      "sinner",
      "sins",
      "sinful",
      "الخطيئة",
      "خطية",
      "罪"
    ]
  },

  {
    name: "prayer",

    terms: [
      "ጸሎት",
      "መጸለይ",
      "ጸልይ",
      "prayer",
      "pray",
      "praying",
      "الصلاة",
      "صلاة",
      "祷告",
      "祈祷"
    ]
  },

  {
    name: "fasting",

    terms: [
      "ጾም",
      "መጾም",
      "ጾመ",
      "የጾም ሕግ",
      "fasting",
      "fast",
      "lent",
      "the fast",
      "الصوم",
      "صيام",
      "禁食"
    ]
  },

  {
    name: "mary",

    terms: [
      "ማርያም",
      "ድንግል",
      "እመቤታችን",
      "ቅድስት ማርያም",
      "የእመቤታችን",
      "mary",
      "virgin mary",
      "holy mary",
      "mother of god",
      "مريم",
      "العذراء مريم",
      "圣母玛利亚"
    ]
  },

  {
    name: "trinity",

    terms: [
      "ሥላሴ",
      "መንፈስ ቅዱስ",
      "አብ ወልድ መንፈስ ቅዱስ",
      "trinity",
      "holy trinity",
      "father son holy spirit",
      "الثالوث",
      "الثالوث المقدس",
      "三位一体"
    ]
  },

  {
    name: "incarnation",

    terms: [
      "ሥጋዌ",
      "ሰው መሆን",
      "ሥጋ ሆነ",
      "እግዚአብሔር ሰው ሆነ",
      "incarnation",
      "word became flesh",
      "god became man",
      "التجسد",
      "تجسد",
      "道成肉身"
    ]
  },

  {
    name: "cross",

    terms: [
      "መስቀል",
      "ቅዱስ መስቀል",
      "መስቀሉ",
      "cross",
      "holy cross",
      "cross of christ",
      "الصليب",
      "الصليب المقدس",
      "十字架"
    ]
  },

  {
    name: "ark",

    terms: [
      "ታቦት",
      "ታቦተ ጽዮን",
      "ark",
      "ark of covenant",
      "ark of the covenant",
      "تابوت",
      "تابوت العهد",
      "约柜"
    ]
  },

  {
    name: "faith",

    terms: [
      "ሃይማኖት",
      "እምነት",
      "ትምህርተ ሃይማኖት",
      "faith",
      "religion",
      "belief",
      "orthodox faith",
      "الإيمان",
      "الدين",
      "信仰",
      "宗教"
    ]
  },

  {
    name: "church",

    terms: [
      "ቤተ ክርስቲያን",
      "ቤተክርስቲያን",
      "church",
      "orthodox church",
      "holy church",
      "الكنيسة",
      "الكنيسة الأرثوذكسية",
      "教会"
    ]
  },

  {
    name: "christ",

    terms: [
      "ኢየሱስ ክርስቶስ",
      "ክርስቶስ",
      "ኢየሱስ",
      "ጌታ",
      "jesus christ",
      "jesus",
      "christ",
      "lord jesus",
      "يسوع المسيح",
      "يسوع",
      "المسيح",
      "耶稣基督",
      "耶稣"
    ]
  }
];


const TOPIC_ANCHORS = {};

for (
  const group of TOPIC_GROUPS
) {
  TOPIC_ANCHORS[group.name] =
    group.terms;
}


// ============================================================
// TOPIC DETECTION
// ============================================================

function detectTopic(question) {

  const q =
    normalize(question);

  if (!q) {
    return null;
  }

  let bestTopic = null;
  let bestScore = 0;

  for (
    const group of TOPIC_GROUPS
  ) {

    let score = 0;

    for (
      const term of group.terms
    ) {

      const t =
        normalize(term);

      if (!t) {
        continue;
      }

      if (
        containsTerm(q, t)
      ) {

        // Long phrases are much stronger.
        if (t.length >= 12) {
          score += 25;
        } else if (t.length >= 8) {
          score += 15;
        } else if (t.length >= 5) {
          score += 10;
        } else {
          score += 5;
        }
      }
    }

    if (
      score > bestScore
    ) {
      bestScore = score;
      bestTopic = group.name;
    }
  }

  return bestTopic;
}


// ============================================================
// TOPIC MATCH SCORE
// ============================================================

function topicMatchScore(
  row,
  topic
) {

  if (!topic) {
    return 0;
  }

  const anchors =
    TOPIC_ANCHORS[topic] ||
    [];

  const question =
    normalize(
      rowQuestion(row)
    );

  const category =
    normalize(
      rowCategory(row)
    );

  const answer =
    normalize(
      rowAnswer(row)
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

  let score = 0;

  for (
    const anchor of anchors
  ) {

    const a =
      normalize(anchor);

    if (!a) {
      continue;
    }

    if (
      containsTerm(
        question,
        a
      )
    ) {
      score += 30;
    }

    if (
      containsTerm(
        category,
        a
      )
    ) {
      score += 24;
    }

    if (
      containsTerm(
        answer,
        a
      )
    ) {
      score += 6;
    }

    if (
      containsTerm(
        bible,
        a
      )
    ) {
      score += 3;
    }

    if (
      containsTerm(
        church,
        a
      )
    ) {
      score += 4;
    }

    if (
      containsTerm(
        comparison,
        a
      )
    ) {
      score += 2;
    }
  }

  return score;
}


// ============================================================
// STRICT TOPIC TEST
// ============================================================

function rowStronglyMatchesTopic(
  row,
  topic
) {

  if (!topic) {
    return true;
  }

  const anchors =
    TOPIC_ANCHORS[topic] ||
    [];

  const question =
    normalize(
      rowQuestion(row)
    );

  const category =
    normalize(
      rowCategory(row)
    );

  const answer =
    normalize(
      rowAnswer(row)
    );

  let questionHits = 0;
  let categoryHits = 0;
  let answerHits = 0;

  for (
    const anchor of anchors
  ) {

    const a =
      normalize(anchor);

    if (!a) {
      continue;
    }

    if (
      containsTerm(
        question,
        a
      )
    ) {
      questionHits++;
    }

    if (
      containsTerm(
        category,
        a
      )
    ) {
      categoryHits++;
    }

    if (
      containsTerm(
        answer,
        a
      )
    ) {
      answerHits++;
    }
  }

  // Question/category is strongest evidence.
  if (
    questionHits > 0 ||
    categoryHits > 0
  ) {
    return true;
  }

  // Answer alone is accepted only when
  // it contains more than one topic signal.
  return answerHits >= 2;
}


// ============================================================
// QUESTION SIMILARITY
// ============================================================

function wordOverlapScore(
  question,
  target
) {

  const qWords =
    getWords(question)
      .filter(
        word =>
          !STOP_WORDS.has(word)
      );

  const tWords =
    getWords(target)
      .filter(
        word =>
          !STOP_WORDS.has(word)
      );

  if (
    !qWords.length ||
    !tWords.length
  ) {
    return 0;
  }

  const targetSet =
    new Set(tWords);

  let hits = 0;

  for (
    const word of qWords
  ) {

    if (
      targetSet.has(word)
    ) {
      hits++;
    }
  }

  return Math.round(
    (
      hits /
      qWords.length
    ) * 100
  );
}


// ============================================================
// SCORE ROW
// ============================================================

function scoreRow(
  row,
  question,
  language,
  topic
) {

  // ------------------------------------------
  // LANGUAGE IS MANDATORY
  // ------------------------------------------

  if (
    !isSameLanguage(
      row,
      language
    )
  ) {
    return -1000000;
  }

  const q =
    normalize(question);

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

  if (
    !rq &&
    !ra
  ) {
    return -1000000;
  }

  let score = 100;

  // ------------------------------------------
  // EXACT QUESTION
  // ------------------------------------------

  if (
    rq === q
  ) {
    score += 25000;
  }

  // ------------------------------------------
  // QUESTION CONTAINMENT
  // ------------------------------------------

  if (
    q.length >= 6 &&
    rq.includes(q)
  ) {
    score += 10000;
  }

  // ------------------------------------------
  // WORD OVERLAP
  // ------------------------------------------

  score +=
    wordOverlapScore(
      question,
      rowQuestion(row)
    ) * 60;

  score +=
    wordOverlapScore(
      question,
      rowCategory(row)
    ) * 30;

  score +=
    wordOverlapScore(
      question,
      rowAnswer(row)
    ) * 8;

  // ------------------------------------------
  // INDIVIDUAL QUESTION WORDS
  // ------------------------------------------

  const qWords =
    getWords(question)
      .filter(
        word =>
          !STOP_WORDS.has(word)
      );

  let questionHits = 0;

  for (
    const word of qWords
  ) {

    if (
      rq.includes(word)
    ) {
      score += 800;
      questionHits++;
    }

    if (
      category.includes(word)
    ) {
      score += 400;
    }

    if (
      ra.includes(word)
    ) {
      score += 100;
    }

    if (
      bible.includes(word)
    ) {
      score += 40;
    }

    if (
      church.includes(word)
    ) {
      score += 40;
    }
  }

  // ------------------------------------------
  // COVERAGE
  // ------------------------------------------

  if (
    qWords.length > 0
  ) {

    score += Math.round(
      (
        questionHits /
        qWords.length
      ) * 2000
    );
  }

  // ------------------------------------------
  // TOPIC LOCK
  // ------------------------------------------

  if (topic) {

    const topicScore =
      topicMatchScore(
        row,
        topic
      );

    if (
      topicScore <= 0
    ) {
      return -1000000;
    }

    score +=
      topicScore * 80;

    if (
      rowStronglyMatchesTopic(
        row,
        topic
      )
    ) {
      score += 5000;
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

  if (
    !response.ok
  ) {

    throw new Error(
      data?.message ||
      data?.error_description ||
      `Supabase error ${response.status}`
    );
  }

  return data;
}


// ============================================================
// GET KNOWLEDGE
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

  const rows = [];

  let offset = 0;

  while (
    offset < MAX_ROWS
  ) {

    const path =
      `${TABLE_NAME}` +
      `?select=${encodeURIComponent(
        columns
      )}` +
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

    rows.push(
      ...page
    );

    if (
      page.length <
      PAGE_SIZE
    ) {
      break;
    }

    offset +=
      PAGE_SIZE;
  }

  return rows;
}


// ============================================================
// BUILD SOURCES
// ============================================================

function buildSources(
  ranked
) {

  return ranked.map(
    item => ({

      score:
        item.score,

      question:
        rowQuestion(
          item.row
        ),

      answer:
        rowAnswer(
          item.row
        ).slice(
          0,
          MAX_SOURCE_ANSWER_LENGTH
        ),

      language:
        rowLanguage(
          item.row
        ),

      category:
        rowCategory(
          item.row
        ),

      education_level:
        rowEducation(
          item.row
        ),

      bible_references:
        rowBible(
          item.row
        ),

      church_sources:
        rowChurch(
          item.row
        ),

      comparison_group:
        rowComparison(
          item.row
        )
    })
  );
}


// ============================================================
// CONTEXT BUILDER
// ============================================================

function makeContext(
  sources
) {

  if (
    !sources.length
  ) {

    return `
NO DIRECTLY MATCHING
ORTHODOX KNOWLEDGE SOURCE.
`;
  }

  let context = "";

  for (
    let index = 0;
    index < sources.length;
    index++
  ) {

    const source =
      sources[index];

    const block = `
==============================
ORTHODOX SOURCE ${index + 1}
==============================

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

Content:
${source.answer || "N/A"}

==============================
`;

    if (
      (
        context.length +
        block.length
      ) > MAX_CONTEXT_LENGTH
    ) {
      break;
    }

    context += block;
  }

  return context;
}


// ============================================================
// LANGUAGE VALIDATION
// ============================================================

function answerHasWrongLanguage(
  answer,
  language
) {

  const text =
    cleanText(answer);

  if (!text) {
    return true;
  }

  if (
    language === "zh"
  ) {

    return (
      (
        text.match(
          /[\u4e00-\u9fff]/g
        ) || []
      ).length < 5
    );
  }

  if (
    language === "ar"
  ) {

    return (
      (
        text.match(
          /[\u0600-\u06ff]/g
        ) || []
      ).length < 5
    );
  }

  if (
    ETHIOPIC_LANGUAGES.has(
      language
    )
  ) {

    return (
      (
        text.match(
          /[\u1200-\u137f]/g
        ) || []
      ).length < 5
    );
  }

  if (
    LATIN_LANGUAGES.has(
      language
    )
  ) {

    return (
      (
        text.match(
          /[A-Za-zÀ-ÖØ-öø-ÿ]/g
        ) || []
      ).length < 5
    );
  }

  return false;
}


// ============================================================
// TOPIC VALIDATION OF GENERATED ANSWER
//
// This is intentionally conservative.
// It prevents a clearly unrelated answer,
// but does not reject an answer merely because
// it explains the topic without repeating the keyword.
// ============================================================

function generatedAnswerMatchesTopic(
  answer,
  topic
) {

  if (!topic) {
    return true;
  }

  const anchors =
    TOPIC_ANCHORS[topic] ||
    [];

  const text =
    normalize(answer);

  if (!text) {
    return false;
  }

  let hits = 0;

  for (
    const anchor of anchors
  ) {

    if (
      containsTerm(
        text,
        anchor
      )
    ) {
      hits++;
    }
  }

  return hits >= 1;
}


// ============================================================
// SYSTEM PROMPT
// ============================================================

// ============================================================
// SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(
  language,
  question,
  topic
) {

  const languageName =
    LANGUAGES[language] || "አማርኛ";

  const topicName =
    topic || "general Orthodox Christian teaching";

  return `
You are the main theological answer engine for
"Ortodoxaw-meles" (ኦርቶዶክሳዊ መልስ).

Your task is NOT to give a short chatbot reply.

Your task is to produce a COMPLETE, DETAILED,
WELL-STRUCTURED, BOOK-LIKE Orthodox Christian teaching
that directly answers the user's question.

============================================================
ABSOLUTE LANGUAGE RULE
============================================================

Answer ONLY in:

${languageName}

Do not switch to English, Amharic, Arabic, Chinese,
or another language.

Do not translate the answer into another language.

Use the natural vocabulary and grammar of the requested
language as accurately as possible.

============================================================
ABSOLUTE TOPIC RULE
============================================================

User question:

${question}

Detected topic:

${topicName}

Stay focused on the exact subject of the question.

DO NOT automatically add unrelated theological subjects.

For example:

If the question is about BAPTISM, do not turn the answer
into a general teaching about fasting, prayer, repentance,
communion, Mary, the Cross, or other subjects unless that
subject is genuinely necessary for explaining baptism.

If the question is about REPENTANCE, do not automatically
add fasting, baptism, prayer, communion, or other unrelated
teachings.

Every paragraph must help answer the user's actual question.

============================================================
ANSWER LENGTH
============================================================

For a substantive theological question, do NOT give a
2-3 sentence answer.

Give a substantial answer, normally around
1000-1800 words when the subject requires it.

The answer may be shorter only when the question genuinely
requires a short factual response.

Prefer depth, completeness and clarity over brevity.

Do not repeat the same idea merely to make the answer longer.

============================================================
ORTHODOX THEOLOGICAL POSITION
============================================================

Answer from the teaching and tradition of the
Ethiopian Orthodox Tewahedo Church.

The answer should be faithful to Orthodox Tewahedo theology.

Do not present Protestant, Catholic, Islamic, secular,
or other theological positions as if they were Orthodox
teaching.

If comparison is genuinely requested or necessary,
clearly identify each position and then explain the
Orthodox Tewahedo understanding.

============================================================
STRUCTURE
============================================================

For substantive questions, organize the answer naturally
with clear headings.

Where appropriate, use this structure:

1. መግቢያ / Introduction

2. የጥያቄው ቀጥተኛ መልስ
   Give the direct answer first.

3. ዝርዝር ትርጉምና ማብራሪያ
   Explain the theological meaning carefully.

4. የመጽሐፍ ቅዱስ መሠረት
   Explain the relevant biblical passages and how they
   support the answer.

5. የኦርቶዶክስ ተዋሕዶ ትምህርት
   Explain the teaching of the Ethiopian Orthodox
   Tewahedo Church.

6. የቤተ ክርስቲያን ምንጮች
   Use only sources actually supplied in the retrieved
   knowledge/context.

7. ማብራሪያ እና ምሳሌ
   Give useful examples when they clarify the subject.

8. መደምደሚያ
   Summarize the central teaching clearly.

Do not force every heading when it is not appropriate.
The structure should serve the question.

============================================================
BIBLE RULE
============================================================

Use the Bible as a primary foundation whenever relevant.

Explain the meaning of the cited passage instead of merely
listing verse numbers.

Use only biblical references that you know are relevant.

Never invent a Bible verse, chapter, verse number,
or quotation.

If you are not certain about an exact quotation,
PARAPHRASE the teaching and give the reference only when
you are confident that the reference is correct.

============================================================
CHURCH FATHERS AND ETHIOPIAN SOURCES
============================================================

Use retrieved church sources and Ethiopian theological
sources when they are provided in the source material.

Examples may include:

- Holy Scriptures
- Hymnot Abaw
- Fetha Negest
- Mäs'hafe Mistir
- St. Yared
- Abba Giyorgis of Gasicha
- Ethiopian Orthodox theological sources
- Other supplied and identifiable church sources

IMPORTANT:

Never invent a quotation from a Church Father,
Ethiopian scholar, saint, book, hymn, or church document.

Never attribute a statement to a named person unless the
provided source actually supports that attribution.

If an exact quotation is not available, explain the idea
without pretending it is an exact quotation.

============================================================
SOURCE-GROUNDED RULE
============================================================

The retrieved database sources are EVIDENCE and theological
reference material.

Do not simply copy one short database answer and return it
as the final answer.

Synthesize the relevant evidence into a coherent,
well-explained teaching.

Use the strongest relevant sources first.

Do not mix unrelated database records merely because they
contain a common word.

Only use sources relevant to the detected topic.

============================================================
NO FABRICATION
============================================================

Never invent:

- Bible quotations
- Bible references
- Church Father quotations
- Ethiopian scholar quotations
- book titles
- page numbers
- chapter numbers
- historical claims
- theological citations
- source names

If the available source material does not establish a claim,
say so honestly.

Accuracy is more important than appearing authoritative.

============================================================
NO SOURCE DUMP
============================================================

Do not produce a meaningless list of sources.

Explain what the relevant source teaches and how it relates
to the question.

The final answer should read like a knowledgeable Orthodox
teacher explaining the subject to a student.

============================================================
BEGINNER TO ADVANCED
============================================================

The answer must be understandable to an ordinary believer
but also useful for students, teachers and advanced readers.

Explain important theological terms when necessary.

Do not assume that the reader already understands
specialized theological terminology.

============================================================
FINAL QUALITY REQUIREMENTS
============================================================

Before producing the final answer, internally verify:

1. Did I answer the exact question?
2. Did I stay in the requested language?
3. Did I stay on the requested topic?
4. Did I provide enough depth?
5. Did I explain the biblical foundation?
6. Did I distinguish Orthodox teaching from other views?
7. Did I avoid unrelated subjects?
8. Did I avoid fabricated quotations and references?
9. Did I use the supplied sources appropriately?
10. Does the answer have a clear beginning, development,
    and conclusion?

If the answer is too short, expand the theological
explanation rather than adding unrelated subjects.

Return ONLY the final answer.
Do not describe these instructions.
`;
}



// ============================================================
// GEMINI GENERATION
// ============================================================

// ============================================================
// GEMINI GENERATION
// ============================================================

async function generateWithGemini(
  question,
  language,
  topic,
  sources
) {

  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY_MISSING"
    );
  }

  if (
    !Array.isArray(sources) ||
    sources.length === 0
  ) {
    throw new Error(
      "NO_KNOWLEDGE_SOURCES"
    );
  }

  const systemPrompt =
    buildSystemPrompt(
      language,
      question,
      topic
    );

  const context =
    makeContext(
      sources
    );

  // ==========================================================
  // FIRST PROMPT
  // ==========================================================

  const userPrompt = `
USER QUESTION:

${question}

==================================================
RELEVANT ORTHODOX KNOWLEDGE FROM SUPABASE
==================================================

${context}

==================================================
FINAL ANSWER REQUIREMENTS
==================================================

Write ONE complete Orthodox Tewahedo theological answer
to the user's exact question.

This is NOT a short chatbot response.

The answer must be a substantial, book-like teaching.

For a theological question, normally produce at least
1200 words when the subject allows it.

Explain the subject deeply and coherently.

The answer should normally contain:

1. A clear introduction.
2. A direct answer to the question.
3. Detailed theological explanation.
4. Relevant Biblical foundation.
5. Explanation of the relevant Biblical passages.
6. Ethiopian Orthodox Tewahedo teaching.
7. Relevant Church or Ethiopian sources contained in
   the supplied knowledge.
8. Clear examples where useful.
9. A strong conclusion.

IMPORTANT:

Use the Supabase material as source material.

Do NOT simply copy the shortest database answer.

SYNTHESIZE and EXPAND the relevant knowledge.

Do not invent quotations or references.

Do not add unrelated subjects.

For example, if the question is about baptism,
remain focused on baptism and its direct theological
meaning.

Answer ONLY in the requested language.

Return ONLY the final answer.
`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(
      GEMINI_MODEL
    )}:generateContent`;

  async function callGemini(
    prompt
  ) {

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
                      prompt
                  }
                ]
              }
            ],

            generationConfig: {

              maxOutputTokens:
                12000,

              temperature:
                0.25,

              topP:
                0.90
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

      throw new Error(
        data?.error?.message ||
        `Gemini error ${response.status}`
      );
    }

    const parts =
      data?.candidates?.[0]
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
      throw new Error(
        "EMPTY_GENERATED_ANSWER"
      );
    }

    return answer;
  }

  // ==========================================================
  // FIRST GEMINI GENERATION
  // ==========================================================

  let answer =
    await callGemini(
      userPrompt
    );

  // ==========================================================
  // MINIMUM LENGTH CHECK
  //
  // IMPORTANT:
  // Gemini sometimes returns a very short answer even when
  // the prompt requests a detailed answer.
  //
  // Do NOT accept that short answer immediately.
  // ==========================================================

  const minimumCharacters =
    4500;

  if (
    answer.length <
    minimumCharacters
  ) {

    console.log(
      "GEMINI SHORT ANSWER:",
      answer.length,
      "characters"
    );

    const expansionPrompt = `
USER QUESTION:

${question}

DETECTED TOPIC:

${topic || "general Orthodox Christian teaching"}

The previous generated answer was too short.

PREVIOUS ANSWER:

${answer}

==================================================
TASK
==================================================

Rewrite and substantially expand the previous answer.

Do NOT merely repeat the previous sentences.

Produce a complete, book-like Orthodox Tewahedo
theological teaching.

The final answer should normally be at least
1200 words when the subject allows it.

Develop the subject step by step.

Include, where genuinely relevant:

- introduction
- direct answer
- theological definition
- detailed explanation
- Biblical foundation
- explanation of the Biblical passages
- Orthodox Tewahedo understanding
- relevant Ethiopian Orthodox sources supplied in
  the knowledge context
- practical theological meaning
- examples where useful
- conclusion

IMPORTANT:

Stay strictly on the user's topic.

Do NOT add unrelated subjects merely to increase length.

Do NOT invent Bible verses.

Do NOT invent quotations.

Do NOT invent Church Father quotations.

Do NOT invent Ethiopian scholar quotations.

Use only information supported by the supplied
Orthodox knowledge.

Answer ONLY in the requested language.

Return ONLY the expanded final answer.
`;

    try {

      const expanded =
        await callGemini(
          expansionPrompt
        );

      if (
        expanded &&
        expanded.length >
        answer.length
      ) {
        answer =
          expanded;
      }

    } catch (error) {

      console.error(
        "GEMINI EXPANSION ERROR:",
        error?.message
      );

      // Keep the original valid answer.
    }
  }

  // ==========================================================
  // LANGUAGE VALIDATION
  // ==========================================================

  if (
    answerHasWrongLanguage(
      answer,
      language
    )
  ) {
    throw new Error(
      "LANGUAGE_VALIDATION_FAILED"
    );
  }

  // ==========================================================
  // TOPIC VALIDATION
  // ==========================================================

  if (
    topic &&
    !generatedAnswerMatchesTopic(
      answer,
      topic
    )
  ) {
    throw new Error(
      "TOPIC_VALIDATION_FAILED"
    );
  }

  return answer;
}

  // ------------------------------------------
  // LANGUAGE CHECK
  // ------------------------------------------

  if (
    answerHasWrongLanguage(
      answer,
      language
    )
  ) {
    throw new Error(
      "LANGUAGE_VALIDATION_FAILED"
    );
  }

  // ------------------------------------------
  // TOPIC CHECK
  // ------------------------------------------

  if (
    topic &&
    !generatedAnswerMatchesTopic(
      answer,
      topic
    )
  ) {
    throw new Error(
      "TOPIC_VALIDATION_FAILED"
    );
  }

  return answer;
}


// ============================================================
// SAFE FALLBACK
// ============================================================

function fallbackAnswer(
  ranked,
  language,
  topic
) {

  if (
    !Array.isArray(ranked) ||
    !ranked.length
  ) {
    return "";
  }

  let candidates =
    ranked.filter(
      item =>
        isSameLanguage(
          item.row,
          language
        )
    );

  // ------------------------------------------
  // STRICT TOPIC FILTER
  // ------------------------------------------

  if (topic) {

    candidates =
      candidates.filter(
        item =>
          rowStronglyMatchesTopic(
            item.row,
            topic
          )
      );
  }

  // ------------------------------------------
  // SCORE FILTER
  // ------------------------------------------

  candidates =
    candidates
      .filter(
        item =>
          Number(item.score) >= 300
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (
    !candidates.length
  ) {
    return "";
  }

  // ------------------------------------------
  // ONE SOURCE ONLY
  //
  // Never concatenate unrelated answers.
  // ------------------------------------------

  const answer =
    rowAnswer(
      candidates[0].row
    ).trim();

  if (!answer) {
    return "";
  }

  if (
    answerHasWrongLanguage(
      answer,
      language
    )
  ) {
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
// PUBLIC SOURCE LABEL
// ============================================================

function publicSourceLabel() {
  return "የኦርቶዶክሳዊ እውቀት መሠረት";
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

    // ========================================================
    // METHOD
    // ========================================================

    if (
      req.method !== "POST"
    ) {

      return res.status(405).json({
        success: false,
        answer: "",
        error:
          "Only POST requests are allowed."
      });
    }

    try {

      // ======================================================
      // BODY
      // ======================================================

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

      // ======================================================
      // VALIDATION
      // ======================================================

      if (!question) {

        return res.status(400).json({
          success: false,
          answer: "",
          error:
            "ጥያቄዎን ያስገቡ።"
        });
      }

      if (
        question.length > 3000
      ) {

        return res.status(400).json({
          success: false,
          answer: "",
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
          answer: "",
          error:
            `Unsupported language: ${requestedLanguage}`
        });
      }

      // ======================================================
      // TOPIC
      // ======================================================

      const topic =
        detectTopic(
          question
        );

      // ======================================================
      // LOAD KNOWLEDGE
      // ======================================================

      let rows = [];

      try {

        rows =
          await getLessons();

      } catch (error) {

        console.error(
          "SUPABASE LOAD ERROR:",
          error?.message
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

      if (
        !Array.isArray(rows) ||
        rows.length === 0
      ) {

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
            "የኦርቶዶክሳዊ እውቀት መረጃ አልተገኘም።"
        });
      }

      // ======================================================
      // LANGUAGE PRE-FILTER
      // ======================================================

      const languageRows =
        rows.filter(
          row =>
            isSameLanguage(
              row,
              language
            )
        );

      if (
        languageRows.length === 0
      ) {

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
            "በተመረጠው ቋንቋ የሚመለከት የእውቀት መረጃ አልተገኘም።"
        });
      }

      // ======================================================
      // RANK
      // ======================================================

      let ranked =
        languageRows
          .map(
            row => ({

              row,

              score:
                scoreRow(
                  row,
                  question,
                  language,
                  topic
                )
            })
          )
          .filter(
            item =>
              item.score > 0
          )
          .sort(
            (a, b) =>
              b.score - a.score
          )
          .slice(
            0,
            MAX_CANDIDATES
          );

      // ======================================================
      // STRICT TOPIC LOCK
      // ======================================================

      if (topic) {

        const strictTopicRows =
          ranked.filter(
            item =>
              rowStronglyMatchesTopic(
                item.row,
                topic
              )
          );

        // Only replace ranking when
        // strict topic sources exist.
        //
        // This prevents an empty result
        // from a weak topic dictionary.
        if (
          strictTopicRows.length > 0
        ) {
          ranked =
            strictTopicRows;
        } else {
          ranked = [];
        }
      }

      // ======================================================
      // FINAL LANGUAGE FILTER
      // ======================================================

      ranked =
        ranked.filter(
          item =>
            isSameLanguage(
              item.row,
              language
            )
        );

      // ======================================================
      // TOP SOURCES
      // ======================================================

      const topRanked =
        ranked.slice(
          0,
          MAX_SOURCES
        );

      const sources =
        buildSources(
          topRanked
        );

      // ======================================================
      // GEMINI
      // ======================================================

      let finalAnswer = "";

      if (
        sources.length > 0
      ) {

        try {

          finalAnswer =
            await generateWithGemini(
              question,
              language,
              topic,
              sources
            );

        } catch (error) {

          console.error(
            "GEMINI ERROR:",
            error?.message
          );

          finalAnswer = "";
        }
      }

      // ======================================================
      // FALLBACK
      // ======================================================

      if (!finalAnswer) {

        finalAnswer =
          fallbackAnswer(
            ranked,
            language,
            topic
          );
      }

      // ======================================================
      // NO ANSWER
      // ======================================================

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
            "ይህንን ጥያቄ የሚመልስ ተዛማጅ የኦርቶዶክሳዊ እውቀት መረጃ አልተገኘም።"
        });
      }

      // ======================================================
      // FINAL LANGUAGE VALIDATION
      // ======================================================

      if (
        answerHasWrongLanguage(
          finalAnswer,
          language
        )
      ) {

        const safe =
          fallbackAnswer(
            ranked,
            language,
            topic
          );

        if (safe) {

          finalAnswer =
            safe;

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

      // ======================================================
      // FINAL TOPIC VALIDATION
      // ======================================================

      if (
        topic &&
        !generatedAnswerMatchesTopic(
          finalAnswer,
          topic
        )
      ) {

        const safe =
          fallbackAnswer(
            ranked,
            language,
            topic
          );

        if (safe) {

          finalAnswer =
            safe;

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
              "መልሱ ከተጠየቀው ርዕስ ጋር በቂ ተዛማጅነት የለውም።"
          });
        }
      }

      // ======================================================
      // SUCCESS
      // ======================================================

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
        error?.message
      );

      return res.status(500).json({

        success: false,

        answer: "",

        error:
          "የመልስ ማዘጋጀት ላይ ችግር ተፈጥሯል።"
      });
    }
  };
