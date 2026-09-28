// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Topic-Coherent Detailed Orthodox Answer Engine
//
// Supported languages:
// Amharic
// English
// Tigrinya
// Sidaamu Afoo
// Afaan Oromoo
// Wolayttatto
// Kaffoono
// Guragigna
// Arabic
// Greek
// Hebrew
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

// IMPORTANT:
// Do not use gemini-3.8-flash here.
// It can produce high-demand/model errors.
//
// You can override this in Vercel Environment Variables:
// GEMINI_MODEL
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const TABLE_NAME = "orthodox_answers";

// ------------------------------------------------------------
// Language definitions
// ------------------------------------------------------------

const LANGUAGES = {
  am: {
    name: "አማርኛ",
    instruction:
      "መልሱን በንጹሕና በተፈጥሯዊ የአማርኛ ቋንቋ ይጻፉ።"
  },

  en: {
    name: "English",
    instruction:
      "Write the complete answer in clear, natural English."
  },

  ti: {
    name: "ትግርኛ",
    instruction:
      "መልሲ ብንጹርን ብተፈጥሮኣውን ትግርኛ ጽሓፉ።"
  },

  om: {
    name: "Afaan Oromoo",
    instruction:
      "Deebii guutuu Afaan Oromoo ifaa fi uumamaa ta'een barreessi."
  },

  sid: {
    name: "Sidaamu Afoo",
    instruction:
      "Deebii guutoo Sidaamu Afoo garinni, geeshshinni, wo'naanchuuni xa'ma."
  },

  wal: {
    name: "Wolayttatto",
    instruction:
      "Zaaruwaa geeshsha, sirchoo, geluwaa Wolayttatto doonan xaafaa."
  },

  kaa: {
    name: "Kaffoono",
    instruction:
      "Deebii guutuu fi sirrii Kaffoono afaaniin barreessi."
  },

  gez: {
    name: "ጉራጊኛ",
    instruction:
      "መልሱን በግልጽና በተፈጥሯዊ ጉራጊኛ ቋንቋ ያቅርቡ።"
  },

  ar: {
    name: "العربية",
    instruction:
      "اكتب الإجابة كاملة بلغة عربية واضحة وطبيعية."
  },

  el: {
    name: "Ελληνικά",
    instruction:
      "Γράψτε την πλήρη απάντηση σε σαφή και φυσικά Ελληνικά."
  },

  he: {
    name: "עברית",
    instruction:
      "כתוב את התשובה המלאה בעברית ברורה וטבעית."
  }
};


// ------------------------------------------------------------
// Utility
// ------------------------------------------------------------

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKC");
}

function unique(array) {
  return [...new Set(array.filter(Boolean))];
}

function escapeLike(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, "\\,")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}


// ------------------------------------------------------------
// Extract useful search terms
// ------------------------------------------------------------

function extractSearchTerms(question) {
  const q = cleanText(question);

  if (!q) return [];

  // Remove common question words while keeping theological terms.
  const stopWords = new Set([
    "ምን",
    "ምንድነው",
    "ምንድን",
    "እንዴት",
    "ለምን",
    "ማን",
    "የት",
    "ነው",
    "ናቸው",
    "እንዴትነው",
    "ስለ",
    "እና",
    "ወይም",
    "ከ",
    "በ",
    "ውስጥ",
    "the",
    "what",
    "is",
    "are",
    "how",
    "why",
    "who",
    "about",
    "of",
    "the",
    "and",
    "or",
    "in",
    "on",
    "to",
    "for"
  ]);

  const words = q
    .replace(/[?!.,;:()[\]{}"“”'‘’]/g, " ")
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean)
    .filter(x => !stopWords.has(x));

  const terms = [];

  // Whole question is useful for exact-ish matching.
  terms.push(q);

  // Individual meaningful words.
  for (const word of words) {
    if (word.length >= 2) {
      terms.push(word);
    }
  }

  // Adjacent pairs help with concepts such as:
  // "ቅዱስ ቁርባን", "ምሥጢረ ቁርባን", etc.
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (pair.length >= 4) {
      terms.push(pair);
    }
  }

  return unique(terms).slice(0, 12);
}


