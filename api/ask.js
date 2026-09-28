// =========================================================
// Vercel Serverless Function: api/ask.js
// ኦርቶዶክሳዊ መልስ
// Supabase Knowledge Base + Gemini
// Topic-Coherent Detailed Orthodox Answer Engine
// =========================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash"
].filter(
  (v, i, a) => v && a.indexOf(v) === i
);


// =========================================================
// LANGUAGES
// =========================================================

const LANGUAGE_NAMES = {
  am: "Amharic (አማርኛ)",
  en: "English",
  ti: "Tigrinya (ትግርኛ)",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolayttatto",
  kaf: "Kafa/Kaffoono",
  gur: "Guragigna (ጉራጊኛ)",
  ar: "Arabic (العربية)",
  so: "Somali (Soomaali)",
  fr: "French (Français)",
  es: "Spanish (Español)",
  it: "Italian (Italiano)",
  de: "German (Deutsch)",
  zh: "Chinese (中文)",
  pt: "Portuguese (Português)",
  ru: "Russian (Русский)"
};


// =========================================================
// BASIC HELPERS
// =========================================================

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


function words(value) {
  return [
    ...new Set(
      normalize(value)
        .split(" ")
        .filter(w => w.length >= 2)
    )
  ];
}


function rowQuestion(row) {
  return (
    row.question ??
    row.Question ??
    row.question_text ??
    row.title ??
    row.title_am ??
    row.q ??
    ""
  );
}


function rowAnswer(row) {
  return (
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
  ).toLowerCase();
}


// =========================================================
// COMMON / LOW-INFORMATION WORDS
// These should NOT determine the theological topic.
// =========================================================

const STOP_WORDS = new Set([

  // Amharic
  "ምን",
  "ምንድን",
  "ማን",
  "ማንነት",
  "ለምን",
  "እንዴት",
  "መቼ",
  "የት",
  "ስለ",
  "ስለምን",
  "ነው",
  "ናት",
  "ናቸው",
  "ነገር",
  "ነገሮች",
  "እና",
  "ወይም",
  "ከ",
  "ወደ",
  "በ",
  "ላይ",
  "ለ",
  "እንደ",
  "ይህ",
  "ይህን",
  "ያለው",
  "ያለች",
  "ያሉ",
  "እንዴት",
  "ምንም",
  "ነገር",
  "ጥያቄ",
  "ጥያቄው",
  "ትምህርት",
  "ትምህርቱ",
  "መሠረት",
  "መሰረት",

  // English
  "what",
  "who",
  "why",
  "how",
  "when",
  "where",
  "which",
  "is",
  "are",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "about",
  "question",
  "teaching",
  "meaning",
  "according",

  // Arabic
  "ما",
  "ماذا",
  "من",
  "لماذا",
  "كيف",
  "متى",
  "اين",
  "في",
  "من",
  "عن",
  "و",
  "أو",
  "هو",
  "هي",

  // Tigrinya
  "እንታይ",
  "መን",
  "ስለምንታይ",
  "ከመይ",
  "መዓስ",
  "እዩ",
  "እያ",
  "እዮም"
]);


// =========================================================
// TOPIC WORDS
// =========================================================

function contentWords(value) {

  return [
    ...new Set(
      words(value)
        .filter(
          word =>
            word.length >= 2 &&
            !STOP_WORDS.has(word)
        )
    )
  ];
}


// =========================================================
// SPECIAL TOPIC GROUPS
// These help connect related expressions.
// =========================================================

