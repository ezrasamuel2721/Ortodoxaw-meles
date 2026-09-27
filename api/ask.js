// api/ask.js

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

function findRelevantLessons(
  rows,
  question,
  language
) {
  const q = normalize(question);

  const queryWords = [
    ...new Set(
      q
        .split(/\s+/)
        .filter(word => word.length >= 2)
    )
  ];

  const ranked = rows
    .map(row => {
      if (!languageMatches(row, language)) {
        return {
          row,
          score: 0
        };
      }

      const questionText =
        normalize(rowQuestion(row));

      const answerText =
        normalize(rowAnswer(row));

      const category =
        normalize(row.category);

      let score = 0;

      if (
        questionText === q
      ) {
        score += 10000;
      }

      if (
        questionText.includes(q)
      ) {
        score += 4000;
      }

      for (const word of queryWords) {
        if (questionText.includes(word)) {
          score += 500;
        }

        if (category.includes(word)) {
          score += 250;
        }

        if (answerText.includes(word)) {
          score += 30;
        }
      }

      return {
        row,
        score
      };
    })
    .filter(item => item.score > 0)
    .sort(
      (a, b) => b.score - a.score
    );

  return ranked.slice(0, 5);
}

function buildSources(items) {
  return items.map(item => ({
    score: item.score,

    question: clean(
      rowQuestion(item.row)
    ),

    category: clean(
      item.row.category
    ),

    language: getRowLanguage(item.row),

    answer: clean(
      rowAnswer(item.row)
    ).slice(0, 12000),

    bible_references: clean(
      item.row.bible_references
    ),

    church_sources: clean(
      item.row.church_sources
    )
  }));
}

function buildDirectAnswer(
  sources,
  question,
  language
) {
  if (!sources.length) {
    return language === "am"
      ? `ይቅርታ፣ ለ«${question}» በአሁኑ ጊዜ በእውቀት መሠረቱ ውስጥ በቂ ተዛማጅ ትምህርት አልተገኘም።`
      : `No directly matching teaching was found for "${question}".`;
  }

  const parts = sources
    .map((source, index) => {
      const title =
        source.question ||
        `Teaching ${index + 1}`;

      const answer =
        source.answer;

      const references = [];

      if (source.bible_references) {
        references.push(
          `መጽሐፍ ቅዱስ: ${source.bible_references}`
        );
      }

      if (source.church_sources) {
        references.push(
          `የቤተ ክርስቲያን ምንጮች: ${source.church_sources}`
        );
      }

      return [
        `## ${title}`,
        answer,
        references.length
          ? `\n${references.join("\n")}`
          : ""
      ].join("\n");
    });

  if (language === "am") {
    return [
      `### የጥያቄዎ መልስ`,
      `«${question}»`,
      "",
      parts.join("\n\n---\n\n"),
      "",
      "### መደምደሚያ",
      "ይህ መልስ በኦርቶዶክሳዊ ትምህርት የተገኘውን የእውቀት መሠረት በመጠቀም ቀጥታ ተዘጋጅቷል።"
    ].join("\n");
  }

  return parts.join("\n\n---\n\n");
}

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

Write the complete answer ONLY in
${languageName}.

Answer the exact user question.

Use the supplied database teaching as
your primary source.

Give a detailed and organized answer.

Where supported by the supplied material,
explain:
- Old Testament
- New Testament
- Ethiopian Orthodox Tewahedo teaching
- Church Fathers
- Ethiopian Orthodox scholars
- spiritual meaning
- practical examples
- conclusion

IMPORTANT:
Never invent quotations,
Bible references, book references,
page numbers, scholars, or citations.

Do not mix unrelated topics.
`;

  const prompt = `
SUPPLIED TEACHING MATERIAL:

${material}

USER QUESTION:

${question}

Write the complete answer.
`;

  const response = await fetch(
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
              text: systemInstruction
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
          temperature: 0.3,
          maxOutputTokens: 5000
        }
      })
    }
  );

  const text =
    await response.text();

  let data;

  try {
    data = text
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

    const quota =
      response.status === 429;

    const busy =
      response.status === 503;

    const errorObject =
      new Error(error);

    errorObject.code =
      quota
        ? "QUOTA"
        : busy
        ? "BUSY"
        : "GEMINI_ERROR";

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

function materialForGemini(
  sources
) {
  if (!sources.length) {
    return "No directly matching database lesson was found.";
  }

  return sources
    .map(
      (source, index) =>
        `
SOURCE ${index + 1}

Question:
${source.question}

Category:
${source.category}

Bible references:
${source.bible_references}

Church sources:
${source.church_sources}

Lesson:
${source.answer}
`
    )
    .join("\n");
}

export default async function handler(
  req,
  res
) {
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
        error: error.message
      });
    }

    const relevant =
      findRelevantLessons(
        rows,
        question,
        language
      );

    const sources =
      buildSources(
        relevant
      );

    /*
     * IMPORTANT:
     * Supabase is the fallback.
     * Gemini is optional.
     */
    let answer = null;
    let aiStatus = "not_used";

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
          aiStatus = "gemini";
        }
      } catch (error) {
        console.error(
          "GEMINI_FALLBACK:",
          error
        );

        aiStatus =
          error.code === "QUOTA"
            ? "quota_fallback"
            : error.code === "BUSY"
            ? "busy_fallback"
            : "error_fallback";
      }
    }

    /*
     * If Gemini is unavailable,
     * ALWAYS return the database answer.
     */
    if (!answer) {
      answer =
        buildDirectAnswer(
          sources,
          question,
          language
        );
    }

    return res.status(200).json({
      success: true,
      answer,
      language,
      model:
        aiStatus === "gemini"
          ? MODEL_NAME
          : "supabase-fallback",
      ai_status: aiStatus,
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
