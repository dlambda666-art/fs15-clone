lliureconst cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";

const SOURCES = {
  films: `${BASE_URL}/index.php?category=films&do=cat`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};

const PAGES = Number(process.env.FS15_PAGES || 8);
const REFRESH_MS = Number(
  process.env.FS15_REFRESH_MS || 600000
);
const MAX_RESULTS = Number(
  process.env.FS15_MAX_RESULTS || 80
);

const ENRICH_CONCURRENCY = Number(
  process.env.FS15_ENRICH_CONCURRENCY || 6
);

let cache = [];
let lastUpdate = 0;


/* =========================================================
   HTTP
   ========================================================= */

async function fetchPage(url) {

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

      "Accept-Language":
        "fr-FR,fr;q=0.9,en;q=0.8"
    },

    signal:
      AbortSignal.timeout(20000)
  });


  if (!response.ok) {
    throw new Error(
      `FS23 HTTP ${response.status}`
    );
  }


  return await response.text();
}


/* =========================================================
   URL
   ========================================================= */

function absoluteUrl(url) {

  if (!url) {
    return "";
  }


  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }


  if (url.startsWith("//")) {
    return "https:" + url;
  }


  if (url.startsWith("/")) {
    return BASE_URL + url;
  }


  return BASE_URL + "/" + url;
}


/* =========================================================
   TEXTE
   ========================================================= */

