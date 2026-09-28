// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Gemini
// Detailed / Structured / Topic-Coherent Orthodox Answer Engine
//
// SUPPORTED SUPABASE COLUMNS ONLY:
//
// id
// created_at
// question
// answer
// language
// category
// education_level
// bible_references
// church_sources
// comparison_group
//
// MAIN GOAL:
//
// Question
//   ↓
// Language
//   ↓
// Topic detection
//   ↓
// Supabase knowledge retrieval
//   ↓
// Topic-coherent ranking
//   ↓
// Bible + Church Fathers/Scholars + examples + comparison
//   ↓
// Gemini structured answer
//   ↓
// Safe fallback if Gemini unavailable
//
// IMPORTANT:
// - Does NOT expose Gemini API key to browser.
// - Does NOT use Supabase service_role key.
// - Uses REST API directly.
// - Keeps the 11-language structure.
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash";

const SUPABASE_TABLE =
  "orthodox_answers";

const MAX_QUESTION_LENGTH =
  3000;


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


// Some frontends may use alternative values.
// They are normalized here without removing the main values.

const LANGUAGE_ALIASES = {
  amh: "am",
  amharic: "am",

  eng: "en",
  english: "en",

  tir: "ti",
  tigrinya: "ti",

  or: "om",
  oromo: "om",
  afaan_oromoo: "om",

  sidaamu: "sid",
  sidaamu_afoo: "sid",
  sidaami: "sid",
  sidaama: "sid",

  wolaytta: "wal",
  wolaita: "wal",
  wolayttatto: "wal",
  wolayta: "wal",

  kafa: "kaa",
  kaficho: "kaa",
  kafaa: "kaa",

  guragie: "gez",
  gurage: "gez",
  guragigna: "gez",
  ጉራጊኛ: "gez",

  arabic: "ar",
  ara: "ar",

  french: "fr",
  fra: "fr",

  german: "de",
  deu: "de",

  italian: "it",
  ita: "it",

  spanish: "es",
  spa: "es",

  portuguese: "pt",
  por: "pt",

  russian: "ru",
  rus: "ru"
};


// ============================================================
// NORMALIZE LANGUAGE
// ============================================================

function normalizeLanguage(value) {

  const raw =
    String(value || "am")
      .trim()
      .toLowerCase();

  if (LANGUAGES[raw]) {
    return raw;
  }

  if (LANGUAGE_ALIASES[raw]) {
    return LANGUAGE_ALIASES[raw];
  }

  return "am";
}


// ============================================================
// LANGUAGE NAME
// ============================================================

function languageName(language) {

  return (
    LANGUAGES[language] ||
    LANGUAGES.am
  );
}


// ============================================================
// TEXT NORMALIZATION
// ============================================================

