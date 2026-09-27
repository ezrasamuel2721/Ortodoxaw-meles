const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6MTc5MDAyNTI1NiwiaWF0IjoxNzkwMDI1MjU2LCJleHAiOjIxMDA2MDEyNTZ9.spxmqIhfeHPjD4SXI8mT9CY611-_0Mw3w7RoRloYPkQ";

const MODELS = [
  process.env.GEMINI_MODEL || "gemini-1.5-flash"
];

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
    terms: ["ቁርባን", "ቅዱስ ቁርባን", "ሥጋና ደም", "ሥጋ ደም", "eucharist", "communion", "holy communion"]
  },
  {
    id: "baptism",
    terms: ["ጥምቀት", "መጠመቅ", "የሕፃናት ጥምቀት", "baptism", "baptize", "baptized"]
  },
  {
    id: "tabot",
    terms: ["ታቦት", "ታቦታት", "tabot", "ark"]
  },
  {
    id: "faith",
    terms: ["ሃይማኖት", "እምነት", "faith", "religion"]
  },
  {
    id: "trinity",
    terms: ["ሥላሴ", "ሦስት አካላት", "ሶስት አካላት", "trinity", "holy trinity"]
  },
  {
    id: "incarnation",
    terms: ["ሥጋዌ", "ተዋሕዶ", "incarnation", "tewahedo"]
  },
  {
    id: "repentance",
    terms: ["ንስሐ", "ንስሃ", "repentance", "repent"]
  },
  {
    id: "prayer",
    terms: ["ጸሎት", "ልመና", "prayer", "pray"]
  },
  {
    id: "fasting",
    terms: ["ጾም", "መጾም", "fasting", "fast"]
  },
  {
    id: "mary",
    terms: ["ማርያም", "ድንግል", "mary", "virgin mary"]
  },
  {
    id: "cross",
    terms: ["መስቀል", "መስቀሉ", "cross"]
  },
  {
    id: "saints",
    terms: ["ቅዱሳን", "ቅዱስ", "ቅድስት", "saints", "saint"]
  },
  {
    id: "church",
    terms: ["ቤተ ክርስቲያን", "ቤተክርስቲያን", "church"]
  },
  {
    id: "christ",
    terms: ["ኢየሱስ", "ክርስቶስ", "ጌታ", "jesus", "christ"]
  }
];

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
  return [...new Set(normalize(value).split(" ").filter(word => word.length >= 2))];
}

function rowQuestion(row) {
  return row.question ?? row.Question ?? row.question_text ?? row.title ?? row.title_am ?? row.q ?? "";
}

function rowAnswer(row) {
  return row.answer ?? row.Answer ?? row.response ?? row.lesson ?? row.content ?? row.text ?? "";
}

function rowLanguage(row) {
  return cleanText(row.language ?? row.lang ?? row.lang_code ?? "").toLowerCase();
}

function languageMatches(rowLang, requestedLang) {
  const value = normalize(rowLang);
  return (LANGUAGE_ALIASES[requestedLang] || []).includes(value) || value === normalize(requestedLang);
}