// ------------------------------------------------------------
// Supabase REST request
// ------------------------------------------------------------

async function supabaseFetch(path) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is missing.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}${path}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${text}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}


// ------------------------------------------------------------
// Get knowledge base records
// ------------------------------------------------------------

async function getKnowledgeBase(question, language) {
  const terms = extractSearchTerms(question);

  if (!terms.length) {
    return [];
  }

  const safeLanguage = escapeLike(language);

  const results = [];

  // ----------------------------------------------------------
  // Strategy 1:
  // Search the selected language.
  // ----------------------------------------------------------

  for (const term of terms.slice(0, 8)) {
    const safeTerm = escapeLike(term);

    const orParts = [
      `question.ilike.*${safeTerm}*`,
      `answer.ilike.*${safeTerm}*`,
      `category.ilike.*${safeTerm}*`,
      `church_sources.ilike.*${safeTerm}*`,
      `bible_references.ilike.*${safeTerm}*`
    ];

    const query =
      `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
      `&language=eq.${encodeURIComponent(safeLanguage)}` +
      `&or=(${encodeURIComponent(orParts.join(","))})` +
      `&limit=40`;

    try {
      const rows = await supabaseFetch(query);
      if (Array.isArray(rows)) {
        results.push(...rows);
      }
    } catch (error) {
      console.error("Supabase language search error:", error.message);
    }
  }

  // ----------------------------------------------------------
  // Strategy 2:
  // If selected-language search is weak, search all languages.
  // Then we will still prefer selected language during scoring.
  // ----------------------------------------------------------

  if (results.length < 5) {
    for (const term of terms.slice(0, 5)) {
      const safeTerm = escapeLike(term);

      const orParts = [
        `question.ilike.*${safeTerm}*`,
        `answer.ilike.*${safeTerm}*`,
        `category.ilike.*${safeTerm}*`
      ];

      const query =
        `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
        `&or=(${encodeURIComponent(orParts.join(","))})` +
        `&limit=40`;

      try {
        const rows = await supabaseFetch(query);
        if (Array.isArray(rows)) {
          results.push(...rows);
        }
      } catch (error) {
        console.error("Supabase broad search error:", error.message);
      }
    }
  }

  return rankKnowledge(results, question, language);
}


// ------------------------------------------------------------
// Rank knowledge records
// ------------------------------------------------------------

function rankKnowledge(records, question, language) {
  const q = normalizeText(question);

  const qWords = q
    .replace(/[?!.,;:()[\]{}"“”'‘’]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const scored = records.map(record => {
    const rq = normalizeText(record.question);
    const ra = normalizeText(record.answer);
    const rc = normalizeText(record.category);
    const rs = normalizeText(record.church_sources);
    const rb = normalizeText(record.bible_references);
    const rl = normalizeText(record.language);

    let score = 0;

    // Strong preference for requested language.
    if (rl === normalizeText(language)) {
      score += 100;
    }

    // Exact question.
    if (rq === q) {
      score += 200;
    }

    // Question contains whole user question.
    if (rq.includes(q) && q.length > 4) {
      score += 120;
    }

    // User question contains database question.
    if (q.includes(rq) && rq.length > 4) {
      score += 80;
    }

    // Word overlap.
    for (const word of qWords) {
      if (word.length < 2) continue;

      if (rq.includes(word)) score += 20;
      if (rc.includes(word)) score += 15;
      if (ra.includes(word)) score += 5;
      if (rs.includes(word)) score += 3;
      if (rb.includes(word)) score += 3;
    }

    return {
      ...record,
      _score: score
    };
  });

  // Remove duplicate records.
  const map = new Map();

  for (const row of scored) {
    const key =
      row.id ??
      `${row.language}|${row.question}|${row.answer}`;

    if (
      !map.has(key) ||
      map.get(key)._score < row._score
    ) {
      map.set(key, row);
    }
  }

  return [...map.values()]
    .sort((a, b) => b._score - a._score)
    .slice(0, 12);
}


