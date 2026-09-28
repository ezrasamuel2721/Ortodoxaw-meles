// =========================================================
// Vercel Serverless Function: api/ask.js
// ኦርቶዶክሳዊ መልስ
// Supabase Knowledge Base + Gemini
// Detailed, structured, source-grounded answer engine
// =========================================================

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
].filter(
  (v, i, a) => v && a.indexOf(v) === i
);


// =========================================================
// LANGUAGES
// =========================================================

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


// =========================================================
// BASIC HELPERS
// =========================================================

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


// =========================================================
// SEARCH / RELEVANCE ENGINE
// =========================================================

function scoreRow(row, query, lang) {

  const q = normalize(query);
  const qWords = words(query);

  const question = normalize(
    rowQuestion(row)
  );

  const answer = normalize(
    rowAnswer(row)
  );

  const category = normalize(
    row.category
  );

  const education = normalize(
    row.education_level
  );

  const bible = normalize(
    row.bible_references
  );

  const church = normalize(
    row.church_sources
  );

  const comparison = normalize(
    row.comparison_group
  );

  const fields = [
    question,
    answer,
    category,
    education,
    bible,
    church,
    comparison
  ];

  if (!question && !answer) {
    return 0;
  }

  let score = 0;


  // -------------------------------------------------------
  // EXACT QUESTION
  // -------------------------------------------------------

  if (question === q) {
    score += 3000;
  }


  // -------------------------------------------------------
  // COMPLETE QUERY INSIDE QUESTION
  // -------------------------------------------------------

  if (
    q.length > 2 &&
    question.includes(q)
  ) {
    score += 1500;
  }


  // -------------------------------------------------------
  // DATABASE QUESTION INSIDE USER QUESTION
  // -------------------------------------------------------

  if (
    question.length > 3 &&
    q.includes(question)
  ) {
    score += 500;
  }


  // -------------------------------------------------------
  // CATEGORY
  // -------------------------------------------------------

  if (
    category &&
    q.length > 2 &&
    category.includes(q)
  ) {
    score += 700;
  }


  // -------------------------------------------------------
  // WORD MATCHING
  // -------------------------------------------------------

  let hits = 0;

  for (const word of qWords) {

    let found = false;

    if (question.includes(word)) {
      score += 120;
      found = true;
    }

    if (category.includes(word)) {
      score += 90;
      found = true;
    }

    if (answer.includes(word)) {
      score += 45;
      found = true;
    }

    if (education.includes(word)) {
      score += 20;
    }

    if (bible.includes(word)) {
      score += 30;
    }

    if (church.includes(word)) {
      score += 30;
    }

    if (comparison.includes(word)) {
      score += 20;
    }

    if (found) {
      hits++;
    }
  }


  // -------------------------------------------------------
  // QUERY COVERAGE
  // -------------------------------------------------------

  if (qWords.length > 0) {

    score += Math.round(
      (hits / qWords.length) * 250
    );
  }


  // -------------------------------------------------------
  // LANGUAGE PRIORITY
  // -------------------------------------------------------

  const rl = rowLanguage(row);

  if (rl === lang) {
    score += 300;
  }

  if (
    lang === "am" &&
    ["amh", "amharic"].includes(rl)
  ) {
    score += 300;
  }

  if (
    lang === "en" &&
    ["eng", "english"].includes(rl)
  ) {
    score += 300;
  }

  if (
    lang === "ti" &&
    ["tir", "tigrinya"].includes(rl)
  ) {
    score += 300;
  }

  if (
    lang === "om" &&
    ["orm", "oromo", "afaanoromo"].includes(rl)
  ) {
    score += 300;
  }

  if (
    lang === "ar" &&
    ["ara", "arabic"].includes(rl)
  ) {
    score += 300;
  }


  return score;
}


// =========================================================
// SUPABASE
// =========================================================

