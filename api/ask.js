// Vercel Serverless Function: api/ask.js
// Ortodoxaw-meles — Orthodox Answer Engine
// Supabase knowledge retrieval + structured theological answer generation

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlem5la3JwZHVicGdzZWdzZWVyIiwicm9sZSI6MTc5MDAyNTI1NiwiaWF0IjoxNzkwMDI1MjU2LCJleHAiOjIxMDA2MDEyNTZ9.spxmqIhfeHPjD4SXI8mT9CY611-_0Mw3w7RoRloYPkQ";

/*
 * Keep the model configurable from Vercel.
 * If GEMINI_MODEL is set, it is tried first.
 * The fallback list is intentionally conservative.
 */
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash"
].filter((v, i, a) => v && a.indexOf(v) === i);

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
        .filter(w => w.length >= 2)
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

/* -------------------------------------------------------
   LANGUAGE MATCHING
------------------------------------------------------- */

function languageMatches(rowLang, requestedLang) {
  const rl = normalize(rowLang);
  const aliases = {
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

  return aliases[requestedLang]?.includes(rl) || rl === requestedLang;
}

/* -------------------------------------------------------
   QUERY SCORING
------------------------------------------------------- */

function scoreRow(row, query, requestedLanguage) {
  const q = normalize(query);
  const qWords = words(query);

  const question = normalize(rowQuestion(row));
  const answer = normalize(rowAnswer(row));
  const category = normalize(row.category);
  const education = normalize(row.education_level);
  const bible = normalize(row.bible_references);
  const church = normalize(row.church_sources);
  const comparison = normalize(row.comparison_group);

  if (!question && !answer) return 0;

  const fields = [
    question,
    answer,
    category,
    education,
    bible,
    church,
    comparison
  ];

  let score = 0;

  // Exact question is extremely strong.
  if (question === q) score += 3000;

  // The question field is much more important than lesson body text.
  if (q && question.includes(q)) score += 1400;

  if (q && q.includes(question) && question.length > 3) {
    score += 500;
  }

  // Category match.
  if (q && category.includes(q)) {
    score += 700;
  }

  let questionHits = 0;
  let totalHits = 0;

  for (const word of qWords) {
    let hit = false;

    if (question.includes(word)) {
      score += 150;
      questionHits++;
      hit = true;
    }

    if (category.includes(word)) {
      score += 90;
      hit = true;
    }

    if (answer.includes(word)) {
      score += 35;
      hit = true;
    }

    if (education.includes(word)) {
      score += 15;
      hit = true;
    }

    if (bible.includes(word)) {
      score += 25;
      hit = true;
    }

    if (church.includes(word)) {
      score += 25;
      hit = true;
    }

    if (comparison.includes(word)) {
      score += 12;
      hit = true;
    }

    if (hit) totalHits++;
  }

  // Reward records where many query terms are actually represented.
  if (qWords.length) {
    score += Math.round(
      (totalHits / qWords.length) * 180
    );
  }

  // Strongly prefer exact requested language.
  if (languageMatches(rowLanguage(row), requestedLanguage)) {
    score += 500;
  }

  /*
   * Penalize a record when only the long answer body matched,
   * but its question/category did not.
   *
   * This prevents unrelated lessons from being mixed into the answer.
   */
  if (
    qWords.length >= 2 &&
    questionHits === 0 &&
    totalHits <= Math.ceil(qWords.length / 2)
  ) {
    score -= 180;
  }

  return Math.max(0, score);
}

/* -------------------------------------------------------
   SUPABASE
------------------------------------------------------- */

async function supabaseGet(path) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
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
      `Supabase error ${response.status}`
    );
  }

  return data;
}

async function getLessons() {
  const columns = [
    "id",
    "question",
    "answer",
    "language",
    "category",
    "education_level",
    "bible_references",
    "church_sources",
    "comparison_group"
  ].join(",");

  const path =
    `orthodox_answers?select=${encodeURIComponent(columns)}&limit=500`;

  return await supabaseGet(path);
}

/* -------------------------------------------------------
   SOURCE PREPARATION
------------------------------------------------------- */

function buildSources(ranked, limit) {
  return ranked
    .slice(0, limit)
    .map(({ row }) => ({
      question: cleanText(rowQuestion(row)),
      category: cleanText(row.category),
      education_level: cleanText(row.education_level),
      bible_references: cleanText(row.bible_references),
      church_sources: cleanText(row.church_sources),
      comparison_group: cleanText(row.comparison_group),
      language: cleanText(rowLanguage(row)),
      answer: cleanText(rowAnswer(row)).slice(0, 7000)
    }));
}

