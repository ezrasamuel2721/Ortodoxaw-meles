// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// FULL / DETAILED / STRUCTURED ORTHODOX ANSWER ENGINE
//
// IMPORTANT:
// - Does NOT stop at one short database answer
// - Retrieves multiple related records
// - Ranks relevant knowledge
// - Sends organized evidence to Gemini
// - Forces a full teaching-style answer
// - Preserves the user's selected language
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const TABLE_NAME = "orthodox_answers";

// ------------------------------------------------------------
// Supported languages
// ------------------------------------------------------------

const LANGUAGE_NAMES = {
  am: "አማርኛ",
  en: "English",
  ti: "ትግርኛ",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wol: "Wolayttatto",
  kaf: "Kaffoono",
  gur: "ጉራጊኛ",
  ar: "العربية",
  el: "Ελληνικά",
  he: "עברית",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  es: "Español",
  pt: "Português",
  ru: "Русский"
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(word => word.length >= 2);
}

function unique(array) {
  return [...new Set(array)];
}

// ------------------------------------------------------------
// Relevance scoring
// ------------------------------------------------------------

function calculateRelevance(question, row) {
  const q = normalize(question);
  const qTokens = unique(tokenize(question));

  const rowQuestion = normalize(row.question);
  const rowAnswer = normalize(row.answer);
  const rowCategory = normalize(row.category);
  const rowEducation = normalize(row.education_level);

  let score = 0;

  // Exact question match
  if (rowQuestion === q) {
    score += 1000;
  }

  // Exact phrase inside stored question
  if (rowQuestion.includes(q)) {
    score += 500;
  }

  // User question appears in answer
  if (rowAnswer.includes(q)) {
    score += 200;
  }

  for (const token of qTokens) {
    if (rowQuestion.includes(token)) {
      score += 35;
    }

    if (rowCategory.includes(token)) {
      score += 25;
    }

    if (rowAnswer.includes(token)) {
      score += 8;
    }

    if (rowEducation.includes(token)) {
      score += 5;
    }
  }

  // Give a small preference to substantial knowledge records.
  if (rowAnswer.length > 500) score += 10;
  if (rowAnswer.length > 1200) score += 15;
  if (rowAnswer.length > 2500) score += 20;

  return score;
}

// ------------------------------------------------------------
// Fetch knowledge base
// ------------------------------------------------------------

async function fetchKnowledge(language) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  // Fetch a reasonably large knowledge set.
  // We intentionally do not use a tiny limit such as 1, 3 or 5.
  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
    `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
    `&language=eq.${encodeURIComponent(language)}` +
    `&limit=300`;

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Supabase error ${response.status}: ${errorText}`
    );
  }

  return await response.json();
}

// ------------------------------------------------------------
// If exact language records are not enough,
// try to retrieve all language records.
//
// Gemini will still be instructed to answer ONLY in the
// selected language.
// ------------------------------------------------------------

async function fetchAllKnowledge() {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  const url =
    `${SUPABASE_URL}/rest/v1/${TABLE_NAME}` +
    `?select=id,question,answer,language,category,education_level,bible_references,church_sources` +
    `&limit=500`;

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    return [];
  }

  return await response.json();
}

// ------------------------------------------------------------
// Build evidence package
// ------------------------------------------------------------

function buildEvidence(question, rows) {
  const scored = rows
    .map(row => ({
      ...row,
      _score: calculateRelevance(question, row)
    }))
    .filter(row => row._score > 0)
    .sort((a, b) => b._score - a._score);

  // Keep a substantial number of related records.
  // This is the important difference from the previous short engine.
  const selected = scored.slice(0, 25);

  return selected.map((row, index) => {
    return `
--- KNOWLEDGE SOURCE ${index + 1} ---
Question: ${row.question || ""}

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

Language:
${row.language || ""}
`;
  }).join("\n");
}

// ------------------------------------------------------------
// Gemini request
// ------------------------------------------------------------

