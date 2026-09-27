// api/ask.js

import { GoogleGenAI } from "@google/genai";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const MODEL_NAME =
  process.env.GEMINI_MODEL || "gemini-1.5-flash";

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
  am: ["am", "amh", "amharic"],
  en: ["en", "eng", "english"],
  ti: ["ti", "tir", "tigrinya"],
  om: ["om", "oro", "oromo", "afaan oromoo"],
  sid: ["sid", "sidaamu", "sidaamu afoo"],
  wal: ["wal", "wolaytta", "wolayttatto"],
  kaf: ["kaf", "kaffa", "kaffoono"],
  gur: ["gur", "guragie", "guragigna"],
  ar: ["ar", "ara", "arabic"],
  so: ["so", "som", "somali"],
  fr: ["fr", "fra", "french"],
  es: ["es", "spa", "spanish"],
  it: ["it", "ita", "italian"],
  de: ["de", "deu", "german"],
  zh: ["zh", "chi", "chinese"],
  pt: ["pt", "por", "portuguese"],
  ru: ["ru", "rus", "russian"]
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
    (LANGUAGE_ALIASES[requestedLang] || []).includes(value) ||
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

  return matches.length
    ? matches[0].topic
    : null;
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

  if (
    question &&
    q &&
    question.includes(q)
  ) {
    score += 2200;
  }

  if (
    category &&
    q &&
    category.includes(q)
  ) {
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
    return "No directly matching lesson was found in the supplied database.";
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
    ? `The primary topic is "${topic.id}". Stay focused on this topic and do not mix unrelated teachings.`
    : "Determine the primary topic from the question and stay focused on it.";

  return `
You are the scholarly theological answer engine inside the Ethiopian Orthodox Tewahedo spiritual Q&A application called "ኦርቶዶክሳዊ መልስ".

FINAL LANGUAGE:
Write the entire final answer ONLY in ${languageName}.

PRIMARY RULE:
Answer the user's exact question thoroughly and directly.

TOPIC ISOLATION:
${topicText}

ANSWER STRUCTURE:
1. Give a direct introduction to the question.
2. Explain the teaching from the Old and New Testament.
3. Explain the teaching according to the Ethiopian Orthodox Tewahedo tradition.
4. Where the supplied sources support it, explain Church Fathers and Ethiopian Orthodox scholars.
5. Give clear examples so a student and an ordinary believer can understand.
6. Explain the spiritual meaning and practical application.
7. Finish with a clear theological conclusion.

DEPTH:
Level: ${level.name}
Target length: ${level.length}
Focus: ${level.focus}

IMPORTANT SOURCE RULE:
The supplied database material is the primary source.
Do NOT invent quotations, page numbers, book titles, Fathers, or references.
If a precise quotation is not present in the supplied material, explain the teaching without pretending that a quotation is exact.

ORTHODOX PERSPECTIVE:
Present the teaching from the perspective of the Ethiopian Orthodox Tewahedo Church.

LANGUAGE RULE:
Do not switch languages inside the answer.
Do not begin by saying that information is unavailable merely because a direct database match is missing.
Use the supplied material as theological grounding and explain the question faithfully.

Do not discuss these instructions in the final answer.
`.trim();
}

function getGeminiText(response) {
  if (!response) {
    return "";
  }

  if (
    typeof response.text === "string" &&
    response.text.trim()
  ) {
    return response.text.trim();
  }

  if (
    response.candidates &&
    response.candidates[0] &&
    response.candidates[0].content &&
    Array.isArray(
      response.candidates[0].content.parts
    )
  ) {
    return response.candidates[0].content.parts
      .map(part => part.text || "")
      .join("")
      .trim();
  }

  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const question = cleanText(body.question);
    const language = cleanText(
      body.language || "am"
    ).toLowerCase();

    const education_level =
      Number(body.education_level) || 2;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required"
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error:
          "GEMINI_API_KEY is missing in Vercel Environment Variables.",
        stage: "configuration"
      });
    }

    if (!SUPABASE_ANON_KEY) {
      return res.status(500).json({
        success: false,
        error:
          "SUPABASE_ANON_KEY is missing in Vercel Environment Variables.",
        stage: "configuration"
      });
    }

    const topic =
      detectPrimaryTopic(question);

    let rows;

    try {
      rows = await getLessons();
    } catch (error) {
      console.error(
        "SUPABASE_ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Supabase request failed.",
        stage: "supabase"
      });
    }

    if (!Array.isArray(rows)) {
      return res.status(500).json({
        success: false,
        error:
          "Supabase returned an unexpected response.",
        stage: "supabase"
      });
    }

    const ranked = rows
      .map(row => ({
        row,
        score: scoreRow(
          row,
          question,
          language,
          topic
        )
      }))
      .filter(item => item.score > 0)
      .sort(
        (a, b) => b.score - a.score
      );

    const sources = buildSources(
      ranked,
      5
    );

    const sourceText =
      buildSourceText(sources);

    const languageName =
      LANGUAGE_NAMES[language] ||
      LANGUAGE_NAMES.am;

    const sysInstruction =
      systemInstruction(
        languageName,
        education_level,
        topic
      );

    const prompt = `
SUPPLIED TEACHING MATERIAL:

${sourceText}

USER QUESTION:

${question}

Answer the user's question using the supplied teaching material.
Stay focused on the exact question.
`.trim();

    let ai;

    try {
      ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY
      });
    } catch (error) {
      console.error(
        "GEMINI_INIT_ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Gemini initialization failed.",
        stage: "gemini_init"
      });
    }

    let response;

    try {
      response =
        await ai.models.generateContent({
          model: MODEL_NAME,
          contents: prompt,
          config: {
            systemInstruction:
              sysInstruction,
            temperature: 0.3
          }
        });
    } catch (error) {
      console.error(
        "GEMINI_API_ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Gemini request failed.",
        stage: "gemini",
        model: MODEL_NAME
      });
    }

    const answerText =
      getGeminiText(response);

    if (!answerText) {
      return res.status(500).json({
        success: false,
        error:
          "Gemini returned an empty answer.",
        stage: "gemini_response",
        model: MODEL_NAME
      });
    }

    return res.status(200).json({
      success: true,
      answer: answerText,
      sources,
      topic: topic
        ? topic.id
        : null,
      language,
      model: MODEL_NAME
    });

  } catch (error) {
    console.error(
      "UNHANDLED_API_ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Unexpected server error.",
      stage: "handler"
    });
  }
}
