// ============================================================
// Ortodoxaw-meles
// api/ask.js
//
// FINAL ORTHODOX ANSWER ENGINE (COMPLETE & EXTENDED)
// 15 LANGUAGES | STRICT TOPIC LOCK | DEEP THEOLOGICAL ANSWERS
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
  return cleanText(row.question ?? row.Question ?? row.question_text ?? row.title ?? row.q ?? "");
}

function rowAnswer(row) {
  return cleanText(row.answer ?? row.Answer ?? row.response ?? row.lesson ?? row.content ?? row.text ?? "");
}

function rowLanguage(row) {
  return cleanText(row.language ?? row.lang ?? row.lang_code ?? "");
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
    if (LANGUAGE_ALIASES[code].some(alias => normalize(alias) === normalized)) {
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
    return value === a || value.includes(a) || a.includes(value);
  });
}

function isSameLanguage(row, language) {
  return languageMatches(rowLanguage(row), language);
}


// ============================================================
// STOP WORDS
// ============================================================

const STOP_WORDS = new Set([
  "ምን", "ነው", "እንዴት", "ስለ", "የ", "እና", "ነገር", "ማለት", "እንደ", "ከ", "ላይ", "ውስጥ",
  "what", "is", "the", "how", "why", "about", "and", "of", "to", "does", "do", "are", "for", "a", "an",
  "من", "ما", "هو", "كيف", "لماذا", "عن", "في", "هل"
]);


// ============================================================
// TOPIC GROUPS & ANCHORS
// ============================================================

const TOPIC_GROUPS = [
  { name: "baptism", terms: ["ጥምቀት", "ጥምቀትን", "ተጠመቀ", "ማጥመቅ", "ሕፃን ጥምቀት", "baptism", "baptize"] },
  { name: "communion", terms: ["ቁርባን", "ቅዱስ ቁርባን", "communion", "eucharist"] },
  { name: "repentance", terms: ["ንስሐ", "ንስሐ መግባት", "ንስሐ ገባ", "ከኃጢአት መመለስ", "repentance", "repent", "confession"] },
  { name: "sin", terms: ["ኃጢአት", "ኃጢአተኛ", "sin", "sinner"] },
  { name: "prayer", terms: ["ጸሎት", "መጸለይ", "prayer", "pray"] },
  { name: "fasting", terms: ["ጾም", "መጾም", "ጾመ", "fasting", "fast"] },
  { name: "mary", terms: ["ማርያም", "ድንግል", "እመቤታችን", "ቅድስት ማርያም", "mary", "virgin mary"] },
  { name: "trinity", terms: ["ሥላሴ", "መንፈስ ቅዱስ", "trinity", "father son holy spirit"] },
  { name: "incarnation", terms: ["ሥጋዌ", "ሰው መሆን", "ሥጋ ሆነ", "incarnation"] },
  { name: "cross", terms: ["መስቀል", "ቅዱስ መስቀል", "cross", "holy cross"] },
  { name: "ark", terms: ["ታቦት", "ታቦተ ጽዮን", "ark", "ark of covenant"] },
  { name: "faith", terms: ["ሃይማኖት", "እምነት", "faith", "religion", "belief"] },
  { name: "church", terms: ["ቤተ ክርስቲያን", "ቤተክርስቲያን", "church", "orthodox church"] },
  { name: "christ", terms: ["ኢየሱስ ክርስቶስ", "ክርስቶስ", "ጌታ", "jesus christ", "christ"] }
];

const TOPIC_ANCHORS = {
  baptism: ["ጥምቀት", "ተጠመቀ", "ማጥመቅ", "baptism", "baptize"],
  communion: ["ቁርባን", "ቅዱስ ቁርባን", "communion", "eucharist"],
  repentance: ["ንስሐ", "ንስሐ መግባት", "ከኃጢአት መመለስ", "repentance", "repent", "confession"],
  sin: ["ኃጢአት", "ኃጢአተኛ", "sin", "sinner"],
  prayer: ["ጸሎት", "መጸለይ", "prayer", "pray"],
  fasting: ["ጾም", "መጾም", "fasting", "fast"],
  mary: ["ማርያም", "ድንግል", "እመቤታችን", "mary", "virgin mary"],
  trinity: ["ሥላሴ", "መንፈስ ቅዱስ", "trinity"],
  incarnation: ["ሥጋዌ", "incarnation"],
  cross: ["መስቀል", "cross"],
  ark: ["ታቦት", "ታቦተ ጽዮን", "ark"],
  faith: ["ሃይማኖት", "እምነት", "faith", "religion"],
  church: ["ቤተ ክርስቲያን", "ቤተክርስቲያን", "church"],
  christ: ["ኢየሱስ ክርስቶስ", "ክርስቶስ", "jesus christ", "christ"]
};

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

function countTopicAnchors(text, topic) {
  const normalizedText = normalize(text);
  const anchors = TOPIC_ANCHORS[topic] || [];
  let count = 0;

  for (const anchor of anchors) {
    const a = normalize(anchor);
    if (a && normalizedText.includes(a)) {
      count++;
    }
  }
  return count;
}

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

