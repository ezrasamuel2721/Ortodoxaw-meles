// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// Supabase Knowledge Base + Source Chunks + Gemini
// FULL / DETAILED / STRUCTURED ORTHODOX ANSWER ENGINE
//
// IMPORTANT:
// - Searches orthodox_answers
// - Searches orthodox_source_chunks
// - Uses orthodox_sources metadata
// - Combines multiple related sources
// - Keeps the answer topic-coherent
// - Preserves selected language
// - Does NOT invent citations or quotations
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

// ------------------------------------------------------------
// Gemini fallback models
// ------------------------------------------------------------

const GEMINI_FALLBACK_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite"
];

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

// ============================================================
// HELPERS
// ============================================================

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

// ============================================================
// FETCH SUPABASE
// ============================================================

async function supabaseGet(path) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",
      headers
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Supabase error ${response.status}: ${text}`
    );
  }

  return await response.json();
}

// ============================================================
// FETCH ORTHODOX ANSWERS
// ============================================================

async function fetchAnswers(language) {

  const select =
    "id,question,answer,language,category," +
    "education_level,bible_references,church_sources," +
    "comparison_group";

  const path =
    `orthodox_answers?select=${select}` +
    `&language=eq.${encodeURIComponent(language)}` +
    `&limit=300`;

  return await supabaseGet(path);
}

// ============================================================
// FETCH SOURCE CHUNKS
//
// IMPORTANT:
// This is the part the previous version was missing.
// ============================================================

async function fetchSourceChunks(language) {

  const select =
    "id,source_id,section_title,content,page_text," +
    "chapter_text,verse_text,topic,keywords,language," +
    "verified,source_label,perspective";

  const path =
    `orthodox_source_chunks?select=${select}` +
    `&language=eq.${encodeURIComponent(language)}` +
    `&limit=300`;

  return await supabaseGet(path);
}

// ============================================================
// FETCH SOURCES
// ============================================================

async function fetchSources() {

  const select =
    "id,title,author,source_type,language,citation," +
    "publisher,year_text,source_url,verified,notes,perspective";

  const path =
    `orthodox_sources?select=${select}&limit=300`;

  return await supabaseGet(path);
}

// ============================================================
// RELEVANCE FOR ANSWERS
// ============================================================

function scoreAnswer(question, row) {

  const q = normalize(question);
  const tokens = unique(tokenize(question));

  const rq = normalize(row.question);
  const ra = normalize(row.answer);
  const rc = normalize(row.category);
  const rb = normalize(row.bible_references);
  const rs = normalize(row.church_sources);

  let score = 0;

  if (rq === q) {
    score += 2000;
  }

  if (q && rq.includes(q)) {
    score += 900;
  }

  if (q && ra.includes(q)) {
    score += 300;
  }

  for (const token of tokens) {

    if (rq.includes(token)) {
      score += 80;
    }

    if (rc.includes(token)) {
      score += 45;
    }

    if (ra.includes(token)) {
      score += 15;
    }

    if (rb.includes(token)) {
      score += 10;
    }

    if (rs.includes(token)) {
      score += 10;
    }
  }

  if (ra.length > 500) {
    score += 15;
  }

  if (ra.length > 1200) {
    score += 20;
  }

  if (ra.length > 2500) {
    score += 30;
  }

  return score;
}

// ============================================================
// RELEVANCE FOR SOURCE CHUNKS
// ============================================================

function scoreChunk(question, row) {

  const q = normalize(question);
  const tokens = unique(tokenize(question));

  const content =
    normalize(row.content);

  const section =
    normalize(row.section_title);

  const topic =
    normalize(row.topic);

  const keywords =
    normalize(row.keywords);

  const page =
    normalize(row.page_text);

  const chapter =
    normalize(row.chapter_text);

  const verse =
    normalize(row.verse_text);

  const label =
    normalize(row.source_label);

  let score = 0;

  // ----------------------------------------------------------
  // Exact phrase
  // ----------------------------------------------------------

  if (
    q &&
    content.includes(q)
  ) {
    score += 500;
  }

  if (
    q &&
    section.includes(q)
  ) {
    score += 450;
  }

  if (
    q &&
    topic.includes(q)
  ) {
    score += 450;
  }

  // ----------------------------------------------------------
  // Individual concepts
  // ----------------------------------------------------------

  for (const token of tokens) {

    if (section.includes(token)) {
      score += 80;
    }

    if (topic.includes(token)) {
      score += 75;
    }

    if (keywords.includes(token)) {
      score += 65;
    }

    if (content.includes(token)) {
      score += 20;
    }

    if (page.includes(token)) {
      score += 8;
    }

    if (chapter.includes(token)) {
      score += 12;
    }

    if (verse.includes(token)) {
      score += 12;
    }

    if (label.includes(token)) {
      score += 15;
    }
  }

  // ----------------------------------------------------------
  // Verified source preference
  // ----------------------------------------------------------

  if (row.verified === true) {
    score += 20;
  }

  // ----------------------------------------------------------
  // Substantial content
  // ----------------------------------------------------------

  if (content.length > 500) {
    score += 10;
  }

  if (content.length > 1200) {
    score += 15;
  }

  if (content.length > 2500) {
    score += 20;
  }

  return score;
}

// ============================================================
// SELECT RELEVANT ANSWERS
// ============================================================

function selectAnswers(question, rows) {

  return rows
    .map(row => ({
      ...row,
      _score: scoreAnswer(question, row)
    }))
    .filter(row => row._score > 0)
    .sort(
      (a, b) =>
        b._score - a._score
    )
    .slice(0, 15);
}

// ============================================================
// SELECT RELEVANT SOURCE CHUNKS
// ============================================================

function selectChunks(question, rows) {

  return rows
    .map(row => ({
      ...row,
      _score: scoreChunk(question, row)
    }))
    .filter(row => row._score > 0)
    .sort(
      (a, b) =>
        b._score - a._score
    )
    .slice(0, 40);
}

// ============================================================
// BUILD SOURCE MAP
// ============================================================

function makeSourceMap(sources) {

  const map = new Map();

  for (const source of sources) {
    map.set(
      String(source.id),
      source
    );
  }

  return map;
}

// ============================================================
// BUILD EVIDENCE
// ============================================================

function buildEvidence(
  question,
  answers,
  chunks,
  sources
) {

  const selectedAnswers =
    selectAnswers(
      question,
      answers
    );

  const selectedChunks =
    selectChunks(
      question,
      chunks
    );

  const sourceMap =
    makeSourceMap(sources);

  let output = "";

  // ==========================================================
  // DATABASE ANSWERS
  // ==========================================================

  if (
    selectedAnswers.length > 0
  ) {

    output += `