const TOPIC_GROUPS = [

  {
    name: "mary",
    terms: [
      "ማርያም",
      "ድንግል",
      "እመቤታችን",
      "እመቤት",
      "ወላዲተ",
      "አምላክ",
      "ብፅዕት",
      "ብፁዕት",
      "ቅድስት",
      "ድንግልና",
      "mary",
      "maryam",
      "virgin"
    ]
  },

  {
    name: "trinity",
    terms: [
      "ሥላሴ",
      "ሶስት",
      "ሦስት",
      "አካላት",
      "አንድ",
      "አምላክ",
      "ሰለስተ",
      "trinity",
      "father",
      "son",
      "spirit"
    ]
  },

  {
    name: "baptism",
    terms: [
      "ጥምቀት",
      "ተጠመቀ",
      "መጠመቅ",
      "ጥምቀተ",
      "ሕፃን",
      "ሕፃናት",
      "baptism",
      "baptize",
      "baptized"
    ]
  },

  {
    name: "communion",
    terms: [
      "ቁርባን",
      "ሥጋ",
      "ደም",
      "ቅዱስ",
      "ምሥጢር",
      "ወይን",
      "ኅብስት",
      "communion",
      "eucharist"
    ]
  },

  {
    name: "marriage",
    terms: [
      "ጋብቻ",
      "ትዳር",
      "ባል",
      "ሚስት",
      "ተጋባዦች",
      "marriage",
      "wedding",
      "husband",
      "wife"
    ]
  },

  {
    name: "repentance",
    terms: [
      "ንስሐ",
      "ኃጢአት",
      "መናዘዝ",
      "ንስሃ",
      "repentance",
      "confession",
      "sin"
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
    name: "prayer",
    terms: [
      "ጸሎት",
      "መጸለይ",
      "ምልጃ",
      "ልመና",
      "prayer",
      "pray"
    ]
  },

  {
    name: "cross",
    terms: [
      "መስቀል",
      "ተሰቀለ",
      "ስቅለት",
      "የመስቀል",
      "cross",
      "crucifixion",
      "crucified"
    ]
  },

  {
    name: "incarnation",
    terms: [
      "ሥጋዌ",
      "ተዋሕዶ",
      "ተዋህዶ",
      "ወልድ",
      "ሥጋ",
      "ሰው",
      "incarnation",
      "christology"
    ]
  },

  {
    name: "ark",
    terms: [
      "ታቦት",
      "ጽላት",
      "ark",
      "tabot"
    ]
  }
];


// =========================================================
// DETECT TOPIC
// =========================================================

function detectTopics(query) {

  const normalizedQuery =
    normalize(query);

  const detected = [];

  for (const group of TOPIC_GROUPS) {

    let hits = 0;

    for (const term of group.terms) {

      const normalizedTerm =
        normalize(term);

      if (
        normalizedTerm &&
        normalizedQuery.includes(
          normalizedTerm
        )
      ) {
        hits++;
      }
    }

    if (hits > 0) {

      detected.push({
        name: group.name,
        hits
      });
    }
  }

  return detected
    .sort(
      (a, b) =>
        b.hits - a.hits
    );
}


// =========================================================
// TOPIC TERM EXTRACTION
// =========================================================

function topicTerms(query) {

  const result = new Set();

  const detected =
    detectTopics(query);

  // Add explicit query words.
  for (
    const word of contentWords(query)
  ) {
    result.add(word);
  }

  // Add terms from detected topic groups.
  for (
    const topic of detected
  ) {

    const group =
      TOPIC_GROUPS.find(
        g => g.name === topic.name
      );

    if (!group) {
      continue;
    }

    for (
      const term of group.terms
    ) {

      const normalized =
        normalize(term);

      if (
        normalized &&
        normalize(query).includes(
          normalized
        )
      ) {
        result.add(normalized);
      }
    }
  }

  return [
    ...result
  ];
}


// =========================================================
// TOPIC MATCH
// =========================================================

function topicMatchScore(
  row,
  query
) {

  const q =
    normalize(query);

  const qWords =
    contentWords(query);

  const qTopics =
    detectTopics(query);

  const question =
    normalize(
      rowQuestion(row)
    );

  const category =
    normalize(
      row.category
    );

  const answer =
    normalize(
      rowAnswer(row)
    );

  let score = 0;

  let strongHits = 0;

  // -------------------------------------------------------
  // Exact / phrase matches in QUESTION
  // -------------------------------------------------------

  if (
    q.length > 2 &&
    question.includes(q)
  ) {
    score += 2200;
    strongHits += 3;
  }

  if (
    question &&
    q.includes(question) &&
    question.length >= 4
  ) {
    score += 900;
    strongHits += 2;
  }


  // -------------------------------------------------------
  // Query content words
  // QUESTION gets strongest weight.
  // ANSWER gets lower weight.
  // -------------------------------------------------------

  for (
    const word of qWords
  ) {

    if (
      question.includes(word)
    ) {
      score += 300;
      strongHits++;
    }

    if (
      category.includes(word)
    ) {
      score += 220;
      strongHits++;
    }

    if (
      answer.includes(word)
    ) {
      score += 35;
    }
  }


  // -------------------------------------------------------
  // Topic group matching
  // -------------------------------------------------------

  for (
    const topic of qTopics
  ) {

    const group =
      TOPIC_GROUPS.find(
        g => g.name === topic.name
      );

    if (!group) {
      continue;
    }

    let groupHit = false;

    for (
      const term of group.terms
    ) {

      const t =
        normalize(term);

      if (!t) {
        continue;
      }

      if (
        question.includes(t)
      ) {
        score += 700;
        groupHit = true;
      }

      if (
        category.includes(t)
      ) {
        score += 450;
        groupHit = true;
      }

      if (
        answer.includes(t)
      ) {
        score += 100;
        groupHit = true;
      }
    }

    if (groupHit) {
      score += 500;
    }
  }


  return {
    score,
    strongHits
  };
}


// =========================================================
// FINAL RELEVANCE SCORE
// =========================================================

function scoreRow(
  row,
  query,
  lang
) {

  const question =
    normalize(
      rowQuestion(row)
    );

  const answer =
    normalize(
      rowAnswer(row)
    );

  if (
    !question &&
    !answer
  ) {
    return 0;
  }

  const topic =
    topicMatchScore(
      row,
      query
    );

  let score =
    topic.score;


  // -------------------------------------------------------
  // LANGUAGE PRIORITY
  // -------------------------------------------------------

  const rl =
    rowLanguage(row);

  const languageAliases = {

    am: [
      "am",
      "amh",
      "amharic"
    ],

    en: [
      "en",
      "eng",
      "english"
    ],

    ti: [
      "ti",
      "tir",
      "tigrinya"
    ],

    om: [
      "om",
      "orm",
      "oromo",
      "afaanoromo"
    ],

    sid: [
      "sid",
      "sidaamu"
    ],

    wal: [
      "wal",
      "wolaytta",
      "wolayttatto"
    ],

    kaf: [
      "kaf",
      "kaffoono",
      "kafa"
    ],

    gur: [
      "gur",
      "guragigna"
    ],

    ar: [
      "ar",
      "ara",
      "arabic"
    ],

    so: [
      "so",
      "som",
      "somali"
    ],

    fr: [
      "fr",
      "fra",
      "french"
    ],

    es: [
      "es",
      "spa",
      "spanish"
    ],

    it: [
      "it",
      "ita",
      "italian"
    ],

    de: [
      "de",
      "deu",
      "german"
    ],

    zh: [
      "zh",
      "chi",
      "chinese"
    ],

    pt: [
      "pt",
      "por",
      "portuguese"
    ],

    ru: [
      "ru",
      "rus",
      "russian"
    ]
  };


  const aliases =
    languageAliases[lang] || [];


  if (
    aliases.includes(rl)
  ) {
    score += 600;
  }


  // -------------------------------------------------------
  // IMPORTANT:
  // A language match must NEVER make an unrelated
  // theological topic relevant by itself.
  // -------------------------------------------------------

  if (
    topic.strongHits === 0
  ) {
    return 0;
  }


  return score;
}


// =========================================================
// SUPABASE
// =========================================================

async function supabaseGet(
  path
) {

  if (!SUPABASE_ANON_KEY) {

    throw new Error(
      "SUPABASE_ANON_KEY is not configured."
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


  const responseText =
    await response.text();


  let data = null;


  try {

    data =
      responseText
        ? JSON.parse(
            responseText
          )
        : null;

  } catch {

    data = null;
  }


  if (!response.ok) {

    throw new Error(
      data?.message ||
      data?.hint ||
      data?.error_description ||
      `Supabase error ${response.status}`
    );
  }


  return data;
}


// =========================================================
// LOAD KNOWLEDGE BASE
// =========================================================

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
    `orthodox_answers?select=${encodeURIComponent(
      columns
    )}&limit=500`;


  return await supabaseGet(
    path
  );
}


// =========================================================
// REMOVE CROSS-TOPIC RESULTS
// =========================================================

function selectCoherentRows(
  ranked,
  query,
  limit
) {

  if (!ranked.length) {
    return [];
  }


  const topics =
    detectTopics(query);


  const primaryTopic =
    topics[0]?.name || null;


  const primaryGroup =
    TOPIC_GROUPS.find(
      g => g.name === primaryTopic
    );


  const primaryTerms =
    primaryGroup
      ? primaryGroup.terms.map(
          normalize
        )
      : [];


  const coherent = [];


  for (
    const item of ranked
  ) {

    const row =
      item.row;


    const question =
      normalize(
        rowQuestion(row)
      );

    const category =
      normalize(
        row.category
      );

    const answer =
      normalize(
        rowAnswer(row)
      );


    // -----------------------------------------------------
    // If a special topic is detected, require that the
    // candidate belongs to that same topic.
    // -----------------------------------------------------

    if (
      primaryTerms.length > 0
    ) {

      let sameTopic = false;


      for (
        const term of primaryTerms
      ) {

        if (!term) {
          continue;
        }

        if (
          question.includes(term) ||
          category.includes(term)
        ) {

          sameTopic = true;
          break;
        }
      }


      // Answer-only topic match is allowed only when
      // the answer strongly contains the topic.
      if (
        !sameTopic
      ) {

        let answerHits = 0;

        for (
          const term of primaryTerms
        ) {

          if (
            term &&
            answer.includes(term)
          ) {
            answerHits++;
          }
        }

        if (
          answerHits >= 2
        ) {
          sameTopic = true;
        }
      }


      if (!sameTopic) {
        continue;
      }
    }


    coherent.push(item);


    if (
      coherent.length >= limit
    ) {
      break;
    }
  }


  // -------------------------------------------------------
  // If strict filtering found nothing, use the ranked
  // result rather than returning no answer.
  // -------------------------------------------------------

  if (
    !coherent.length
  ) {

    return ranked.slice(
      0,
      Math.min(limit, 3)
    );
  }


  return coherent;
}


// =========================================================
// SOURCE PREPARATION
// =========================================================

function buildSources(
  ranked,
  limit
) {

  return ranked
    .slice(0, limit)
    .map(
      ({ row }) => ({

        question:
          cleanText(
            rowQuestion(row)
          ),

        category:
          cleanText(
            row.category
          ),

        education_level:
          cleanText(
            row.education_level
          ),

        bible_references:
          cleanText(
            row.bible_references
          ),

        church_sources:
          cleanText(
            row.church_sources
          ),

        comparison_group:
          cleanText(
            row.comparison_group
          ),

        answer:
          cleanText(
            rowAnswer(row)
          ).slice(
            0,
            9000
          )
      })
    );
}


// =========================================================
// SOURCE TEXT FOR GEMINI
// =========================================================

function sourceText(
  sources
) {

  if (
    !sources.length
  ) {

    return (
      "NO MATCHING KNOWLEDGE-BASE MATERIAL WAS FOUND."
    );
  }


  return sources
    .map(
      (s, i) => {

        return [

          `SOURCE ${i + 1}`,

          `Question: ${
            s.question || ""
          }`,

          `Category: ${
            s.category || ""
          }`,

          `Education level: ${
            s.education_level || ""
          }`,

          `Bible references: ${
            s.bible_references || ""
          }`,

          `Church sources: ${
            s.church_sources || ""
          }`,

          `Comparison group: ${
            s.comparison_group || ""
          }`,

          `Lesson text: ${
            s.answer || ""
          }`

        ].join("\n");

      }
    )
    .join(
      "\n\n====================\n\n"
    );
}


// =========================================================
// ANSWER LEVEL
// =========================================================

function levelConfig(
  level
) {

  const n =
    Number(level) || 2;


  if (n === 1) {

    return {

      name: "Basic",

      length:
        "normally about 450-750 words when explanation is needed",

      focus:
        "Give a clear foundation. Answer directly, define the main concept, explain the essential Orthodox teaching, provide the most important biblical basis, and finish with a practical conclusion."
    };
  }


  if (n === 3) {

    return {

      name: "Scholarly",

      length:
        "normally about 1800-3000 words when the subject requires depth",

      focus:
        "Treat the question as a serious theological study. Give definitions, distinctions, biblical connections, historical context, early Church Fathers, Ethiopian Orthodox Tewahedo tradition, relevant Ethiopian scholars and church texts when supplied, common misunderstandings, doctrinal comparisons where relevant, evidence comparison, and a carefully reasoned conclusion."
    };
  }


  return {

    name: "Detailed",

    length:
      "normally about 900-1600 words when the subject requires explanation",

    focus:
      "Give a complete teaching suitable for a serious learner. Explain the direct answer, meaning, biblical foundation, Orthodox theological understanding, Church Fathers, Ethiopian Orthodox Tewahedo tradition, important distinctions, examples, spiritual significance, and conclusion."
  };
}


// =========================================================
// ORTHODOX ANSWER INSTRUCTION
// =========================================================

function systemInstruction(
  languageName,
  answerLevel
) {

  const level =
    levelConfig(
      answerLevel
    );


  return `
You are the scholarly theological answer engine of an Ethiopian Orthodox Tewahedo spiritual question-and-answer application called "ኦርቶዶክሳዊ መልስ".

Your responsibility is to answer the user's question accurately, deeply, respectfully, and in a logically organized educational form.

=========================================================
ABSOLUTE LANGUAGE RULE
=========================================================

Write the FINAL ANSWER ONLY in:

${languageName}

Do not switch languages unnecessarily.

Scripture references, names of people, books, and proper names may remain in their standard form when necessary.

=========================================================
MOST IMPORTANT RULE: ANSWER ONLY THE USER'S TOPIC
=========================================================

The supplied teaching material may contain multiple theological subjects.

DO NOT combine unrelated subjects.

If the user asks about:

- the Virgin Mary

do not add unrelated sections about:

- baptism
- fasting
- marriage
- communion
- prayer
- repentance
- the Trinity

unless the specific subject is genuinely necessary to explain the Virgin Mary.

If the user asks about baptism, focus on baptism.

If the user asks about communion, focus on communion.

If the user asks about marriage, focus on marriage.

If the user asks about the Trinity, focus on the Trinity.

A long answer is good.

An answer containing unrelated subjects is NOT good.

=========================================================
SOURCE MATERIAL RULE
=========================================================

The supplied sources have already been selected because they are relevant to the user's topic.

Treat them as evidence about ONE central subject.

Do not turn every source into a separate unrelated section.

Synthesize them into ONE coherent teaching.

If one supplied source contains unrelated material, ignore the unrelated portion.

=========================================================
IMPORTANT
=========================================================

The reader must receive a finished teaching.

NEVER mention:

- AI
- Gemini
- model
- database
- Supabase
- API
- prompt
- retrieval
- source selection
- internal instruction
- system message
- knowledge base

Do not say "I found".

Do not say "according to the AI".

=========================================================
ANSWER DEPTH
=========================================================

Selected level:

${level.name}

Required focus:

${level.focus}

Target length:

${level.length}

Do not produce a short three-line answer when explanation is needed.

Make the answer longer by adding relevant theological substance.

Never make it longer by adding unrelated doctrines.

=========================================================
CORE ANSWER METHOD
=========================================================

For every question:

1. Identify exactly what the user is asking.

2. Identify the central theological topic.

3. Give the DIRECT ANSWER first.

4. Define the central term or doctrine.

5. Explain the relevant biblical foundation.

6. Explain the Ethiopian Orthodox Tewahedo understanding.

7. Use relevant Church Fathers only when reliable material is supplied.

8. Use relevant Ethiopian Orthodox sources when supplied.

9. Explain important distinctions and common misunderstandings.

10. If another religion or denomination is directly relevant, explain its position fairly.

11. Explain the Orthodox response.

12. Explain spiritual and practical meaning.

13. End with a meaningful conclusion.

=========================================================
TOPIC DISCIPLINE
=========================================================

Every paragraph must contribute directly to answering the user's question.

Before including a section, silently ask:

"Does this help answer the exact question?"

If the answer is NO, leave it out.

Do not add a general Orthodox catechism to every question.

Do not automatically discuss Trinity, Incarnation, baptism, communion, fasting, prayer, repentance, marriage, or the Cross.

Mention them only when they are genuinely relevant to the requested subject.

=========================================================
MANDATORY ORGANIZATION
=========================================================

Use only the sections that are relevant.

A typical detailed answer may use:

# Direct Answer

## 1. Meaning and Definition

## 2. Biblical Foundation

## 3. Ethiopian Orthodox Tewahedo Understanding

## 4. Teaching of the Church Fathers

## 5. Ethiopian Orthodox Tradition and Sources

## 6. Important Distinctions and Misunderstandings

## 7. Comparison with Other Positions

## 8. Spiritual and Practical Meaning

## Conclusion

Do not force irrelevant sections.

=========================================================
SCRIPTURE RULE
=========================================================

When Scripture is relevant:

- use accurate references
- explain the passage
- do not merely list verses
- distinguish direct teaching from typology or foreshadowing
- do not invent quotations
- do not invent verse numbers

Never create a Bible reference simply to make the answer appear scholarly.

=========================================================
SOURCE INTEGRITY
=========================================================

Never invent:

- quotations
- Bible references
- Church Fathers
- Ethiopian scholars
- books
- manuscripts
- page numbers
- historical claims
- citations
- denominational teachings

Never put quotation marks around a paraphrase.

If an exact attribution is uncertain, do not manufacture it.

=========================================================
CHURCH FATHERS
=========================================================

Use Fathers only when relevant to the exact question.

When reliable material supplies a Father and his teaching:

- identify the Father
- identify the work when available
- explain the teaching accurately
- distinguish quotation from paraphrase

Never invent quotations.

Never claim that all Fathers taught something unless evidence establishes it.

=========================================================
ETHIOPIAN ORTHODOX SOURCES
=========================================================

When supplied material contains Ethiopian Orthodox sources, use them accurately.

This may include:

- Ethiopian Orthodox scholars
- traditional teachers
- ecclesiastical literature
- liturgical teaching
- church order
- canonical material
- Ethiopian theological texts

Do not invent statements by Ethiopian scholars.

Do not invent page numbers.

=========================================================
COMPARATIVE RELIGION
=========================================================

If the user's exact question concerns Catholic, Protestant, Jehovah's Witnesses, Muslim, Jewish, atheist, "Only Jesus", or another position:

First explain the Ethiopian Orthodox teaching.

Then explain the other position fairly.

Then explain the evidence.

Then identify the exact agreement and disagreement.

Then explain the Ethiopian Orthodox response.

Do not insult or misrepresent another group.

Do not introduce comparative religion when the user did not ask for it and it is not necessary.

=========================================================
MULTIPLE SOURCE SYNTHESIS
=========================================================

When several supplied sources discuss the same subject:

Do not produce several disconnected mini-answers.

Instead:

1. identify the common teaching
2. combine complementary information
3. remove repetition
4. preserve important distinctions
5. produce ONE coherent teaching

The final answer should read as if one knowledgeable Orthodox teacher prepared it.

=========================================================
WHEN MATERIAL IS INSUFFICIENT
=========================================================

If the supplied material does not establish a specialized historical or theological claim:

Do not invent it.

Give the strongest precise answer supported by the available material.

=========================================================
STYLE
=========================================================

Use:

- clear headings
- numbered sections
- readable paragraphs
- bullets where useful
- precise Orthodox terminology
- respectful language
- logical progression
- meaningful explanations

Avoid:

- unnecessary repetition
- empty introductory phrases
- unrelated theology
- unsupported claims
- fake quotations
- fake references
- overly short answers

The answer must be understandable to:

- ordinary believers
- students
- teachers
- preachers
- serious learners
- advanced readers

=========================================================
FINAL QUALITY CHECK
=========================================================

Before producing the answer, silently verify:

1. Did I answer the exact question?
2. Did I identify one central topic?
3. Did I give the direct answer first?
4. Did every major section contribute to that topic?
5. Did I accidentally introduce unrelated subjects?
6. Did I provide relevant Scripture?
7. Did I explain the Orthodox theological meaning?
8. Did I use Fathers only when relevant and reliable?
9. Did I use Ethiopian Orthodox material when supplied?
10. Did I avoid invented quotations and references?
11. Did I maintain the selected language?
12. Is the answer structured and readable?
13. Did I give spiritual meaning relevant to the topic?
14. Did I finish with a meaningful conclusion?

Return ONLY the finished answer.
`;
}


// =========================================================
// GEMINI TEXT EXTRACTION
// =========================================================

function extractGeminiText(
  data
) {

  const candidates =
    data?.candidates || [];


  if (
    !candidates.length
  ) {
    return "";
  }


  const parts =
    candidates[0]
      ?.content
      ?.parts || [];


  return parts
    .map(
      part =>
        part?.text || ""
    )
    .join("\n")
    .trim();
}


// =========================================================
// GEMINI GENERATION
// =========================================================

async function generateWithGemini(
  question,
  language,
  sources,
  answerLevel
) {

  const apiKey =
    process.env.GEMINI_API_KEY;


  if (!apiKey) {

    throw new Error(
      "GEMINI_API_KEY is not configured in Vercel."
    );
  }


  const languageName =
    LANGUAGE_NAMES[language] ||
    LANGUAGE_NAMES.am;


  const instruction =
    systemInstruction(
      languageName,
      answerLevel
    );


  let lastError = null;


  for (
    const model of MODELS
  ) {

    try {

      const response =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(
            apiKey
          )}`,
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
                        text:
                          [
                            "USER QUESTION:",
                            question,

                            "",

                            "CENTRAL TOPIC:",
                            detectTopics(
                              question
                            )
                              .map(
                                t =>
                                  t.name
                              )
                              .join(", "),

                            "",

                            "RELEVANT TEACHING MATERIAL:",
                            sourceText(
                              sources
                            )
                          ].join("\n")
                      }

                    ]
                  }

                ],

                generationConfig: {

                  temperature:
                    0.20,

                  topP:
                    0.90,

                  maxOutputTokens:
                    answerLevel === 3
                      ? 9000
                      : 7000,

                  responseMimeType:
                    "text/plain"
                }
              })
          }
        );


      const responseText =
        await response.text();


      let data = null;


      try {

        data =
          responseText
            ? JSON.parse(
                responseText
              )
            : null;

      } catch {

        data = null;
      }


      if (
        response.ok
      ) {

        const answer =
          extractGeminiText(
            data
          );


        if (answer) {
          return answer;
        }


        lastError =
          new Error(
            "The answer service returned no text."
          );

        continue;
      }


      const errorMessage =
        data?.error?.message ||
        `Answer service error ${response.status}`;


      lastError =
        new Error(
          errorMessage
        );


      if (
        ![
          400,
          401,
          403,
          404,
          429,
          500,
          502,
          503,
          504
        ].includes(
          response.status
        )
      ) {
        break;
      }

    } catch (error) {

      lastError =
        error;
    }
  }


  throw (
    lastError ||
    new Error(
      "Unable to generate an answer."
    )
  );
}


// =========================================================
// SAFE FALLBACK
// IMPORTANT:
// Never combine many unrelated lessons.
// =========================================================

function fallbackAnswer(
  coherentRanked,
  language
) {

  if (
    !coherentRanked.length
  ) {
    return "";
  }


  // Use only the strongest 1-3 coherent sources.
  const selected =
    coherentRanked
      .slice(0, 3)
      .map(
        item => item.row
      );


  const parts = [];


  for (
    const row of selected
  ) {

    const answer =
      cleanText(
        rowAnswer(row)
      );


    if (!answer) {
      continue;
    }


    const duplicate =
      parts.some(
        part =>
          normalize(part) ===
          normalize(answer)
      );


    if (
      !duplicate
    ) {
      parts.push(answer);
    }
  }


  if (
    !parts.length
  ) {
    return "";
  }


  if (
    language === "am"
  ) {

    return [

      "## መልስ",

      parts.join(
        "\n\n"
      )

    ].join(
      "\n\n"
    );
  }


  return [

    "Answer",

    parts.join(
      "\n\n"
    )

  ].join(
    "\n\n"
  );
}


// =========================================================
// MAIN API HANDLER
// =========================================================

module.exports =
  async function handler(
    req,
    res
  ) {

    // -----------------------------------------------------
    // RESPONSE HEADERS
    // -----------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );


    // -----------------------------------------------------
    // METHOD CHECK
    // -----------------------------------------------------

    if (
      req.method !== "POST"
    ) {

      return res
        .status(405)
        .json({
          error:
            "Method not allowed"
        });
    }


    try {

      // ---------------------------------------------------
      // BODY
      // ---------------------------------------------------

      const body =
        req.body || {};


      const question =
        cleanText(
          body.question
        );


      const language =
        cleanText(
          body.language ||
          "am"
        ).toLowerCase();


      const answerLevel =
        [1, 2, 3].includes(
          Number(
            body.answerLevel
          )
        )
          ? Number(
              body.answerLevel
            )
          : 2;


      // ---------------------------------------------------
      // VALIDATION
      // ---------------------------------------------------

      if (!question) {

        return res
          .status(400)
          .json({
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
            error:
              "Question is too long"
          });
      }


      // ---------------------------------------------------
      // LOAD SUPABASE
      // ---------------------------------------------------

      const loadedRows =
        await getLessons();


      const rows =
        Array.isArray(
          loadedRows
        )
          ? loadedRows
          : [];


      // ---------------------------------------------------
      // RANK
      // ---------------------------------------------------

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


      // ---------------------------------------------------
      // SOURCE LIMIT
      // ---------------------------------------------------

      const sourceLimit =
        answerLevel === 1
          ? 6
          : answerLevel === 3
          ? 14
          : 10;


      // ---------------------------------------------------
      // TOPIC-COHERENT SELECTION
      // ---------------------------------------------------

      const coherentRanked =
        selectCoherentRows(
          ranked,
          question,
          sourceLimit
        );


      const selected =
        buildSources(
          coherentRanked,
          sourceLimit
        );


      // ---------------------------------------------------
      // GENERATE
      // ---------------------------------------------------

      let answer = "";

      let generationUsed =
        false;


      try {

        answer =
          await generateWithGemini(
            question,
            language,
            selected,
            answerLevel
          );


        generationUsed =
          true;

      } catch (generationError) {

        console.error(
          "Gemini generation failed:",
          generationError?.message ||
          generationError
        );


        // -------------------------------------------------
        // SAFE FALLBACK
        // -------------------------------------------------

        answer =
          fallbackAnswer(
            coherentRanked,
            language
          );
      }


      // ---------------------------------------------------
      // NO ANSWER
      // ---------------------------------------------------

      if (!answer) {

        return res
          .status(503)
          .json({

            error:
              "The answer service is temporarily unavailable.",

            matchedCount:
              ranked.length,

            coherentCount:
              coherentRanked.length
          });
      }


      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

      return res
        .status(200)
        .json({

          answer,

          language,

          answerLevel,

          detectedTopics:
            detectTopics(
              question
            )
              .map(
                topic =>
                  topic.name
              ),

          matchedCount:
            ranked.length,

          coherentCount:
            coherentRanked.length,

          usedKnowledgeSources:
            selected.length,

          generationUsed,

          sources:
            selected.map(
              source => ({

                question:
                  source.question,

                category:
                  source.category,

                education_level:
                  source.education_level,

                bible_references:
                  source.bible_references,

                church_sources:
                  source.church_sources,

                comparison_group:
                  source.comparison_group
              })
            )
        });


    } catch (error) {

      console.error(
        "/api/ask error:",
        error?.message ||
        error
      );


      return res
        .status(500)
        .json({

          error:
            "Unable to answer the question right now."
        });
    }
  };
