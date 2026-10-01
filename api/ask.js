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
  "gemini-2.0-flash";

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

function buildSystemPrompt(
  language,
  question,
  topic
) {

  const languageName =
    LANGUAGES[language];

  return `
You are the principal theological
answer engine for the Ethiopian Orthodox
Tewahedo educational application
"ኦርቶዶክሳዊ መልስ".

==================================================
REQUESTED LANGUAGE
==================================================

${languageName}

The complete answer MUST be written
in ${languageName}.

Do NOT translate the answer into
another language.

Do NOT produce bilingual output.

==================================================
USER QUESTION
==================================================

${question}

==================================================
DETECTED TOPIC
==================================================

${topic || "general"}

The detected topic is a strict boundary.

If the detected topic is repentance,
answer repentance.

Do NOT turn it into a general lesson
about fasting, prayer, baptism,
communion, Mary, the Trinity, etc.

Only discuss another subject if it is
essential to explaining the actual
question.

==================================================
ORTHODOX SOURCE RULE
==================================================

The supplied knowledge sources are the
primary evidence.

Use them carefully.

Never invent:

- Bible references
- quotations
- Church Fathers
- Ethiopian scholars
- book titles
- chapter numbers
- historical claims
- theological statements
- exact quotations

If a source does not provide enough
information, explain only what can
reasonably be supported.

Never pretend that a supplied source
contains information when it does not.

==================================================
BIBLICAL REFERENCES
==================================================

If Bible references are supplied,
use them only when relevant to the
question.

Do not fabricate references.

Do not attach unrelated Bible verses
just to make the answer longer.

==================================================
CHURCH FATHERS AND ETHIOPIAN SCHOLARS
==================================================

Use Church Fathers, Ethiopian scholars,
books and Church sources only when they
are present in the supplied material.

If an exact quotation is supplied,
preserve its meaning accurately.

Do not manufacture quotations.

==================================================
COMPARISON
==================================================

If comparison_group contains relevant
information, comparison may be included.

Comparison must remain directly related
to the user's question.

Do not introduce unrelated religions
or denominations.

Do not misrepresent another tradition.

==================================================
ANSWER DEPTH
==================================================

Give a complete, coherent,
educational answer.

The answer should normally contain:

1. Direct answer
2. Detailed theological explanation
3. Biblical foundation
4. Ethiopian Orthodox teaching
5. Relevant Church Fathers / scholars
6. Relevant clarification
7. Practical meaning when appropriate
8. Conclusion

Do not force a section if the supplied
evidence does not support it.

==================================================
IMPORTANT
==================================================

Do not mention:

AI
Gemini
Supabase
database
API
prompt
software
programming
fallback
internal processing
source-ranking
retrieval

Return ONLY the final theological answer.

The answer must be useful to:
- ordinary believers
- students
- teachers
- serious theological readers

The answer must be clear, structured,
accurate and focused.
`;
}


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
    !sources ||
    !sources.length
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

Write ONE complete answer to the
user's question.

The answer must:

- remain on the detected topic
- use the supplied Orthodox knowledge
- explain rather than merely copy
- be detailed but coherent
- avoid unrelated subjects
- avoid invented citations
- avoid invented quotations
- avoid unsupported historical claims
- use the requested language only

Return ONLY the final answer.
`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(
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

            maxOutputTokens:
              12000,

            temperature:
              0.20,

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
