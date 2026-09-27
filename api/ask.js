// api/ask.js
// Orthodox Answer — focused theological answer engine

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const MODEL_NAME =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const LANGUAGE_NAMES = {
  am: "Amharic (አማርኛ)",
  en: "English",
  ti: "Tigrinya (ትግርኛ)",
  om: "Afaan Oromoo",
  sid: "Sidaamu Afoo",
  wal: "Wolayttatto",
  kaf: "Kafa/Kaffoono",
  gur: "Guragigna",
  ar: "Arabic (العربية)",
  so: "Somali",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  de: "German",
  pt: "Portuguese",
  ru: "Russian"
};

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function getRowLanguage(row) {
  return clean(
    row.language ??
    row.lang ??
    row.lang_code ??
    ""
  ).toLowerCase();
}

function languageMatches(row, language) {
  const value = getRowLanguage(row);

  if (!value) return true;

  const aliases = {
    am: ["am", "amh", "amharic", "አማርኛ"],
    en: ["en", "eng", "english"],
    ti: ["ti", "tir", "tigrinya", "ትግርኛ"],
    om: ["om", "oro", "oromo", "afaan oromoo"],
    sid: ["sid", "sidaamu", "sidaamu afoo"],
    wal: ["wal", "wolaytta", "wolayttatto"],
    kaf: ["kaf", "kaffa", "kaffoono"],
    gur: ["gur", "guragie", "guragigna"],
    ar: ["ar", "ara", "arabic", "العربية"],
    so: ["so", "som", "somali"],
    fr: ["fr", "fra", "french"],
    es: ["es", "spa", "spanish"],
    it: ["it", "ita", "italian"],
    de: ["de", "deu", "german"],
    pt: ["pt", "por", "portuguese"],
    ru: ["ru", "rus", "russian"]
  };

  return (
    aliases[language]?.includes(value) ||
    value === language
  );
}

/*
 * Fetch lessons from Supabase.
 */