function sourceText(sources) {
  return sources
    .map((s, i) => {
      return [
        `SOURCE ${i + 1}`,
        `Question: ${s.question}`,
        `Language: ${s.language}`,
        `Category: ${s.category}`,
        `Education level: ${s.education_level}`,
        `Bible references: ${s.bible_references}`,
        `Church sources: ${s.church_sources}`,
        `Comparison group: ${s.comparison_group}`,
        `Lesson text: ${s.answer}`
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/* -------------------------------------------------------
   ANSWER DEPTH
------------------------------------------------------- */

function levelConfig(level) {
  const n = Number(level) || 2;

  if (n === 1) {
    return {
      name: "Basic",
      length: "normally 500–800 words when the subject requires explanation",
      focus:
        "Give a clear foundation. Answer the question directly, explain the essential Orthodox teaching, give the main biblical basis, and finish with a practical conclusion."
    };
  }

  if (n === 3) {
    return {
      name: "Scholarly",
      length: "normally 1800–3000 words when the subject requires depth",
      focus:
        "Give a serious theological study. Explain definitions and distinctions; connect relevant Old and New Testament evidence; discuss Church Fathers and Ethiopian Orthodox Tewahedo tradition when supported by the supplied material; address doctrinal context, common misunderstandings and relevant opposing interpretations; and conclude carefully."
    };
  }

  return {
    name: "Detailed",
    length: "normally 1000–1800 words when the subject requires depth",
    focus:
      "Give a complete teaching suitable for a serious learner. Explain the meaning, theological basis, biblical foundation, Orthodox interpretation, relevant tradition, spiritual significance, practical application and important distinctions."
  };
}

/* -------------------------------------------------------
   SYSTEM INSTRUCTION
------------------------------------------------------- */

function systemInstruction(languageName, answerLevel) {
  const level = levelConfig(answerLevel);

  return `
You are the scholarly theological answer engine inside
the Ethiopian Orthodox Tewahedo spiritual Q&A application
called "ኦርቶዶክሳዊ መልስ".

FINAL LANGUAGE:
Write the entire final answer ONLY in ${languageName}.

Never switch to another language.
Do not answer in English unless English was explicitly selected.
Do not include untranslated headings from another language.

ANSWER DEPTH:
${level.name}

Target length:
${level.length}

Depth requirement:
${level.focus}

MOST IMPORTANT RULE:
Answer the user's EXACT question.
Do not mix unrelated lessons merely because they contain one common word.

KNOWLEDGE RULE:
The supplied Supabase knowledge-base material is the primary source.
Use it as the foundation of the answer.

SOURCE DISCIPLINE:
- Do not invent Bible references.
- Do not invent quotations.
- Do not invent Church Fathers.
- Do not invent Ethiopian scholars.
- Do not invent book titles.
- Do not invent page numbers.
- Do not invent historical claims.
- Do not attribute a teaching to a source unless the supplied material supports it.
- If a detail cannot be established from the supplied material, explain it cautiously instead of pretending certainty.

ORTHODOX THEOLOGICAL STYLE:
Present the teaching from the perspective of
the Ethiopian Orthodox Tewahedo Church.

When relevant, distinguish:
1. Biblical teaching
2. Apostolic teaching
3. Church tradition
4. Theological explanation
5. Practical spiritual application

When relevant, connect:
- Old Testament
- New Testament
- Apostolic teaching
- Early Church Fathers
- Ethiopian Orthodox Tewahedo tradition
- Ethiopian scholars and traditional texts

But include these only when relevant and supported.

STRUCTURE:
Use a clear structure such as:

### መግቢያ / Introduction

### የቃሉ ትርጉም / Meaning

### ዋና የኦርቶዶክስ ትምህርት

### የመጽሐፍ ቅዱስ መሠረት

### የሐዋርያትና የቅዱሳን አበው ትምህርት
(only when relevant)

### የኢትዮጵያ ተዋሕዶ ትውፊት
(only when supported)

### ማብራሪያና ምሳሌ

### መደምደሚያ

You do not have to use every heading.
Use only headings that fit the actual question.

QUALITY:
- Do not produce a three-line answer for a theological question that requires explanation.
- Do not repeat the same idea just to make the answer longer.
- Increase depth through explanation, evidence, distinctions and examples.
- Keep paragraphs readable.
- Use numbered lists when explaining several points.
- Use Bible references naturally.
- Quote Scripture only when confident about the wording supplied or reliably known.
- If exact quotation wording is uncertain, give the reference and paraphrase rather than fabricate a quotation.

COMPARATIVE QUESTIONS:
If the user asks about Islam, Protestantism, Catholicism,
Jehovah's Witnesses, "Only Jesus", atheism or another belief:
- explain the Orthodox Tewahedo position clearly;
- accurately describe the other position when supported;
- do not insult or attack people;
- focus on theological differences.

IMPORTANT:
Never mention:
AI
Gemini
model
API
Supabase
database
prompt
retrieval
system instruction
knowledge base
internal service

The answer must read like a carefully prepared Orthodox theological lesson,
not like a chatbot response.

Finish with a meaningful conclusion.
`;
}

/* -------------------------------------------------------
   GEMINI
------------------------------------------------------- */

function extractGeminiText(data) {
  const candidates = data?.candidates || [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];

    const text = parts
      .map(part => part?.text || "")
      .join("\n")
      .trim();

    if (text) return text;
  }

  return "";
}

async function generateWithGemini(
  question,
  language,
  sources,
  answerLevel
) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured in Vercel."
    );
  }

  const languageName =
    LANGUAGE_NAMES[language] ||
    LANGUAGE_NAMES.am;

  const instruction =
    systemInstruction(
      languageName,
      answerLevel
    );

  const material = sourceText(sources);

  if (!material.trim()) {
    throw new Error(
      "No relevant knowledge source was found."
    );
  }

  let lastError = null;

  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: instruction
                }
              ]
            },

            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      `USER QUESTION:\n${question}\n\n` +
                      `RELEVANT TEACHING MATERIAL:\n${material}`
                  }
                ]
              }
            ],

            generationConfig: {
              temperature: 0.25,
              topP: 0.9,
              maxOutputTokens: 6500,
              responseMimeType: "text/plain"
            }
          })
        }
      );

      const raw = await response.text();

      let data = null;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (response.ok) {
        const answer = extractGeminiText(data);

        if (answer) {
          return answer.trim();
        }

        lastError =
          new Error(
            "The answer service returned no text."
          );

        continue;
      }

      lastError =
        new Error(
          data?.error?.message ||
          `Answer service error ${response.status}`
        );

      /*
       * Try another configured model when the current
       * model is temporarily unavailable.
       */
      if (
        ![
          404,
          429,
          500,
          502,
          503,
          504
        ].includes(response.status)
      ) {
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Unable to generate an answer."
    )
  );
}