async function supabaseGet(path) {

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is not configured."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",

      headers: {
        apikey: SUPABASE_ANON_KEY,

        Authorization:
          `Bearer ${SUPABASE_ANON_KEY}`,

        Accept:
          "application/json"
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
      data?.error_description ||
      `Supabase error ${response.status}`
    );
  }


  return data;
}


// =========================================================
// LOAD KNOWLEDGE BASE
// =========================================================

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
    `orthodox_answers?select=${encodeURIComponent(
      columns
    )}&limit=500`;


  return await supabaseGet(path);
}


// =========================================================
// SOURCE PREPARATION
// =========================================================

function buildSources(
  ranked,
  limit
) {

  return ranked
    .slice(0, limit)
    .map(({ row }) => {

      return {

        question:
          cleanText(
            rowQuestion(row)
          ),

        category:
          cleanText(
            row.category
          ),

        education_level:
          cleanText(
            row.education_level
          ),

        bible_references:
          cleanText(
            row.bible_references
          ),

        church_sources:
          cleanText(
            row.church_sources
          ),

        comparison_group:
          cleanText(
            row.comparison_group
          ),

        answer:
          cleanText(
            rowAnswer(row)
          ).slice(0, 9000)
      };
    });
}


// =========================================================
// SOURCE TEXT FOR GEMINI
// =========================================================

function sourceText(
  sources
) {

  if (!sources.length) {

    return (
      "NO MATCHING KNOWLEDGE-BASE MATERIAL WAS FOUND."
    );
  }


  return sources
    .map((s, i) => {

      return [
        `SOURCE ${i + 1}`,

        `Question: ${
          s.question || ""
        }`,

        `Category: ${
          s.category || ""
        }`,

        `Education level: ${
          s.education_level || ""
        }`,

        `Bible references: ${
          s.bible_references || ""
        }`,

        `Church sources: ${
          s.church_sources || ""
        }`,

        `Comparison group: ${
          s.comparison_group || ""
        }`,

        `Lesson text: ${
          s.answer || ""
        }`
      ].join("\n");

    })
    .join("\n\n====================\n\n");
}


// =========================================================
// ANSWER LEVEL
// =========================================================

function levelConfig(
  level
) {

  const n =
    Number(level) || 2;


  if (n === 1) {

    return {

      name: "Basic",

      length:
        "normally about 450-750 words when explanation is needed",

      focus:
        "Give a clear foundation. Answer directly, define the main concept, explain the essential Orthodox teaching, provide the most important biblical basis, and finish with a practical conclusion."
    };
  }


  if (n === 3) {

    return {

      name: "Scholarly",

      length:
        "normally about 1800-3000 words when the subject requires depth",

      focus:
        "Treat the question as a serious theological study. Give definitions, distinctions, biblical connections, historical context, early Church Fathers, Ethiopian Orthodox Tewahedo tradition, relevant Ethiopian scholars and church texts when supplied, common misunderstandings, doctrinal comparisons where relevant, evidence comparison, and a carefully reasoned conclusion."
    };
  }


  return {

    name: "Detailed",

    length:
      "normally about 900-1600 words when the subject requires explanation",

    focus:
      "Give a complete teaching suitable for a serious learner. Explain the direct answer, meaning, biblical foundation, Orthodox theological understanding, Church Fathers, Ethiopian Orthodox Tewahedo tradition, important distinctions, examples, spiritual significance, and conclusion."
  };
}


// =========================================================
// ORTHODOX ANSWER INSTRUCTION
// =========================================================

