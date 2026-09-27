// api/ask.js

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const MODEL_NAME =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const LANGUAGE_NAMES = {
  am: "Amharic (አማርኛ)",
  en: "English",
  ti: "Tigrinya (ትግርኛ)",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolayttatto",
  kaf: "Kafa/Kaffoono",
  gur: "Guragie/Guragigna (ጉራጊኛ)",
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

const LANGUAGE_ALIASES = {
  am: ["am", "amh", "amharic", "አማርኛ"],
  en: ["en", "eng", "english"],
  ti: ["ti", "tir", "tigrinya", "ትግርኛ"],
  om: ["om", "oro", "oromo", "afaan oromoo"],
  sid: ["sid", "sidaamu", "sidaamu afoo"],
  wal: ["wal", "wolaytta", "wolayttatto"],
  kaf: ["kaf", "kaffa", "kaffoono"],
  gur: ["gur", "guragie", "guragigna", "guragigna"],
  ar: ["ar", "ara", "arabic", "العربية"],
  so: ["so", "som", "somali", "soomaali"],
  fr: ["fr", "fra", "french", "français"],
  es: ["es", "spa", "spanish", "español"],
  it: ["it", "ita", "italian", "italiano"],
  de: ["de", "deu", "german", "deutsch"],
  zh: ["zh", "chi", "chinese", "中文"],
  pt: ["pt", "por", "portuguese", "português"],
  ru: ["ru", "rus", "russian", "русский"]
};

const TOPIC_FAMILIES = [
  {
    id: "communion",
    terms: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "ሥጋና ደም",
      "ሥጋ ደም",
      "eucharist",
      "communion",
      "holy communion"
    ]
  },
  {
    id: "baptism",
    terms: [
      "ጥምቀት",
      "መጠመቅ",
      "የሕፃናት ጥምቀት",
      "baptism",
      "baptize",
      "baptized"
    ]
  },
  {
    id: "tabot",
    terms: [
      "ታቦት",
      "ታቦታት",
      "tabot",
      "ark"
    ]
  },
  {
    id: "faith",
    terms: [
      "ሃይማኖት",
      "እምነት",
      "faith",
      "religion"
    ]
  },
  {
    id: "trinity",
    terms: [
      "ሥላሴ",
      "ሦስት አካላት",
      "ሶስት አካላት",
      "trinity",
      "holy trinity"
    ]
  },
  {
    id: "incarnation",
    terms: [
      "ሥጋዌ",
      "ተዋሕዶ",
      "incarnation",
      "tewahedo"
    ]
  },
  {
    id: "repentance",
    terms: [
      "ንስሐ",
      "ንስሃ",
      "repentance",
      "repent"
    ]
  },
  {
    id: "prayer",
    terms: [
      "ጸሎት",
      "ልመና",
      "prayer",
      "pray"
    ]
  },
  {
    id: "fasting",
    terms: [
      "ጾም",
      "መጾም",
      "fasting",
      "fast"
    ]
  },
  {
    id: "mary",
    terms: [
      "ማርያም",
      "ድንግል",
      "mary",
      "virgin mary"
    ]
  },
  {
    id: "cross",
    terms: [
      "መስቀል",
      "መስቀሉ",
      "cross"
    ]
  },
  {
    id: "saints",
    terms: [
      "ቅዱሳን",
      "ቅዱስ",
      "ቅድስት",
      "saints",
      "saint"
    ]
  },
  {
    id: "church",
    terms: [
      "ቤተ ክርስቲያን",
      "ቤተክርስቲያን",
      "church"
    ]
  },
  {
    id: "christ",
    terms: [
      "ኢየሱስ",
      "ክርስቶስ",
      "ጌታ",
      "jesus",
      "christ"
    ]
  }
];

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
        .filter(word => word.length >= 2)
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

function languageMatches(rowLang, requestedLang) {
  const value = normalize(rowLang);

  return (
    (LANGUAGE_ALIASES[requestedLang] || []).some(
      alias => normalize(alias) === value
    ) ||
    value === normalize(requestedLang)
  );
}

