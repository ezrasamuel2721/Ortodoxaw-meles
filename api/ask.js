// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini (Clean & Fixed)
// Detailed / Structured / Topic-Coherent Orthodox Answer Engine
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-1.5-flash";

const SUPABASE_TABLE =
  "orthodox_answers";

const MAX_QUESTION_LENGTH = 3000;

// ============================================================
// SUPPORTED LANGUAGES
// ============================================================

const LANGUAGES = {
  am: "Amharic",
  en: "English",
  ti: "Tigrinya",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolaytta",
  kaa: "Kafa",
  gez: "Guragie",
  ar: "Arabic",
  fr: "French",
  de: "German",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  ru: "Russian"
};

const LANGUAGE_ALIASES = {
  amh: "am", amharic: "am",
  eng: "en", english: "en",
  tir: "ti", tigrinya: "ti",
  or: "om", oromo: "om", afaan_oromoo: "om",
  sidaamu: "sid", sidaamu_afoo: "sid", sidaami: "sid", sidaama: "sid",
  wolaytta: "wal", wolaita: "wal", wolayttatto: "wal", wolayta: "wal",
  kafa: "kaa", kaficho: "kaa", kafaa: "kaa",
  guragie: "gez", gurage: "gez", guragigna: "gez", "ጉራጊኛ": "gez",
  arabic: "ar", ara: "ar",
  french: "fr", fra: "fr",
  german: "de", deu: "de",
  italian: "it", ita: "it",
  spanish: "es", spa: "es",
  portuguese: "pt", por: "pt",
  russian: "ru", rus: "ru"
};

function normalizeLanguage(value) {
  const raw = String(value || "am").trim().toLowerCase();
  if (LANGUAGES[raw]) return raw;
  if (LANGUAGE_ALIASES[raw]) return LANGUAGE_ALIASES[raw];
  return "am";
}

