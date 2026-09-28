// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Topic-Locked Detailed Orthodox Answer Engine
//
// MAIN FIX:
// 1. Detect the user's main topic.
// 2. Search only relevant knowledge.
// 3. Reject unrelated topics.
// 4. Send only coherent context to Gemini.
// 5. Force Gemini to remain on the requested topic.
// 6. Validate the final answer against the topic.
// 7. Preserve multilingual support and database fallback.
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

// ------------------------------------------------------------
// Gemini models
// ------------------------------------------------------------
const MODELS = [
  process.env.GEMINI_MODEL || "",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
].filter(Boolean);

// ------------------------------------------------------------
// Supported languages
// ------------------------------------------------------------
const LANGUAGE_NAMES = {
  am: "አማርኛ",
  en: "English",
  ti: "ትግርኛ",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolayttatto",
  kaa: "Kafaa",
  gez: "ግዕዝ",
  ar: "العربية",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  es: "Español",
  pt: "Português",
  ru: "Русский"
};

// ------------------------------------------------------------
// Normalize language
// ------------------------------------------------------------
function normalizeLanguage(value) {
  const v = String(value || "am").trim().toLowerCase();

  const aliases = {
    amh: "am",
    amharic: "am",

    english: "en",

    tigrinya: "ti",
    tig: "ti",

    oromo: "om",
    afaanoromoo: "om",

    sidaama: "sid",
    sidaamu: "sid",

    wolayta: "wal",
    wolaitta: "wal",
    wolayttatto: "wal",

    kafa: "kaa",
    kafaa: "kaa",

    geez: "gez",
    geez: "gez",

    arabic: "ar",
    french: "fr",
    german: "de",
    italian: "it",
    spanish: "es",
    portuguese: "pt",
    russian: "ru"
  };

  return aliases[v] || (LANGUAGE_NAMES[v] ? v : "am");
}