function detectPrimaryTopic(question) {
  const query = normalize(question);
  const matches = TOPIC_FAMILIES.map(topic => {
    let score = 0;
    for (const term of topic.terms) {
      const t = normalize(term);
      if (query.includes(t)) {
        score += t.includes(" ") ? 8 : 5;
      }
    }
    return { topic, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

  return matches.length ? matches[0].topic : null;
}

function rowMatchesTopic(row, topic) {
  if (!topic) return true;
  const text = normalize(`${rowQuestion(row)} ${row.category ?? ""}`);
  if (!text) return false;
  return topic.terms.some(term => text.includes(normalize(term)));
}

function scoreRow(row, query, requestedLanguage, topic) {
  if (requestedLanguage && !languageMatches(rowLanguage(row), requestedLanguage)) return 0;
  if (topic && !rowMatchesTopic(row, topic)) return 0;

  const q = normalize(query);
  const qWords = words(query);
  const question = normalize(rowQuestion(row));
  const answer = normalize(rowAnswer(row));
  const category = normalize(row.category);

  if (!question && !answer) return 0;

  let score = 0;
  if (question === q) score += 5000;
  if (question && q && question.includes(q)) score += 2200;
  if (category && q && category.includes(q)) score += 1000;

  let questionHits = 0;
  let categoryHits = 0;
  let totalHits = 0;

  for (const word of qWords) {
    let hit = false;
    if (question.includes(word)) { score += 220; questionHits++; hit = true; }
    if (category.includes(word)) { score += 140; categoryHits++; hit = true; }
    if (answer.includes(word)) { score += 8; hit = true; }
    if (hit) totalHits++;
  }

  if (questionHits === 0 && categoryHits === 0) return 0;
  if (qWords.length >= 2 && totalHits < Math.ceil(qWords.length * 0.5)) return 0;
  if (topic) score += 1200;
  score += 800;

  return Math.max(0, score);
}

async function supabaseGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.hint || `Supabase error ${response.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function getLessons() {
  return await supabaseGet("orthodox_answers?select=*&limit=1000");
}

function buildSources(ranked, limit) {
  return ranked.slice(0, limit).map(item => ({
    score: item.score,
    question: cleanText(rowQuestion(item.row)),
    category: cleanText(item.row.category),
    education_level: cleanText(item.row.education_level),
    bible_references: cleanText(item.row.bible_references),
    church_sources: cleanText(item.row.church_sources),
    comparison_group: cleanText(item.row.comparison_group),
    language: cleanText(rowLanguage(item.row)),
    answer: cleanText(rowAnswer(item.row)).slice(0, 9000)
  }));
}

function buildSourceText(sources) {
  return sources.map((source, index) => {
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
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

function levelConfig(level) {
  const n = Number(level) || 2;
  if (n === 1) {
    return {
      name: "Basic",
      length: "normally 500–800 words",
      focus: "Give a clear foundation, answer directly, and explain the essential Orthodox teaching."
    };
  }
  if (n === 3) {
    return {
      name: "Scholarly",
      length: "normally 1800–3000 words",
      focus: "Give a serious theological study with definitions, biblical evidence from Old and New Testaments, Church Fathers, and Ethiopian Orthodox tradition."
    };
  }
  return {
    name: "Detailed",
    length: "normally 1000–1800 words",
    focus: "Give a complete teaching with biblical foundations, Patristic and Ethiopian Orthodox tradition, spiritual significance, and practical applications."
  };
}

function systemInstruction(languageName, answerLevel, topic) {
  const level = levelConfig(answerLevel);
  const topicText = topic ? `The primary topic is "${topic.id}".` : "Determine the primary topic from the question.";

  return `
You are the scholarly theological answer engine inside the Ethiopian Orthodox Tewahedo spiritual Q&A application called "ኦርቶዶክሳዊ መልስ".

FINAL LANGUAGE: Write the entire final answer ONLY in ${languageName}.

PRIMARY RULE: Answer the user's EXACT question thoroughly.
TOPIC ISOLATION: ${topicText}

RESPONSE STRUCTURE REQUIREMENTS:
1. ከብሉይ እና ከሐዲስ መጽሐፍ ቅዱስ ምስክርነቶችንና ንጽጽሮችን በማካተት በዝርዝር አስረዳ።
2. ከቤተ ክርስቲያን ሊቃውንት እና ከኢትዮጵያ ኦርቶዶክሳዊ ተዋሕዶ ቤተ ክርስቲያን ሊቃውንት ትምህርቶችና ምስክርነቶች በመነሳት ቃል በቃል በመጥቀስ አብራራ።
3. ግልጽ ምሳሌዎችን በመጨመር ተማሪው ወይም አማኙ በቀላሉ እንዲረዳው አድርግ።
4. ግልጽ እና ጥልቅ የሆነ መንፈሳዊ መደምደሚያ (Conclusion) ስጥ።

ANSWER DEPTH: ${level.name}
TARGET LENGTH: ${level.length}
DEPTH REQUIREMENT: ${level.focus}

KNOWLEDGE RULE: The supplied teaching material is the primary source. Do not invent references or quotes not supported by the material.

ORTHODOX PERSPECTIVE: Present the teaching strictly from the perspective of the Ethiopian Orthodox Tewahedo Church tradition.
`.trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, language = "am", education_level = 2 } = req.body || {};

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const topic = detectPrimaryTopic(question);
    const rows = await getLessons();

    if (!rows || !rows.length) {
      throw new Error("መረጃውን ማመጣት አልተቻለም።");
    }

    const ranked = rows.map(row => ({
      row,
      score: scoreRow(row, question, language, topic)
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

    const sources = buildSources(ranked, 5);
    const sourceText = buildSourceText(sources);
    const langName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES["am"];
    const sysInstruction = systemInstruction(langName, education_level, topic);

    // እዚህጋር የ Gemini ሞዴል ጥሪ ይደረጋል (እባክዎ የ AI SDK ውቅረትዎ በትክክል መገናኘቱን ያረጋግጡ)
    
    return res.status(200).json({
      success: true,
      sources,
      topic: topic ? topic.id : null
    });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ 
      error: error.message || "መረጃውን ማመጣት አልተቻለም።" 
    });
  }
}