function languageName(language) {
  return LANGUAGES[language] || LANGUAGES.am;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, " ")
    .replace(/[.,!?;:()[\]{}<>/\\|+=*_~^$#@%&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const text = normalizeText(value);
  if (!text) return [];
  return text.split(/\s+/).filter(token => token.length >= 2);
}

const STOP_WORDS = new Set([
  "ስለ", "ምን", "ለምን", "እንዴት", "ማን", "ነው", "ናት", "ናቸው", "የሚለው", "የሆነ", "እንደ", "እና", "ወይም", "ነገር", "ስለዚህ", "እኔ", "እኛ", "እርሷ", "እርሱ",
  "what", "why", "how", "who", "when", "where", "is", "are", "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "about", "does", "do"
]);

const TOPICS = [
  { name: "mary", keywords: ["ማርያም", "ማርያ", "ድንግል", "እመቤታችን", "ቅድስት ድንግል", "የአምላክ እናት", "theotokos", "mary", "maria", "virgin mary", "mother of god", "ብፅዕት"] },
  { name: "baptism", keywords: ["ጥምቀት", "መጠመቅ", "ተጠመቀ", "ሕፃን ጥምቀት", "child baptism", "baptism", "baptize", "በውሃ", "ዮሐንስ መጥምቁ"] },
  { name: "cross", keywords: ["መስቀል", "የመስቀል", "መስቀሉ", "cross", "crucifixion", "ስቅለት", "ጎልጎታ"] },
  { name: "eucharist", keywords: ["ቁርባን", "ቅዱስ ቁርባን", "ቅዱስ ሥጋ", "ደሙ", "ሥጋው", "communion", "eucharist", "holy communion"] },
  { name: "faith", keywords: ["ሃይማኖት", "እምነት", "ኦርቶዶክስ", "ተዋሕዶ", "faith", "religion", "orthodox", "tawahido"] },
  { name: "tabot", keywords: ["ታቦት", "ጽላት", "tabot", "ark", "ኪዳነ ምሕረት", "ታቦተ ጽዮን"] },
  { name: "trinity", keywords: ["ሥላሴ", "አብ", "ወልድ", "መንፈስ ቅዱስ", "trinity", "father son holy spirit"] },
  { name: "christ", keywords: ["ኢየሱስ", "ክርስቶስ", "ጌታ", "አዳኝ", "jesus", "christ", "savior", "messiah"] },
  { name: "prayer", keywords: ["ጸሎት", "ጸልይ", "መጸለይ", "ምልጃ", "prayer", "pray", "intercession"] },
  { name: "church", keywords: ["ቤተ ክርስቲያን", "ቤተክርስቲያን", "church", "ቅዱሳን", "saints"] },
  { name: "scripture", keywords: ["መጽሐፍ ቅዱስ", "ቅዱሳት መጻሕፍት", "ሃያ ሰባት", "ሰማንያ አንድ", "bible", "scripture", "holy scripture"] }
];

function detectTopics(question) {
  const text = normalizeText(question);
  const found = [];
  for (const topic of TOPICS) {
    const matches = topic.keywords.filter(keyword => text.includes(normalizeText(keyword)));
    if (matches.length > 0) {
      found.push({ name: topic.name, matches });
    }
  }
  return found;
}

function rowText(row) {
  return normalizeText(
    [row.question, row.answer, row.language, row.category, row.education_level, row.bible_references, row.church_sources, row.comparison_group]
      .filter(Boolean).join(" ")
  );
}

function scoreRow(row, question, language) {
  const qText = normalizeText(question);
  const qTokens = tokenize(question);
  const rText = rowText(row);
  if (!rText) return 0;

  let score = 0;
  if (normalizeLanguage(row.language) === language) score += 18;

  const rowQuestion = normalizeText(row.question);
  if (rowQuestion && qText.includes(rowQuestion)) score += 50;
  if (rowQuestion && rowQuestion.includes(qText)) score += 45;

  for (const token of qTokens) {
    if (STOP_WORDS.has(token)) continue;
    if (rText.includes(token)) score += 4;
  }

  const questionTopics = detectTopics(question);
  for (const topic of questionTopics) {
    if (topic.keywords.some(k => rText.includes(normalizeText(k)))) {
      score += 35;
    }
  }

  if (row.bible_references) score += 3;
  if (row.church_sources) score += 3;
  if (row.comparison_group) score += 2;

  return score;
}

async function getLessons() {
  if (!SUPABASE_ANON_KEY) throw new Error("SUPABASE_ANON_KEY is missing");

  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?select=id,created_at,question,answer,language,category,education_level,bible_references,church_sources,comparison_group` +
    `&order=id.asc&limit=300`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }

  return await response.json();
}

function selectCoherentRows(ranked, question, limit) {
  if (!Array.isArray(ranked)) return [];
  const topics = detectTopics(question);
  if (topics.length === 0) return ranked.slice(0, limit).map(item => item.row);

  const topicRows = [];
  const generalRows = [];

  for (const item of ranked) {
    const text = rowText(item.row);
    let belongs = topics.some(topic => topic.matches.some(k => text.includes(normalizeText(k))));
    if (belongs) topicRows.push(item);
    else generalRows.push(item);
  }

  return [...topicRows, ...generalRows].slice(0, limit).map(item => item.row);
}

function buildSources(rows, limit) {
  return rows.slice(0, limit).map(row => ({
    question: row.question || "",
    answer: row.answer || "",
    language: normalizeLanguage(row.language),
    category: row.category || "",
    education_level: row.education_level || "",
    bible_references: row.bible_references || "",
    church_sources: row.church_sources || "",
    comparison_group: row.comparison_group || ""
  }));
}

function formatSources(sources) {
  if (!sources.length) return "No direct knowledge-base entries matched.";
  return sources.map((source, index) => `
SOURCE ${index + 1}
Question: ${source.question}
Answer: ${source.answer}
Language: ${source.language}
Bible refs: ${source.bible_references}
Church sources: ${source.church_sources}
Comparison: ${source.comparison_group}
`).join("\n-------------------------\n");
}

function buildSystemInstruction(language) {
  const lang = languageName(language);
  return `
You are the primary theological answer engine for "ኦርቶዶክሳዊ መልስ".
Your goal is to provide deep, exhaustive, authoritative Orthodox Christian answers.

OUTPUT LANGUAGE:
Translate and compose the entire response fluently in: ${lang}.

STRUCTURE OF THE RESPONSE:
1. **Direct Orthodox Answer**: Clear theological statement.
2. **Biblical Foundations**: Quote/reference Old and New Testament (81 Books framework).
3. **Church Fathers & Scholars**: St. Athanasius, St. Cyril, St. John Chrysostom, and Ethiopian Scholars (የኢትዮጵያ ሊቃውንት Commentary/ትርጓሜ).
4. **Ethiopian Orthodox Tradition & Liturgy**: Deep traditional perspective.
5. **Comparative Analysis (ንፅፅራዊ ትምህርት)**: Respectfully contrast Orthodox theology with Protestantism, Catholicism, or Islam on this specific topic.
6. **Spiritual/Practical Application & Conclusion**.

ACCURACY STRICTNESS:
- Never fabricate Bible citations or Patristic quotes.
- Keep the topic coherent.
- Maintain maximum clarity and respectful depth.
`;
}

function buildUserPrompt(question, language, sources) {
  return `
USER QUESTION: ${question}
TARGET LANGUAGE: ${languageName(language)}

DATABASE CONTEXT (Grounding):
${formatSources(sources)}

Provide a fully detailed, comparative, and scriptural Orthodox response in ${languageName(language)}.
`;
}

function getModelCandidates() {
  const candidates = [
    GEMINI_MODEL,
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash"
  ];
  return [...new Set(candidates.filter(Boolean))];
}

async function callGemini(model, systemInstruction, userPrompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing in Environment Variables");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.85,
        maxOutputTokens: 4000
      }
    })
  });

  const raw = await response.text();
  let data = null;
  try { data = JSON.parse(raw); } catch (_) {}

  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${data?.error?.message || raw}`);
  }

  const answer = data?.candidates?.[0]?.content?.parts?.map(p => p?.text || "").join("").trim();
  if (!answer) throw new Error("Gemini returned empty answer");

  return answer;
}