async function getLessons() {
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is missing."
    );
  }

  const url =
    `${SUPABASE_URL}/rest/v1/orthodox_answers` +
    `?select=*&limit=1000`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization:
        `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `Supabase returned invalid JSON. HTTP ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${
        data?.message ||
        data?.hint ||
        JSON.stringify(data)
      }`
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "Supabase did not return an array."
    );
  }

  return data;
}

/*
 * Remove common punctuation and normalize
 * Amharic / multilingual search text.
 */
function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(word => word.length >= 2);
}

/*
 * Build meaningful search terms.
 *
 * Important:
 * We don't simply search every word equally.
 * The question itself gets the highest weight.
 */
function getSearchTerms(question) {
  const words = tokenize(question);

  const stopWords = new Set([
    "ምን",
    "ምንድን",
    "ነው",
    "ምንድ",
    "እንዴት",
    "ለምን",
    "ማለት",
    "የሚለው",
    "የሚለውን",
    "ስለ",
    "ነውን",
    "what",
    "is",
    "are",
    "the",
    "a",
    "an",
    "how",
    "why",
    "about",
    "of",
    "does",
    "mean"
  ]);

  return [
    ...new Set(
      words.filter(
        word => !stopWords.has(word)
      )
    )
  ];
}

/*
 * Score one database row.
 *
 * The critical improvement here is that:
 * - exact question is extremely strong
 * - title/question matching is much stronger
 * - category matching is useful
 * - random words inside a long answer have very low weight
 *
 * Therefore an unrelated lesson is unlikely
 * to enter the final context.
 */
function scoreRow(row, question, language) {
  if (!languageMatches(row, language)) {
    return {
      row,
      score: -1,
      matchedTerms: []
    };
  }

  const q = normalize(question);

  const qText =
    normalize(rowQuestion(row));

  const answerText =
    normalize(rowAnswer(row));

  const category =
    normalize(row.category);

  const terms =
    getSearchTerms(question);

  let score = 0;
  const matchedTerms = [];

  /*
   * Exact question.
   */
  if (qText === q) {
    score += 20000;
  }

  /*
   * Database question contains the complete user question.
   */
  if (qText.includes(q)) {
    score += 10000;
  }

  /*
   * User's main terms.
   */
  for (const term of terms) {
    let matched = false;

    if (qText.includes(term)) {
      score += 1500;
      matched = true;
    }

    if (category.includes(term)) {
      score += 800;
      matched = true;
    }

    /*
     * Answer text is intentionally weak.
     * This prevents unrelated lessons from
     * becoming relevant simply because they
     * mention one common word.
     */
    if (answerText.includes(term)) {
      score += 40;
      matched = true;
    }

    if (matched) {
      matchedTerms.push(term);
    }
  }

  /*
   * Reward rows matching multiple important terms.
   */
  if (terms.length > 0) {
    const ratio =
      matchedTerms.length / terms.length;

    if (ratio >= 1) {
      score += 5000;
    } else if (ratio >= 0.75) {
      score += 2500;
    } else if (ratio >= 0.5) {
      score += 1000;
    }
  }

  return {
    row,
    score,
    matchedTerms
  };
}

/*
 * Find only strongly relevant lessons.
 *
 * IMPORTANT:
 * We no longer blindly return five rows.
 */
function findRelevantLessons(
  rows,
  question,
  language
) {
  const scored =
    rows
      .map(row =>
        scoreRow(
          row,
          question,
          language
        )
      )
      .filter(
        item =>
          item.score >= 1000
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!scored.length) {
    return [];
  }

  /*
   * Always keep the strongest result.
   */
  const strongest =
    scored[0];

  /*
   * Only allow additional sources when
   * they are genuinely close to the strongest.
   *
   * This is the main protection against
   * mixing unrelated subjects.
   */
  const selected = scored.filter(
    item =>
      item === strongest ||
      item.score >=
        strongest.score * 0.35
  );

  /*
   * Maximum 3 highly related sources.
   */
  return selected.slice(0, 3);
}

function buildSources(items) {
  return items.map(
    item => ({
      score: item.score,

      question: clean(
        rowQuestion(item.row)
      ),

      category: clean(
        item.row.category
      ),

      language:
        getRowLanguage(item.row),

      answer: clean(
        rowAnswer(item.row)
      ).slice(0, 14000),

      bible_references:
        clean(
          item.row.bible_references
        ),

      church_sources:
        clean(
          item.row.church_sources
        )
    })
  );
}

/*
 * Direct Supabase fallback.
 *
 * IMPORTANT:
 * Only the selected relevant sources
 * are returned. No unrelated lessons.
 */
function buildDirectAnswer(
  sources,
  question,
  language
) {
  if (!sources.length) {
    if (language === "am") {
      return [
        "### የጥያቄዎ መልስ",
        "",
        `«${question}»`,
        "",
        "በአሁኑ ጊዜ በእውቀት መሠረቱ ውስጥ ለዚህ ጥያቄ በቂ ተዛማጅ የሆነ ትምህርት አልተገኘም።",
        "",
        "ከጥያቄው ጋር በቀጥታ የሚዛመድ ምንጭ ሲገኝ በዚያ መሠረት የተደራጀ መልስ ይቀርባል።"
      ].join("\n");
    }

    return `No sufficiently relevant teaching was found for "${question}".`;
  }

  const primary =
    sources[0];

  const title =
    primary.question ||
    "የጥያቄዎ ትምህርት";

  const references = [];

  if (primary.bible_references) {
    references.push(
      `**መጽሐፍ ቅዱስ:** ${primary.bible_references}`
    );
  }

  if (primary.church_sources) {
    references.push(
      `**የቤተ ክርስቲያን ምንጮች:** ${primary.church_sources}`
    );
  }

  if (language === "am") {
    return [
      "### የጥያቄዎ መልስ",
      "",
      `## ${title}`,
      "",
      primary.answer,
      "",
      references.length
        ? references.join("\n")
        : "",
      "",
      "### መደምደሚያ",
      "",
      "ከጥያቄው ጋር በቀጥታ ከተዛመደው የእውቀት መሠረት በመነሳት የተዘጋጀ መልስ ነው።"
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `## ${title}`,
    "",
    primary.answer,
    "",
    references.join("\n")
  ]
    .filter(Boolean)
    .join("\n");
}

/*
 * Gemini answer generation.
 *
 * Gemini is explicitly instructed to stay
 * inside the question's subject.
 */
