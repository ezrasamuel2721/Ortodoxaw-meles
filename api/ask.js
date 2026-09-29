// ============================================================
// api/ask.js
// ኦርቶዶክሳዊ መልስ
//
// SUPABASE KNOWLEDGE BASE + GEMINI
//
// ይህ ስሪት:
// 1. orthodox_answers ይፈልጋል
// 2. orthodox_sources ይፈልጋል
// 3. orthodox_source_chunks ይፈልጋል
// 4. በጥያቄው ርዕስ ላይ ተዛማጅ ይዘቶችን ያሰባስባል
// 5. የማይመለከት ርዕስ እንዳይቀላቀል ያጣራል
// 6. Gemini የተሰጠውን ምንጭ ብቻ ተጠቅሞ ያደራጃል
// 7. አጭር መልስ እንዳይሰጥ ጠንካራ መመሪያ አለው
// 8. የማይገኝ ምንጭ እንዳይፈጥር ይከለክላል
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY;

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";

// ------------------------------------------------------------
// LANGUAGE MAP
// ------------------------------------------------------------

const LANGUAGE_NAMES = {
  am: "አማርኛ",
  en: "English",
  ti: "ትግርኛ",
  om: "Afaan Oromoo",
  ar: "العربية",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  es: "Español",
  pt: "Português",
  ru: "Русский",
  sid: "Sidaamu Afoo",
  wal: "Wolayttatto",
  kaa: "Kaffoono",
  gez: "ጉራጊኛ",
  el: "Ελληνικά",
  he: "עברית"
};