function systemInstruction(
  languageName,
  answerLevel
) {

  const level =
    levelConfig(answerLevel);


  return `
You are the scholarly theological answer engine of an Ethiopian Orthodox Tewahedo spiritual question-and-answer application called "ኦርቶዶክሳዊ መልስ".

Your responsibility is to answer the user's question accurately, deeply, respectfully, and in a logically organized educational form.

=========================================================
ABSOLUTE LANGUAGE RULE
=========================================================

Write the FINAL ANSWER ONLY in:

${languageName}

Do not switch to English.

Do not mix languages unnecessarily.

Scripture references, names of people, books, and proper names may remain in their standard form when necessary.

=========================================================
IMPORTANT
=========================================================

The reader must receive a finished teaching, not a discussion about how the answer was generated.

NEVER mention:

- AI
- Gemini
- model
- database
- Supabase
- API
- prompt
- retrieval
- source selection
- internal instruction
- system message
- knowledge base

Do not say "I found".

Do not say "according to the AI".

=========================================================
ANSWER DEPTH
=========================================================

Selected level:

${level.name}

Required focus:

${level.focus}

Target length:

${level.length}

Do not produce a short three-line answer when the question requires explanation.

Make the answer longer by adding useful theological substance, not repetition.

=========================================================
CORE ANSWER METHOD
=========================================================

For every question, follow this reasoning order:

1. Identify exactly what the user is asking.

2. Give the DIRECT ANSWER first.

3. Define the central term or doctrine.

4. Explain the biblical foundation.

5. Explain the Ethiopian Orthodox Tewahedo theological understanding.

6. Use relevant Church Fathers when reliable material is supplied.

7. Use relevant Ethiopian Orthodox sources, scholars, church literature, liturgical tradition, or ecclesiastical teaching when supplied.

8. Explain important distinctions and common misunderstandings.

9. If another religion or Christian denomination is relevant, explain its position fairly.

10. Present the evidence used by the different positions when available.

11. Compare the teachings carefully without insulting another religion or group.

12. Explain the Ethiopian Orthodox Tewahedo response using Scripture, theology, Fathers, and verified tradition.

13. Explain the spiritual and practical meaning.

14. End with a meaningful conclusion.

=========================================================
MANDATORY ORGANIZATION
=========================================================

When relevant, organize the final answer approximately as follows:

# Direct Answer

Answer the question immediately.

## 1. Meaning and Definition

Explain the central concept.

## 2. Biblical Foundation

Explain the relevant Old Testament and New Testament passages.

## 3. Ethiopian Orthodox Tewahedo Understanding

Explain the doctrine clearly and precisely.

## 4. Teaching of the Church Fathers

Use relevant Fathers only when the attribution is reliable.

## 5. Ethiopian Orthodox Tradition and Sources

Use supplied Ethiopian material accurately.

## 6. Important Distinctions and Misunderstandings

Clarify difficult points.

## 7. Comparison with Other Positions

Use only when relevant.

## 8. Evidence and Orthodox Response

Compare the relevant teachings and explain the Orthodox response.

## 9. Spiritual and Practical Meaning

Explain how the teaching affects Christian life.

## Conclusion

Summarize the central teaching.

Do not force irrelevant sections into an answer.

=========================================================
SCRIPTURE RULE
=========================================================

When Scripture is relevant:

- use accurate references
- explain the passage
- do not merely list verses
- connect Old Testament and New Testament where appropriate
- distinguish direct teaching from typology or foreshadowing
- do not invent quotations
- do not invent verse numbers

Never create a Bible reference simply to make the answer appear scholarly.

=========================================================
SOURCE INTEGRITY
=========================================================

The supplied lesson material is source material for the answer.

Synthesize multiple relevant lessons into ONE coherent teaching.

Do NOT simply copy one lesson when several relevant materials are available.

Never invent:

- quotations
- Bible references
- Church Fathers
- Ethiopian scholars
- books
- manuscripts
- page numbers
- historical claims
- citations
- denominational teachings
- theological quotations

Never place quotation marks around a paraphrase.

If an exact attribution is uncertain, do not manufacture it.

If a specific source is not supplied and you are not confident that the attribution is accurate, explain the doctrine without falsely attributing it.

=========================================================
ORTHODOX THEOLOGICAL FRAMEWORK
=========================================================

When relevant, give attention to:

- the Holy Trinity
- the Incarnation
- Christology
- salvation
- the Cross
- the Resurrection
- the Church
- the mysteries/sacraments
- repentance
- prayer
- fasting
- Christian holiness
- eternal life

Do not force unrelated doctrines into the answer.

=========================================================
CHURCH FATHERS
=========================================================

Use Church Fathers only when they are relevant.

When reliable source material provides a Father and his teaching:

- identify the Father
- identify the work when available
- explain the teaching accurately
- distinguish quotation from paraphrase

Never invent a quotation.

Never claim that "all the Fathers" taught something unless the evidence actually establishes that.

=========================================================
ETHIOPIAN ORTHODOX SOURCES
=========================================================

When supplied material contains Ethiopian Orthodox sources, use them accurately.

This may include:

- Ethiopian Orthodox scholars
- traditional teachers
- ecclesiastical literature
- liturgical teaching
- church order
- canonical material
- Ethiopian theological texts

Do not invent statements by Ethiopian scholars.

Do not invent page numbers.

=========================================================
COMPARATIVE RELIGION
=========================================================

If the question concerns Catholic, Protestant, Jehovah's Witnesses, Muslim, Jewish, atheist, "Only Jesus", or another religious position:

First explain the Ethiopian Orthodox Tewahedo teaching clearly.

Then, when relevant, explain the other position fairly.

Then explain the evidence associated with each position.

Then identify the exact points of agreement and disagreement.

Then explain the Ethiopian Orthodox response.

Do not insult, ridicule, stereotype, or misrepresent another religion or its followers.

Do not invent what another group believes.

=========================================================
SPECIAL TOPIC: THE CROSS
=========================================================

If the question concerns:

- መስቀል
- Cross
- Crucifixion
- Cross of Christ
- sign of the Cross
- Meskel
- Feast of the Cross
- salvation through the Cross
- why Christians honor the Cross

give a particularly complete teaching.

Where relevant, explain:

1. What the Cross is.
2. Christ's suffering and saving death.
3. The relationship between the Cross and the Incarnation.
4. The relationship between death and Resurrection.
5. Victory over death and evil.
6. Old Testament figures and foreshadowings.
7. New Testament teaching.
8. Why the Cross changed from an instrument of shame into a sign of glory and victory.
9. Worship of God versus honor shown to the Cross associated with Christ's saving work.
10. The spiritual meaning of making the sign of the Cross.
11. Ethiopian Orthodox Tewahedo tradition when supplied.
12. Practical Christian meaning.

Do not reduce the Cross to merely a physical object.

=========================================================
SPECIAL TOPIC: BAPTISM
=========================================================

If the question concerns:

- ጥምቀት
- baptism
- infant baptism
- child baptism
- baptism of adults
- baptism by immersion
- baptism in the Trinity
- rebirth through baptism

give a complete teaching.

Where relevant, explain:

- meaning of baptism
- new birth
- water and the Holy Spirit
- Christ's command
- baptism into the Trinity
- death and rising with Christ
- forgiveness and new life
- Church membership
- infant baptism
- adult baptism
- immersion
- Ethiopian Orthodox practice
- relevant Fathers
- relevant biblical evidence
- comparison with traditions that reject infant baptism
- evidence and Orthodox response
- spiritual significance

Do not invent historical claims.

=========================================================
MULTIPLE SOURCE SYNTHESIS
=========================================================

If several supplied sources discuss the same subject:

Do not answer with several disconnected mini-answers.

Instead:

1. identify the common teaching
2. combine complementary information
3. resolve repetition
4. preserve important distinctions
5. produce ONE coherent teaching

The final answer should read as if one knowledgeable Orthodox teacher prepared it.

=========================================================
WHEN MATERIAL IS INSUFFICIENT
=========================================================

If the supplied material does not establish a specialized historical or theological claim:

Do not invent information.

Use only what can be stated confidently.

It is better to give a precise answer with a stated limitation than a fabricated scholarly claim.

=========================================================
STYLE
=========================================================

Use:

- clear headings
- numbered sections
- readable paragraphs
- bullets where useful
- precise Orthodox terminology
- respectful language
- logical progression
- meaningful explanations

Avoid:

- unnecessary repetition
- empty introductory phrases
- unsupported claims
- fake quotations
- fake references
- overly short answers

The answer must be understandable to:

- ordinary believers
- students
- teachers
- preachers
- serious learners
- advanced readers

Do not simplify away important doctrine.

=========================================================
FINAL QUALITY CHECK
=========================================================

Before producing the answer, silently verify:

1. Did I answer the exact question?
2. Did I give the direct answer first?
3. Did I define the main concept?
4. Did I provide relevant Scripture?
5. Did I explain the Orthodox theological meaning?
6. Did I use relevant Fathers only when reliable?
7. Did I use Ethiopian Orthodox material when supplied?
8. Did I combine related sources rather than repeating them?
9. Did I represent other positions fairly when relevant?
10. Did I avoid invented quotations and references?
11. Did I maintain the selected language?
12. Is the answer structured and readable?
13. Did I give practical spiritual meaning?
14. Did I finish with a meaningful conclusion?

Return ONLY the finished answer.
`;
}