function cleanText(value) {

  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================================================
   LANGUE
   ========================================================= */

function detectLanguage(text) {

  const value =
    cleanText(text).toUpperCase();


  if (
    value.includes("VF+VOSTFR")
  ) {
    return "VF+VOSTFR";
  }


  if (
    value.includes("VOSTFR")
  ) {
    return "VOSTFR";
  }


  if (
    /\bVF\b/.test(value) ||
    value.includes("TRUEFRENCH") ||
    value.includes("TRUE FRENCH") ||
    value.includes("FRENCH")
  ) {
    return "VF";
  }


  if (
    /\bVO\b/.test(value)
  ) {
    return "VO";
  }


  return "";
}


/* =========================================================
   QUALITE
   ========================================================= */

function detectQuality(text) {

  const value =
    cleanText(text).toUpperCase();


  const qualities = [
    "2160P",
    "2160",
    "4K",
    "1080P",
    "1080",
    "720P",
    "720",
    "HDLIGHT",
    "HD",
    "WEB-DL",
    "WEBDL",
    "WEBRIP",
    "BLURAY",
    "BLU-RAY",
    "BRRIP",
    "DVDRIP"
  ];


  for (
    const quality of qualities
  ) {

    if (
      value.includes(quality)
    ) {
      return quality;
    }

  }


  return "";
}


/* =========================================================
   NOTE
   ========================================================= */

function detectRating(text) {

  const value =
    cleanText(text);


  const matches =
    value.match(
      /\b([0-9](?:[.,][0-9])?)\b/g
    );


  if (!matches) {
    return 0;
  }


  const numbers =
    matches
      .map(value =>
        Number(
          value.replace(",", ".")
        )
      )
      .filter(
        value =>
          value >= 0 &&
          value <= 10
      );


  if (!numbers.length) {
    return 0;
  }


  return numbers[
    numbers.length - 1
  ];
}


/* =========================================================
   ANNEE
   ========================================================= */

function detectYear(text) {

  const match =
    cleanText(text).match(
      /\b(19|20)\d{2}\b/
    );


  return match
    ? match[0]
    : "";
}


/* =========================================================
   EXTRACTION CARTE
   ========================================================= */

function extractCard($, link) {

  const href =
    $(link).attr("href");


  if (
    !href ||
    !href.includes("newsid=")
  ) {
    return null;
  }


  const url =
    absoluteUrl(href);


  let node =
    $(link);


  for (
    let i = 0;
    i < 6;
    i++
  ) {

    const text =
      cleanText(
        node.text()
      );

    const images =
      node.find("img");


    if (
      images.length &&
      text.length > 20
    ) {
      break;
    }


    node =
      node.parent();

  }


  const text =
    cleanText(
      node.text()
    );


  let title =
    cleanText(
      $(link).text()
    );


  if (!title) {

    const image =
      node.find("img").first();


    title =
      cleanText(
        image.attr("alt")
      );

  }


  if (!title) {
    return null;
  }


  let poster = "";


  const image =
    node.find("img").first();


  if (image.length) {

    poster =
      image.attr("data-src") ||
      image.attr("data-lazy-src") ||
      image.attr("src") ||
      "";

  }


  poster =
    absoluteUrl(poster);


  let id = "";


  try {

    id =
      new URL(url)
        .searchParams
        .get("newsid") || "";

  } catch {

    return null;

  }


  return {

    id,

    title,

    year:
      detectYear(text),

    type:
      "movie",

    poster,

    language:
      detectLanguage(text),

    quality:
      detectQuality(text),

    rating:
      detectRating(text),

    comments:
      0,

    views:
      0,

    genres: [],

    country: [],

    themes: [],

    synopsis: "",

    trailer: "",

    url,

    addedAt:
      new Date().toISOString()

  };
}


/* =========================================================
   PARSE LISTING
   ========================================================= */

function parseListing(
  html,
  type
) {

  const $ =
    cheerio.load(html);


  const results = [];
  const seen = new Set();


  $("a[href*='newsid=']")
    .each(
      (_index, element) => {

        const item =
          extractCard(
            $,
            element
          );


        if (!item) {
          return;
        }


        if (
          seen.has(item.id)
        ) {
          return;
        }


        seen.add(item.id);


        item.type =
          type;


        results.push(item);

      }
    );


  return results;
}


/* =========================================================
   FICHE FS23
   ========================================================= */

async function enrichItem(item) {

  try {

    const html =
      await fetchPage(
        item.url
      );


    const $ =
      cheerio.load(html);


    const pageText =
      cleanText(
        $("body").text()
      );


    /* TITRE */

    const heading =
      $("h1").first().text();


    if (heading) {

      item.title =
        cleanText(
          heading
        );

    }


    /* AFFICHE */

    const images =
      $("img");


    for (
      let i = 0;
      i < images.length;
      i++
    ) {

      const src =
        $(images[i]).attr("src") ||
        $(images[i]).attr("data-src") ||
        $(images[i]).attr("data-lazy-src") ||
        "";


      if (
        src &&
        (
          src.includes("tmdb") ||
          src.includes("poster") ||
          src.includes("upload")
        )
      ) {

        item.poster =
          absoluteUrl(src);

        break;

      }

    }


    /* VERSION */

    const version =
      pageText.match(
        /Version\s*:\s*([^]+?)(?=\s+Qualité|$)/i
      );


    if (version) {

      item.language =
        cleanText(
          version[1]
        );

    }


    /* QUALITE */

    const quality =
      pageText.match(
        /Qualité\s*:\s*([^]+)/i
      );


    if (quality) {

      item.quality =
        cleanText(
          quality[1]
        )
        .split(
          "Date de sortie"
        )[0]
        .trim();

    }


    /* DATE */

    const release =
      pageText.match(
        /Date de sortie\s*:\s*([^]+)/i
      );


    if (release) {

      item.year =
        detectYear(
          release[1]
        );

    }


        /* =========================================================
   GENRES
   ========================================================= */

const KNOWN_GENRES = [
  "Action",
  "Animation",
  "Aventure",
  "Comédie",
  "Crime",
  "Documentaire",
  "Drame",
  "Famille",
  "Fantastique",
  "Histoire",
  "Horreur",
  "Musique",
  "Mystère",
  "Romance",
  "Science-Fiction",
  "Thriller",
  "Guerre",
  "Western"
];

const detectedGenres = [];

for (const genreName of KNOWN_GENRES) {

  const pattern = new RegExp(
    `(?:^|[^a-zà-ÿ])${genreName.replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      "\\$&"
    )}(?:$|[^a-zà-ÿ])`,
    "i"
  );

  if (pattern.test(pageText)) {
    detectedGenres.push(genreName);
  }
}

item.genres = [
  ...new Set(detectedGenres)
];


    /* LANGUE DE SECOURS */

    if (!item.language) {

      item.language =
        detectLanguage(
          pageText
        );

    }


    /* QUALITE DE SECOURS */

    if (!item.quality) {

      item.quality =
        detectQuality(
          pageText
        );

    }


    /* ANNEE DE SECOURS */

    if (!item.year) {

      item.year =
        detectYear(
          pageText
        );

    }

  }

  catch (error) {

    console.error(
      "Erreur fiche FS23:",
      item.url,
      error.message
    );

  }


  return item;
}


/* =========================================================
   ENRICHISSEMENT
   ========================================================= */

async function enrichItems(items) {

  for (
    let start = 0;
    start < items.length;
    start += ENRICH_CONCURRENCY
  ) {

    const batch =
      items.slice(
        start,
        start +
          ENRICH_CONCURRENCY
      );


    await Promise.all(
      batch.map(
        item =>
          enrichItem(item)
      )
    );


    console.log(
      `FS23 enrichissement: ${
        Math.min(
          start +
            batch.length,
          items.length
        )
      }/${items.length}`
    );

  }


  return items;
}


/* =========================================================
   RECUPERATION DES PAGES
   ========================================================= */

async function collectSource(
  baseUrl,
  type
) {

  const all = [];


  for (
    let page = 1;
    page <= PAGES;
    page++
  ) {

    const url =
      page === 1
        ? baseUrl
        : `${baseUrl}&cstart=${page}`;


    try {

      console.log(
        `FS23 ${type}: page ${page}`
      );


      const html =
        await fetchPage(
          url
        );


      const items =
        parseListing(
          html,
          type
        );


      all.push(
        ...items
      );

    }

    catch (error) {

      console.error(
        `FS23 ${type} page ${page}:`,
        error.message
      );

    }

  }


  return all;
}


/* =========================================================
   REFRESH
   ========================================================= */

async function refresh() {

  console.log(
    "Actualisation du catalogue FS23..."
  );


  const [
    movies,
    series
  ] =
    await Promise.all([

      collectSource(
        SOURCES.films,
        "movie"
      ),

      collectSource(
        SOURCES.series,
        "series"
      )

    ]);


  const combined = [
    ...movies,
    ...series
  ];


  const unique =
    new Map();


  for (
    const item of combined
  ) {

    if (
      !item.id ||
      unique.has(item.id)
    ) {
      continue;
    }


    unique.set(
      item.id,
      item
    );

  }


  const catalogue =
    [
      ...unique.values()
    ];


  const limited =
    catalogue.slice(
      0,
      MAX_RESULTS
    );


  await enrichItems(
    limited
  );


  cache =
    limited;


  lastUpdate =
    Date.now();


  console.log(
    `FS23: ${cache.length} éléments chargés`
  );


  return cache;
}


/* =========================================================
   CATALOGUE
   ========================================================= */

async function getCatalogue() {

  if (
    cache.length &&
    Date.now() -
      lastUpdate <
      REFRESH_MS
  ) {

    return cache;

  }


  return refresh();
}


/* =========================================================
   EXPORT
   ========================================================= */

module.exports = {

  getCatalogue,

  normalize:
    item => item

};
