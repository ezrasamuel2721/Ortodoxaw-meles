// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL LONG-FORM ORTHODOX ANSWER ENGINE
//
// - 15 LANGUAGES
// - SUPABASE KNOWLEDGE BASE
// - SAME-TOPIC SOURCE RANKING
// - LONG BOOK-LIKE ANSWERS
// - GEMINI 3.8 FLASH
// - NO OLD GEMINI 2.0 MODEL
// - NO UNRELATED SOURCE MIXING
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

const MAX_SOURCES = 4;
const MAX_CONTEXT_LENGTH = 70000;


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
// TOPIC DETECTION
// ============================================================

// ============================================================
// TOPIC DETECTION — STRICT PRIMARY TOPIC
// ============================================================

function detectTopics(question) {

  const normalized = normalize(question);

  const matches = [];

  for (const [name, terms] of TOPICS) {

    let bestLength = 0;

    for (const term of terms) {

      const t = normalize(term);

      if (!t) continue;

      if (normalized.includes(t)) {
        bestLength = Math.max(
          bestLength,
          t.length
        );
      }

    }

    if (bestLength > 0) {

      matches.push({
        name,
        length: bestLength
      });

    }
  }

  // Longest / most specific phrase wins.
  // This prevents secondary words inside the question
  // from creating unrelated topics.

  matches.sort(
    (a, b) =>
      b.length - a.length
  );

  if (!matches.length) {
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
// SOURCE SCORING
// ============================================================

function scoreSource(
  row,
  question,
  language,
  topics
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

  if (topics.length > 0) {

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

    // Strong bonus for explicit topic
    score += 500;

  }


  // ==========================================================
  // EXACT QUESTION
  // ==========================================================

  if (rq === q) {

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
  //
  // IMPORTANT:
  // We intentionally DO NOT search row.answer here.
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
  language
) {

  const topics =
    detectTopics(
      question
    );

  const primaryTopic =
    topics[0] || null;


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
              topics
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

    // Extra final safety gate.
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
          ) === questionText
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
      MAX_SOURCES
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

  if (!SUPABASE_KEY) {

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
// FALLBACK: if DB uses language names instead of codes
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


  // Second attempt:
  // read all rows and filter by language aliases.

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
// SOURCE SELECTION
// ============================================================

function chooseSources(
  rows,
  question,
  language
) {

  const topics =
    detectTopics(
      question
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
              topics
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
      MAX_SOURCES
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
  context
) {

  const topicLock =
    topics.length
      ? topics.join(", ")
      : "Use the exact subject of the user's question.";


  return `

You are the principal theological answer writer for an Ethiopian Orthodox Tewahedo educational application called "ኦርቶዶክሳዊ መልስ".

USER QUESTION:
${question}

REQUESTED LANGUAGE:
${LANGUAGES[language]}

TOPIC LOCK:
${topicLock}

SUPABASE KNOWLEDGE BASE:
${context || "No matching source was found."}


YOUR TASK:

Write a substantial, book-like, carefully structured answer to the user's exact question.

The answer must be useful to:

- ordinary Orthodox believers
- students
- teachers
- serious theological readers


REQUIRED STRUCTURE:

1. መግቢያ / Introduction
   Directly explain what the question is asking.

2. ትርጉምና ዋና ትምህርት
   Give a clear theological explanation of the exact subject.

3. መጽሐፍ ቅዱሳዊ መሠረት
   Explain the relevant Bible passages.
   Do not invent Bible references.
   Explain why each cited passage matters.

4. የተዋሕዶ ትምህርት
   Explain the Ethiopian Orthodox Tewahedo understanding using the supplied database sources.

5. የቤተክርስቲያን ምንጮች
   If the supplied sources contain Church Fathers, Ethiopian scholars,
   liturgical books, hymns, Fetha Negest, Mäs'hafe Mistir,
   St. Yared or other relevant material, explain only what is actually supported.

6. ማብራሪያና ምሳሌ
   Give useful examples where they clarify the exact subject.

7. የተሳሳቱ ግንዛቤዎች
   Correct important misunderstandings only when relevant.

8. ንጽጽር
   ONLY if the supplied sources contain a relevant comparison group or
   the question explicitly asks for comparison.
   Do not introduce unrelated religions or doctrines.

9. የክርስቲያናዊ ሕይወት ትርጉም
   Explain practical meaning when relevant to the exact question.

10. መደምደሚያ
    Give a strong summary of the answer.

11. ምንጮች
    List only Bible references and database sources actually used.


STRICT RULES:

- Stay on the exact topic.
- Never mix unrelated topics merely because a word appears in another source.
- A baptism question must remain primarily about baptism.
- A repentance question must remain primarily about repentance.
- A prayer question must remain primarily about prayer.
- A fasting question must remain primarily about fasting.
- Relationships between topics may be explained only when the question itself requires them.

- Use Supabase sources as evidence.
- Do not blindly concatenate database answers.
- Synthesize related sources into one coherent teaching.
- Never invent quotations.
- Never invent Church Father statements.
- Never invent Ethiopian scholar statements.
- Never invent book titles.
- Never invent page numbers.
- Never invent Bible references.
- If an exact quotation is not supplied, explain the teaching without pretending it is a quotation.
- Clearly distinguish source evidence from your own explanatory synthesis.
- Do not claim something is officially taught unless the source supports that claim.

LENGTH:

Aim for approximately 1,800-3,000 words when the subject reasonably supports that depth.

Do not use meaningless repetition merely to make the answer long.

LANGUAGE:

Write the entire answer ONLY in ${LANGUAGES[language]}.

Do not switch to English, Amharic, Arabic or Chinese.

Preserve Bible references and proper source names accurately.
- The user's primary topic is authoritative.
- Never change the subject because a secondary theological word
  appears inside a source answer.
- Source Answer text MUST NOT be used to decide the source topic.
- Source Question, Category, and Comparison Group are the only
  metadata used for topic selection.
- If the user asks about Holy Communion, remain focused on Holy Communion.
- Do not turn a Holy Communion answer into a Trinity, repentance,
  fasting, prayer, Mary, baptism, or other lesson unless that topic
  is explicitly necessary to answer the user's question.
- A related doctrine may be mentioned briefly only when it is
  directly necessary to explain the requested subject.
- Never append an unrelated source merely because it contains
  a keyword appearing in the requested topic.
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


      const question =
        clean(
          body.question ||
          body.query ||
          body.prompt
        );


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
          language
        );


      // ======================================================
      // 3. BUILD CONTEXT
      // ======================================================

      const context =
        buildContext(
          selected
        );


      // ======================================================
      // 4. BUILD LONG-FORM PROMPT
      // ======================================================

      const prompt =
        buildPrompt(
          question,
          language,
          topics,
          context
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

                bible_references:
                  rowBible(
                    item.row
                  ),

                church_sources:
                  rowChurch(
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