// =========================================================
// GEMINI TEXT EXTRACTION
// =========================================================

function extractGeminiText(
  data
) {

  const candidates =
    data?.candidates || [];

  if (!candidates.length) {
    return "";
  }

  const parts =
    candidates[0]?.content?.parts || [];

  return parts
    .map(
      part => part?.text || ""
    )
    .join("\n")
    .trim();
}


// =========================================================
// GEMINI GENERATION
// =========================================================

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
                    text:
                      instruction
                  }
                ]
              },

              contents: [
                {
                  role: "user",

                  parts: [
                    {
                      text:
                        [
                          "USER QUESTION:",
                          question,
                          "",
                          "RELEVANT TEACHING MATERIAL:",
                          sourceText(sources)
                        ].join("\n")
                    }
                  ]
                }
              ],

              generationConfig: {

                temperature: 0.20,

                topP: 0.90,

                maxOutputTokens:
                  answerLevel === 3
                    ? 9000
                    : 7000,

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

        data =
          responseText
            ? JSON.parse(
                responseText
              )
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


      const errorMessage =
        data?.error?.message ||
        `Answer service error ${response.status}`;


      lastError =
        new Error(
          errorMessage
        );


      // Try the next model for
      // temporary availability/rate errors.
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
        ].includes(
          response.status
        )
      ) {
        break;
      }

    } catch (error) {

      lastError =
        error;
    }
  }


  throw (
    lastError ||
    new Error(
      "Unable to generate an answer."
    )
  );
}