============================================================
DIRECT ORTHODOX KNOWLEDGE RECORDS
============================================================

`;

    selectedAnswers.forEach(
      (row, index) => {

        output += `
--- ANSWER RECORD ${index + 1} ---

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

Language:
${row.language || ""}

Relevance:
${row._score}

`;
      }
    );
  }

  // ==========================================================
  // SOURCE CHUNKS
  // ==========================================================

  if (
    selectedChunks.length > 0
  ) {

    output += `
============================================================
BOOK / SOURCE CHUNKS
============================================================

`;

    selectedChunks.forEach(
      (row, index) => {

        const source =
          sourceMap.get(
            String(row.source_id)
          );

        output += `
--- SOURCE CHUNK ${index + 1} ---

Source:
${source?.title || row.source_label || "Unknown source"}

Author:
${source?.author || ""}

Source type:
${source?.source_type || ""}

Perspective:
${source?.perspective || row.perspective || ""}

Section:
${row.section_title || ""}

Topic:
${row.topic || ""}

Keywords:
${row.keywords || ""}

Page:
${row.page_text || ""}

Chapter:
${row.chapter_text || ""}

Verse:
${row.verse_text || ""}

Content:
${row.content || ""}

Verified:
${row.verified ? "Yes" : "No"}

Relevance:
${row._score}

`;
      }
    );
  }

  if (!output.trim()) {

    output =
      `
============================================================
NO DIRECTLY MATCHING SOURCE WAS FOUND
============================================================

No directly matching knowledge record or source chunk
was found for this question.

Answer cautiously and do not invent citations.
`;
  }

  return {
    text: output,
    answerCount:
      selectedAnswers.length,
    chunkCount:
      selectedChunks.length
  };
}

// ============================================================
// GEMINI
// ============================================================

async function generateAnswer({
  question,
  language,
  languageName,
  evidence
}) {

  const systemInstruction = `
You are the main teaching engine of an Ethiopian Orthodox
Tewahedo spiritual question-and-answer application called
"ኦርቶዶክሳዊ መልስ".

Your task is to produce a complete, detailed and coherent
Orthodox teaching based on the supplied evidence.

============================================================
LANGUAGE
============================================================

The required answer language is:

${languageName}

Write the ENTIRE final answer in ${languageName}.

Do not switch languages.