async function generateWithGemini(question, language, sources) {
  const systemInstruction = buildSystemInstruction(language);
  const userPrompt = buildUserPrompt(question, language, sources);
  let lastError = null;

  for (const model of getModelCandidates()) {
    try {
      return await callGemini(model, systemInstruction, userPrompt);
    } catch (error) {
      lastError = error;
      console.error(`Model ${model} failed:`, error.message);
    }
  }
  throw lastError || new Error("All Gemini model candidates failed.");
}

function fallbackAnswer(coherentRows, language) {
  if (!Array.isArray(coherentRows) || coherentRows.length === 0) return "";
  const rows = coherentRows.filter(r => normalizeLanguage(r.language) === language);
  const targetRows = rows.length ? rows : coherentRows;

  return targetRows.slice(0, 3).map(r => r.answer).join("\n\n");
}

function getBody(req) {
  return (req && typeof req.body === "object" && req.body !== null) ? req.body : {};
}

// ============================================================
// MAIN HANDLER
// ============================================================

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const body = getBody(req);
    const question = String(body.question || "").trim();
    const language = normalizeLanguage(body.language || "am");

    if (!question) return res.status(400).json({ error: "እባክዎ ጥያቄ ያስገቡ።" });
    if (question.length > MAX_QUESTION_LENGTH) return res.status(400).json({ error: "ጥያቄው በጣም ረጅም ነው።" });

    let loadedRows = [];
    try {
      loadedRows = await getLessons();
    } catch (e) {
      console.warn("Supabase load failed, falling back purely to Gemini API context:", e.message);
    }

    const rows = Array.isArray(loadedRows) ? loadedRows : [];
    const ranked = rows
      .map(row => ({ row, score: scoreRow(row, question, language) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const coherentRows = selectCoherentRows(ranked, question, 10);
    const selected = buildSources(coherentRows, 10);

    let answer = "";
    let generationUsed = false;

    if (GEMINI_API_KEY) {
      try {
        answer = await generateWithGemini(question, language, selected);
        generationUsed = true;
      } catch (genError) {
        console.error("Gemini failed:", genError.message);
        answer = fallbackAnswer(coherentRows, language);
      }
    } else {
      answer = fallbackAnswer(coherentRows, language);
    }

    if (!answer) {
      return res.status(503).json({ error: "የተጠየቀውን ጥያቄ ለማስተናገድ የመረጃ ምንጭ ማግኘት አልተቻለም።" });
    }

    return res.status(200).json({
      answer,
      language,
      languageName: languageName(language),
      generationUsed,
      sources: selected
    });

  } catch (error) {
    console.error("/api/ask internal error:", error);
    
    // ችግሩ ከየት እንደሆነ በግልጽ የሚያሳየው የምላሽ አካል
    return res.status(500).json({ 
      error: "የሰርቨር ስህተት አጋጥሟል",
      errorMessage: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};
