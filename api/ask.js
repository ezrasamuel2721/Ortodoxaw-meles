// Vercel Serverless Function: api/ask.js
// Ortodoxaw-meles — Orthodox Answer Engine
// Topic-isolated Supabase retrieval + structured theological answer generation

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://geznekrpdubpgsegseer.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlem5la3JwZHVicGdzZWdzZWVyIiwicm9sZSI6MTc5MDAyNTI1NiwiaWF0IjoxNzkwMDI1MjU2LCJleHAiOjIxMDA2MDEyNTZ9.spxmqIhfeHPjD4SXI8mT9CY611-_0Mw3w7RoRloYPkQ";

/*
 * Gemini model
 *
 * You can override this from Vercel:
 * GEMINI_MODEL=gemini-3.8-flash
 */
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash"
].filter(Boolean);

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

/* -------------------------------------------------------
   TEXT HELPERS
------------------------------------------------------- */

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
        .filter(word => word.length >= 2)
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
   LANGUAGE
------------------------------------------------------- */

const LANGUAGE_ALIASES = {
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
  de: ["de", "deu