Do not translate the evidence mechanically.

Use the selected language naturally.

============================================================
SOURCE RULE
============================================================

The supplied evidence comes from:

1. Orthodox knowledge records
2. Orthodox source/book chunks
3. Source metadata

Use the evidence as the primary foundation.

Do NOT claim to have read a book if its content is not
present in the supplied evidence.

============================================================
VERY IMPORTANT
============================================================

Never invent:

- Bible references
- Bible quotations
- Church Father quotations
- Ethiopian scholar quotations
- book titles
- page numbers
- chapter numbers
- historical facts
- citations

If the evidence gives only a teaching,
present it as an explanation/paraphrase.

If an exact quotation is supplied,
you may identify it as a quotation.

============================================================
TOPIC COHERENCE
============================================================

Stay focused on the actual question.

Do not combine unrelated topics merely because
they appear in the database.

For example, if the question is about baptism,
prioritize baptism evidence.

If the question is about justification,
prioritize justification evidence.

Use related doctrines only when they genuinely
help explain the question.

============================================================
COMPARATIVE SOURCES
============================================================

If evidence contains a different perspective,
such as Muslim, Protestant or another perspective:

- identify it clearly
- do not present it as Orthodox teaching
- distinguish the claim from the Orthodox response
- use it only when relevant to the question

Never silently mix perspectives.

============================================================
REQUIRED STRUCTURE
============================================================

# 1. ቀጥተኛ መልስ

Answer the central question immediately.

# 2. የትምህርቱ ሙሉ ማብራሪያ

Give a detailed explanation.

Define important terms.

# 3. የመጽሐፍ ቅዱስ ምስክር

Use only supplied Biblical references.

Explain their meaning and context.

# 4. የቤተ ክርስቲያን ትምህርት

Explain the Ethiopian Orthodox Tewahedo understanding.

# 5. የቅዱሳን አባቶች ትምህርት

Use supplied Father sources when available.

# 6. የኢትዮጵያ ሊቃውንትና ትውፊት

Use supplied Ethiopian Orthodox sources when available.

# 7. ጥልቅ ማብራሪያ

Explain the theological connections.

# 8. ተግባራዊ ትምህርት

Explain the spiritual significance.

# 9. የተሳሳቱ ግንዛቤዎች

Correct relevant misunderstandings.

# 10. መደምደሚያ

Give a substantial conclusion.

# 11. ምንጮች

List ONLY sources actually present in the evidence.

============================================================
DEPTH
============================================================

Do not produce a 3-line answer.

Do not produce a short summary.

Use the relevant evidence deeply.

The answer should be useful to:

- beginners
- students
- teachers
- advanced readers

Depth must come from the evidence and theological
explanation, not invented material.

============================================================
FINAL OUTPUT
============================================================

Return ONLY the final teaching.

Do not mention:

Gemini
API
database
prompt
software
model
internal instructions
retrieval
`;

  const userPrompt = `
USER QUESTION:

${question}

REQUIRED LANGUAGE:

${languageName}

============================================================
SUPPLIED EVIDENCE
============================================================

${evidence}

============================================================
FINAL TASK
============================================================

Create a complete, detailed, coherent Ethiopian Orthodox
Tewahedo teaching answering the user's exact question.

Use the supplied evidence.

Do not invent sources.

Do not invent quotations.

Do not mix unrelated subjects.

