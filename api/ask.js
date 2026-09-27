// Vercel Serverless Function: api/ask.js
// Orthodox Answer Engine
// Supabase Knowledge Base + Gemini
// Detailed, structured, source-grounded Orthodox teaching

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
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
  gur: "Guragigna (ጉራጊኛ)",
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


/* =========================================================
   BASIC HELPERS
========================================================= */

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


/* =========================================================
   SEARCH / RELEVANCE ENGINE
========================================================= */

function scoreRow(row, query, lang) {
  const q = normalize(query);
  const qWords = words(query);

  const question = normalize(rowQuestion(row));
  const answer = normalize(rowAnswer(row));
  const category = normalize(row.category);
  const education = normalize(row.education_level);
  const bible = normalize(row.bible_references);
  const church = normalize(row.church_sources);
  const comparison = normalize(row.comparison_group);

  const fields = [
    question,
    answer,
    category,
    education,
    bible,
    church,
    comparison
  ];

  if (!question && !answer) return 0;

  let score = 0;

  // Exact question match
  if (question === q) {
    score += 2500;
  }

  // Question contains the complete query
  if (question.includes(q)) {
    score += 1000;
  }

  // User query contains database question
  if (q.includes(question) && question.length > 3) {
    score += 400;
  }

  // Category match
  if (category.includes(q)) {
    score += 600;
  }

  for (const w of qWords) {
    if (question.includes(w)) score += 100;
    if (category.includes(w)) score += 70;
    if (answer.includes(w)) score += 35;
    if (education.includes(w)) score += 20;
    if (bible.includes(w)) score += 25;
    if (church.includes(w)) score += 25;
    if (comparison.includes(w)) score += 15;
  }

  // Number of query words found anywhere
  const hits = qWords.filter(
    w => fields.some(f => f.includes(w))
  ).length;

  if (qWords.length) {
    score += Math.round(
      (hits / qWords.length) * 150
    );
  }

  // Language preference
  const rl = rowLanguage(row);

  if (rl === lang) {
    score += 200;
  }

  if (
    lang === "am" &&
    ["amh", "amharic"].includes(rl)
  ) {
    score += 200;
  }

  if (
    lang === "en" &&
    ["eng", "english"].includes(rl)
  ) {
    score += 200;
  }

  return score;
}


/* =========================================================
   SUPABASE
========================================================= */