// ------------------------------------------------------------
// BASIC HELPERS
// ------------------------------------------------------------

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[።፣፤፥፦፧፨]/g, " ")
    .replace(/[.,!?;:'"()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function safeString(value) {
  return value == null ? "" : String(value);
}

function escapePostgrestValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

// ------------------------------------------------------------
// IMPORTANT ORTHODOX TOPIC GROUPS
//
// These help retrieval when the user asks with one word but
// the knowledge base contains related terminology.
// ------------------------------------------------------------

const TOPIC_GROUPS = {
  "ጥምቀት": [
    "ጥምቀት",
    "ጠመቀ",
    "ተጠምቀ",
    "ውኃ",
    "ውሃ",
    "አዲስ ልደት",
    "ከውኃና ከመንፈስ",
    "መንፈስ ቅዱስ",
    "ሥላሴ",
    "ሞትና ትንሣኤ",
    "ልደት",
    "ምሥጢር",
    "ሕፃናት ጥምቀት",
    "ክርስቲያናዊ ሕይወት"
  ],

  "ቁርባን": [
    "ቁርባን",
    "ቅዱስ ቁርባን",
    "ሥጋና ደም",
    "ሥጋውና ደሙ",
    "ምሥጢረ ቁርባን",
    "እንጀራ",
    "ወይን",
    "ቅዳሴ",
    "መሥዋዕት",
    "ሐዋርያት"
  ],

  "ንስሐ": [
    "ንስሐ",
    "ንስሐ ገባ",
    "ኃጢአት",
    "ኃጢአትን መተው",
    "ንስሐ አባት",
    "ይቅርታ",
    "መመለስ"
  ],

  "ሥላሴ": [
    "ሥላሴ",
    "አብ",
    "ወልድ",
    "መንፈስ ቅዱስ",
    "አንድ አምላክ",
    "ሦስት አካላት"
  ],

  "ሥጋዌ": [
    "ሥጋዌ",
    "ተዋሕዶ",
    "ወልደ እግዚአብሔር",
    "ኢየሱስ ክርስቶስ",
    "ድንግል ማርያም",
    "ሰው ሆነ",
    "ሰውነት"
  ],

  "ማርያም": [
    "ማርያም",
    "ድንግል",
    "ቅድስት ድንግል",
    "እመቤታችን",
    "እናተ አምላክ",
    "ወላዲተ አምላክ"
  ],

  "መስቀል": [
    "መስቀል",
    "መስቀለ ክርስቶስ",
    "ስቅለት",
    "ጎልጎታ",
    "መድኃኒት"
  ],

  "ጾም": [
    "ጾም",
    "ጾምና ጸሎት",
    "የጾም ሕግ",
    "አብይ ጾም",
    "ጾመ ነነዌ",
    "ጾመ ማርያም"
  ],

  "ጸሎት": [
    "ጸሎት",
    "ጸለየ",
    "ጸሎተ አበው",
    "መጸለይ",
    "ልመና",
    "ምስጋና"
  ]
};

// ------------------------------------------------------------
// FIND MAIN TOPIC
// ------------------------------------------------------------

function detectTopic(question) {
  const q = normalizeText(question);

  for (const [topic, words] of Object.entries(TOPIC_GROUPS)) {
    for (const word of words) {
      if (q.includes(normalizeText(word))) {
        return topic;
      }
    }
  }

  return null;
}

// ------------------------------------------------------------
// EXTRACT IMPORTANT TERMS
// ------------------------------------------------------------

function extractTerms(question) {
  const q = normalizeText(question);

  const words = q
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const topic = detectTopic(question);

  let terms = [...words];

  if (topic && TOPIC_GROUPS[topic]) {
    terms = terms.concat(TOPIC_GROUPS[topic]);
  }

  return unique(
    terms
      .map(normalizeText)
      .filter(Boolean)
  ).slice(0, 40);
}

// ------------------------------------------------------------
// SCORE A KNOWLEDGE RECORD
// ------------------------------------------------------------

function scoreRecord(record, terms, question, topic) {
  const fields = [
    record.question,
    record.answer,
    record.category,
    record.bible_references,
    record.church_sources,
    record.comparison_group
  ];

  const text = normalizeText(fields.join(" "));
  const q = normalizeText(question);

  let score = 0;

  // Exact question
  if (normalizeText(record.question) === q) {
    score += 100;
  }

  // Question contains exact stored question
  if (
    normalizeText(record.question).includes(q) ||
    q.includes(normalizeText(record.question))
  ) {
    score += 60;
  }

  // Topic
  if (topic) {
    if (text.includes(normalizeText(topic))) {
      score += 30;
    }
  }

  // Terms
  for (const term of terms) {
    if (!term) continue;

    if (text.includes(term)) {
      score += 4;
    }

    if (
      normalizeText(record.question).includes(term)
    ) {
      score += 12;
    }

    if (
      normalizeText(record.category).includes(term)
    ) {
      score += 8;
    }

    if (
      normalizeText(record.bible_references).includes(term)
    ) {
      score += 5;
    }

    if (
      normalizeText(record.church_sources).includes(term)
    ) {
      score += 5;
    }
  }

  return score;
}

// ------------------------------------------------------------
// SCORE SOURCE CHUNK
// ------------------------------------------------------------

function scoreChunk(record, terms, question, topic) {
  const fields = [
    record.section_title,
    record.content,
    record.page_text,
    record.chapter_text,
    record.verse_text,
    record.topic,
    record.keywords,
    record.source_label,
    record.perspective
  ];

  const text = normalizeText(fields.join(" "));
  const q = normalizeText(question);

  let score = 0;

  if (record.verified === true) {
    score += 5;
  }

  if (topic && text.includes(normalizeText(topic))) {
    score += 35;
  }

  if (
    normalizeText(record.topic).includes(normalizeText(topic || ""))
  ) {
    score += 25;
  }

  if (
    normalizeText(record.keywords).includes(normalizeText(topic || ""))
  ) {
    score += 20;
  }

  for (const term of terms) {
    if (text.includes(term)) {
      score += 3;
    }

    if (
      normalizeText(record.topic).includes(term)
    ) {
      score += 10;
    }

    if (
      normalizeText(record.keywords).includes(term)
    ) {
      score += 8;
    }

    if (
      normalizeText(record.section_title).includes(term)
    ) {
      score += 6;
    }
  }

  if (text.includes(q)) {
    score += 30;
  }

  return score;
}

// ------------------------------------------------------------
// SUPABASE FETCH
// ------------------------------------------------------------

async function supabaseFetch(path) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${response.status}: ${bodyText}`
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------
// GET ALL ANSWERS FOR LANGUAGE
//
// Current table has only 92 rows, so retrieving the whole
// language set is practical and prevents missing related records.
// ------------------------------------------------------------

async function getAnswerRecords(language) {
  const lang = encodeURIComponent(language);

  const path =
    `orthodox_answers?select=*` +
    `&language=eq.${lang}` +
    `&order=id.asc` +
    `&limit=1000`;

  return await supabaseFetch(path);
}

// ------------------------------------------------------------
// GET SOURCE CHUNKS
//
// We retrieve the available source chunks for the selected
// language. If there are no chunks in that language, Amharic
// source chunks are used as the Orthodox source base and Gemini
// translates/organizes them into the requested language.
// ------------------------------------------------------------

async function getSourceChunks(language) {
  const lang = encodeURIComponent(language);

  const selected = await supabaseFetch(
    `orthodox_source_chunks?select=*` +
    `&language=eq.${lang}` +
    `&order=id.asc` +
    `&limit=1000`
  );

  if (selected.length > 0) {
    return selected;
  }

  if (language !== "am") {
    return await supabaseFetch(
      `orthodox_source_chunks?select=*` +
      `&language=eq.am` +
      `&order=id.asc` +
      `&limit=1000`
    );
  }

  return [];
}

// ------------------------------------------------------------
// GET SOURCE METADATA
// ------------------------------------------------------------

async function getSources(language) {
  const lang = encodeURIComponent(language);

  let rows = await supabaseFetch(
    `orthodox_sources?select=*` +
    `&language=eq.${lang}` +
    `&order=id.asc` +
    `&limit=1000`
  );

  if (
    rows.length === 0 &&
    language !== "am"
  ) {
    rows = await supabaseFetch(
      `orthodox_sources?select=*` +
      `&language=eq.am` +
      `&order=id.asc` +
      `&limit=1000`
    );
  }

  return rows;
}

// ------------------------------------------------------------
// BUILD KNOWLEDGE PACKAGE
// ------------------------------------------------------------

function buildKnowledgePackage(
  answers,
  chunks,
  sources,
  question,
  language
) {
  const terms = extractTerms(question);
  const topic = detectTopic(question);

  // ------------------------------------------
  // SCORE ANSWERS
  // ------------------------------------------

  const rankedAnswers = answers
    .map(row => ({
      ...row,
      _score: scoreRecord(
        row,
        terms,
        question,
        topic
      )
    }))
    .filter(row => row._score > 0)
    .sort((a, b) => b._score - a._score);

  // ------------------------------------------
  // SCORE CHUNKS
  // ------------------------------------------

  const rankedChunks = chunks
    .map(row => ({
      ...row,
      _score: scoreChunk(
        row,
        terms,
        question,
        topic
      )
    }))
    .filter(row => row._score > 0)
    .sort((a, b) => b._score - a._score);

  // ------------------------------------------
  // Keep a large amount of context.
  //
  // The purpose is NOT to give Gemini one answer.
  // The purpose is to give Gemini the complete relevant
  // knowledge available in the current database.
  // ------------------------------------------

  const selectedAnswers =
    rankedAnswers.slice(0, 50);

  const selectedChunks =
    rankedChunks.slice(0, 100);

  // ------------------------------------------
  // Remove internal scoring before sending.
  // ------------------------------------------

  const cleanAnswers =
    selectedAnswers.map(row => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      language: row.language,
      category: row.category,
      education_level: row.education_level,
      bible_references: row.bible_references,
      church_sources: row.church_sources,
      comparison_group: row.comparison_group
    }));

  const cleanChunks =
    selectedChunks.map(row => ({
      id: row.id,
      source_id: row.source_id,
      section_title: row.section_title,
      content: row.content,
      page_text: row.page_text,
      chapter_text: row.chapter_text,
      verse_text: row.verse_text,
      topic: row.topic,
      keywords: row.keywords,
      language: row.language,
      verified: row.verified,
      source_label: row.source_label,
      perspective: row.perspective
    }));

  const cleanSources =
    sources.map(row => ({
      id: row.id,
      title: row.title,
      author: row.author,
      source_type: row.source_type,
      language: row.language,
      citation: row.citation,
      publisher: row.publisher,
      year_text: row.year_text,
      source_url: row.source_url,
      verified: row.verified,
      notes: row.notes,
      perspective: row.perspective
    }));

  return {
    requested_language: language,
    requested_language_name:
      LANGUAGE_NAMES[language] || language,

    detected_topic: topic,

    search_terms: terms,

    answer_records: cleanAnswers,

    source_records: cleanSources,

    source_chunks: cleanChunks,

    statistics: {
      total_answer_records: answers.length,
      matched_answer_records:
        cleanAnswers.length,

      total_source_chunks: chunks.length,
      matched_source_chunks:
        cleanChunks.length,

      total_sources: sources.length
    }
  };
}

// ------------------------------------------------------------
// SYSTEM PROMPT
// ------------------------------------------------------------

const SYSTEM_PROMPT = `
አንተ "ኦርቶዶክሳዊ መልስ" የተባለ የኢትዮጵያ
ኦርቶዶክስ ተዋሕዶ መንፈሳዊ ጥያቄና መልስ ሞተር ነህ።

ዋና ተግባርህ ለተጠየቀው ጥያቄ አጭር መልስ መስጠት
አይደለም።

የተጠየቀውን ርዕስ በጥልቀት መርምረህ፣
በKnowledge Base የተገኙትን ተዛማጅ ምንጮች ሁሉ
በመጠቀም ሙሉ፣ የተደራጀ፣ ዝርዝር እና ትምህርታዊ
መልስ ማቅረብ አለብህ።

============================================================
ዋና ሕግ
============================================================

ከKnowledge Base የተሰጠህን ምንጭ በመሠረት አድርግ።

ከምንጩ ውጭ ያልተረጋገጠ መረጃ አትፍጠር።

የሌለውን የመጽሐፍ ቅዱስ ጥቅስ አትፍጠር።

የሌለውን የቅዱሳን አባቶች ጥቅስ አትፍጠር።

የሌለውን የኢትዮጵያ ሊቅ ቃል አትፍጠር።

የሌለውን መጽሐፍ፣ ምዕራፍ፣ ገጽ ወይም ማጣቀሻ
አትፍጠር።

============================================================
1. የጥያቄውን ርዕስ ለይ
============================================================

የተጠየቀውን ዋና ርዕስ ለይ።

ለምሳሌ "ጥምቀት ምንድነው?" ከሆነ፣
ርዕሱ ጥምቀት ነው።

ከዚያ ጥምቀትን በቀጥታ የሚመለከቱ
እንደ፦
- ውኃ
- አዲስ ልደት
- መንፈስ ቅዱስ
- ሥላሴ
- ክርስቶስ ሞትና ትንሣኤ
- ንስሐ
- እምነት
- ምሥጢር
- ሕፃናት ጥምቀት

ያሉ ተዛማጅ ጉዳዮችን አካትት።

ነገር ግን ከዋናው ርዕስ ጋር የማይዛመዱ
ጉዳዮችን አታስገባ።

============================================================
2. የመጽሐፍ ቅዱስ ማስረጃ
============================================================

በKnowledge Base ውስጥ በጥያቄው ርዕስ ላይ
የተገኙትን ተዛማጅ የመጽሐፍ ቅዱስ
ማጣቀሻዎች በበቂ ስፋት አካትት።

አንድ ወይም ሁለት ጥቅሶች ብቻ አትጠቀም።

ምንጩ የጥቅሱን ጽሑፍ ካካተተ እና ለመጠቀም
ፈቃድ ያለው ከሆነ አጭር ቀጥተኛ ጥቅስ በጥቅስ
ምልክት አሳይ።

የምንጩ ሙሉ ጽሑፍ ከሌለ ጥቅሱን አትፍጠር።

የቅጂ መብት ያለውን መጽሐፍ ሙሉ በሙሉ
ቃል በቃል አታባዛ።

============================================================
3. የቅዱሳን አባቶች ትምህርት
============================================================

በKnowledge Base ውስጥ በርዕሱ ላይ የተገኙ
የቅዱሳን አባቶች ምንጮችን ሁሉ አጣራ።

ለእያንዳንዱ ምንጭ፦
- የአባቱ ስም
- የመጽሐፉ ስም
- ካለ ምዕራፍ/ክፍል
- የትምህርቱ ዋና ሐሳብ
- ከጥያቄው ጋር ያለው ግንኙነት

አቅርብ።

በKnowledge Base ውስጥ ያለ ቃል በቃል ጥቅስ እና
የቅጂ መብት ሁኔታ የሚፈቅደው ከሆነ በታማኝነት
ጥቀስ።

ካልተረጋገጠ ግን በራስህ አትፍጠር።

============================================================
4. የኢትዮጵያ ሊቃውንት
============================================================

በKnowledge Base ውስጥ በርዕሱ ላይ የተገኙ
የኢትዮጵያ ሊቃውንት ትምህርቶችን ሁሉ
አጣራ።

ምንጩ ካለ፦
- ስም
- መጽሐፍ
- ምዕራፍ/ክፍል
- ገጽ ካለ
- የትምህርቱ ይዘት

አሳይ።

የማታገኘውን የሊቅ ቃል አትፍጠር።

============================================================
5. የሌሎች እምነቶች አቋም
============================================================

ጥያቄው ንጽጽር ከፈለገ፣ በKnowledge Base
የተገኘውን የሌሎች እምነቶች አቋም በትክክል
አቅርብ።

ለምሳሌ፦
- ፕሮቴስታንት
- ካቶሊክ
- የይሖዋ ምስክሮች
- ሙስሊም
- ሌሎች

እያንዳንዱን አቋም እንደራሱ ምንጭ አቅርብ።

የሌላ እምነት አቋም አትፍጠር።

============================================================
6. ኦርቶዶክሳዊ ንጽጽር
============================================================

ንጽጽር አስፈላጊ ከሆነ፦

"የኦርቶዶክስ ትምህርት"
እና
"የሌላው አቋም"

በግልጽ ለይ።

ከዚያ የኦርቶዶክስ ትምህርት
በመጽሐፍ ቅዱስ፣ በቅዱሳን አባቶች
እና በቤተ ክርስቲያን ትውፊት መሠረት
እንዴት እንደሚታበራራ ግለጽ።

============================================================
7. ሙሉ መልስ
============================================================

በፍጹም አጭር መልስ አትስጥ።

"በአጭሩ" ብለህ በጥቂት መስመሮች አትጨርስ።

የKnowledge Base ምንጮች ብዙ ከሆኑ ሁሉንም
ተዛማጅ ነገሮች በተደራጀ መልኩ አካትት።

ርዝመት ለማሳደግ የማይመለከት መረጃ አትጨምር።

============================================================
8. የመልስ መዋቅር
============================================================

መልሱን በዚህ ቅደም ተከተል አደራጅ፦

# 1. ቀጥተኛ መልስ

# 2. የትምህርቱ ሙሉ ማብራሪያ

# 3. የመጽሐፍ ቅዱስ ምስክር

# 4. የቤተ ክርስቲያን ትምህርት

# 5. የቅዱሳን አባቶች ትምህርት

# 6. የኢትዮጵያ ሊቃውንት ትምህርት

# 7. ጥልቅ ማብራሪያ

# 8. ከሌሎች እምነቶች ጋር ንጽጽር
(ጥያቄው አስፈላጊ ካደረገው)

# 9. ተግባራዊ ትምህርት

# 10. መደምደሚያ

# 11. ምንጮች

============================================================
9. ቋንቋ
============================================================

መልሱን በተጠየቀው የተመረጠ ቋንቋ ስጥ።

ለምሳሌ ቋንቋው "am" ከሆነ መልሱ በአማርኛ
መሆን አለበት።

ሌላ ቋንቋ የሚያስፈልገውን ምንጭ ማግኘት ካስፈለገ
ምንጩን በተቻለ መጠን በተመረጠው ቋንቋ አብራራ።

============================================================
10. ምንጮች
============================================================

በመጨረሻ "ምንጮች" የሚል ክፍል አዘጋጅ።

በዚህ ክፍል የተጠቀምካቸውን ምንጮች በስም
አሳይ።

የማታውቀውን መጽሐፍ አትጨምር።

============================================================
11. መደምደሚያ
============================================================

ሁሉንም ማብራሪያ ካቀረብክ በኋላ ብቻ
"መደምደሚያ" ስጥ።

መደምደሚያው ዋናውን ትምህርት ያጠቃልል።

አዲስ ያልተረጋገጠ መረጃ በመደምደሚያ ውስጥ
አትጨምር።

============================================================
12. በጥብቅ የተከለከሉ ነገሮች
============================================================

- አጭር መልስ መስጠት
- የሌለ ምንጭ መፍጠር
- የሌለ የአባት ጥቅስ መፍጠር
- የሌለ የሊቅ ቃል መፍጠር
- የሌለ የመጽሐፍ ቅዱስ ጥቅስ መፍጠር
- ከጥያቄው ውጭ ርዕስ ማስገባት
- የተለያዩ ርዕሶችን በድንገት መቀላቀል
- ምንጭ እንዳለ ማስመሰል
- ያልተረጋገጠ ነገርን "ቤተ ክርስቲያን ታስተምራለች"
  ብሎ ማቅረብ

============================================================
13. ዋና ግብ
============================================================

ዋና ግብህ፦

"ተጠቃሚው የጠየቀውን ርዕስ በጥልቀት፣
በሙሉ፣ በተደራጀ ሁኔታ፣ ከተገኙ ምንጮች
ጋር በማቅረብ፣ ተዛማጅ መጽሐፍ ቅዱሳዊ፣
የአባቶች፣ የኢትዮጵያ ሊቃውንት እና
አስፈላጊ ከሆነ ንጽጽራዊ መረጃ በማካተት
የተሟላ መልስ መስጠት"

ነው።
`;

// ------------------------------------------------------------
// BUILD USER PROMPT
// ------------------------------------------------------------

function buildUserPrompt(question, language, knowledge) {
  return `
የተጠቃሚው ጥያቄ፦

${question}

የመልስ ቋንቋ፦
${LANGUAGE_NAMES[language] || language}

የተለየው ዋና ርዕስ፦
${knowledge.detected_topic || "በጥያቄው ላይ ተመስርተህ ለይ"}

============================================================
KNOWLEDGE BASE
============================================================

ይህ የKnowledge Base መረጃ ነው።

በዚህ መረጃ ላይ ብቻ ተመስርተህ ምንጭ-ተመርኮዘ
መልስ አዘጋጅ።

-----------------------------
ANSWER RECORDS
-----------------------------

${JSON.stringify(
  knowledge.answer_records,
  null,
  2
)}

-----------------------------
SOURCE RECORDS
-----------------------------

${JSON.stringify(
  knowledge.source_records,
  null,
  2
)}

-----------------------------
SOURCE CHUNKS
-----------------------------

${JSON.stringify(
  knowledge.source_chunks,
  null,
  2
)}

============================================================
IMPORTANT
============================================================

ከላይ ከተሰጠው መረጃ ውጭ ምንጭ እንዳለ
አትገምት።

ነገር ግን ከተሰጠው Knowledge Base ውስጥ
በጥያቄው ርዕስ ላይ ብዙ ተዛማጅ መረጃ ካለ
ሁሉንም በተደራጀ ሁኔታ አጣምር።

አንድ መዝገብ ብቻ ተመርጠህ አትመልስ።

ተዛማጅ የሆኑ ምንጮችን በሙሉ ተጠቀም።

ከጥያቄው ጋር የማይዛመድ መረጃ ግን አትጨምር።

መልሱ ረጅም፣ ጥልቅ፣ የተደራጀ እና ሙሉ ይሁን።

በመጨረሻ ብቻ መደምደሚያ ስጥ።
`;
}

// ------------------------------------------------------------
// GEMINI
// ------------------------------------------------------------

async function callGemini(
  question,
  language,
  knowledge
) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured."
    );
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent` +
    `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    systemInstruction: {
      parts: [
        {
          text: SYSTEM_PROMPT
        }
      ]
    },

    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildUserPrompt(
              question,
              language,
              knowledge
            )
          }
        ]
      }
    ],

    generationConfig: {
      temperature: 0.15,
      topP: 0.85,
      maxOutputTokens: 16000
    }
  };

  const response = await fetch(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Gemini ${response.status}: ${responseText}`
    );
  }

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!text) {
    throw new Error(
      "Gemini returned an empty answer."
    );
  }

  return text;
}