// =========================================================
// FALLBACK ANSWER
// =========================================================

function fallbackAnswer(
  ranked,
  language
) {

  if (!ranked.length) {
    return "";
  }


  const selected =
    ranked
      .slice(0, 8)
      .map(
        item => item.row
      );


  const parts = [];


  // -------------------------------------------------------
  // Direct answer
  // -------------------------------------------------------

  const firstAnswer =
    cleanText(
      rowAnswer(
        selected[0]
      )
    );


  if (firstAnswer) {

    parts.push(
      firstAnswer
    );
  }


  // -------------------------------------------------------
  // Additional relevant teachings
  // -------------------------------------------------------

  for (
    let i = 1;
    i < selected.length;
    i++
  ) {

    const answer =
      cleanText(
        rowAnswer(
          selected[i]
        )
      );


    if (!answer) {
      continue;
    }


    // Prevent exact duplicate answers.
    const duplicate =
      parts.some(
        part =>
          normalize(part) ===
          normalize(answer)
      );


    if (!duplicate) {

      parts.push(
        answer
      );
    }
  }


  if (!parts.length) {
    return "";
  }


  /*
   * When Gemini is unavailable, the fallback cannot
   * create new theology. Therefore it only combines
   * material already stored in Supabase.
   *
   * This is intentionally safer than inventing doctrine.
   */

  if (language === "am") {

    return [
      "## መልስ",

      parts.join(
        "\n\n"
      ),

      "## ማጠቃለያ",

      "ከተያያዙት የትምህርት ምንጮች መሠረት ይህ ጉዳይ በቤተ ክርስቲያን ትምህርት፣ በቅዱሳት መጻሕፍትና በተረጋገጡ የትምህርት ምንጮች መሠረት መታየት ይገባዋል።"
    ].join(
      "\n\n"
    );
  }


  return [
    "Answer",

    parts.join(
      "\n\n"
    ),

    "Conclusion",

    "The teaching should be understood in the context of Scripture and the relevant Orthodox teaching provided above."
  ].join(
    "\n\n"
  );
}