function rowMatchesTopic(row, topic) {
  if (!topic) return true;
  return countTopicAnchors(rowSearchText(row), topic) >= 1;
}

function rowStronglyMatchesTopic(row, topic) {
  if (!topic) return true;
  const questionText = normalize(rowQuestion(row));
  const categoryText = normalize(rowCategory(row));
  const answerText = normalize(rowAnswer(row));
  const anchors = TOPIC_ANCHORS[topic] || [];

  const questionHits = anchors.filter(anchor => {
    const a = normalize(anchor);
    return questionText.includes(a) || categoryText.includes(a);
  }).length;

  if (questionHits > 0) return true;

  const answerHits = anchors.filter(anchor => {
    const a = normalize(anchor);
    return answerText.includes(a);
  }).length;

  return answerHits >= 1;
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
  let score = 2000; // Base language match score

  if (rq === q) score += 10000;
  if (q.length >= 5 && rq.includes(q)) score += 5000;

  const qWords = getWords(question).filter(word => !STOP_WORDS.has(word));
  let hits = 0;

  for (const word of qWords) {
    let found = false;
    if (rq.includes(word)) { score += 500; found = true; }
    if (category.includes(word)) { score += 300; found = true; }
    if (ra.includes(word)) { score += 100; found = true; }
    if (found) hits++;
  }

  if (qWords.length) {
    score += Math.round((hits / qWords.length) * 1200);
  }

  if (topic) {
    if (!rowMatchesTopic(row, topic)) return -100000;
    score += countTopicAnchors(rowSearchText(row), topic) * 800;
    if (rowStronglyMatchesTopic(row, topic)) score += 1500;
  }

  return score;
}


// ============================================================
// SUPABASE FETCH
// ============================================================

async function supabaseGet(path) {
  if (!SUPABASE_KEY) {
    throw new Error("SUPABASE_KEY_MISSING");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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
    throw new Error(data?.message || `Supabase error ${response.status}`);
  }
  return data;
}