// ------------------------------------------------------------
// FALLBACK ANSWER
//
// If Gemini fails but Supabase has a matching answer,
// return the strongest stored answer instead of showing
// an unnecessary generic error.
// ------------------------------------------------------------

function buildFallbackAnswer(
  question,
  knowledge
) {
  const first =
    knowledge.answer_records?.[0];

  if (!first) {
    return null;
  }

  const parts = [];

  parts.push(
    "# 1. ቀጥተኛ መልስ\n\n" +
    safeString(first.answer)
  );

  if (first.bible_references) {
    parts.push(
      "\n\n# 2. የመጽሐፍ ቅዱስ ምስክር\n\n" +
      safeString(first.bible_references)
    );
  }

  if (first.church_sources) {
    parts.push(
      "\n\n# 3. የቤተ ክርስቲያን ምንጮች\n\n" +
      safeString(first.church_sources)
    );
  }

  parts.push(
    "\n\n# 4. መደምደሚያ\n\n" +
    safeString(first.answer)
  );

  return parts.join("");
}

// ------------------------------------------------------------
// API HANDLER
// ------------------------------------------------------------

export default async function handler(req, res) {
  // ------------------------------------------
  // CORS
  // ------------------------------------------

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
      ok: false,
      error: "POST method required."
    });
  }

  // ------------------------------------------
  // CHECK CONFIG
  // ------------------------------------------

  if (!SUPABASE_ANON_KEY) {
    return res.status(500).json({
      ok: false,
      error:
        "SUPABASE_ANON_KEY is not configured in Vercel."
    });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error:
        "GEMINI_API_KEY is not configured in Vercel."
    });
  }

  // ------------------------------------------
  // READ BODY
  // ------------------------------------------

  const question =
    safeString(req.body?.question).trim();

  const requestedLanguage =
    safeString(
      req.body?.language || "am"
    ).trim();

  const language =
    LANGUAGE_NAMES[requestedLanguage]
      ? requestedLanguage
      : "am";

  if (!question) {
    return res.status(400).json({
      ok: false,
      error: "ጥያቄ ያስገቡ።"
    });
  }

  if (question.length > 3000) {
    return res.status(400).json({
      ok: false,
      error:
        "ጥያቄው ከ3000 ፊደላት መብለጥ የለበትም።"
    });
  }

  try {
    // ----------------------------------------
    // 1. GET KNOWLEDGE
    // ----------------------------------------

    const [
      answers,
      chunks,
      sources
    ] = await Promise.all([
      getAnswerRecords(language),
      getSourceChunks(language),
      getSources(language)
    ]);

    // ----------------------------------------
    // 2. BUILD RELEVANT KNOWLEDGE
    // ----------------------------------------

    const knowledge =
      buildKnowledgePackage(
        answers,
        chunks,
        sources,
        question,
        language
      );

    // ----------------------------------------
    // 3. IF NOTHING MATCHES
    // ----------------------------------------

    if (
      knowledge.answer_records.length === 0 &&
      knowledge.source_chunks.length === 0
    ) {
      return res.status(200).json({
        ok: true,
        answer:
          `የ"${question}" ጥያቄን በተመለከተ ` +
          `በአሁኑ ጊዜ በKnowledge Base ውስጥ ` +
          `በቂ የተረጋገጠ ምንጭ አልተገኘም።`,
        language,
        topic:
          knowledge.detected_topic,
        sources_found: 0
      });
    }

    // ----------------------------------------
    // 4. ASK GEMINI TO ORGANIZE THE SOURCES
    // ----------------------------------------

    let answer;

    try {
      answer =
        await callGemini(
          question,
          language,
          knowledge
        );
    } catch (geminiError) {
      console.error(
        "Gemini error:",
        geminiError
      );

      // --------------------------------------
      // FALLBACK TO SUPABASE
      // --------------------------------------

      answer =
        buildFallbackAnswer(
          question,
          knowledge
        );

      if (!answer) {
        throw geminiError;
      }
    }

    // ----------------------------------------
    // 5. RESPONSE
    // ----------------------------------------

    return res.status(200).json({
      ok: true,

      answer,

      language,

      language_name:
        LANGUAGE_NAMES[language] || language,

      topic:
        knowledge.detected_topic,

      retrieval: {
        answer_records:
          knowledge.statistics
            .matched_answer_records,

        source_chunks:
          knowledge.statistics
            .matched_source_chunks,

        sources:
          knowledge.statistics
            .total_sources
      }
    });

  } catch (error) {
    console.error(
      "ORTODOXAW-MELES API ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,

      error:
        "መልሱን ለማዘጋጀት ችግር ተፈጥሯል።",

      details:
        process.env.NODE_ENV === "development"
          ? safeString(error.message)
          : undefined
    });
  }
}