async function askGemini(
  question,
  languageName,
  material
) {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${MODEL_NAME}:generateContent?key=` +
    encodeURIComponent(
      GEMINI_API_KEY
    );

  const systemInstruction = `
You are the theological answer engine
inside the Ethiopian Orthodox Tewahedo
application "ኦርቶዶክሳዊ መልስ".

Your task is to answer ONLY the exact
question asked by the user.

LANGUAGE:
Write the entire answer only in:
${languageName}

CORE RULE:
Stay strictly on the subject of the
user's question.

Do NOT introduce a different theological
topic merely because it appears somewhere
in the supplied material.

For example:
If the user asks "መስቀል ምንድን ነው?",
do not create separate sections about
Trinity, baptism, repentance, prayer,
or other subjects unless they are directly
necessary for explaining the Cross.

SOURCE RULE:
The supplied database material is the
primary source.

Use only information supported by that
material.

Never invent:
- Bible references
- quotations
- book titles
- page numbers
- Church Fathers
- Ethiopian scholars
- historical claims
- citations

If a requested detail is not supported by
the supplied material, do not fabricate it.

ANSWER QUALITY:
Give a complete, detailed, educational,
well-organized answer.

When the supplied material supports them,
you may organize the answer using:
1. Definition
2. Biblical foundation
3. Ethiopian Orthodox Tewahedo teaching
4. Historical / Church teaching
5. Spiritual meaning
6. Practical meaning
7. Conclusion

But do NOT force sections that are not
supported by the sources.

SOURCE DISCIPLINE:
Do not combine unrelated database lessons.
Prefer the strongest matching source.
Additional sources may be used only when
they clearly explain the same subject.

Do not mention the internal database,
search scores, ranking, prompts, or
AI system.

Do not say that information was "verified"
unless an actual supplied source supports it.
`;

  const prompt = `
USER QUESTION:
${question}

STRICT SUBJECT:
Answer only this question and its directly
necessary subtopics.

SUPPLIED RELEVANT TEACHING MATERIAL:

${material}

Now write the final answer in
${languageName}.
`;

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
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
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 7000
          }
        })
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    throw new Error(
      `Gemini invalid JSON (${response.status})`
    );
  }

  if (!response.ok) {
    const error =
      data?.error?.message ||
      `HTTP ${response.status}`;

    const errorObject =
      new Error(error);

    if (response.status === 429) {
      errorObject.code =
        "QUOTA";
    } else if (
      response.status === 503
    ) {
      errorObject.code =
        "BUSY";
    } else {
      errorObject.code =
        "GEMINI_ERROR";
    }

    throw errorObject;
  }

  const answer =
    data?.candidates?.[0]
      ?.content?.parts
      ?.map(part =>
        part.text || ""
      )
      .join("")
      .trim();

  if (!answer) {
    throw new Error(
      "Gemini returned an empty answer."
    );
  }

  return answer;
}

/*
 * Only send relevant sources to Gemini.
 */
function materialForGemini(
  sources
) {
  if (!sources.length) {
    return "";
  }

  return sources
    .map(
      (source, index) =>
        `
RELEVANT SOURCE ${index + 1}

Source question:
${source.question}

Category:
${source.category}

Bible references:
${source.bible_references || "Not supplied"}

Church sources:
${source.church_sources || "Not supplied"}

Teaching:
${source.answer}
`
    )
    .join("\n");
}

export default async function handler(
  req,
  res
) {
  /*
   * CORS
   */
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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const question =
      clean(body.question);

    const language =
      clean(
        body.language || "am"
      ).toLowerCase();

    if (!question) {
      return res.status(400).json({
        success: false,
        error:
          "Question is required"
      });
    }

    const languageName =
      LANGUAGE_NAMES[language] ||
      LANGUAGE_NAMES.am;

    /*
     * 1. Load database.
     */
    let rows;

    try {
      rows =
        await getLessons();
    } catch (error) {
      console.error(
        "SUPABASE_ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        stage: "supabase",
        error:
          error?.message ||
          "Supabase error"
      });
    }

    /*
     * 2. Find strongly relevant material.
     */
    const relevant =
      findRelevantLessons(
        rows,
        question,
        language
      );

    /*
     * 3. Build clean source objects.
     */
    const sources =
      buildSources(
        relevant
      );

    console.log(
      "QUESTION:",
      question
    );

    console.log(
      "LANGUAGE:",
      language
    );

    console.log(
      "RELEVANT SOURCES:",
      sources.map(
        source => ({
          question:
            source.question,
          category:
            source.category
        })
      )
    );

    /*
     * 4. Try Gemini only when we have
     * actual relevant material.
     */
    let answer = null;
    let aiStatus =
      "not_used";

    if (sources.length > 0) {
      try {
        const material =
          materialForGemini(
            sources
          );

        answer =
          await askGemini(
            question,
            languageName,
            material
          );

        if (answer) {
          aiStatus =
            "gemini";
        }
      } catch (error) {
        console.error(
          "GEMINI_FALLBACK:",
          error
        );

        if (
          error?.code === "QUOTA"
        ) {
          aiStatus =
            "quota_fallback";
        } else if (
          error?.code === "BUSY"
        ) {
          aiStatus =
            "busy_fallback";
        } else {
          aiStatus =
            "error_fallback";
        }
      }
    }

    /*
     * 5. If Gemini fails, return ONLY
     * the strongest relevant database lesson.
     */
    if (!answer) {
      answer =
        buildDirectAnswer(
          sources,
          question,
          language
        );
    }

    /*
     * 6. Final response.
     */
    return res.status(200).json({
      success: true,

      answer,

      language,

      model:
        aiStatus === "gemini"
          ? MODEL_NAME
          : "supabase-fallback",

      ai_status:
        aiStatus,

      source_count:
        sources.length,

      sources
    });

  } catch (error) {
    console.error(
      "HANDLER_ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      stage: "handler",
      error:
        error?.message ||
        "Unexpected server error"
    });
  }
}