// ------------------------------------------------------------
// Clean text
// ------------------------------------------------------------
function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------
// Tokenizer
// ------------------------------------------------------------
function tokenize(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[።፣፤፥፦፧፨,.;:!?()[\]{}"'“”‘’]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// ------------------------------------------------------------
// Topic definitions
//
// IMPORTANT:
// Keep specific topics ABOVE broad topics.
// This prevents words such as "እግዚአብሔር",
// "ሥጋ", "ቅዱስ", etc. from creating unrelated matches.
// ------------------------------------------------------------
const TOPICS = [

  // ----------------------------------------------------------
  // ንስሐ
  // ----------------------------------------------------------
  {
    key: "repentance",
    names: [
      "ንስሐ",
      "ንስሃ",
      "ንስሐ ምንድነው",
      "ንስሐ ምንድን ነው",
      "መናዘዝ",
      "ኃጢአትን መተው",
      "ከኃጢአት መመለስ",
      "የንስሐ ልጅ",
      "ተናዛዥ",
      "repentance",
      "repent",
      "confession"
    ],
    keywords: [
      "ንስሐ",
      "ንስሃ",
      "መናዘዝ",
      "ኃጢአት",
      "መጸጸት",
      "መመለስ",
      "repentance",
      "repent",
      "confession"
    ],
    excludeTopics: [
      "communion",
      "baptism"
    ]
  },

  // ----------------------------------------------------------
  // ቅዱስ ቁርባን
  // ----------------------------------------------------------
  {
    key: "communion",
    names: [
      "ቅዱስ ቁርባን",
      "ቁርባን",
      "ምሥጢረ ቁርባን",
      "የጌታ ራት",
      "ሥጋና ደም",
      "ቅዱስ ሥጋ",
      "ቅዱስ ደም",
      "communion",
      "eucharist"
    ],
    keywords: [
      "ቁርባን",
      "ምሥጢረ ቁርባን",
      "ሥጋና ደም",
      "የጌታ ራት",
      "eucharist",
      "communion"
    ]
  },

  // ----------------------------------------------------------
  // ጥምቀት
  // ----------------------------------------------------------
  {
    key: "baptism",
    names: [
      "ጥምቀት",
      "ጥምቀት ምንድነው",
      "ሕፃናት ጥምቀት",
      "ልጅ ማጥመቅ",
      "በጥምቀት",
      "baptism",
      "baptize"
    ],
    keywords: [
      "ጥምቀት",
      "አጥምቅ",
      "ማጥመቅ",
      "ሕፃናት",
      "baptism",
      "baptize"
    ]
  },

  // ----------------------------------------------------------
  // ሥጋዌ
  // ----------------------------------------------------------
  {
    key: "incarnation",
    names: [
      "ሥጋዌ",
      "የሥጋዌ ምሥጢር",
      "እግዚአብሔር ሰው መሆን",
      "ወልድ ሰው ሆነ",
      "incarnation"
    ],
    keywords: [
      "ሥጋዌ",
      "ሰው ሆነ",
      "ወልድ",
      "incarnation"
    ]
  },

  // ----------------------------------------------------------
  // ቅድስት ድንግል ማርያም
  // ----------------------------------------------------------
  {
    key: "mary",
    names: [
      "ማርያም",
      "ድንግል ማርያም",
      "ቅድስት ማርያም",
      "ቅድስት ድንግል",
      "የማርያም ክብር",
      "mother mary"
    ],
    keywords: [
      "ማርያም",
      "ድንግል",
      "እመቤታችን",
      "እናቱ",
      "mother mary"
    ]
  },

  // ----------------------------------------------------------
  // ሥላሴ
  // ----------------------------------------------------------
  {
    key: "trinity",
    names: [
      "ሥላሴ",
      "ቅድስት ሥላሴ",
      "አብ ወልድ መንፈስ ቅዱስ",
      "trinity"
    ],
    keywords: [
      "ሥላሴ",
      "አብ",
      "ወልድ",
      "መንፈስ ቅዱስ",
      "trinity"
    ]
  },

  // ----------------------------------------------------------
  // መስቀል
  // ----------------------------------------------------------
  {
    key: "cross",
    names: [
      "መስቀል",
      "የመስቀል ምሥጢር",
      "የመስቀል ክብር",
      "cross"
    ],
    keywords: [
      "መስቀል",
      "ተሰቀለ",
      "cross"
    ]
  },

  // ----------------------------------------------------------
  // ታቦት
  // ----------------------------------------------------------
  {
    key: "tabot",
    names: [
      "ታቦት",
      "የታቦት ምሥጢር",
      "የታቦት ክብር",
      "ark",
      "tabot"
    ],
    keywords: [
      "ታቦት",
      "ark",
      "tabot"
    ]
  },

  // ----------------------------------------------------------
  // እምነት
  // ----------------------------------------------------------
  {
    key: "faith",
    names: [
      "እምነት",
      "ሃይማኖት",
      "የእምነት ትምህርት",
      "faith",
      "religion"
    ],
    keywords: [
      "እምነት",
      "ሃይማኖት",
      "faith",
      "religion"
    ]
  },

  // ----------------------------------------------------------
  // ጸሎት
  // ----------------------------------------------------------
  {
    key: "prayer",
    names: [
      "ጸሎት",
      "መጸለይ",
      "የጸሎት ሕይወት",
      "prayer"
    ],
    keywords: [
      "ጸሎት",
      "መጸለይ",
      "pray",
      "prayer"
    ]
  }
];

// ------------------------------------------------------------
// Detect main topic
// ------------------------------------------------------------
function detectTopic(question) {
  const q = cleanText(question).toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    let score = 0;

    // Exact phrase gets strong priority.
    for (const name of topic.names || []) {
      const n = String(name).toLowerCase();

      if (q === n) {
        score += 100;
      } else if (q.includes(n)) {
        score += 40;
      }
    }

    // Keyword matching.
    for (const keyword of topic.keywords || []) {
      if (q.includes(String(keyword).toLowerCase())) {
        score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  return {
    topic: best,
    score: bestScore
  };
}

// ------------------------------------------------------------
// Score database row against question/topic
// ------------------------------------------------------------
function scoreRow(row, question, topic) {
  const q = cleanText(question).toLowerCase();

  const fields = [
    row.question,
    row.answer,
    row.category,
    row.education_level,
    row.bible_references,
    row.church_sources,
    row.comparison_group
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  // Exact question similarity.
  const qTokens = tokenize(q);
  const fieldTokens = new Set(tokenize(fields));

  for (const token of qTokens) {
    if (fieldTokens.has(token)) {
      score += 2;
    }
  }

  // Topic-specific matching.
  if (topic) {
    const category = String(row.category || "").toLowerCase();

    if (
      category === topic.key.toLowerCase() ||
      category.includes(topic.key.toLowerCase())
    ) {
      score += 60;
    }

    for (const keyword of topic.keywords || []) {
      const k = String(keyword).toLowerCase();

      if (fields.includes(k)) {
        score += 15;
      }
    }
  }

  return score;
}

// ------------------------------------------------------------
// Determine whether a row belongs to a different strong topic
// ------------------------------------------------------------
function hasStrongOtherTopic(row, selectedTopic) {
  if (!selectedTopic) return false;

  const text = [
    row.question,
    row.answer,
    row.category
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let strongest = null;
  let strongestScore = 0;

  for (const topic of TOPICS) {
    if (topic.key === selectedTopic.key) continue;

    let score = 0;

    for (const keyword of topic.keywords || []) {
      if (text.includes(String(keyword).toLowerCase())) {
        score += 1;
      }
    }

    if (score > strongestScore) {
      strongestScore = score;
      strongest = topic;
    }
  }

  // Only reject if another topic is clearly dominant.
  return Boolean(strongest && strongestScore >= 2);
}

// ------------------------------------------------------------
// Fetch knowledge base
// ------------------------------------------------------------
async function fetchKnowledge(language) {
  const url =
    `${SUPABASE_URL}/rest/v1/orthodox_answers` +
    `?select=id,created_at,question,answer,language,category,education_level,bible_references,church_sources,comparison_group` +
    `&language=eq.${encodeURIComponent(language)}` +
    `&order=id.asc` +
    `&limit=300`;

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Supabase error ${response.status}: ${text}`
    );
  }

  return response.json();
}

// ------------------------------------------------------------
// Select coherent rows
// ------------------------------------------------------------
function selectRelevantRows(rows, question, topic) {
  if (!Array.isArray(rows)) return [];

  const scored = rows
    .map(row => ({
      row,
      score: scoreRow(row, question, topic)
    }))
    .filter(item => item.score > 0);

  scored.sort((a, b) => b.score - a.score);

  let selected = scored
    .filter(item => {
      // If a strong topic was detected, reject unrelated rows.
      if (topic && hasStrongOtherTopic(item.row, topic)) {
        return false;
      }

      // Topic lock.
      if (topic) {
        const combined = [
          item.row.question,
          item.row.answer,
          item.row.category
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const topicHit = (topic.keywords || []).some(k =>
          combined.includes(String(k).toLowerCase())
        );

        const categoryHit =
          String(item.row.category || "")
            .toLowerCase()
            .includes(topic.key.toLowerCase());

        if (!topicHit && !categoryHit) {
          return false;
        }
      }

      return true;
    })
    .slice(0, 12)
    .map(item => item.row);

  return selected;
}

// ------------------------------------------------------------
// Format context for Gemini
// ------------------------------------------------------------
function buildContext(rows) {
  return rows
    .map((row, index) => {
      return `
SOURCE ${index + 1}

Question:
${row.question || ""}

Answer:
${row.answer || ""}

Category:
${row.category || ""}

Education level:
${row.education_level || ""}

Bible references:
${row.bible_references || ""}

Church sources:
${row.church_sources || ""}

Comparison group:
${row.comparison_group || ""}
`;
    })
    .join("\n-------------------------\n");
}

// ------------------------------------------------------------
// Gemini prompt
// ------------------------------------------------------------
function buildPrompt(question, language, topic, context) {
  const languageName =
    LANGUAGE_NAMES[language] || LANGUAGE_NAMES.am;

  const topicName = topic
    ? topic.key
    : "the user's requested Orthodox subject";

  return `
You are the answer engine for an Ethiopian Orthodox Tewahedo
spiritual Q&A application called "ኦርቶዶክሳዊ መልስ".

USER QUESTION:
${question}

RESPONSE LANGUAGE:
${languageName}

LOCKED TOPIC:
${topicName}

KNOWLEDGE BASE:
${context || "No sufficiently relevant database material was found."}

============================================================
ABSOLUTE TOPIC RULES
============================================================

1. Answer ONLY the user's question.

2. Stay strictly inside the LOCKED TOPIC.

3. DO NOT introduce an unrelated Orthodox subject.

4. DO NOT combine separate database records merely because
   they contain generic words such as:
   - God
   - holy
   - body
   - blood
   - church
   - faith
   - Lord
   - Spirit

5. For example:
   If the question is about "ንስሐ",
   DO NOT suddenly write a section about "ቅዱስ ቁርባን"
   unless the user specifically asks about the relationship
   between repentance and Communion.

6. If the question is about Communion, do not turn the answer
   into a general teaching about repentance.

7. Use related concepts ONLY when they directly explain the
   requested topic.

8. Do not invent database sources.

9. If a Bible reference is provided in the knowledge base,
   use it accurately.

10. The answer must be based on Ethiopian Orthodox Tewahedo
    teaching and must not present Protestant, Catholic, Islamic,
    Jehovah's Witness, or other teachings as Orthodox doctrine.

============================================================
ANSWER STRUCTURE
============================================================

Give a complete, educational answer appropriate for a reader
from beginner level to advanced level.

Use this structure when appropriate:

1. ቀጥተኛ መልስ
2. ዝርዝር ማብራሪያ
3. የመጽሐፍ ቅዱስ መሠረት
4. የተዋሕዶ ትውፊት/ትምህርት
5. ተዛማጅ ነጥቦች
6. ማጠቃለያ

Do not force every heading if it is not relevant.

IMPORTANT:
The final answer must remain coherent as ONE answer to the
USER QUESTION.

Never append another unrelated answer from the database.

Return ONLY the final answer.
`;
}

// ------------------------------------------------------------
// Call Gemini
// ------------------------------------------------------------
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  let lastError = null;

  for (const model of MODELS) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent?key=` +
        encodeURIComponent(GEMINI_API_KEY);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.85,
            maxOutputTokens: 4000
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        lastError = new Error(
          data?.error?.message ||
          `Gemini ${response.status}`
        );
        continue;
      }

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

      if (text) {
        return text;
      }

      lastError = new Error("Gemini returned an empty answer.");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("All Gemini models failed.");
}

// ------------------------------------------------------------
// Validate final answer
//
// This is a safety net, not the main search mechanism.
// ------------------------------------------------------------
function validateAnswer(answer, topic) {
  if (!answer || !topic) {
    return {
      valid: true,
      text: answer
    };
  }

  const text = answer.toLowerCase();

  // Detect strong unrelated topics.
  const unrelated = [];

  for (const other of TOPICS) {
    if (other.key === topic.key) continue;

    let hits = 0;

    for (const keyword of other.keywords || []) {
      if (text.includes(String(keyword).toLowerCase())) {
        hits++;
      }
    }

    if (hits >= 2) {
      unrelated.push(other.key);
    }
  }

  // We do NOT automatically delete the answer.
  // Some topics legitimately mention another topic.
  // The main protection is the strict prompt + filtered context.
  return {
    valid: unrelated.length === 0,
    text: answer,
    unrelatedTopics: unrelated
  };
}

// ------------------------------------------------------------
// Database fallback
// ------------------------------------------------------------
function buildFallback(rows, question, language) {
  if (!rows.length) {
    return language === "am"
      ? "ይህን ጥያቄ ለመመለስ በቂ የእውቀት መረጃ አልተገኘም።"
      : "No sufficiently relevant knowledge-base material was found.";
  }

  const first = rows[0];

  let output = first.answer || "";

  // Add only strongly related additional answers.
  for (let i = 1; i < Math.min(rows.length, 3); i++) {
    const extra = rows[i]?.answer;

    if (
      extra &&
      !output.includes(extra)
    ) {
      output += `\n\n${extra}`;
    }
  }

  return output.trim();
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
export default async function handler(req, res) {

  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------
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
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {

    // --------------------------------------------------------
    // Read body
    // --------------------------------------------------------
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body || {});

    const question = cleanText(
      body.question ||
      body.query ||
      ""
    );

    const language = normalizeLanguage(
      body.language || "am"
    );

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required."
      });
    }

    if (question.length > 3000) {
      return res.status(400).json({
        success: false,
        error: "Question is too long."
      });
    }

    // --------------------------------------------------------
    // Detect topic
    // --------------------------------------------------------
    const detection = detectTopic(question);
    const topic = detection.topic;

    // --------------------------------------------------------
    // Fetch Supabase
    // --------------------------------------------------------
    const rows = await fetchKnowledge(language);

    // --------------------------------------------------------
    // Topic-locked filtering
    // --------------------------------------------------------
    const relevantRows =
      selectRelevantRows(
        rows,
        question,
        topic
      );

    // --------------------------------------------------------
    // If language has no results, DO NOT silently answer in
    // another language.
    // --------------------------------------------------------
    if (!relevantRows.length) {

      return res.status(200).json({
        success: true,
        answer:
          language === "am"
            ? "ለዚህ ጥያቄ በተመረጠው ቋንቋ በቂ ተዛማጅ የእውቀት መረጃ አልተገኘም።"
            : `No sufficiently relevant knowledge-base material was found in ${LANGUAGE_NAMES[language]}.`,
        language,
        topic: topic?.key || null,
        source: "supabase"
      });
    }

    // --------------------------------------------------------
    // Build clean context
    // --------------------------------------------------------
    const context =
      buildContext(relevantRows);

    // --------------------------------------------------------
    // Gemini
    // --------------------------------------------------------
    let finalAnswer = "";

    if (GEMINI_API_KEY) {

      const prompt =
        buildPrompt(
          question,
          language,
          topic,
          context
        );

      try {
        finalAnswer =
          await callGemini(prompt);
      } catch (geminiError) {
        console.error(
          "Gemini error:",
          geminiError?.message || geminiError
        );

        finalAnswer =
          buildFallback(
            relevantRows,
            question,
            language
          );
      }

    } else {

      finalAnswer =
        buildFallback(
          relevantRows,
          question,
          language
        );
    }

    // --------------------------------------------------------
    // Final topic validation
    // --------------------------------------------------------
    const validation =
      validateAnswer(
        finalAnswer,
        topic
      );

    // If answer has suspicious unrelated topics,
    // regenerate once with an even stricter instruction.
    if (
      !validation.valid &&
      GEMINI_API_KEY
    ) {

      const strictPrompt = `
Rewrite the following answer.

USER QUESTION:
${question}

REQUIRED TOPIC:
${topic?.key || "the requested topic"}

RULE:
Remove every paragraph or statement that belongs to an
unrelated religious topic.

For example, if the question is about repentance (ንስሐ),
do NOT add a separate teaching about Communion (ቅዱስ ቁርባን),
baptism (ጥምቀት), Mary, the Cross, etc., unless the
relationship is directly necessary to answer the question.

Keep only material that directly answers the user's question.

LANGUAGE:
${LANGUAGE_NAMES[language]}

ORIGINAL ANSWER:
${finalAnswer}

Return ONLY the corrected final answer.
`;

      try {
        finalAnswer =
          await callGemini(strictPrompt);
      } catch (error) {
        console.error(
          "Strict regeneration failed:",
          error?.message || error
        );
      }
    }

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------
    return res.status(200).json({
      success: true,
      answer: finalAnswer,
      language,
      topic: topic?.key || null,
      topicScore: detection.score,
      sourcesUsed: relevantRows.length,
      source: GEMINI_API_KEY
        ? "supabase+gemini"
        : "supabase"
    });

  } catch (error) {

    console.error(
      "API ERROR:",
      error?.stack || error
    );

    return res.status(500).json({
      success: false,
      error: "Server error.",
      message:
        process.env.NODE_ENV === "development"
          ? error?.message
          : undefined
    });
  }
}
