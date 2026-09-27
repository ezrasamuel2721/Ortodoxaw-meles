export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { question, language = "am" } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        error: "Supabase environment variables are not configured"
      });
    }

    if (!geminiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const languageNames = {
      am: "Amharic",
      en: "English",
      ti: "Tigrinya",
      om: "Afaan Oromoo",
      ar: "Arabic",
      fr: "French",
      de: "German",
      it: "Italian",
      es: "Spanish",
      pt: "Portuguese",
      ru: "Russian"
    };

    const answerLanguage =
      languageNames[language] || "Amharic";

    /*
     * =========================================================
     * 1. NORMALIZE QUESTION
     * =========================================================
     */

    const originalQuestion = question.trim();

    const normalizedQuestion = originalQuestion
      .toLowerCase()
      .replace(/[።፣፤፥፦፧፨.,!?;:()[\]{}"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    /*
     * =========================================================
     * 2. SEARCH TERMS
     * =========================================================
     *
     * We keep the user's important words, but also add
     * theological related terms for major subjects.
     */

    const rawTerms = normalizedQuestion
      .split(/\s+/)
      .filter(word => word.length >= 2)
      .slice(0, 18);

    const relatedTerms = [];

    const questionHas = (...words) =>
      words.some(word =>
        normalizedQuestion.includes(word)
      );

    /*
     * ---------------------------------------------------------
     * COMMUNION / EUCHARIST
     * ---------------------------------------------------------
     */

    if (
      questionHas(
        "ቁርባን",
        "ቅዱስ ቁርባን",
        "ምሥጢረ ቁርባን",
        "ቁርባንን",
        "eucharist",
        "communion"
      )
    ) {
      relatedTerms.push(
        "ቁርባን",
        "ምሥጢረ ቁርባን",
        "ሥጋ",
        "ደም",
        "ቅዳሴ",
        "ጽዋ",
        "ኅብስት",
        "መሥዋዕት",
        "ፋሲካ",
        "መና",
        "ማልከሴዴቅ",
        "ኪዳን",
        "ምሥጢር",
        "ንስሐ",
        "ቅድስና",
        "ሐዋርያት",
        "አበው",
        "ሊቃውንት",
        "ዮሐንስ አፈወርቅ",
        "ቄርሎስ"
      );
    }

    /*
     * ---------------------------------------------------------
     * BAPTISM
     * ---------------------------------------------------------
     */

    if (
      questionHas(
        "ጥምቀት",
        "ጥምቀቱ",
        "መጠመቅ",
        "baptism"
      )
    ) {
      relatedTerms.push(
        "ጥምቀት",
        "ውሃ",
        "ተወልደ",
        "ክርስቶስ",
        "መንፈስ ቅዱስ",
        "ንስሐ",
        "ምሥጢር",
        "ሕፃን"
      );
    }

    /*
     * ---------------------------------------------------------
     * GENERAL THEOLOGY
     * ---------------------------------------------------------
     */

    if (
      questionHas(
        "ሃይማኖት",
        "ትምህርተ ሃይማኖት",
        "እምነት",
        "theology"
      )
    ) {
      relatedTerms.push(
        "ሥላሴ",
        "ክርስቶስ",
        "መንፈስ ቅዱስ",
        "ቤተክርስቲያን",
        "ምሥጢራት",
        "ሐዋርያት",
        "አበው",
        "ትውፊት"
      );
    }

    const searchTerms = [
      ...new Set([
        ...rawTerms,
        ...relatedTerms
      ])
    ].slice(0, 40);

    /*
     * =========================================================
     * 3. SUPABASE SEARCH
     * =========================================================
     */

    const orConditions = [];

    for (const term of searchTerms) {
      const safeTerm = term
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_");

      orConditions.push(`topic.ilike.%${safeTerm}%`);
      orConditions.push(`keywords.ilike.%${safeTerm}%`);
      orConditions.push(`content.ilike.%${safeTerm}%`);
      orConditions.push(`section_title.ilike.%${safeTerm}%`);
      orConditions.push(`source_label.ilike.%${safeTerm}%`);
    }

    let knowledge = [];

    if (orConditions.length > 0) {
      const supabaseSearchUrl =
        `${supabaseUrl}/rest/v1/orthodox_source_chunks` +
        `?select=*` +
        `&or=(${orConditions.join(",")})` +
        `&limit=120`;

      const supabaseResponse = await fetch(
        supabaseSearchUrl,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (supabaseResponse.ok) {
        knowledge = await supabaseResponse.json();
      } else {
        const errorText =
          await supabaseResponse.text();

        console.error(
          "Supabase search error:",
          errorText
        );
      }
    }

    /*
     * =========================================================
     * 4. RANK KNOWLEDGE
     * =========================================================
     */

    knowledge = knowledge
      .map(item => {
        let score = 0;

        const topic =
          String(item.topic || "").toLowerCase();

        const title =
          String(item.section_title || "").toLowerCase();

        const keywords =
          String(item.keywords || "").toLowerCase();

        const content =
          String(item.content || "").toLowerCase();

        const source =
          String(item.source_label || "").toLowerCase();

        /*
         * Exact question/topic matches
         */

        if (
          topic &&
          normalizedQuestion.includes(topic)
        ) {
          score += 35;
        }

        if (
          title &&
          normalizedQuestion.includes(title)
        ) {
          score += 25;
        }

        /*
         * Term matches
         */

        for (const term of searchTerms) {
          const t = term.toLowerCase();

          if (topic.includes(t)) {
            score += 12;
          }

          if (title.includes(t)) {
            score += 10;
          }

          if (keywords.includes(t)) {
            score += 8;
          }

          if (source.includes(t)) {
            score += 6;
          }

          if (content.includes(t)) {
            score += 2;
          }
        }

        /*
         * Verified sources receive priority.
         */

        if (item.verified === true) {
          score += 10;
        }

        /*
         * Sources with citation metadata receive priority.
         */

        if (
          item.page_text ||
          item.chapter_text ||
          item.verse_text
        ) {
          score += 8;
        }

        /*
         * Patristic / Scripture source indicators
         */

        if (
          /bible|መጽሐፍ|ወንጌል|ቅዱስ|father|homily|catechetical/i
            .test(source)
        ) {
          score += 5;
        }

        return {
          ...item,
          _score: score
        };
      })
      .sort((a, b) =>
        b._score - a._score
      )
      .slice(0, 80);

    /*
     * =========================================================
     * 5. BUILD SOURCE CONTEXT
     * =========================================================
     *
     * We explicitly expose citation metadata to Gemini.
     */

    const knowledgeContext = knowledge
      .map((item, index) => {
        return `
==================================================
SOURCE ${index + 1}
==================================================

ID:
${item.id || ""}

SOURCE ID:
${item.source_id || ""}

SOURCE LABEL:
${item.source_label || ""}

TOPIC:
${item.topic || ""}

SECTION:
${item.section_title || ""}

LANGUAGE:
${item.language || ""}

VERIFIED:
${item.verified ? "YES" : "NO"}

PAGE / BIBLIOGRAPHIC INFORMATION:
${item.page_text || ""}

CHAPTER INFORMATION:
${item.chapter_text || ""}

VERSE INFORMATION:
${item.verse_text || ""}

KEYWORDS:
${item.keywords || ""}

CONTENT:
${item.content || ""}
`;
      })
      .join("\n");

    /*
     * =========================================================
     * 6. IMPORTANT SCRIPTURE MAP
     * =========================================================
     *
     * This is a research guide, not a replacement for source
     * verification. Gemini must distinguish direct teaching
     * from Old Testament typology.
     */

    let subjectScriptureGuide = "";

    if (
      questionHas(
        "ቁርባን",
        "ቅዱስ ቁርባን",
        "ምሥጢረ ቁርባን",
        "eucharist",
        "communion"
      )
    ) {
      subjectScriptureGuide = `
For the subject of Holy Communion/Eucharist, examine
the following Biblical passages where relevant.

OLD TESTAMENT / TYPOLOGICAL BACKGROUND:

1. Genesis 14:18
   Melchizedek brings bread and wine.

2. Exodus 12
   The Passover lamb and covenant meal.

3. Exodus 16
   Manna from heaven.

4. Exodus 24:3-8
   Covenant, sacrifice, blood, and the people.

5. Leviticus 24:5-9
   The bread of the Presence.

6. Proverbs 9:1-6
   Wisdom prepares bread and wine and invites people
   to eat and drink.

7. Isaiah 25:6
   The Lord's eschatological feast.

8. Isaiah 55:1-3
   Invitation to eat and drink and receive life.

9. Jeremiah 31:31-34
   The promise of the New Covenant.

10. Malachi 1:10-11
    The prophecy concerning a pure offering among
    the nations.

IMPORTANT:
Do not call every Old Testament passage a direct
institution of the Eucharist. Explain whether it is
a type, figure, prophecy, preparation, or direct New
Testament fulfillment according to the Church's
interpretive tradition.

NEW TESTAMENT:

1. Matthew 26:26-29
   Institution of the Eucharist.

2. Mark 14:22-25
   Institution of the Eucharist.

3. Luke 22:14-20
   Institution of the Eucharist and New Covenant.

4. John 6:22-59
   Bread of Life discourse, including verses
   concerning eating Christ's flesh and drinking
   His blood.

5. Acts 2:42
   Apostolic fellowship, breaking of bread, and
   prayers.

6. Acts 20:7
   Gathering on the first day of the week for
   breaking bread.

7. 1 Corinthians 10:16-17
   The cup of blessing and the bread as communion
   in Christ's blood and body.

8. 1 Corinthians 10:18-21
   Sacrificial communion and the Lord's table.

9. 1 Corinthians 11:23-34
   Tradition received from the Lord, institution,
   remembrance, examination, and warning concerning
   receiving unworthily.

10. Hebrews 9:11-15
    Christ as High Priest and the New Covenant.

11. Hebrews 10:19-25
    Access to God through Christ's sacrifice and
    gathering together in faith.

12. Hebrews 13:10
    Teaching concerning the altar.

Only use passages that genuinely support the particular
claim being made.
`;
    }

    /*
     * =========================================================
     * 7. HIGH-QUALITY THEOLOGICAL PROMPT
     * =========================================================
     */

    const prompt = `
You are "Orthodox Answer" (ኦርቶዶክሳዊ መልስ),
an Ethiopian Orthodox Tewahedo Christian theological
and historical educational assistant.

Your task is NOT to give a short generic answer.

Your task is to produce a serious, detailed,
well-structured theological answer based primarily
on the supplied verified knowledge and clearly
identified sources.

==================================================
USER QUESTION
==================================================

${originalQuestion}

==================================================
ANSWER LANGUAGE
==================================================

${answerLanguage}

==================================================
RESEARCH GUIDE
==================================================

${subjectScriptureGuide}

==================================================
SUPPLIED KNOWLEDGE
==================================================

${knowledgeContext || "No directly matching verified source was found."}

==================================================
CORE RULES
==================================================

1. Answer according to the teaching of the Ethiopian
   Orthodox Tewahedo Church.

2. Give a substantial answer. Do not answer in only
   a few sentences.

3. Explain the subject progressively:
   definition → theological meaning → Biblical
   evidence → historical development → Church Fathers
   → Ethiopian Tewahedo tradition → practical/spiritual
   meaning → conclusion.

4. When appropriate, use these headings:

   መግቢያ

   የቃሉ ትርጉም

   ዋና የሥነ መለኮት ትምህርት

   የብሉይ ኪዳን ማስረጃዎች

   የሐዲስ ኪዳን ማስረጃዎች

   የሐዋርያት ትምህርት

   የቅዱሳን አበው ትምህርት

   የኢትዮጵያ ሊቃውንትና ተዋሕዶ ትውፊት

   የታሪክ ማስረጃ

   ማብራሪያና ምሳሌ

   ተቃራኒ አመለካከቶች ካሉ

   መደምደሚያ

   Use only headings that actually fit.

==================================================
BIBLICAL EVIDENCE RULE
==================================================

5. When the question concerns a Biblical doctrine,
   do not mention only one or two verses when several
   relevant passages are available in the supplied
   knowledge and research guide.

6. Separate:

   A. direct New Testament teaching

   B. Old Testament type/figure

   C. prophecy

   D. historical/liturgical interpretation

7. Never falsely say that an Old Testament passage
   directly teaches a doctrine if it is being used
   typologically.

8. Give exact book, chapter and verse whenever known.

9. Never invent a verse number.

==================================================
CHURCH FATHERS RULE
==================================================

10. Do NOT write:

   "The Church Fathers generally teach..."

   when specific Fathers can be identified.

11. Instead, organize Fathers individually.

Example:

   ### ቅዱስ ዮሐንስ አፈወርቅ

   መጽሐፍ/ስብከት:
   [exact title if supplied]

   ምዕራፍ/Homily:
   [exact number if supplied]

   የትምህርቱ ይዘት:
   [accurate summary]

   ቀጥተኛ ጥቅስ:
   [ONLY if exact quotation exists in supplied source]

   ማጣቀሻ:
   [edition/volume/page ONLY if verified]

12. Do the same for other Fathers such as:

   - St. John Chrysostom
   - St. Cyril of Alexandria
   - St. Cyril of Jerusalem
   - St. Justin Martyr
   - St. Ignatius of Antioch

   BUT only claim what is actually supported by
   the supplied sources.

13. Never invent a quotation.

14. Never put quotation marks around a paraphrase.

==================================================
PAGE NUMBER RULE
==================================================

15. PAGE NUMBERS MUST NEVER BE INVENTED.

16. Page numbers vary by edition.

17. If the exact edition and page are supplied,
   provide:

   Book
   Volume
   Homily/Chapter
   Edition
   Page

18. If the page is not verified, say:

   "የገጽ ቁጥሩ በተጠቀሰው የእትም መረጃ ውስጥ
   አልተረጋገጠም።"

   Do NOT guess a page.

==================================================
ETHIOPIAN TEWAHEDO SOURCES
==================================================

19. Give Ethiopian Orthodox Tewahedo sources their
   own section when relevant.

20. Distinguish between:

   - Holy Scripture
   - Apostolic teaching
   - Church Fathers
   - Canonical/liturgical texts
   - Ethiopian theological literature
   - Historical tradition
   - Later explanatory material

21. If an Ethiopian scholar is named in the supplied
   knowledge, explain his/her teaching specifically.

22. Do not invent Ethiopian book titles, quotations,
   page numbers, or authors.

==================================================
SOURCE FIDELITY
==================================================

23. The supplied knowledge is the primary evidence.

24. If the supplied source gives exact bibliographic
   information, preserve it.

25. If it gives an exact quotation, you may quote it.

26. If it only gives a summary, label it as a summary.

27. Never turn a summary into a quotation.

28. Never invent missing bibliographic information.

29. If the knowledge base is insufficient for a precise
   historical or theological claim, clearly state that
   the available verified source material is insufficient.

==================================================
ANSWER QUALITY
==================================================

30. Explain difficult theological concepts in language
   understandable to an ordinary reader.

31. At the same time, retain theological precision.

32. Do not repeat the same paragraph.

33. Do not mix unrelated topics into the answer.

34. If the question asks "why", explain the reasons.

35. If it asks "how", explain the process.

36. If it asks "what did Father X teach", focus on
   Father X rather than giving a generic Christian answer.

37. If it asks for historical development, give a
   chronological explanation where the evidence allows.

38. If it asks for Biblical proof, prioritize Scripture.

39. If it asks for Tewahedo doctrine, clearly identify
   the Ethiopian Orthodox Tewahedo position.

==================================================
CONTROVERSIAL QUESTIONS
==================================================

40. When comparing Orthodox Tewahedo teaching with
   Protestant, Catholic, Muslim, Jehovah's Witness,
   "Only Jesus", atheist, or other positions:

   - explain the difference respectfully
   - do not insult another religion
   - do not caricature another position
   - clearly identify the Tewahedo position
   - distinguish historical fact from theological belief

==================================================
LANGUAGE
==================================================

41. Write the final answer entirely in the requested
   language.

42. Do not randomly switch languages.

43. Preserve necessary proper names and book titles
   when needed.

==================================================
CITATION STYLE
==================================================

44. When evidence is available, use readable references
   such as:

   (ማቴዎስ 26፥26–28)

   (ዮሐንስ 6፥53–56)

   (1ኛ ቆሮንቶስ 10፥16–17)

   (1ኛ ቆሮንቶስ 11፥23–29)

45. For Church Fathers, use:

   ቅዱስ ዮሐንስ አፈወርቅ,
   Homily 82 on Matthew,
   Matthew 26፥26–28

   and add edition/page only when verified.

==================================================
FINAL INSTRUCTION
==================================================

Produce the deepest accurate answer possible from
the available verified material.

Do NOT sacrifice accuracy for length.

Do NOT invent evidence to make the answer look scholarly.

Do NOT mention:

- Supabase
- database
- AI
- prompt
- system
- internal API
- search process

The reader should experience the result as a carefully
researched Ethiopian Orthodox Tewahedo theological answer.
`;

    /*
     * =========================================================
     * 8. GEMINI MODELS
     * =========================================================
     *
     * Use currently supported Interactions API models.
     */

    const models = [
      "gemini-3.8-flash",
      "gemini-3.6-flash"
    ];

    let lastError = null;

    /*
     * =========================================================
     * 9. CALL GEMINI
     * =========================================================
     */

    for (const model of models) {
      try {
        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/interactions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiKey
            },
            body: JSON.stringify({
              model,
              input: prompt
            })
          }
        );

        const data = await response.json();

        /*
         * Temporary overload / server errors:
         * try the next supported model.
         */

        if (
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          console.error(
            `Gemini ${model} temporarily unavailable:`,
            data
          );

          lastError =
            data?.error?.message ||
            `Model ${model} unavailable`;

          continue;
        }

        if (!response.ok) {
          console.error(
            `Gemini API error (${model}):`,
            data
          );

          return res.status(response.status).json({
            error:
              data?.error?.message ||
              "Gemini API request failed"
          });
        }

        /*
         * =====================================================
         * 10. EXTRACT ANSWER
         * =====================================================
         */

        let answer = "";

        if (
          typeof data.output_text === "string"
        ) {
          answer =
            data.output_text.trim();
        }

        /*
         * REST responses may provide steps.
         */

        if (
          !answer &&
          Array.isArray(data.steps)
        ) {
          answer = data.steps
            .filter(
              step =>
                step?.type === "model_output"
            )
            .flatMap(
              step =>
                Array.isArray(step.content)
                  ? step.content
                  : []
            )
            .filter(
              content =>
                content?.type === "text"
            )
            .map(
              content =>
                content.text || ""
            )
            .join("\n")
            .trim();
        }

        /*
         * Compatibility fallback.
         */

        if (
          !answer &&
          Array.isArray(data.outputs)
        ) {
          answer = data.outputs
            .map(item => {
              if (
                typeof item === "string"
              ) {
                return item;
              }

              if (
                typeof item?.text === "string"
              ) {
                return item.text;
              }

              if (
                Array.isArray(item?.content)
              ) {
                return item.content
                  .map(
                    content =>
                      content?.text || ""
                  )
                  .join("");
              }

              return "";
            })
            .join("\n")
            .trim();
        }

        if (!answer) {
          lastError =
            "Gemini returned no answer";

          continue;
        }

        /*
         * =====================================================
         * 11. RETURN
         * =====================================================
         */

        return res.status(200).json({
          answer,
          source:
            knowledge.length > 0
              ? "Orthodox Knowledge Base + Gemini AI"
              : "Gemini AI – Orthodox Christian Context",
          language,
          knowledge_count:
            knowledge.length,
          model
        });

      } catch (modelError) {
        console.error(
          `Error using ${model}:`,
          modelError
        );

        lastError =
          modelError?.message ||
          "Model error";

        continue;
      }
    }

    /*
     * =========================================================
     * 12. ALL MODELS FAILED
     * =========================================================
     */

    return res.status(503).json({
      error:
        "Gemini AI is temporarily unavailable. Please try again shortly.",
      details:
        lastError ||
        "All Gemini models were unavailable."
    });

  } catch (error) {
    console.error(
      "Server error:",
      error
    );

    return res.status(500).json({
      error:
        error?.message ||
        "Internal server error"
    });
  }
}