async function getLessons() {
  const columns = [
    "id", "question", "answer", "language", "category",
    "education_level", "bible_references", "church_sources", "comparison_group"
  ].join(",");

  const allRows = [];
  let offset = 0;

  while (offset < MAX_ROWS) {
    const path = `${TABLE_NAME}?select=${encodeURIComponent(columns)}&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const page = await supabaseGet(path);

    if (!Array.isArray(page) || page.length === 0) break;
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows;
}


// ============================================================
// CONTEXT BUILDER
// ============================================================

function buildSources(ranked) {
  return ranked.map(item => ({
    score: item.score,
    question: rowQuestion(item.row),
    answer: rowAnswer(item.row).slice(0, 14000),
    language: rowLanguage(item.row),
    category: rowCategory(item.row),
    education_level: rowEducation(item.row),
    bible_references: rowBible(item.row),
    church_sources: rowChurch(item.row),
    comparison_group: rowComparison(item.row)
  }));
}

function makeContext(sources) {
  if (!sources.length) return "No directly matching knowledge-base source was found.";
  return sources.map((source, index) => `
==================================================
ORTHODOX SOURCE ${index + 1}
==================================================
Question: ${source.question || "N/A"}
Category: ${source.category || "N/A"}
Bible references: ${source.bible_references || "N/A"}
Church sources: ${source.church_sources || "N/A"}
Content: ${source.answer || "N/A"}
`).join("\n");
}


// ============================================================
// LANGUAGE VALIDATION
// ============================================================

function answerHasWrongLanguage(answer, language) {
  const text = cleanText(answer);
  if (!text) return true;

  if (language === "zh") return (text.match(/[\u4e00-\u9fff]/g) || []).length < 5;
  if (language === "ar") return (text.match(/[\u0600-\u06ff]/g) || []).length < 5;
  if (ETHIOPIC_LANGUAGES.has(language)) return (text.match(/[\u1200-\u137f]/g) || []).length < 5;
  if (LATIN_LANGUAGES.has(language)) return (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length < 5;

  return false;
}


// ============================================================
// GEMINI SYSTEM PROMPT (FOR EXTENSIVE, DEEP ANSWERS)
// ============================================================

function buildSystemPrompt(language, question) {
  const languageName = LANGUAGES[language];
  const topic = detectTopic(question);

  return `
You are the official theological answer engine for the Ethiopian Orthodox Tewahedo educational application "ኦርቶዶክሳዊ መልስ".
Provide a **very detailed, comprehensive, deep, and structured educational answer** from the Ethiopian Orthodox Tewahedo perspective. Avoid short or superficial summaries. Treat the response like an in-depth theological lecture or spiritual book chapter.

Language: ${languageName}
Write the FINAL ANSWER ONLY in ${languageName}. No bilingual output.

Detected Topic: ${topic || "general"}
Stay strictly focused on this topic. Do not mix unrelated subjects.

Structure your comprehensive answer using clear headings and paragraphs:
1. Direct Theological Answer (ሰፊ ቀጥተኛ መልስ)
2. Deeper Theological Meaning (የጉዳዩ ጥልቅ መንፈሳዊ ትርጉም)
3. Biblical Foundation and Verses (የመጽሐፍ ቅዱስ መሠረቶችና ጥቅሶች)
4. Ethiopian Orthodox Tewahedo Tradition and Fathers (የኢትዮጵያ ኦርቶዶክስ ተዋሕዶ ቤተ ክርስቲያን ትውፊትና አባቶች አስተምህሮ)
5. Practical Spiritual Application for Believers (ለክርስቲያኖች ሕይወት የሚኖረው ተግባራዊ ትርጉም)
6. Conclusion (ማጠቃለያ)

Never mention AI, Gemini, Supabase, API, database, or prompts. Return ONLY the theological text.
`;
}


// ============================================================
// GEMINI GENERATION
// ============================================================

async function generateWithGemini(question, language, sources) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY_MISSING");

  const systemPrompt = buildSystemPrompt(language, question);
  const context = makeContext(sources);

  const userPrompt = `
USER QUESTION: ${question}

RELEVANT ORTHODOX KNOWLEDGE:
${context}

Provide an extensive, thorough, and highly detailed Ethiopian Orthodox Tewahedo theological exposition based on the knowledge provided.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 24000,
        temperature: 0.35,
        topP: 0.9
      }
    })
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini error ${response.status}`);
  }

  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  const parts = candidates[0]?.content?.parts || [];
  const answer = parts.map(part => part?.text || "").join("\n").trim();

  if (!answer) throw new Error("Gemini returned an empty answer.");

  if (answerHasWrongLanguage(answer, language)) {
    throw new Error(`GEMINI_LANGUAGE_VALIDATION_FAILED: ${LANGUAGES[language]}`);
  }

  return answer;
}


// ============================================================
// FALLBACK
// ============================================================

function fallbackAnswer(ranked, language, question) {
  const topic = detectTopic(question);
  let candidates = ranked.filter(item => isSameLanguage(item.row, language));

  if (topic) {
    candidates = candidates.filter(item => rowStronglyMatchesTopic(item.row, topic));
  }

  candidates = candidates.filter(item => item.score >= 120).sort((a, b) => b.score - a.score);
  if (!candidates.length) return "";

  return rowAnswer(candidates[0].row).trim();
}

function getRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function getErrorMessage(error) {
  return error?.message ? String(error.message) : "Unknown API error.";
}


// ============================================================
// MAIN HANDLER
// ============================================================

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Only POST requests are allowed." });
  }

  try {
    const body = getRequestBody(req);
    const question = cleanText(body.question);
    const requestedLanguage = cleanText(body.language || "am").toLowerCase();
    const language = resolveLanguage(requestedLanguage);

    if (!question) {
      return res.status(400).json({ success: false, error: "ጥያቄዎን ያስገቡ።" });
    }
    if (question.length > 3000) {
      return res.status(400).json({ success: false, error: "ጥያቄው ከ3000 ፊደል መብለጥ የለበትም።" });
    }
    if (!language || !LANGUAGES[language]) {
      return res.status(400).json({ success: false, error: `Unsupported language: ${requestedLanguage}` });
    }

    const topic = detectTopic(question);
    let rows = [];

    try {
      rows = await getLessons();
    } catch (supabaseError) {
      return res.status(503).json({
        success: false,
        answer: "",
        language,
        languageName: LANGUAGES[language],
        source: "supabase-error",
        topic,
        error: getErrorMessage(supabaseError)
      });
    }

    let ranked = rows
      .map(row => ({ row, score: scoreRow(row, question, language) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (topic) {
      const strictTopicRows = ranked.filter(item => rowStronglyMatchesTopic(item.row, topic));
      ranked = strictTopicRows.length ? strictTopicRows : [];
    }

    const topRanked = ranked.slice(0, MAX_SOURCES);
    const sources = buildSources(topRanked);

    let finalAnswer = "";
    let sourceUsed = "gemini";

    try {
      if (sources.length > 0) {
        finalAnswer = await generateWithGemini(question, language, sources);
      }
    } catch (geminiError) {
      console.error("GEMINI ERROR:", getErrorMessage(geminiError));
    }

    if (!finalAnswer) {
      finalAnswer = fallbackAnswer(ranked, language, question);
      if (finalAnswer) sourceUsed = "fallback-single";
    }

    if (!finalAnswer) {
      return res.status(404).json({
        success: false,
        answer: "",
        language,
        languageName: LANGUAGES[language],
        source: "not-found",
        topic,
        error: "ይህንን ጥያቄ የሚመለስ መረጃ በውሂብ መዝገብ ውስጥ አልተገኘም።"
      });
    }

    return res.status(200).json({
      success: true,
      answer: finalAnswer,
      language,
      languageName: LANGUAGES[language],
      source: sourceUsed,
      topic,
      sourcesCount: sources.length
    });

  } catch (error) {
    console.error("HANDLER ERROR:", getErrorMessage(error));
    return res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
};