/* -------------------------------------------------------
   STRUCTURED FALLBACK
------------------------------------------------------- */

function fallbackAnswer(
  ranked,
  language,
  question
) {
  if (!ranked.length) return "";

  const sameLanguage = ranked.filter(
    item =>
      languageMatches(
        rowLanguage(item.row),
        language
      )
  );

  const usable =
    sameLanguage.length > 0
      ? sameLanguage
      : ranked;

  const selected = usable
    .slice(0, 3)
    .map(item => item.row);

  const main = selected[0];

  const mainAnswer = cleanText(
    rowAnswer(main)
  );

  if (!mainAnswer) return "";

  /*
   * If the requested language is different from the
   * source language, do not pretend that the fallback
   * translated the answer.
   */
  const sourceLang =
    rowLanguage(main);

  if (
    !languageMatches(
      sourceLang,
      language
    )
  ) {
    return mainAnswer;
  }

  let output =
    `### መሠረታዊ መልስ\n\n${mainAnswer}`;

  const extra = selected
    .slice(1)
    .map(row => cleanText(rowAnswer(row)))
    .filter(Boolean);

  if (extra.length) {
    output +=
      `\n\n### ተጨማሪ ማብራሪያ\n\n` +
      extra.join("\n\n");
  }

  output +=
    `\n\n### መደምደሚያ\n\n` +
    `ይህ ማብራሪያ በተገኘው የቤተክርስቲያን ትምህርት መሠረት የቀረበ ነው።`;

  return output;
}

/* -------------------------------------------------------
   MAIN HANDLER
------------------------------------------------------- */

module.exports = async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};

    const question =
      cleanText(body.question);

    const language =
      cleanText(
        body.language || "am"
      ).toLowerCase();

    const answerLevel =
      [1, 2, 3].includes(
        Number(body.answerLevel)
      )
        ? Number(body.answerLevel)
        : 2;

    if (!question) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    if (question.length > 5000) {
      return res.status(400).json({
        error: "Question is too long"
      });
    }

    /*
     * 1. Load the complete current knowledge set.
     */
    const loadedRows =
      await getLessons();

    const rows =
      Array.isArray(loadedRows)
        ? loadedRows
        : [];

    /*
     * 2. Rank all lessons.
     */
    const ranked = rows
      .map(row => ({
        row,
        score: scoreRow(
          row,
          question,
          language
        )
      }))
      .filter(item => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score
      );

    /*
     * 3. Do not feed a huge number of unrelated
     * records to Gemini.
     */
    const sourceLimit =
      answerLevel === 1
        ? 5
        : answerLevel === 3
          ? 10
          : 7;

    const selected =
      buildSources(
        ranked,
        sourceLimit
      );

    /*
     * 4. Generate the complete answer.
     */
    let answer = "";

    try {
      answer =
        await generateWithGemini(
          question,
          language,
          selected,
          answerLevel
        );
    } catch (generationError) {
      console.error(
        "Answer generation failed:",
        generationError
      );

      /*
       * 5. If Gemini is temporarily unavailable,
       * return the best relevant Supabase material
       * instead of a completely unrelated response.
       */
      answer =
        fallbackAnswer(
          ranked,
          language,
          question
        );
    }

    if (!answer) {
      return res.status(503).json({
        error:
          "ለዚህ ጥያቄ በቂ የተዛመደ የትምህርት ምንጭ አልተገኘም።"
      });
    }

    return res.status(200).json({
      answer,
      language,
      answerLevel,

      sources: selected.map(
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
            source.comparison_group
        })
      ),

      matchedCount:
        selected.length
    });
  } catch (error) {
    console.error(
      "/api/ask error:",
      error
    );

    return res.status(500).json({
      error:
        "Unable to answer the question right now."
    });
  }
};