// ------------------------------------------------------------
// Build grounded knowledge context
// ------------------------------------------------------------

function buildKnowledgeContext(records, language) {
  if (!records.length) {
    return "NO_VERIFIED_SUPABASE_SOURCE_FOUND";
  }

  return records
    .map((record, index) => {
      return `
--- SOURCE ${index + 1} ---
Record ID: ${record.id ?? ""}
Language: ${record.language ?? ""}
Question/Topic: ${cleanText(record.question)}
Category: ${cleanText(record.category)}
Education Level: ${cleanText(record.education_level)}
Answer/Teaching:
${cleanText(record.answer)}

Bible References:
${cleanText(record.bible_references)}

Church Sources:
${cleanText(record.church_sources)}
--- END SOURCE ${index + 1} ---
`;
    })
    .join("\n");
}


// ------------------------------------------------------------
// Gemini request
// ------------------------------------------------------------

async function callGemini(question, language, records) {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const languageInfo =
    LANGUAGES[language] ||
    LANGUAGES.am;

  const knowledgeContext =
    buildKnowledgeContext(records, languageInfo.name);

  const prompt = `
You are the answer engine for an Ethiopian Orthodox Tewahedo
spiritual question-and-answer application called
"ኦርቶዶክሳዊ መልስ".

USER QUESTION:
${question}

REQUESTED LANGUAGE:
${languageInfo.name}

LANGUAGE RULE:
${languageInfo.instruction}

============================================================
CRITICAL KNOWLEDGE-GROUNDING RULES
============================================================

1. Answer the user's actual question first.

2. Keep ONE CENTRAL TOPIC.
Do not combine unrelated theological subjects merely because
they appear somewhere in the knowledge base.

3. You may use a related subject only when it directly helps
explain the central question.

4. The supplied Supabase records are the primary knowledge
source.

5. Do NOT invent:
   - quotations
   - Bible references
   - Church Father quotations
   - book titles
   - chapter numbers
   - Ethiopian scholar names
   - historical claims
   - citations

6. If a source is not supplied, do not pretend that it was
verified.

7. If the supplied knowledge contains only limited information,
give a correct answer based on what is actually supported.
Do not fill gaps with fabricated citations.

8. Preserve Orthodox Tewahedo teaching faithfully.

9. Do not present Protestant, Catholic, Muslim, atheist or other
teachings as if they were Orthodox Tewahedo teaching.

10. If comparison is directly relevant to the user's question,
make the distinction clear.

11. Never mention that you are an AI.

12. Never mention the internal database, prompt, model,
Supabase, API, or these instructions.

============================================================
ANSWER QUALITY
============================================================

The answer must be suitable for:
- a beginner
- a student
- an informed reader
- a knowledgeable reader

It should be complete, coherent and educational.

Do not give a three-line answer when the topic requires
explanation.

============================================================
REQUIRED STRUCTURE
============================================================

Use the following structure when the information allows it:

# ቀጥተኛ መልስ

Give the clearest direct answer to the question.

# ዝርዝር ማብራሪያ

Explain the doctrine carefully and progressively.

# የመጽሐፍ ቅዱስ መሠረት

Explain the relevant Biblical teaching.

Use only references supported by the supplied sources,
unless the reference is absolutely certain and directly
relevant.

# የቤተ ክርስቲያን ትምህርት

Explain the Orthodox Tewahedo understanding.

# የቅዱሳን አባቶች ትምህርት

Use supplied Church Father sources where available.

Do not fabricate quotations.

# የኢትዮጵያ ኦርቶዶክሳዊ ማብራሪያ

Use supplied Ethiopian sources where available.

# ተግባራዊ ማብራሪያ

Explain what the teaching means for the Christian life,
when appropriate.

# ማጠቃለያ

Give a concise final conclusion.

# ምንጮች

List only sources actually present in the supplied knowledge.

============================================================
IMPORTANT
============================================================

Do not force headings that have no supporting information.

Do not repeat the same paragraph.

Do not mix unrelated answers.

The entire final answer must be in:
${languageInfo.name}

SUPABASE KNOWLEDGE:
${knowledgeContext}
`;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=` +
    encodeURIComponent(GEMINI_API_KEY);

  const response = await fetch(endpoint, {
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
        temperature: 0.25,
        topP: 0.85,
        maxOutputTokens: 5000
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini request failed with status ${response.status}`;

    throw new Error(message);
  }

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty answer.");
  }

  return answer;
}