function normalizeText(value) {

  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, " ")
    .replace(/[.,!?;:()[\]{}<>/\\|+=*_~^$#@%&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ============================================================
// TOKENIZATION
// ============================================================

function tokenize(value) {

  const text =
    normalizeText(value);

  if (!text) {
    return [];
  }

  return text
    .split(/\s+/)
    .filter(
      token =>
        token.length >= 2
    );
}


// ============================================================
// REMOVE COMMON STOP WORDS
// ============================================================

const STOP_WORDS = new Set([

  // Amharic
  "ስለ",
  "ምን",
  "ለምን",
  "እንዴት",
  "ማን",
  "ነው",
  "ናት",
  "ናቸው",
  "የሚለው",
  "የሆነ",
  "እንደ",
  "እና",
  "ወይም",
  "ነገር",
  "ስለዚህ",
  "እኔ",
  "እኛ",
  "እርሷ",
  "እርሱ",

  // English
  "what",
  "why",
  "how",
  "who",
  "when",
  "where",
  "is",
  "are",
  "the",
  "a",
  "an",
  "of",
  "and",
  "or",
  "to",
  "in",
  "on",
  "for",
  "about",
  "does",
  "do",

  // French
  "le",
  "la",
  "les",
  "de",
  "des",
  "et",
  "ou",
  "pour",
  "dans",
  "est",

  // Arabic common words
  "ما",
  "هو",
  "هي",
  "من",
  "في",
  "عن",
  "و",
  "أو",
  "لماذا",
  "كيف"
]);


// ============================================================
// TOPIC DICTIONARY
//
// This is intentionally broad.
// It helps prevent unrelated knowledge rows from being mixed.
// ============================================================

const TOPICS = [

  {
    name: "mary",
    keywords: [
      "ማርያም",
      "ማርያ",
      "ድንግል",
      "እመቤታችን",
      "ቅድስት ድንግል",
      "የአምላክ እናት",
      "theotokos",
      "mary",
      "maria",
      "virgin mary",
      "mother of god",
      "ብፅዕት"
    ]
  },

  {
    name: "baptism",
    keywords: [
      "ጥምቀት",
      "መጠመቅ",
      "ተጠመቀ",
      "ሕፃን ጥምቀት",
      "child baptism",
      "baptism",
      "baptize",
      "በውሃ",
      "ዮሐንስ መጥምቁ"
    ]
  },

  {
    name: "cross",
    keywords: [
      "መስቀል",
      "የመስቀል",
      "መስቀሉ",
      "cross",
      "crucifixion",
      "ስቅለት",
      "ጎልጎታ"
    ]
  },

  {
    name: "eucharist",
    keywords: [
      "ቁርባን",
      "ቅዱስ ቁርባን",
      "ቅዱስ ሥጋ",
      "ደሙ",
      "ሥጋው",
      "communion",
      "eucharist",
      "holy communion"
    ]
  },

  {
    name: "faith",
    keywords: [
      "ሃይማኖት",
      "እምነት",
      "ኦርቶዶክስ",
      "ተዋሕዶ",
      "faith",
      "religion",
      "orthodox",
      "tawahido"
    ]
  },

  {
    name: "tabot",
    keywords: [
      "ታቦት",
      "ጽላት",
      "tabot",
      "ark",
      "ኪዳነ ምሕረት",
      "ታቦተ ጽዮን"
    ]
  },

  {
    name: "trinity",
    keywords: [
      "ሥላሴ",
      "አብ",
      "ወልድ",
      "መንፈስ ቅዱስ",
      "trinity",
      "father son holy spirit"
    ]
  },

  {
    name: "christ",
    keywords: [
      "ኢየሱስ",
      "ክርስቶስ",
      "ጌታ",
      "አዳኝ",
      "jesus",
      "christ",
      "savior",
      "messiah"
    ]
  },

  {
    name: "prayer",
    keywords: [
      "ጸሎት",
      "ጸልይ",
      "መጸለይ",
      "ምልጃ",
      "prayer",
      "pray",
      "intercession"
    ]
  },

  {
    name: "church",
    keywords: [
      "ቤተ ክርስቲያን",
      "ቤተክርስቲያን",
      "church",
      "ቅዱሳን",
      "saints"
    ]
  },

  {
    name: "scripture",
    keywords: [
      "መጽሐፍ ቅዱስ",
      "ቅዱሳት መጻሕፍት",
      "ሃያ ሰባት",
      "ሰማንያ አንድ",
      "bible",
      "scripture",
      "holy scripture"
    ]
  }
];


// ============================================================
// DETECT TOPICS
// ============================================================

function detectTopics(question) {

  const text =
    normalizeText(question);

  const found = [];

  for (const topic of TOPICS) {

    const matches =
      topic.keywords.filter(
        keyword =>
          text.includes(
            normalizeText(keyword)
          )
      );

    if (matches.length > 0) {

      found.push({
        name: topic.name,
        matches
      });
    }
  }

  return found;
}


// ============================================================
// ROW TEXT
// ============================================================

function rowText(row) {

  return normalizeText(
    [
      row.question,
      row.answer,
      row.language,
      row.category,
      row.education_level,
      row.bible_references,
      row.church_sources,
      row.comparison_group
    ]
      .filter(Boolean)
      .join(" ")
  );
}


// ============================================================
// SCORE ONE ROW
//
// Important:
// Topic relevance is weighted much more heavily than
// simple word overlap.
// This prevents unrelated answers from being mixed.
// ============================================================

function scoreRow(
  row,
  question,
  language
) {

  const qText =
    normalizeText(question);

  const qTokens =
    tokenize(question);

  const rText =
    rowText(row);

  if (!rText) {
    return 0;
  }

  let score = 0;

  // ----------------------------------------------------------
  // LANGUAGE
  // ----------------------------------------------------------

  const rowLanguage =
    normalizeLanguage(row.language);

  if (rowLanguage === language) {
    score += 18;
  }

  // ----------------------------------------------------------
  // EXACT QUESTION PHRASE
  // ----------------------------------------------------------

  const rowQuestion =
    normalizeText(row.question);

  if (
    rowQuestion &&
    qText.includes(rowQuestion)
  ) {
    score += 50;
  }

  if (
    rowQuestion &&
    rowQuestion.includes(qText)
  ) {
    score += 45;
  }

  // ----------------------------------------------------------
  // TOKEN OVERLAP
  // ----------------------------------------------------------

  for (const token of qTokens) {

    if (STOP_WORDS.has(token)) {
      continue;
    }

    if (rText.includes(token)) {
      score += 4;
    }

    // Prefix match helps with inflected words.
    if (
      token.length >= 4 &&
      rText
        .split(/\s+/)
        .some(
          word =>
            word.startsWith(token) ||
            token.startsWith(word)
        )
    ) {
      score += 2;
    }
  }

  // ----------------------------------------------------------
  // TOPIC MATCH
  // ----------------------------------------------------------

  const questionTopics =
    detectTopics(question);

  for (const topic of questionTopics) {

    let topicHit = false;

    for (const keyword of topic.keywords) {

      const k =
        normalizeText(keyword);

      if (
        k &&
        rText.includes(k)
      ) {
        topicHit = true;
        break;
      }
    }

    if (topicHit) {
      score += 35;
    }
  }

  // ----------------------------------------------------------
  // CATEGORY
  // ----------------------------------------------------------

  const category =
    normalizeText(row.category);

  for (const topic of questionTopics) {

    for (const keyword of topic.keywords) {

      if (
        category.includes(
          normalizeText(keyword)
        )
      ) {
        score += 12;
      }
    }
  }

  // ----------------------------------------------------------
  // SOURCE QUALITY
  // ----------------------------------------------------------

  if (row.bible_references) {
    score += 3;
  }

  if (row.church_sources) {
    score += 3;
  }

  // ----------------------------------------------------------
  // COMPARISON DATA
  // ----------------------------------------------------------

  if (row.comparison_group) {
    score += 2;
  }

  return score;
}


// ============================================================
// FETCH ALL SUPABASE ROWS
//
// Pagination prevents depending on Supabase's default row
// limit.
// ============================================================

async function getLessons() {

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is missing"
    );
  }

  const allRows = [];

  const pageSize = 500;

  let offset = 0;

  while (true) {

    const url =
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
      `?select=id,created_at,question,answer,language,category,education_level,bible_references,church_sources,comparison_group` +
      `&order=id.asc` +
      `&offset=${offset}` +
      `&limit=${pageSize}`;

    const response =
      await fetch(url, {

        method: "GET",

        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${SUPABASE_ANON_KEY}`,
          Accept:
            "application/json"
        }
      });

    if (!response.ok) {

      const body =
        await response.text();

      throw new Error(
        `Supabase ${response.status}: ${body}`
      );
    }

    const rows =
      await response.json();

    if (!Array.isArray(rows)) {
      break;
    }

    allRows.push(...rows);

    if (
      rows.length < pageSize
    ) {
      break;
    }

    offset += pageSize;
  }

  return allRows;
}


// ============================================================
// SELECT COHERENT ROWS
//
// Do not simply take the highest scores.
// Prefer rows belonging to the same detected topic.
// ============================================================

function selectCoherentRows(
  ranked,
  question,
  limit
) {

  if (!Array.isArray(ranked)) {
    return [];
  }

  const topics =
    detectTopics(question);

  const topicNames =
    new Set(
      topics.map(
        topic => topic.name
      )
    );

  // ----------------------------------------------------------
  // No topic detected
  // ----------------------------------------------------------

  if (topicNames.size === 0) {

    return ranked
      .slice(0, limit)
      .map(
        item => item.row
      );
  }

  // ----------------------------------------------------------
  // Topic-aware selection
  // ----------------------------------------------------------

  const topicRows = [];

  const generalRows = [];

  for (const item of ranked) {

    const text =
      rowText(item.row);

    let belongs = false;

    for (const topic of topics) {

      for (const keyword of topic.matches) {

        if (
          text.includes(
            normalizeText(keyword)
          )
        ) {
          belongs = true;
          break;
        }
      }

      if (belongs) {
        break;
      }
    }

    if (belongs) {
      topicRows.push(item);
    } else {
      generalRows.push(item);
    }
  }

  // Strongly prefer topic rows.
  return [
    ...topicRows,
    ...generalRows
  ]
    .slice(0, limit)
    .map(
      item => item.row
    );
}


// ============================================================
// BUILD SOURCES
// ============================================================

function buildSources(
  rows,
  limit
) {

  return rows
    .slice(0, limit)
    .map(row => ({

      question:
        row.question || "",

      answer:
        row.answer || "",

      language:
        normalizeLanguage(
          row.language
        ),

      category:
        row.category || "",

      education_level:
        row.education_level || "",

      bible_references:
        row.bible_references || "",

      church_sources:
        row.church_sources || "",

      comparison_group:
        row.comparison_group || ""
    }));
}


// ============================================================
// SOURCE FORMATTER
// ============================================================

function formatSources(
  sources
) {

  if (!sources.length) {

    return (
      "No direct knowledge-base entries were matched. " +
      "Do not invent citations or quotations."
    );
  }

  return sources
    .map(
      (source, index) => {

        return `
SOURCE ${index + 1}

Question:
${source.question}

Answer / Teaching:
${source.answer}

Language:
${source.language}

Category:
${source.category}

Education level:
${source.education_level}

Bible references:
${source.bible_references}

Church sources:
${source.church_sources}

Comparison group:
${source.comparison_group}
`;
      }
    )
    .join("\n-------------------------\n");
}


// ============================================================
// ANSWER LEVEL
// ============================================================

function normalizeAnswerLevel(
  value
) {

  const n =
    Number(value);

  if (
    n === 1 ||
    n === 2 ||
    n === 3
  ) {
    return n;
  }

  return 3;
}


// ============================================================
// ANSWER LENGTH INSTRUCTION
// ============================================================

function answerLengthInstruction(
  answerLevel
) {

  if (answerLevel === 1) {

    return `
Give a concise but complete answer.
Use clear sections where needed.
Do not become unnecessarily long.
`;
  }

  if (answerLevel === 2) {

    return `
Give a detailed answer.
Explain the doctrine clearly.
Include relevant Bible references and Church sources.
Use examples when they improve understanding.
`;
  }

  return `
Give a broad, deep, organized teaching suitable for
a reader from beginner/student level through educated
reader/scholar level.

Do NOT give a three-line answer.

Explain the subject progressively:
1. Direct answer
2. Definition
3. Detailed Orthodox teaching
4. Biblical foundation
5. Church Fathers / Orthodox scholars
6. Ethiopian Orthodox perspective when supported
7. Related doctrines
8. Comparison when relevant
9. Examples
10. Practical or spiritual meaning when appropriate
11. Conclusion

Keep every section connected to the actual question.
Do not mix unrelated topics.
`;
}


// ============================================================
// ORTHODOX SYSTEM INSTRUCTION
// ============================================================

function buildSystemInstruction(
  language,
  answerLevel
) {

  const lang =
    languageName(language);

  return `
You are the answer engine for the Ethiopian Orthodox
Tewahedo spiritual question-and-answer application
called "ኦርቶዶክሳዊ መልስ".

Your task is NOT to produce a short generic chatbot answer.

Your task is to produce a coherent, detailed, educational
Orthodox Christian answer to the user's actual question.

OUTPUT LANGUAGE:
${lang}

IMPORTANT LANGUAGE RULE:
Write the entire answer in ${lang}.
Do not switch to English unless the user explicitly asks.
Do not say that the language is unavailable.
If the knowledge-base sources are in another language,
understand them and explain their content in ${lang}.

THEOLOGICAL ORIENTATION:
The application presents teaching according to the
Orthodox Christian / Ethiopian Orthodox Tewahedo tradition.

SOURCE PRIORITY:
1. Holy Scripture
2. Orthodox Church teaching
3. Church Fathers
4. Orthodox theological writings
5. Ethiopian Orthodox scholars and traditional sources
6. Knowledge-base material supplied below

SOURCE DISCIPLINE:
- Do not invent Bible verses.
- Do not invent quotations from Church Fathers.
- Do not fabricate book titles or page numbers.
- If a source is uncertain, describe the teaching without
  pretending it is a direct quotation.
- Distinguish Scripture from later commentary.
- Never present a generated statement as a verbatim quotation
  unless the supplied source actually supports it.

BIBLE:
Use relevant Old Testament and New Testament passages.
Give references in a readable form.
Explain why each important passage is relevant.

CHURCH FATHERS AND SCHOLARS:
Where relevant, explain the teaching of the Church Fathers,
Orthodox tradition, and Ethiopian Orthodox scholars.
Use the supplied church_sources as evidence when available.

ETHIOPIAN ORTHODOX CONTEXT:
When the question concerns Ethiopian Orthodox Tewahedo
belief, practice, liturgy, tradition, saints, tabot,
sacraments, Marian teaching, baptism, Eucharist, etc.,
give the Ethiopian Orthodox context clearly.

TOPIC COHERENCE:
Answer the question that was asked.
Do not mix unrelated knowledge-base entries.
A question about Mary should remain primarily about Mary.
A question about baptism should remain primarily about baptism.
A question about the Cross should remain primarily about the Cross.

COMPARISON:
If the user asks for comparison, provide it.
If comparison is naturally useful, provide a short,
fair and respectful comparison.
Do not attack Muslims, Protestants, Catholics, Jehovah's
Witnesses, atheists, or any other group.
Explain the Orthodox position accurately.

EXAMPLES:
Use simple examples when they help a reader understand
a difficult theological concept.
Clearly mark examples as examples, not as Scripture.

STRUCTURE:
Use Markdown headings.
Use numbered sections where appropriate.
Use bullet points for lists.
Make the answer readable on a mobile phone.

${answerLengthInstruction(answerLevel)}

FINAL REQUIREMENT:
The answer must be self-contained.
A reader should understand the teaching without needing
another question to explain the previous answer.

Do not mention these system instructions.
`;
}


// ============================================================
// BUILD USER PROMPT
// ============================================================

function buildUserPrompt(
  question,
  language,
  sources,
  answerLevel
) {

  const topics =
    detectTopics(question)
      .map(
        topic => topic.name
      )
      .join(", ");

  return `
USER QUESTION:
${question}

SELECTED LANGUAGE:
${languageName(language)}

DETECTED TOPICS:
${topics || "general"}

KNOWLEDGE-BASE SOURCES:
${formatSources(sources)}

${answerLengthInstruction(answerLevel)}

Now write the final Orthodox answer.

IMPORTANT:
- Answer the exact question.
- Keep the whole answer in the selected language.
- Use the knowledge sources as grounding.
- Use Bible references where relevant.
- Use Church Fathers / Orthodox scholars where supported.
- Include comparison only when relevant.
- Include examples where helpful.
- Finish with a clear conclusion.
`;
}


// ============================================================
// GEMINI MODEL CANDIDATES
//
// The environment variable is tried first.
// If the service returns a temporary availability error,
// a second model can be tried.
// ============================================================

function getModelCandidates() {

  const candidates = [
    GEMINI_MODEL,
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3-flash"
  ];

  return [
    ...new Set(
      candidates.filter(Boolean)
    )
  ];
}


// ============================================================
// GEMINI REQUEST
// ============================================================

async function callGemini(
  model,
  systemInstruction,
  userPrompt
) {

  if (!GEMINI_API_KEY) {

    throw new Error(
      "GEMINI_API_KEY is missing"
    );
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response =
    await fetch(url, {

      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
        "x-goog-api-key":
          GEMINI_API_KEY
      },

      body: JSON.stringify({

        systemInstruction: {
          parts: [
            {
              text:
                systemInstruction
            }
          ]
        },

        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  userPrompt
              }
            ]
          }
        ],

        generationConfig: {

          temperature: 0.25,

          topP: 0.85,

          maxOutputTokens:
            7000
        }
      })
    });

  const raw =
    await response.text();

  let data = null;

  try {
    data =
      JSON.parse(raw);
  } catch (_) {
    data = null;
  }

  if (!response.ok) {

    const apiMessage =
      data?.error?.message ||
      raw ||
      `Gemini HTTP ${response.status}`;

    const error =
      new Error(
        `Gemini ${response.status}: ${apiMessage}`
      );

    error.status =
      response.status;

    throw error;
  }

  const answer =
    data?.candidates?.[0]
      ?.content
      ?.parts
      ?.map(
        part => part?.text || ""
      )
      .join("")
      .trim();

  if (!answer) {

    throw new Error(
      "Gemini returned an empty answer"
    );
  }

  return answer;
}


// ============================================================
// GENERATE WITH GEMINI
// ============================================================

async function generateWithGemini(
  question,
  language,
  sources,
  answerLevel
) {

  const systemInstruction =
    buildSystemInstruction(
      language,
      answerLevel
    );

  const userPrompt =
    buildUserPrompt(
      question,
      language,
      sources,
      answerLevel
    );

  let lastError = null;

  for (
    const model of getModelCandidates()
  ) {

    try {

      return await callGemini(
        model,
        systemInstruction,
        userPrompt
      );

    } catch (error) {

      lastError = error;

      console.error(
        `Gemini model ${model} failed:`,
        error?.message ||
        error
      );

      const status =
        Number(
          error?.status || 0
        );

      // Try another model only for
      // temporary/service/model errors.
      if (
        status !== 429 &&
        status !== 500 &&
        status !== 502 &&
        status !== 503 &&
        status !== 504
      ) {
        break;
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "Gemini generation failed"
    )
  );
}


// ============================================================
// FALLBACK ANSWER
//
// If Gemini is unavailable, return the best coherent
// knowledge-base answer rather than mixing unrelated topics.
// ============================================================

function fallbackAnswer(
  coherentRows,
  language
) {

  if (
    !Array.isArray(coherentRows) ||
    coherentRows.length === 0
  ) {
    return "";
  }

  const sameLanguageRows =
    coherentRows.filter(
      row =>
        normalizeLanguage(
          row.language
        ) === language
    );

  const rows =
    sameLanguageRows.length
      ? sameLanguageRows
      : coherentRows;

  const sections = [];

  sections.push(
    language === "am"
      ? "# ቀጥተኛ መልስ"
      : "# Answer"
  );

  for (
    const row of rows.slice(0, 5)
  ) {

    if (row.answer) {

      sections.push(
        row.answer.trim()
      );
    }

    if (
      row.bible_references
    ) {

      sections.push(
        language === "am"
          ? `\n**የመጽሐፍ ቅዱስ ማጣቀሻ፦** ${row.bible_references}`
          : `\n**Bible references:** ${row.bible_references}`
      );
    }

    if (
      row.church_sources
    ) {

      sections.push(
        language === "am"
          ? `\n**የቤተ ክርስቲያን ምንጮች፦** ${row.church_sources}`
          : `\n**Church sources:** ${row.church_sources}`
      );
    }
  }

  sections.push(
    language === "am"
      ? "\n# መደምደሚያ\n\nይህ መልስ ከተዛማጅ የኦርቶዶክሳዊ እውቀት ምንጮች የተመረጠ ነው።"
      : "\n# Conclusion\n\nThis answer is based on the closest available Orthodox knowledge sources."
  );

  return sections
    .filter(Boolean)
    .join("\n\n")
    .trim();
}


// ============================================================
// REQUEST VALIDATION
// ============================================================

function getBody(
  req
) {

  if (
    req &&
    typeof req.body === "object" &&
    req.body !== null
  ) {
    return req.body;
  }

  return {};
}


// ============================================================
// MAIN HANDLER
// ============================================================

module.exports = async function handler(
  req,
  res
) {

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
    "Content-Type"
  );

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(204)
      .end();
  }

  // ----------------------------------------------------------
  // METHOD
  // ----------------------------------------------------------

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({

        error:
          "Method not allowed. Use POST."
      });
  }

  try {

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

    const body =
      getBody(req);

    const question =
      String(
        body.question || ""
      ).trim();

    const language =
      normalizeLanguage(
        body.language || "am"
      );

    const answerLevel =
      normalizeAnswerLevel(
        body.answerLevel
      );

    // --------------------------------------------------------
    // QUESTION VALIDATION
    // --------------------------------------------------------

    if (!question) {

      return res
        .status(400)
        .json({

          error:
            "Please enter a question."
        });
    }

    if (
      question.length >
      MAX_QUESTION_LENGTH
    ) {

      return res
        .status(400)
        .json({

          error:
            "Question is too long."
        });
    }

    // --------------------------------------------------------
    // LOAD SUPABASE
    // --------------------------------------------------------

    const loadedRows =
      await getLessons();

    const rows =
      Array.isArray(
        loadedRows
      )
        ? loadedRows
        : [];

    // --------------------------------------------------------
    // RANK
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // SOURCE LIMIT
    // --------------------------------------------------------

    const sourceLimit =
      answerLevel === 1
        ? 6
        : answerLevel === 2
        ? 10
        : 14;

    // --------------------------------------------------------
    // TOPIC COHERENCE
    // --------------------------------------------------------

    const coherentRows =
      selectCoherentRows(
        ranked,
        question,
        sourceLimit
      );

    // --------------------------------------------------------
    // SOURCES
    // --------------------------------------------------------

    const selected =
      buildSources(
        coherentRows,
        sourceLimit
      );

    // --------------------------------------------------------
    // GENERATION
    // --------------------------------------------------------

    let answer = "";

    let generationUsed =
      false;

    let generationErrorMessage =
      "";

    if (GEMINI_API_KEY) {

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

        generationErrorMessage =
          generationError?.message ||
          String(generationError);

        console.error(
          "Gemini generation failed:",
          generationErrorMessage
        );

        answer =
          fallbackAnswer(
            coherentRows,
            language
          );
      }

    } else {

      console.warn(
        "GEMINI_API_KEY is not configured."
      );

      answer =
        fallbackAnswer(
          coherentRows,
          language
        );
    }

    // --------------------------------------------------------
    // NO ANSWER
    // --------------------------------------------------------

    if (!answer) {

      return res
        .status(503)
        .json({

          error:
            "The answer service is temporarily unavailable.",

          matchedCount:
            ranked.length,

          coherentCount:
            coherentRows.length,

          usedKnowledgeSources:
            selected.length,

          generationUsed:
            false
        });
    }

    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return res
      .status(200)
      .json({

        answer,

        language,

        languageName:
          languageName(language),

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
          coherentRows.length,

        usedKnowledgeSources:
          selected.length,

        generationUsed,

        // Do NOT expose the actual Gemini error
        // to the public browser response.
        generationFallback:
          !generationUsed,

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
                source.comparison_group,

              language:
                source.language
            })
          )
      });

  } catch (error) {

    // --------------------------------------------------------
    // SERVER ERROR
    // --------------------------------------------------------

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