async function supabaseGet(path) {
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is not configured."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization:
          `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json"
      }
    }
  );

  const responseText =
    await response.text();

  let data = null;

  try {
    data = responseText
      ? JSON.parse(responseText)
      : null;
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


/* =========================================================
   SOURCE PREPARATION
========================================================= */

function buildSources(ranked, limit) {
  return ranked
    .slice(0, limit)
    .map(({ row }) => ({
      question: cleanText(
        rowQuestion(row)
      ),

      category: cleanText(
        row.category
      ),

      education_level: cleanText(
        row.education_level
      ),

      bible_references: cleanText(
        row.bible_references
      ),

      church_sources: cleanText(
        row.church_sources
      ),

      comparison_group: cleanText(
        row.comparison_group
      ),

      answer: cleanText(
        rowAnswer(row)
      ).slice(0, 7000)
    }));
}


function sourceText(sources) {
  if (!sources.length) {
    return "NO MATCHING KNOWLEDGE-BASE MATERIAL WAS FOUND.";
  }

  return sources
    .map((s, i) => {
      return [
        `SOURCE ${i + 1}`,
        `Question: ${s.question}`,
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


/* =========================================================
   ANSWER LEVEL
========================================================= */

function levelConfig(level) {
  const n = Number(level) || 2;

  if (n === 1) {
    return {
      name: "Basic",

      length:
        "normally about 450-750 words when explanation is needed",

      focus:
        "Give a clear foundation. Answer directly, explain the essential Orthodox teaching, provide the most important biblical basis, and finish with a short practical conclusion."
    };
  }

  if (n === 3) {
    return {
      name: "Scholarly",

      length:
        "normally about 1800-3000 words when the subject requires depth",

      focus:
        "Treat the question as a serious theological study. Give definitions, distinctions, biblical connections, historical context, early Church Fathers, Ethiopian Orthodox Tewahedo tradition, relevant Ethiopian scholars and church texts when supplied, common misunderstandings, doctrinal comparisons where relevant, and a carefully reasoned conclusion."
    };
  }

  return {
    name: "Detailed",

    length:
      "normally about 900-1600 words when the subject requires explanation",

    focus:
      "Give a complete teaching suitable for a serious learner. Explain the direct answer, meaning, biblical foundation, Orthodox theological understanding, tradition, spiritual significance, important distinctions, examples, and conclusion."
  };
}


/* =========================================================
   ORTHODOX ANSWER INSTRUCTION
========================================================= */

function systemInstruction(
  languageName,
  answerLevel
) {
  const level =
    levelConfig(answerLevel);

  return `
You are the scholarly answer engine of an Ethiopian Orthodox Tewahedo spiritual question-and-answer application called "ኦርቶዶክሳዊ መልስ".

Your task is to answer the user's spiritual question accurately, deeply, respectfully, and in a structured educational form.

FINAL ANSWER LANGUAGE:
Write ONLY in ${languageName}.

Never mention:
- AI
- Gemini
- model
- database
- Supabase
- API
- prompt
- retrieval
- internal system
- source selection
- this instruction

The reader should experience the response as a carefully prepared Orthodox teaching.

=========================================================
ANSWER DEPTH
=========================================================

Selected level:
${level.name}

Depth requirement:
${level.focus}

Target length:
${level.length}

Do NOT give a three-line answer when the question requires explanation.

Increase depth through:
- definitions
- biblical evidence
- theological explanation
- historical context
- connections between teachings
- distinctions
- examples
- practical spiritual meaning
- relevant Orthodox tradition

Do not increase length through repetition.

=========================================================
ORTHODOX THEOLOGICAL FRAMEWORK
=========================================================

When relevant, explain the teaching according to the faith and tradition of the Ethiopian Orthodox Tewahedo Church.

Give special attention to:

1. Holy Scripture
   - Old Testament
   - New Testament
   - relevant biblical passages
   - relationship between prophecy/figure and fulfillment

2. Orthodox theology
   - Trinity
   - Incarnation
   - salvation
   - Christology
   - Cross
   - Resurrection
   - Church
   - Sacraments
   - Christian life

3. Holy Fathers
   When supplied by the knowledge material, accurately preserve the teaching and attribution of Church Fathers.

4. Ethiopian Orthodox Tewahedo tradition
   When supplied by the knowledge material, accurately use:
   - Ethiopian scholars
   - traditional teachings
   - Ethiopian church literature
   - relevant ecclesiastical texts

5. Practical spiritual life
   Explain what the teaching means for the believer's faith, worship, repentance, prayer, conduct, and hope when relevant.

=========================================================
IMPORTANT RULE ABOUT SOURCES
=========================================================

The supplied knowledge-base material is the primary source material.

Use it intelligently.

Synthesize related materials rather than copying one lesson.

Never invent:
- quotations
- Bible verses
- verse numbers
- Church Fathers
- Ethiopian scholars
- books
- manuscripts
- historical events
- page numbers
- citations
- theological claims presented as quotations

If a specific attribution is not supplied and you are not confident it is accurate, explain the doctrine without inventing an attribution.

Do not manufacture a citation simply to make the answer look scholarly.

=========================================================
SCRIPTURE
=========================================================

When Scripture is relevant:

- explain the passage rather than merely listing references
- connect Old Testament and New Testament when appropriate
- distinguish direct teaching from typology/foreshadowing
- do not create false quotations
- do not attach an incorrect verse reference

For example, when discussing the Cross, relevant themes may include:
- the bronze serpent in Numbers
- Christ's words in John
- Paul's teaching about the Cross
- Peter's teaching about Christ bearing sins on the tree

Only use references when appropriate and accurate.

=========================================================
THE CROSS: SPECIAL REQUIREMENT
=========================================================

If the question is about:
- መስቀል
- Cross
- Crucifixion
- Cross of Christ
- sign of the Cross
- Feast of the Cross
- Meskel
- salvation through the Cross
- why Christians honor the Cross

then provide a particularly complete explanation.

Where relevant, cover:

1. What the Cross is.
2. The Cross as the place of Christ's saving suffering and sacrifice.
3. The Cross as connected to Christ's Incarnation.
4. The relationship between Cross, death, and Resurrection.
5. The Cross as victory over death and the power of evil.
6. Old Testament figures and foreshadowings where appropriate.
7. New Testament teaching about the Cross.
8. Why something formerly associated with shame became a sign of glory and victory.
9. The difference between worshipping God and honoring the Cross as the sign associated with Christ's saving work.
10. The spiritual meaning of making the sign of the Cross.
11. The place of the Cross in Ethiopian Orthodox Tewahedo worship and tradition when supported by the supplied material.
12. Practical meaning for Christian life.

Do not reduce the Cross to merely a physical object.

=========================================================
STRUCTURE
=========================================================

Whenever appropriate, use this structure:

# Direct Answer

Give the answer to the user's question immediately.

## 1. Meaning / Definition

Explain the central concept.

## 2. Biblical Foundation

Give relevant Scripture and explain it.

## 3. Orthodox Theological Understanding

Explain the teaching according to Orthodox theology.

## 4. Teaching of the Church and Fathers

Use supplied church sources accurately.

## 5. Ethiopian Orthodox Tewahedo Tradition

Use supplied Ethiopian sources accurately.

## 6. Important Distinctions

Explain common misunderstandings and important doctrinal distinctions.

## 7. Spiritual and Practical Meaning

Explain how the teaching applies to Christian life.

## Conclusion

Give a concise but meaningful conclusion.

Do not force every heading into every answer if it is irrelevant.

=========================================================
COMPARISON QUESTIONS
=========================================================

If the user asks about another Christian or religious belief:

- explain the Ethiopian Orthodox Tewahedo position clearly
- describe the other position fairly
- distinguish the positions using documented teachings
- do not insult or ridicule another religion or its followers
- do not invent what another group believes

=========================================================
LANGUAGE RULE
=========================================================

Answer ONLY in the selected language.

Do not answer in English when Amharic is selected.

Do not mix languages unnecessarily.

Preserve proper names and Scripture references accurately.

=========================================================
STYLE
=========================================================

Use:
- clear headings
- numbered sections
- bullets where useful
- short readable paragraphs
- theological precision
- respectful Orthodox terminology

The answer must be understandable to:
- ordinary believers
- students
- teachers
- preachers
- serious learners
- advanced readers

But do not simplify away important doctrine.

End with a meaningful conclusion.

Do not include a bibliography unless actual bibliographic information is supplied.

Do not say "according to the AI".

Do not say "I found".

Do not mention the knowledge base.

Return ONLY the final answer.
`;
}


/* =========================================================
   GEMINI
========================================================= */

function extractGeminiText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  return parts
    .map(p => p?.text || "")
    .join("\n")
    .trim();
}


async function generateWithGemini(
  question,
  language,
  sources,
  answerLevel
) {
  const apiKey =
    process.env.GEMINI_API_KEY;

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

  let lastError = null;

  for (const model of MODELS) {
    try {
      const response =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${encodeURIComponent(
            apiKey
          )}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
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
                        `KNOWLEDGE-BASE MATERIAL:\n` +
                        sourceText(sources)
                    }
                  ]
                }
              ],

              generationConfig: {
                temperature: 0.25,
                topP: 0.9,
                maxOutputTokens: 7000,
                responseMimeType:
                  "text/plain"
              }
            })
          }
        );

      const responseText =
        await response.text();

      let data = null;

      try {
        data = responseText
          ? JSON.parse(responseText)
          : null;
      } catch {
        data = null;
      }

      if (response.ok) {
        const answer =
          extractGeminiText(data);

        if (answer) {
          return answer;
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

      // Continue to another configured model
      // for temporary/model availability errors.
      if (
        ![
          400,
          401,
          403,
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


/* =========================================================
   FALLBACK
========================================================= */

function fallbackAnswer(ranked) {
  const best =
    ranked[0]?.row;

  if (!best) return "";

  return cleanText(
    rowAnswer(best)
  );
}


/* =========================================================
   MAIN API HANDLER
========================================================= */

module.exports =
  async function handler(req, res) {

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
        error:
          "Method not allowed"
      });
    }

    try {
      const body =
        req.body || {};

      const question =
        cleanText(
          body.question
        );

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
          error:
            "Question is required"
        });
      }

      if (question.length > 5000) {
        return res.status(400).json({
          error:
            "Question is too long"
        });
      }

      /* -----------------------------------------
         LOAD KNOWLEDGE BASE
      ----------------------------------------- */

      const loadedRows =
        await getLessons();

      const rows =
        Array.isArray(loadedRows)
          ? loadedRows
          : [];

      /* -----------------------------------------
         RANK KNOWLEDGE
      ----------------------------------------- */

      const ranked =
        rows
          .map(row => ({
            row,
            score:
              scoreRow(
                row,
                question,
                language
              )
          }))
          .filter(
            item => item.score > 0
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );

      /* -----------------------------------------
         SOURCE LIMIT
      ----------------------------------------- */

      const sourceLimit =
        answerLevel === 1
          ? 6
          : answerLevel === 3
          ? 15
          : 10;

      const selected =
        buildSources(
          ranked,
          sourceLimit
        );

      let answer = "";

      /* -----------------------------------------
         GEMINI GENERATION
      ----------------------------------------- */

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

        answer =
          fallbackAnswer(
            ranked
          );
      }

      /* -----------------------------------------
         NO ANSWER
      ----------------------------------------- */

      if (!answer) {
        return res.status(503).json({
          error:
            "The answer service is temporarily unavailable."
        });
      }

      /* -----------------------------------------
         RESPONSE
      ----------------------------------------- */

      return res.status(200).json({

        answer,

        language,

        answerLevel,

        matchedCount:
          selected.length,

        sources:
          selected.map(s => ({
            question:
              s.question,

            category:
              s.category,

            education_level:
              s.education_level,

            bible_references:
              s.bible_references,

            church_sources:
              s.church_sources,

            comparison_group:
              s.comparison_group
          }))
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