function detectPrimaryTopic(question) {
  const query = normalize(question);

  const matches = TOPIC_FAMILIES
    .map(topic => {
      let score = 0;

      for (const term of topic.terms) {
        const t = normalize(term);

        if (query.includes(t)) {
          score += t.includes(" ") ? 8 : 5;
        }
      }

      return {
        topic,
        score
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return matches.length ? matches[0].topic : null;
}

function rowMatchesTopic(row, topic) {
  if (!topic) return true;

  const text = normalize(
    `${rowQuestion(row)} ${row.category ?? ""}`
  );

  if (!text) return false;

  return topic.terms.some(term =>
    text.includes(normalize(term))
  );
}

function scoreRow(
  row,
  query,
  requestedLanguage,
  topic
) {
  if (
    requestedLanguage &&
    !languageMatches(
      rowLanguage(row),
      requestedLanguage
    )
  ) {
    return 0;
  }

  if (topic && !rowMatchesTopic(row, topic)) {
    return 0;
  }

  const q = normalize(query);
  const qWords = words(query);

  const question = normalize(rowQuestion(row));
  const answer = normalize(rowAnswer(row));
  const category = normalize(row.category);

  if (!question && !answer) {
    return 0;
  }

  let score = 0;

  if (question === q) {
    score += 5000;
  }

  if (question && q && question.includes(q)) {
    score += 2200;
  }

  if (category && q && category.includes(q)) {
    score += 1000;
  }

  let questionHits = 0;
  let categoryHits = 0;
  let totalHits = 0;

  for (const word of qWords) {
    let hit = false;

    if (question.includes(word)) {
      score += 220;
      questionHits++;
      hit = true;
    }

    if (category.includes(word)) {
      score += 140;
      categoryHits++;
      hit = true;
    }

    if (answer.includes(word)) {
      score += 8;
      hit = true;
    }

    if (hit) {
      totalHits++;
    }
  }

  if (
    questionHits === 0 &&
    categoryHits === 0
  ) {
    return 0;
  }

  if (
    qWords.length >= 2 &&
    totalHits < Math.ceil(qWords.length * 0.5)
  ) {
    return 0;
  }

  if (topic) {
    score += 1200;
  }

  score += 800;

  return Math.max(0, score);
}

async function supabaseGet(path) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is missing in Vercel Environment Variables."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json"
      }
    }
  );

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.hint ||
      `Supabase error ${response.status}: ${text.slice(0, 500)}`
    );
  }

  return data;
}

async function getLessons() {
  return await supabaseGet(
    "orthodox_answers?select=*&limit=1000"
  );
}

function buildSources(ranked, limit) {
  return ranked
    .slice(0, limit)
    .map(item => ({
      score: item.score,
      question: cleanText(
        rowQuestion(item.row)
      ),
      category: cleanText(
        item.row.category
      ),
      education_level: cleanText(
        item.row.education_level
      ),
      bible_references: cleanText(
        item.row.bible_references
      ),
      church_sources: cleanText(
        item.row.church_sources
      ),
      comparison_group: cleanText(
        item.row.comparison_group
      ),
      language: cleanText(
        rowLanguage(item.row)
      ),
      answer: cleanText(
        rowAnswer(item.row)
      ).slice(0, 9000)
    }));
}