// =========================================================
// MAIN API HANDLER
// =========================================================

module.exports =
  async function handler(
    req,
    res
  ) {

    // -----------------------------------------------------
    // RESPONSE HEADERS
    // -----------------------------------------------------

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.setHeader(
      "Content-Type",
      "application/json; charset=utf-8"
    );


    // -----------------------------------------------------
    // METHOD CHECK
    // -----------------------------------------------------

    if (
      req.method !== "POST"
    ) {

      return res
        .status(405)
        .json({
          error:
            "Method not allowed"
        });
    }


    try {

      // ---------------------------------------------------
      // BODY
      // ---------------------------------------------------

      const body =
        req.body || {};


      const question =
        cleanText(
          body.question
        );


      const language =
        cleanText(
          body.language ||
          "am"
        ).toLowerCase();


      const answerLevel =
        [1, 2, 3].includes(
          Number(
            body.answerLevel
          )
        )
          ? Number(
              body.answerLevel
            )
          : 2;


      // ---------------------------------------------------
      // VALIDATION
      // ---------------------------------------------------

      if (!question) {

        return res
          .status(400)
          .json({
            error:
              "Question is required"
          });
      }


      if (
        question.length > 5000
      ) {

        return res
          .status(400)
          .json({
            error:
              "Question is too long"
          });
      }


      // ---------------------------------------------------
      // LOAD SUPABASE
      // ---------------------------------------------------

      const loadedRows =
        await getLessons();


      const rows =
        Array.isArray(
          loadedRows
        )
          ? loadedRows
          : [];


      // ---------------------------------------------------
      // RANK
      // ---------------------------------------------------

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
            item =>
              item.score > 0
          )
          .sort(
            (a, b) =>
              b.score -
              a.score
          );


      // ---------------------------------------------------
      // SOURCE LIMIT
      // ---------------------------------------------------

      const sourceLimit =
        answerLevel === 1
          ? 8
          : answerLevel === 3
          ? 18
          : 12;


      const selected =
        buildSources(
          ranked,
          sourceLimit
        );


      // ---------------------------------------------------
      // GENERATE
      // ---------------------------------------------------

      let answer = "";

      let generationUsed =
        false;


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

        console.error(
          "Gemini generation failed:",
          generationError?.message ||
          generationError
        );


        // -------------------------------------------------
        // SAFE FALLBACK
        // -------------------------------------------------

        answer =
          fallbackAnswer(
            ranked,
            language
          );
      }


      // ---------------------------------------------------
      // NO ANSWER
      // ---------------------------------------------------

      if (!answer) {

        return res
          .status(503)
          .json({

            error:
              "The answer service is temporarily unavailable.",

            matchedCount:
              ranked.length
          });
      }


      // ---------------------------------------------------
      // RESPONSE
      // ---------------------------------------------------

      return res
        .status(200)
        .json({

          answer,

          language,

          answerLevel,

          matchedCount:
            ranked.length,

          usedKnowledgeSources:
            selected.length,

          generationUsed,

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
                  source.comparison_group
              })
            )
        });


    } catch (error) {

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