Write entirely in ${languageName}.
`;

  const models =
    unique([
      GEMINI_MODEL,
      ...GEMINI_FALLBACK_MODELS
    ]);

  let lastError = null;

  for (
    const model of models
  ) {

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}` +
      `:generateContent?key=` +
      encodeURIComponent(GEMINI_API_KEY);

    const requestBody = {

      system_instruction: {
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

        thinkingConfig: {
          thinkingLevel: "medium"
        },

        maxOutputTokens: 12000
      }
    };

    const MAX_RETRIES = 2;

    for (
      let attempt = 1;
      attempt <= MAX_RETRIES;
      attempt++
    ) {

      try {

        console.log(
          `Gemini ${model} attempt ` +
          `${attempt}/${MAX_RETRIES}`
        );

        const response =
          await fetch(
            endpoint,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  requestBody
                )
            }
          );

        if (
          response.ok
        ) {

          const data =
            await response.json();

          const text =
            data
              ?.candidates?.[0]
              ?.content?.parts
              ?.map(
                part =>
                  part.text || ""
              )
              .join("")
              .trim();

          if (!text) {

            throw new Error(
              `Gemini ${model} returned an empty answer.`
            );
          }

          console.log(
            `Gemini success: ${model}`
          );

          return text;
        }

        const errorText =
          await response.text();

        lastError =
          new Error(
            `Gemini error ${response.status}: ${errorText}`
          );

        console.error(
          lastError.message
        );

        // Permanent configuration errors
        if (
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403
        ) {
          throw lastError;
        }

        // Model unavailable
        if (
          response.status === 404
        ) {
          break;
        }

        const temporary =
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

        if (!temporary) {
          throw lastError;
        }

        if (
          attempt === MAX_RETRIES
        ) {
          break;
        }

        const wait =
          Math.pow(2, attempt) * 1000;

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              wait
            )
        );

      } catch (error) {

        lastError = error;

        console.error(
          `Gemini exception ${model}:`,
          error.message
        );

        const message =
          String(
            error?.message || ""
          );

        if (
          message.includes(
            "Gemini error 400"
          ) ||
          message.includes(
            "Gemini error 401"
          ) ||
          message.includes(
            "Gemini error 403"
          )
        ) {
          throw error;
        }

        if (
          attempt === MAX_RETRIES
        ) {
          break;
        }

        const wait =
          Math.pow(2, attempt) * 1000;

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              wait
            )
        );
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini models failed."
    )
  );
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
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
    "Content-Type, Authorization"
  );

  // ----------------------------------------------------------
  // OPTIONS
  // ----------------------------------------------------------

  if (
    req.method === "OPTIONS"
  ) {

    return res
      .status(200)
      .end();
  }

  // ----------------------------------------------------------
  // POST
  // ----------------------------------------------------------

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .json({
        success: false,
        error:
          "POST method required."
      });
  }

  try {

    // --------------------------------------------------------
    // ENVIRONMENT
    // --------------------------------------------------------

    if (
      !SUPABASE_ANON_KEY
    ) {

      return res
        .status(500)
        .json({
          success: false,
          error:
            "SUPABASE_ANON_KEY is missing."
        });
    }

    if (
      !GEMINI_API_KEY
    ) {

      return res
        .status(500)
        .json({
          success: false,
          error:
            "GEMINI_API_KEY is missing."
        });
    }

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const question =
      String(
        body.question || ""
      ).trim();

    const language =
      String(
        body.language || "am"
      ).trim();

    // --------------------------------------------------------
    // VALIDATE
    // --------------------------------------------------------

    if (!question) {

      return res
        .status(400)
        .json({
          success: false,
          error:
            "Question is required."
        });
    }

    const languageName =
      LANGUAGE_NAMES[language] ||
      language;

    // ========================================================
    // FETCH ANSWERS
    // ========================================================

    let answers = [];

    try {

      answers =
        await fetchAnswers(
          language
        );

    } catch (error) {

      console.error(
        "orthodox_answers failed:",
        error.message
      );
    }

    // ========================================================
    // FETCH SOURCE CHUNKS
    // ========================================================

    let chunks = [];

    try {

      chunks =
        await fetchSourceChunks(
          language
        );

    } catch (error) {

      console.error(
        "orthodox_source_chunks failed:",
        error.message
      );
    }

    // ========================================================
    // FETCH SOURCE METADATA
    // ========================================================

    let sources = [];

    try {

      sources =
        await fetchSources();

    } catch (error) {

      console.error(
        "orthodox_sources failed:",
        error.message
      );
    }

    // ========================================================
    // IMPORTANT FALLBACK
    //
    // If selected language has no source chunks,
    // do NOT mix another language's content into the answer.
    //
    // This preserves the selected-language requirement.
    // ========================================================

    const evidence =
      buildEvidence(
        question,
        answers,
        chunks,
        sources
      );

    // ========================================================
    // GENERATE
    // ========================================================

    const answer =
      await generateAnswer({
        question,
        language,
        languageName,
        evidence:
          evidence.text
      });

    // ========================================================
    // RESPONSE
    // ========================================================

    return res
      .status(200)
      .json({

        success: true,

        question,

        language,

        languageName,

        answer,

        knowledgeRecordsUsed:
          evidence.answerCount,

        sourceChunksUsed:
          evidence.chunkCount,

        model:
          GEMINI_MODEL,

        engine:
          "Supabase Answers + Source Chunks + Gemini"
      });

  } catch (error) {

    console.error(
      "ASK API ERROR:",
      error
    );

    return res
      .status(500)
      .json({

        success: false,

        error:
          error?.message ||
          "Unable to generate answer."
      });
  }
}