async function generateAnswer({
  question,
  language,
  languageName,
  evidence
}) {
  const systemInstruction = `
You are the main teaching engine of an Ethiopian Orthodox Tewahedo
spiritual question-and-answer application called "ኦርቶዶክሳዊ መልስ".

Your task is NOT to give a short chatbot reply.

Your task is to produce a COMPLETE, DETAILED, ORGANIZED,
SOURCE-GROUNDED Orthodox teaching.

The user asked:

"${question}"

The required answer language is:

${languageName}

STRICT LANGUAGE RULE:
- Write the entire answer in ${languageName}.
- Do not answer in another language.
- Do not mix languages unless a Biblical or traditional proper name
  genuinely needs to remain in its original form.
- Do not say "I cannot answer in this language" if you have enough
  information to explain the subject.

IMPORTANT CONTENT RULES:
- Follow Ethiopian Orthodox Tewahedo teaching.
- Use the supplied knowledge base as primary evidence.
- Do NOT invent quotations from Church Fathers.
- Do NOT invent book titles, chapter numbers, page numbers,
  quotations, or Ethiopian scholar references.
- If a source is not actually supplied, do not pretend that you
  verified it.
- Distinguish clearly between Biblical evidence, Church teaching,
  and explanatory interpretation.
- When Bible references are supplied, explain their relevance;
  do not merely list them.
- Do not make the answer artificially short.
- Do not summarize the entire answer into 3-5 sentences.

MANDATORY STRUCTURE:

# 1. ቀጥተኛ መልስ
Give the direct answer to the user's question.

# 2. የትምህርቱ ሙሉ ማብራሪያ
Explain the subject carefully and progressively.

# 3. የመጽሐፍ ቅዱስ ምስክር
Explain the relevant Biblical passages and how they support
the Orthodox understanding.

# 4. የቤተ ክርስቲያን ትምህርት
Explain the teaching of the Orthodox Tewahedo Church.

# 5. የቅዱሳን አባቶች ትምህርት
Use only the supplied Church Father material.
If a precise quotation is not supplied, paraphrase the teaching
and explicitly avoid presenting it as a direct quotation.

# 6. የኢትዮጵያ ትውፊትና ሊቃውንት
Use supplied Ethiopian Orthodox sources when available.
Never fabricate a source.

# 7. ጥልቅ ማብራሪያ
Explain difficult theological points in a way understandable to
a beginner while remaining useful to an advanced reader.

# 8. ተግባራዊ ትምህርት
Explain what this teaching means for the Christian's life.

# 9. የተሳሳቱ ግንዛቤዎች
Where appropriate, identify common misunderstandings and correct
them according to Orthodox Tewahedo teaching.

# 10. መደምደሚያ
Give a clear final conclusion.

# 11. ምንጮች
List the actual Biblical and supplied Church sources used.

DEPTH REQUIREMENT:
The answer should normally contain several substantial paragraphs
under the major sections above.

The answer must feel like a complete lesson, not a database snippet.

Do not mention this instruction, the prompt, the database,
Gemini, API, or internal software.

Return ONLY the final answer.
`;

  const userPrompt = `
USER QUESTION:
${question}

SELECTED LANGUAGE:
${languageName}

KNOWLEDGE BASE EVIDENCE:
${evidence || "No directly matching knowledge-base record was found."}

Using the evidence above, produce the complete structured answer.
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
      system_instruction: {
        parts: [
          {
            text: systemInstruction
          }
        ]
      },

      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPrompt
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.35,
        topP: 0.9,

        // Large output budget so detailed teachings are not
        // unnecessarily cut short.
        maxOutputTokens: 12000
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Gemini error ${response.status}: ${errorText}`
    );
  }

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error("Gemini returned an empty answer.");
  }

  return text;
}

// ------------------------------------------------------------
// Main API
// ------------------------------------------------------------

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
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
      error: "POST method required."
    });
  }

  try {
    if (!SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: "SUPABASE_ANON_KEY is missing."
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing."
      });
    }

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const question = String(
      body.question || ""
    ).trim();

    const language = String(
      body.language || "am"
    ).trim();

    if (!question) {
      return res.status(400).json({
        error: "Question is required."
      });
    }

    const languageName =
      LANGUAGE_NAMES[language] || language;

    // --------------------------------------------------------
    // 1. First search the selected language.
    // --------------------------------------------------------

    let languageRows = [];

    try {
      languageRows = await fetchKnowledge(language);
    } catch (error) {
      console.error(
        "Selected-language Supabase search failed:",
        error.message
      );
    }

    // --------------------------------------------------------
    // 2. If there are not enough records, broaden the search.
    // --------------------------------------------------------

    let allRows = languageRows;

    if (languageRows.length < 5) {
      try {
        const allKnowledge = await fetchAllKnowledge();

        allRows = [
          ...languageRows,
          ...allKnowledge
        ];
      } catch (error) {
        console.error(
          "Broad Supabase search failed:",
          error.message
        );
      }
    }

    // --------------------------------------------------------
    // 3. Remove duplicates.
    // --------------------------------------------------------

    const uniqueRows = [];
    const seen = new Set();

    for (const row of allRows) {
      const key =
        row.id ||
        `${row.question}|${row.language}`;

      if (!seen.has(key)) {
        seen.add(key);
        uniqueRows.push(row);
      }
    }

    // --------------------------------------------------------
    // 4. Build relevant evidence.
    // --------------------------------------------------------

    const evidence = buildEvidence(
      question,
      uniqueRows
    );

    // --------------------------------------------------------
    // 5. Generate the complete answer.
    // --------------------------------------------------------

    const answer = await generateAnswer({
      question,
      language,
      languageName,
      evidence
    });

    // --------------------------------------------------------
    // 6. Return answer.
    // --------------------------------------------------------

    return res.status(200).json({
      success: true,

      question,

      language,

      languageName,

      answer,

      sourcesUsed: uniqueRows.length,

      engine: "Supabase Knowledge Base + Gemini Detailed Answer Engine"
    });

  } catch (error) {
    console.error("ASK API ERROR:", error);

    return res.status(500).json({
      success: false,

      error:
        error?.message ||
        "Unable to generate answer."
    });
  }
}