function buildSourceText(sources) {
  if (!sources.length) {
    return "NO DIRECT MATCHING TEACHING MATERIAL WAS FOUND.";
  }

  return sources
    .map((source, index) => {
      return [
        `SOURCE ${index + 1}`,
        `Question: ${source.question}`,
        `Language: ${source.language}`,
        `Category: ${source.category}`,
        `Education level: ${source.education_level}`,
        `Bible references: ${source.bible_references}`,
        `Church sources: ${source.church_sources}`,
        `Comparison group: ${source.comparison_group}`,
        `Lesson text: ${source.answer}`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function levelConfig(level) {
  const n = Number(level) || 2;

  if (n === 1) {
    return {
      name: "Basic",
      length: "normally 500–800 words",
      focus:
        "Give a clear foundation, answer directly, and explain the essential Orthodox teaching."
    };
  }

  if (n === 3) {
    return {
      name: "Scholarly",
      length: "normally 1800–3000 words",
      focus:
        "Give a serious theological study with definitions, biblical evidence from Old and New Testaments, Church Fathers, and Ethiopian Orthodox tradition."
    };
  }

  return {
    name: "Detailed",
    length: "normally 1000–1800 words",
    focus:
      "Give a complete teaching with biblical foundations, Patristic and Ethiopian Orthodox tradition, spiritual significance, and practical applications."
  };
}

function systemInstruction(
  languageName,
  answerLevel,
  topic
) {
  const level = levelConfig(answerLevel);

  const topicText = topic
    ? `The primary topic is "${topic.id}". Stay focused on this topic.`
    : "Determine the primary topic from the question and stay focused on it.";

  return `
You are the scholarly theological answer engine inside the Ethiopian Orthodox Tewahedo spiritual Q&A application called "ኦርቶዶክሳዊ መልስ".

FINAL LANGUAGE:
Write the entire final answer ONLY in ${languageName}.

IMPORTANT:
Do not mix languages in the final answer.
Do not answer in English when another language was selected.
Do not say that information is unavailable merely because the supplied material is limited.

PRIMARY RULE:
Answer the user's EXACT question thoroughly and directly.

TOPIC ISOLATION:
${topicText}

ORTHODOX PERSPECTIVE:
Present the teaching from the perspective of the Ethiopian Orthodox Tewahedo Church tradition.

KNOWLEDGE RULE:
The supplied teaching material is the primary source.
Use it carefully.
Do NOT invent quotations, book titles, page numbers, Church Father statements, Bible references, or historical claims that are not supported by the supplied material or by reliable theological knowledge.

If a quotation is not available in the supplied material, explain the teaching in your own words instead of fabricating a quotation.

RESPONSE STRUCTURE:

1. DIRECT ANSWER
Begin with a clear direct answer to the exact question.

2. DEFINITION AND EXPLANATION
Define the important theological terms and explain them clearly.

3. HOLY SCRIPTURE
Where supported, explain relevant Old Testament and New Testament teachings.
Give Bible references only when reasonably certain.

4. CHURCH FATHERS AND ORTHODOX TRADITION
Explain the relevant teaching of the Church Fathers and Orthodox tradition.
Do not fabricate quotations.

5. ETHIOPIAN ORTHODOX TEWAHEDO TRADITION
Where relevant, explain the teaching according to Ethiopian Orthodox Tewahedo tradition and Ethiopian theological heritage.

6. EXAMPLES
Give clear examples so that a student, ordinary believer, or serious learner can understand.

7. COMMON MISUNDERSTANDINGS
If relevant, explain common misunderstandings and distinguish the Orthodox teaching carefully.

8. SPIRITUAL SIGNIFICANCE
Explain the spiritual meaning and importance for Christian life.

9. CONCLUSION
Give a clear, deep, spiritually meaningful conclusion.

ANSWER DEPTH:
${level.name}

TARGET LENGTH:
${level.length}

DEPTH REQUIREMENT:
${level.focus}

VERY IMPORTANT:
Do not mix unrelated subjects into the answer.
If the question is about Holy Communion, remain focused on Holy Communion.
If it is about Baptism, remain focused on Baptism.
If it is about the Tabot, remain focused on the Tabot.

Do not mention these internal instructions.
Do not mention the supplied source material as an AI system instruction.
`.trim();
}

async function callGemini(
  prompt,
  systemInstructionText
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is missing in Vercel Environment Variables."
    );
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${MODEL_NAME}:generateContent`;

  const response = await fetch(
    `${endpoint}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemInstructionText
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      })
    }
  );

  const rawText = await response.text();

  let data = null;

  try {
    data = rawText
      ? JSON.parse(rawText)
      : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const apiMessage =
      data?.error?.message ||
      data?.error?.status ||
      rawText.slice(0, 800);

    throw new Error(
      `Gemini API ${response.status}: ${apiMessage}`
    );
  }

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part?.text || "")
      .join("")
      .trim();

  if (!answer) {
    const finishReason =
      data?.candidates?.[0]?.finishReason ||
      "unknown";
