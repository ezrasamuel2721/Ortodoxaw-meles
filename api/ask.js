// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL LONG-FORM ORTHODOX ANSWER ENGINE
//
// - 15 LANGUAGES
// - 5 ANSWER MODES
// - SUPABASE KNOWLEDGE BASE
// - SAME-TOPIC SOURCE RANKING
// - MODE-AWARE SOURCE RANKING
// - LONG BOOK-LIKE ANSWERS
// - GEMINI 3.8 FLASH
// - NO OLD GEMINI 2.0 MODEL
// - NO UNRELATED SOURCE MIXING
// - EVIDENCE INCLUDED IN EVERY MODE
// - SCHOLAR MODE
// - COMPARATIVE MODE
// - index.html አይቀየርም
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


// IMPORTANT:
// Do NOT read GEMINI_MODEL from Vercel.
// This prevents an old gemini-2.0-flash variable
// from breaking production.
const GEMINI_MODEL =
  "gemini-3.8-flash";


const TABLE_NAME =
  "orthodox_answers";


const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;


// Increased because scholar and comparative modes
// need more relevant sources.
const MAX_SOURCES = 8;

const MAX_CONTEXT_LENGTH = 70000;


// ============================================================
// ANSWER MODES
// ============================================================

const ANSWER_MODES = {

  basic: {
    label: "መሠረታዊ",
    minWords: 600,
    maxWords: 1100,
    sourceLimit: 5
  },

  intermediate: {
    label: "መካከለኛ",
    minWords: 1000,
    maxWords: 1700,
    sourceLimit: 6
  },

  advanced: {
    label: "ከፍተኛ",
    minWords: 1600,
    maxWords: 2600,
    sourceLimit: 7
  },

  scholars: {
    label: "በሊቃውንት",
    minWords: 1800,
    maxWords: 3200,
    sourceLimit: 8
  },

  comparative: {
    label: "ንጽጽራዊ",
    minWords: 1600,
    maxWords: 3000,
    sourceLimit: 8
  }

};


// ============================================================
// MODE RESOLVER
// ============================================================

function resolveMode(value) {

  const v =
    normalize(value);


  const aliases = {

    basic: [
      "basic",
      "መሠረታዊ"
    ],

    intermediate: [
      "intermediate",
      "መካከለኛ"
    ],

    advanced: [
      "advanced",
      "ከፍተኛ"
    ],

    scholars: [
      "scholars",
      "scholar",
      "ሊቃውንት",
      "በሊቃውንት"
    ],

    comparative: [
      "comparative",
      "comparison",
      "ንጽጽር",
      "ንጽጽራዊ"
    ]

  };


  for (
    const [code, values]
    of Object.entries(aliases)
  ) {

    if (
      values.some(
        value =>
          normalize(value) === v
      )
    ) {

      return code;

    }

  }


  return "basic";

}


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