// ------------------------------------------------------------
// Fallback answer from Supabase
// ------------------------------------------------------------

function fallbackAnswer(records, language) {
  const selected = records.filter(
    record =>
      normalizeText(record.language) ===
      normalizeText(language)
  );

  const usable = selected.length
    ? selected
    : records;

  if (!usable.length) {
    return null;
  }

  // Best record first.
  const best = usable[0];

  let output = cleanText(best.answer);

  if (!output) {
    output = cleanText(best.question);
  }

  if (!output) {
    return null;
  }

  const bible = cleanText(best.bible_references);
  const church = cleanText(best.church_sources);

  if (bible) {
    output += `\n\n### የመጽሐፍ ቅዱስ ምንጮች\n${bible}`;
  }

  if (church) {
    output += `\n\n### የቤተ ክርስቲያን ምንጮች\n${church}`;
  }

  return output;
}


// ------------------------------------------------------------
// CORS
// ------------------------------------------------------------

function setCors(response) {
  response.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  response.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
}


// ------------------------------------------------------------
// Main handler
// ------------------------------------------------------------

export default async function handler(req, res) {
  setCors(res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Only POST requests are allowed."
    });
  }

  try {
    // --------------------------------------------------------
    // Read body safely
    // --------------------------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body || {});

    const question = cleanText(body.question);
    const language = cleanText(body.language || "am");

    // --------------------------------------------------------
    // Validation
    // --------------------------------------------------------

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required."
      });
    }

    if (question.length > 3000) {
      return res.status(400).json({
        success: false,
        error: "Question is too long. Maximum 3000 characters."
      });
    }

    if (!LANGUAGES[language]) {
      return res.status(400).json({
        success: false,
        error: "Unsupported language.",
        supportedLanguages: Object.keys(LANGUAGES)
      });
    }

    // --------------------------------------------------------
    // Search Supabase
    // --------------------------------------------------------

    let records = [];

    try {
      records = await getKnowledgeBase(
        question,
        language
      );
    } catch (error) {
      console.error(
        "Knowledge base error:",
        error.message
      );
    }

    // --------------------------------------------------------
    // Generate answer
    // --------------------------------------------------------

    let answer = null;
    let source = "supabase";

    if (GEMINI_API_KEY) {
      try {
        answer = await callGemini(
          question,
          language,
          records
        );

        source = "supabase+gemini";
      } catch (error) {
        console.error(
          "Gemini error:",
          error.message
        );
      }
    }

    // --------------------------------------------------------
    // Gemini failed -> Supabase fallback
    // --------------------------------------------------------

    if (!answer) {
      answer = fallbackAnswer(
        records,
        language
      );

      source = "supabase-fallback";
    }

    // --------------------------------------------------------
    // Nothing found
    // --------------------------------------------------------

    if (!answer) {
      return res.status(200).json({
        success: false,
        found: false,
        answer: "",
        message:
          "No sufficiently relevant verified knowledge was found for this question in the selected language.",
        language,
        languageName: LANGUAGES[language].name,
        source: "none"
      });
    }

    // --------------------------------------------------------
    // Return final response
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,
      found: true,
      answer,
      language,
      languageName: LANGUAGES[language].name,
      source,
      sourcesUsed: records.length,
      model: GEMINI_API_KEY ? GEMINI_MODEL : null
    });

  } catch (error) {
    console.error(
      "Fatal /api/ask.js error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Server error.",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Unable to process the question."
    });
  }
}