const ALIASES = {

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
    "wolaytto",
    "wolayta"
  ],

  kaa: [
    "kaa",
    "kaffa",
    "kafa",
    "kaffoono",
    "kaffoo"
  ],

  gez: [
    "gez",
    "gur",
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
// TOPIC DEFINITIONS
// ============================================================

const TOPICS = [

  [
    "baptism",
    [
      "ጥምቀት",
      "ጥምቀትን",
      "ማጥመቅ",
      "ተጠመቀ",
      "ሕፃን ጥምቀት",
      "baptism",
      "baptize",
      "baptized",
      "infant baptism",
      "معمودية",
      "المعمودية",
      "洗礼"
    ]
  ],

  [
    "communion",
    [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "communion",
      "holy communion",
      "eucharist",
      "holy eucharist",
      "الإفخارستيا",
      "التناول",
      "圣餐"
    ]
  ],

  [
    "repentance",
    [
      "ንስሐ",
      "ንስሐ መግባት",
      "ንስሐ አባት",
      "ከኃጢአት መመለስ",
      "repentance",
      "repent",
      "confession",
      "التوبة",
      "اعتراف",
      "悔改"
    ]
  ],

  [
    "prayer",
    [
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
  ],

  [
    "fasting",
    [
      "ጾም",
      "መጾም",
      "ጾመ",
      "የጾም ሕግ",
      "fasting",
      "fast",
      "lent",
      "الصوم",
      "صيام",
      "禁食"
    ]
  ],

  [
    "mary",
    [
      "ማርያም",
      "ድንግል",
      "እመቤታችን",
      "ቅድስት ማርያም",
      "mary",
      "virgin mary",
      "holy mary",
      "مريم",
      "圣母玛利亚"
    ]
  ],

  [
    "incarnation",
    [
      "ሥጋዌ",
      "ክርስቶስ ሥጋ ሆነ",
      "incarnation",
      "incarnate",
      "التجسد",
      "道成肉身"
    ]
  ],

  [
    "cross",
    [
      "መስቀል",
      "ቅዱስ መስቀል",
      "cross",
      "holy cross",
      "الصليب",
      "الصليب المقدس",
      "十字架"
    ]
  ],

  [
    "ark",
    [
      "ታቦት",
      "ታቦተ ጽዮን",
      "ark",
      "ark of the covenant",
      "تابوت العهد",
      "约柜"
    ]
  ],

  [
    "faith",
    [
      "ሃይማኖት",
      "እምነት",
      "ትምህርተ ሃይማኖት",
      "faith",
      "belief",
      "doctrine",
      "الإيمان",
      "العقيدة",
      "信仰"
    ]
  ],

  [
    "christ",
    [
      "ኢየሱስ",
      "ክርስቶስ",
      "ጌታ",
      "መድኃኒታችን",
      "jesus",
      "christ",
      "lord",
      "يسوع",
      "المسيح",
      "耶稣",
      "基督"
    ]
  ],

  [
    "trinity",
    [
      "ሥላሴ",
      "አብ",
      "ወልድ",
      "መንፈስ ቅዱስ",
      "trinity",
      "father son holy spirit",
      "الثالوث",
      "三位一体"
    ]
  ],

  [
    "church",
    [
      "ቤተ ክርስቲያን",
      "ቤተክርስቲያን",
      "church",
      "orthodox church",
      "الكنيسة",
      "教会"
    ]
  ],

  [
    "scripture",
    [
      "መጽሐፍ ቅዱስ",
      "ቅዱሳት መጻሕፍት",
      "bible",
      "holy scripture",
      "scripture",
      "الكتاب المقدس",
      "圣经"
    ]
  ],

  [
    "holy spirit",
    [
      "መንፈስ ቅዱስ",
      "holy spirit",
      "روح القدس",
      "圣灵"
    ]
  ]

];


// ============================================================
// STOP WORDS
// ============================================================

const STOP_WORDS =
  new Set([

    "ምን",
    "ነው",
    "እንዴት",
    "ስለ",
    "የ",
    "እና",
    "ከ",
    "ላይ",
    "ውስጥ",
    "ለ",
    "በ",

    "what",
    "is",
    "the",
    "how",
    "why",
    "about",
    "and",
    "of",
    "to",
    "do",
    "does",
    "are",
    "for",
    "a",
    "an",
    "in",
    "on",
    "with",

    "من",
    "ما",
    "هو",
    "هي",
    "كيف",
    "لماذا",
    "عن",
    "في",
    "هل"

  ]);


// ============================================================
// TEXT HELPERS
// ============================================================

function clean(value) {

  return String(
    value ?? ""
  )
    .replace(/\s+/g, " ")
    .trim();

}


function normalize(value) {

  return clean(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(
      /[\u200B-\u200D\uFEFF]/g,
      ""
    )
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

}


function getWords(value) {

  return [
    ...new Set(
      normalize(value)
        .split(/\s+/)
        .filter(
          word =>
            word.length >= 2 &&
            !STOP_WORDS.has(word)
        )
    )
  ];

}


// ============================================================
// ROW HELPERS
// ============================================================

function rowQuestion(row) {

  return clean(
    row.question ??
    row.Question ??
    row.question_text ??
    row.title ??
    row.q ??
    ""
  );

}


function rowAnswer(row) {

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


function rowLanguage(row) {

  return clean(
    row.language ??
    row.lang ??
    row.lang_code ??
    ""
  );

}


function rowCategory(row) {

  return clean(
    row.category ??
    ""
  );

}


function rowEducation(row) {

  return clean(
    row.education_level ??
    ""
  );

}


function rowBible(row) {

  return clean(
    row.bible_references ??
    ""
  );

}


function rowChurch(row) {

  return clean(
    row.church_sources ??
    ""
  );

}


function rowComparison(row) {

  return clean(
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

  for (
    const [code, aliases]
    of Object.entries(ALIASES)
  ) {

    if (
      aliases.some(
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


function sameLanguage(
  row,
  language
) {

  const value =
    normalize(
      rowLanguage(row)
    );

  if (!value) {
    return false;
  }

  if (value === language) {
    return true;
  }

  return (
    ALIASES[language] || []
  ).some(
    alias => {

      const a =
        normalize(alias);

      if (value === a) {
        return true;
      }

      if (a.length >= 4) {
        return value.includes(a);
      }

      return false;

    }
  );

}


// ============================================================
// TOPIC DETECTION — STRICT PRIMARY TOPIC
// ============================================================

function detectTopics(question) {

  const normalized =
    normalize(question);

  const matches = [];


  for (
    const [name, terms]
    of TOPICS
  ) {

    let bestLength = 0;


    for (
      const term
      of terms
    ) {

      const t =
        normalize(term);

      if (!t) {
        continue;
      }


      if (
        normalized.includes(t)
      ) {

        bestLength =
          Math.max(
            bestLength,
            t.length
          );

      }

    }


    if (
      bestLength > 0
    ) {

      matches.push({

        name,

        length:
          bestLength

      });

    }

  }


  matches.sort(
    (a, b) =>
      b.length -
      a.length
  );


  if (
    !matches.length
  ) {

    return [];

  }


  return [
    matches[0].name
  ];

}


// ============================================================
// STRICT TOPIC MATCH
//
// IMPORTANT:
// NEVER use answer text to determine whether a source
// belongs to the requested topic.
// ============================================================

function sourceHasTopic(
  row,
  topic
) {

  if (!topic) {
    return true;
  }


  const topicEntry =
    TOPICS.find(
      item =>
        item[0] === topic
    );


  if (!topicEntry) {
    return false;
  }


  const terms =
    topicEntry[1];


  const sourceQuestion =
    normalize(
      rowQuestion(row)
    );


  const sourceCategory =
    normalize(
      rowCategory(row)
    );


  const sourceComparison =
    normalize(
      rowComparison(row)
    );


  return terms.some(
    term => {

      const t =
        normalize(term);


      return (
        sourceQuestion.includes(t) ||
        sourceCategory.includes(t) ||
        sourceComparison.includes(t)
      );

    }
  );

}


// ============================================================
// EDUCATION / MODE MATCHING
// ============================================================

function normalizeEducationLevel(
  value
) {

  const v =
    normalize(value);


  if (!v) {
    return "";
  }


  if (
    [
      "basic",
      "beginner",
      "elementary",
      "መሠረታዊ",
      "መጀመሪያ"
    ].includes(v)
  ) {

    return "basic";

  }


  if (
    [
      "intermediate",
      "medium",
      "መካከለኛ"
    ].includes(v)
  ) {

    return "intermediate";

  }


  if (
    [
      "advanced",
      "higher",
      "high",
      "ከፍተኛ"
    ].includes(v)
  ) {

    return "advanced";

  }


  if (
    [
      "scholars",
      "scholar",
      "liqa",
      "ሊቃውንት",
      "በሊቃውንት"
    ].includes(v)
  ) {

    return "scholars";

  }


  if (
    [
      "comparative",
      "comparison",
      "ንጽጽር",
      "ንጽጽራዊ"
    ].includes(v)
  ) {

    return "comparative";

  }


  return v;

}


// ============================================================
// SOURCE SCORING
// ============================================================

function scoreSource(
  row,
  question,
  language,
  topics,
  mode = "basic"
) {

  if (
    !sameLanguage(
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


  const category =
    normalize(
      rowCategory(row)
    );


  const education =
    normalizeEducationLevel(
      rowEducation(row)
    );


  const church =
    normalize(
      rowChurch(row)
    );


  const comparison =
    normalize(
      rowComparison(row)
    );


  const questionWords =
    getWords(question);


  const rowQuestionWords =
    new Set(
      getWords(
        rowQuestion(row)
      )
    );


  let score = 0;


  // ==========================================================
  // STRICT TOPIC GATE
  // ==========================================================

  if (
    topics.length > 0
  ) {

    const primaryTopic =
      topics[0];


    if (
      !sourceHasTopic(
        row,
        primaryTopic
      )
    ) {

      return -1000000;

    }


    score += 500;

  }


  // ==========================================================
  // EXACT QUESTION
  // ==========================================================

  if (
    rq === q
  ) {

    score += 2000;

  }


  // ==========================================================
  // QUESTION CONTAINMENT
  // ==========================================================

  if (
    rq &&
    (
      rq.includes(q) ||
      q.includes(rq)
    )
  ) {

    score += 400;

  }


  // ==========================================================
  // QUESTION WORD MATCH
  // ==========================================================

  for (
    const word
    of questionWords
  ) {

    if (
      rowQuestionWords.has(word)
    ) {

      score += 60;

    }
    else if (
      rq.includes(word)
    ) {

      score += 20;

    }

  }


  // ==========================================================
  // CATEGORY MATCH
  // ==========================================================

  if (
    topics.length > 0
  ) {

    const topic =
      topics[0];


    const topicEntry =
      TOPICS.find(
        item =>
          item[0] === topic
      );


    const terms =
      topicEntry
        ? topicEntry[1]
        : [];


    if (
      terms.some(
        term =>
          category.includes(
            normalize(term)
          )
      )
    ) {

      score += 250;

    }

  }


  // ==========================================================
  // MODE / EDUCATION MATCH
  // ==========================================================

  if (
    education === mode
  ) {

    score += 350;

  }


  // ==========================================================
  // SCHOLAR MODE
  // ==========================================================

  if (
    mode === "scholars"
  ) {

    if (
      education === "scholars"
    ) {

      score += 500;

    }


    if (church) {

      score += 120;

    }

  }


  // ==========================================================
  // COMPARATIVE MODE
  // ==========================================================

  if (
    mode === "comparative"
  ) {

    if (
      education === "comparative"
    ) {

      score += 500;

    }


    if (comparison) {

      score += 300;

    }

  }


  // ==========================================================
  // ADVANCED MODE
  // ==========================================================

  if (
    mode === "advanced"
  ) {

    if (
      education === "advanced"
    ) {

      score += 400;

    }


    if (church) {

      score += 50;

    }


    if (rowBible(row)) {

      score += 30;

    }

  }


  // ==========================================================
  // INTERMEDIATE MODE
  // ==========================================================

  if (
    mode === "intermediate"
  ) {

    if (
      education === "intermediate"
    ) {

      score += 400;

    }


    if (rowBible(row)) {

      score += 20;

    }

  }


  // ==========================================================
  // BASIC MODE
  // ==========================================================

  if (
    mode === "basic"
  ) {

    if (
      education === "basic"
    ) {

      score += 400;

    }

  }


  // ==========================================================
  // REFERENCES
  // ==========================================================

  if (
    rowBible(row)
  ) {

    score += 10;

  }


  if (
    rowChurch(row)
  ) {

    score += 10;

  }


  return score;

}


// ============================================================
// SOURCE SELECTION
// ============================================================

function chooseSources(
  rows,
  question,
  language,
  mode = "basic"
) {

  const topics =
    detectTopics(
      question
    );


  const primaryTopic =
    topics[0] || null;


  const modeConfig =
    ANSWER_MODES[mode] ||
    ANSWER_MODES.basic;


  const sourceLimit =
    Math.min(
      modeConfig.sourceLimit,
      MAX_SOURCES
    );


  const ranked =
    rows

      .map(
        row => ({

          row,

          score:
            scoreSource(
              row,
              question,
              language,
              topics,
              mode
            )

        })
      )

      .filter(
        item =>
          item.score > 0 &&
          rowAnswer(item.row)
      )

      .sort(
        (a, b) =>
          b.score -
          a.score
      );


  const selected = [];


  for (
    const item
    of ranked
  ) {

    // ========================================================
    // FINAL TOPIC SAFETY GATE
    // ========================================================

    if (
      primaryTopic &&
      !sourceHasTopic(
        item.row,
        primaryTopic
      )
    ) {

      continue;

    }


    const questionText =
      normalize(
        rowQuestion(
          item.row
        )
      );


    const duplicate =
      selected.some(
        selectedItem =>
          normalize(
            rowQuestion(
              selectedItem.row
            )
          ) ===
          questionText
      );


    if (
      !duplicate
    ) {

      selected.push(
        item
      );

    }


    if (
      selected.length >=
      sourceLimit
    ) {

      break;

    }

  }


  return {

    topics,

    ranked,

    selected

  };

}


// ============================================================
// SUPABASE
// ============================================================

async function fetchSupabase(
  language
) {

  if (
    !SUPABASE_KEY
  ) {

    throw new Error(
      "SUPABASE_KEY_MISSING"
    );

  }


  const rows = [];


  for (
    let offset = 0;
    offset < MAX_ROWS;
    offset += PAGE_SIZE
  ) {

    const url =
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
      `?select=*` +
      `&language=eq.${encodeURIComponent(language)}` +
      `&offset=${offset}` +
      `&limit=${PAGE_SIZE}`;


    const response =
      await fetch(
        url,
        {

          headers: {

            apikey:
              SUPABASE_KEY,

            Authorization:
              `Bearer ${SUPABASE_KEY}`

          }

        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `SUPABASE_${response.status}: ` +
        await response.text()
      );

    }


    const batch =
      await response.json();


    if (
      !Array.isArray(batch) ||
      batch.length === 0
    ) {

      break;

    }


    rows.push(
      ...batch
    );


    if (
      batch.length < PAGE_SIZE
    ) {

      break;

    }

  }


  return rows;

}


// ============================================================
// FALLBACK:
// IF DB USES LANGUAGE NAMES INSTEAD OF CODES
// ============================================================

async function fetchRows(
  language
) {

  let rows =
    await fetchSupabase(
      language
    );


  if (
    rows.length > 0
  ) {

    return rows;

  }


  const all = [];


  for (
    let offset = 0;
    offset < MAX_ROWS;
    offset += PAGE_SIZE
  ) {

    const url =
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
      `?select=*` +
      `&offset=${offset}` +
      `&limit=${PAGE_SIZE}`;


    const response =
      await fetch(
        url,
        {

          headers: {

            apikey:
              SUPABASE_KEY,

            Authorization:
              `Bearer ${SUPABASE_KEY}`

          }

        }
      );


    if (
      !response.ok
    ) {

      throw new Error(
        `SUPABASE_${response.status}: ` +
        await response.text()
      );

    }


    const batch =
      await response.json();


    if (
      !Array.isArray(batch) ||
      batch.length === 0
    ) {

      break;

    }


    all.push(
      ...batch
    );


    if (
      batch.length < PAGE_SIZE
    ) {

      break;

    }

  }


  return all.filter(
    row =>
      sameLanguage(
        row,
        language
      )
  );

}


// ============================================================
// CONTEXT FOR GEMINI
// ============================================================

function buildContext(
  selected
) {

  let context = "";


  selected.forEach(
    (item, index) => {

      const row =
        item.row;


      const block =
        `

[SOURCE ${index + 1}]

Question:
${rowQuestion(row)}

Category:
${rowCategory(row)}

Education level:
${rowEducation(row)}

Bible references:
${rowBible(row)}

Church sources:
${rowChurch(row)}

Comparison group:
${rowComparison(row)}

Answer:
${rowAnswer(row)}

`;


      if (
        (
          context +
          block
        ).length <=
        MAX_CONTEXT_LENGTH
      ) {

        context +=
          block;

      }

    }
  );


  return context.trim();

}


// ============================================================
// GEMINI PROMPT
// ============================================================

function buildPrompt(
  question,
  language,
  topics,
  context,
  mode = "basic"
) {

  const modeConfig =
    ANSWER_MODES[mode] ||
    ANSWER_MODES.basic;


  const topicLock =
    topics.length
      ? topics.join(", ")
      : "Use the exact subject of the user's question.";


  let modeInstructions = "";


  // ==========================================================
  // BASIC
  // ==========================================================

  if (
    mode === "basic"
  ) {

    modeInstructions = `

ANSWER MODE: መሠረታዊ

Give a clear and accessible explanation.

The answer should contain:

- simple definition
- main Orthodox teaching
- essential Biblical evidence
- the most relevant supplied Church/source evidence
- a simple example when useful
- correction of major misunderstanding if relevant
- conclusion

Do not make the answer shallow merely because it is basic.
It must still be evidence-based.

Target length:
${modeConfig.minWords}-${modeConfig.maxWords} words.
`;

  }


  // ==========================================================
  // INTERMEDIATE
  // ==========================================================

  else if (
    mode === "intermediate"
  ) {

    modeInstructions = `

ANSWER MODE: መካከለኛ

Give a fuller theological lesson.

Use this progression:

1. definition
2. Biblical foundation
3. Ethiopian Orthodox Tewahedo teaching
4. relevant Church/source evidence
5. explanation and examples
6. important misunderstandings
7. conclusion

Include more evidence than the basic mode.

Target length:
${modeConfig.minWords}-${modeConfig.maxWords} words.
`;

  }


  // ==========================================================
  // ADVANCED
  // ==========================================================

  else if (
    mode === "advanced"
  ) {

    modeInstructions = `

ANSWER MODE: ከፍተኛ

Give a deep theological treatment suitable for advanced
students, teachers and serious theological readers.

The answer should:

- analyze the exact theological question deeply
- use relevant Biblical passages from the supplied evidence
- explain the Ethiopian Orthodox Tewahedo understanding
- use relevant Church tradition and Ethiopian sources
- distinguish direct source evidence from explanatory synthesis
- explain theological relationships only when necessary
- address important interpretive difficulties
- provide a strong conclusion

Do not add unrelated doctrines simply to make the answer deeper.

Target length:
${modeConfig.minWords}-${modeConfig.maxWords} words.
`;

  }


  // ==========================================================
  // SCHOLARS
  // ==========================================================

  else if (
    mode === "scholars"
  ) {

    modeInstructions = `

ANSWER MODE: በሊቃውንት

This mode is specifically for studying the teachings of
relevant Church Fathers, Ethiopian Orthodox scholars,
teachers and Church books contained in the supplied database.

IMPORTANT:

- Identify every directly relevant scholar/source contained
  in the supplied context.
- Organize the relevant teachings clearly by scholar or source.
- Explain what each supplied source actually teaches.
- Compare the supplied teachings when comparison is useful.
- Do not omit a directly relevant scholar merely because
  another source is easier to use.
- Do not invent a scholar.
- Do not invent a quotation.
- Do not attribute a statement to a scholar unless the
  supplied source actually supports the attribution.
- If an exact quotation is supplied, it may be quoted accurately.
- If only a summary is supplied, paraphrase it and do not
  present it as an exact quotation.
- Do not invent page numbers.
- Do not invent book titles.
- Do not invent citations.
- End with a synthesis showing how the supplied scholarly
  evidence illuminates the exact question.

Every scholar discussed must be directly relevant to the
user's question.

Target length:
${modeConfig.minWords}-${modeConfig.maxWords} words.
`;

  }


  // ==========================================================
  // COMPARATIVE
  // ==========================================================

  else if (
    mode === "comparative"
  ) {

    modeInstructions = `

ANSWER MODE: ንጽጽራዊ

This mode provides a source-based theological comparison.

PRIMARY RULE:

The Ethiopian Orthodox Tewahedo teaching remains the primary
answer.

Then, only when supplied in the database, explain relevant
views from other Christian traditions or other religions.

The comparison should contain:

1. Ethiopian Orthodox Tewahedo position
2. relevant supplied comparison position(s)
3. similarities
4. differences
5. reasons/evidence supplied by the sources
6. final Orthodox Tewahedo explanation

IMPORTANT:

- Do not invent the position of Protestants.
- Do not invent the position of Catholics.
- Do not invent the position of Muslims.
- Do not invent the position of any other religion.
- Only discuss a comparative group when the supplied source
  actually supports it.
- Do not turn the answer into a general lesson about religion.
- Stay focused on the user's exact topic.
- Do not treat unsupported claims as established facts.
- Distinguish source claims from your explanatory synthesis.

Target length:
${modeConfig.minWords}-${modeConfig.maxWords} words.
`;

  }


  return `

You are the principal theological answer writer for an
Ethiopian Orthodox Tewahedo educational application called
"ኦርቶዶክሳዊ መልስ".

USER QUESTION:
${question}

REQUESTED LANGUAGE:
${LANGUAGES[language]}

SELECTED ANSWER MODE:
${modeConfig.label}

TOPIC LOCK:
${topicLock}

SUPABASE KNOWLEDGE BASE:
${context || "No matching source was found."}

${modeInstructions}


============================================================
EVIDENCE RULE
============================================================

Evidence is NOT a separate answer mode.

Evidence is the foundation of EVERY answer mode.

Therefore, regardless of the selected mode:

- use relevant Bible evidence when supplied
- use relevant Church sources when supplied
- use relevant Ethiopian scholar evidence when supplied
- use relevant comparison evidence only when supplied
- explain how the evidence supports the answer
- never fabricate evidence

If a source is not available, do not pretend that it is.


============================================================
GENERAL ANSWER STRUCTURE
============================================================

Use clear headings and readable paragraphs.

Where appropriate, structure the answer around:

1. Introduction
2. Meaning and main teaching
3. Biblical foundation
4. Ethiopian Orthodox Tewahedo teaching
5. Church/Fathers/Ethiopian source evidence
6. Explanation and examples
7. Important misunderstandings
8. Comparison — ONLY when relevant and source-supported
9. Practical Christian meaning — ONLY when relevant
10. Conclusion
11. Sources actually used


============================================================
STRICT TOPIC RULES
============================================================

- Stay on the exact topic.
- Never mix unrelated topics merely because a word appears
  in another source.

A baptism question must remain primarily about baptism.

A repentance question must remain primarily about repentance.

A prayer question must remain primarily about prayer.

A fasting question must remain primarily about fasting.

A Holy Communion question must remain primarily about
Holy Communion.

Relationships between doctrines may be explained ONLY when
they are directly necessary to answer the user's question.

Do not append unrelated lessons.


============================================================
SOURCE INTEGRITY RULES
============================================================

- Use Supabase sources as evidence.
- Do not blindly concatenate database answers.
- Synthesize related sources into one coherent teaching.
- Never invent quotations.
- Never invent Church Father statements.
- Never invent Ethiopian scholar statements.
- Never invent book titles.
- Never invent page numbers.
- Never invent Bible references.
- Never invent comparison positions.
- Never claim a source says something when the supplied
  source does not support that claim.
- If an exact quotation is not supplied, paraphrase it.
- Do not present paraphrase as quotation.
- Clearly distinguish source evidence from explanatory synthesis.
- Do not claim something is officially taught unless the
  supplied evidence supports that claim.


============================================================
SOURCE TOPIC SAFETY
============================================================

The user's primary topic is authoritative.

Never change the subject because a secondary theological word
appears inside a source answer.

IMPORTANT:

Source Answer text MUST NOT be used to decide the source topic.

Source Question, Category and Comparison Group are used for
topic selection.

For example:

If the user asks about baptism, a source whose answer happens
to mention prayer must NOT become a prayer source.

If the user asks about repentance, a source whose answer
mentions fasting must NOT become a fasting source.

If the user asks about Holy Communion, do not turn the answer
into a Trinity, repentance, fasting, prayer, Mary, baptism or
other lesson unless directly necessary.


============================================================
LANGUAGE RULE
============================================================

Write the entire answer ONLY in:

${LANGUAGES[language]}

Do not switch to English, Amharic, Arabic or Chinese.

Preserve Bible references and proper source names accurately.


============================================================
QUALITY RULE
============================================================

Write a coherent educational answer, not a collection of
database excerpts.

Do not repeat the same point unnecessarily.

Do not add empty words merely to reach the target length.

Use the supplied evidence intelligently.

Now write the final answer.
`;

}


// ============================================================
// GEMINI 3.8 FLASH
// ============================================================

async function generateGemini(
  prompt
) {

  if (
    !GEMINI_API_KEY
  ) {

    throw new Error(
      "GEMINI_API_KEY_MISSING"
    );

  }


  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


  const payload = {

    contents: [

      {

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

      thinkingConfig: {

        thinkingLevel:
          "medium"

      }

    }

  };


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
          JSON.stringify(
            payload
          )

      }
    );


  const data =
    await response
      .json()
      .catch(
        () => ({})
      );


  if (
    !response.ok
  ) {

    throw new Error(
      `GEMINI_${response.status}: ` +
      (
        data?.error?.message ||
        JSON.stringify(data)
      )
    );

  }


  const parts =
    data
      ?.candidates?.[0]
      ?.content?.parts || [];


  const answer =
    parts

      .filter(
        part =>
          part?.text &&
          !part?.thought
      )

      .map(
        part =>
          part.text
      )

      .join("\n")

      .trim();


  if (!answer) {

    throw new Error(
      "GEMINI_EMPTY_RESPONSE"
    );

  }


  return answer;

}


// ============================================================
// SAFE FALLBACK
// ============================================================

function fallbackAnswer(
  selected
) {

  if (
    !selected.length
  ) {

    return "";

  }


  // NEVER concatenate multiple database answers.
  // Return only the highest-ranked same-topic source.

  const best =
    selected[0]?.row;


  if (!best) {

    return "";

  }


  return rowAnswer(best);

}


// ============================================================
// CORS
// ============================================================

function setCors(
  res
) {

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

}


// ============================================================
// MAIN HANDLER
// ============================================================

module.exports =
  async function handler(
    req,
    res
  ) {

    setCors(res);


    if (
      req.method ===
      "OPTIONS"
    ) {

      return res
        .status(204)
        .end();

    }


    if (
      req.method !==
      "POST"
    ) {

      return res
        .status(405)
        .json({

          success:
            false,

          answer:
            "",

          error:
            "Method not allowed"

        });

    }


    try {

      const body =
        typeof req.body ===
        "string"

          ? JSON.parse(
              req.body ||
              "{}"
            )

          : (
              req.body ||
              {}
            );


      // ======================================================
      // QUESTION
      // ======================================================

      const question =
        clean(
          body.question ||
          body.query ||
          body.prompt
        );


      // ======================================================
      // LANGUAGE
      // ======================================================

      const requestedLanguage =
        body.language ||
        body.lang ||
        "am";


      const language =
        resolveLanguage(
          requestedLanguage
        ) ||
        (
          LANGUAGES[
            requestedLanguage
          ]
            ? requestedLanguage
            : null
        );


      // ======================================================
      // ANSWER MODE
      // ======================================================

      const mode =
        resolveMode(
          body.mode ||
          body.answerMode ||
          "basic"
        );


      const modeConfig =
        ANSWER_MODES[mode] ||
        ANSWER_MODES.basic;


      if (
        !question
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            answer:
              "",

            error:
              "Question is required"

          });

      }


      if (
        !language
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            answer:
              "",

            error:
              "Unsupported language"

          });

      }


      // ======================================================
      // 1. GET SUPABASE DATA
      // ======================================================

      const rows =
        await fetchRows(
          language
        );


      // ======================================================
      // 2. RANK SAME-TOPIC SOURCES
      // ======================================================

      const {

        topics,

        selected

      } =
        chooseSources(
          rows,
          question,
          language,
          mode
        );


      // ======================================================
      // 3. BUILD CONTEXT
      // ======================================================

      const context =
        buildContext(
          selected
        );


      // ======================================================
      // 4. BUILD MODE-AWARE PROMPT
      // ======================================================

      const prompt =
        buildPrompt(
          question,
          language,
          topics,
          context,
          mode
        );


      // ======================================================
      // 5. GEMINI
      // ======================================================

      let answer =
        "";

      let fallback =
        false;


      try {

        answer =
          await generateGemini(
            prompt
          );

      }
      catch (
        geminiError
      ) {

        console.error(
          "GEMINI ERROR:",
          geminiError?.message ||
          geminiError
        );


        answer =
          fallbackAnswer(
            selected
          );


        fallback =
          true;

      }


      // ======================================================
      // 6. RETURN
      // ======================================================

      return res
        .status(200)
        .json({

          success:
            true,

          answer,

          language,

          mode,

          mode_label:
            modeConfig.label,

          topic:
            topics[0] ||
            null,

          fallback,

          sources:
            selected.map(
              item => ({

                question:
                  rowQuestion(
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
            )

        });

    }
    catch (
      error
    ) {

      console.error(
        "HANDLER ERROR:",
        error?.message ||
        error
      );


      // Never expose an HTTP 500 to index.html
      // for an internal processing failure.

      return res
        .status(200)
        .json({

          success:
            false,

          answer:
            "",

          error:
            error?.message ||
            "UNKNOWN_ERROR"

        });

    }

  };
