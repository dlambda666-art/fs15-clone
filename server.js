const cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";

const SOURCES = {
  films: `${BASE_URL}/index.php?category=films&do=cat`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};

const PAGES = Number(process.env.FS15_PAGES || 50);
const PAGE_SIZE = Number(process.env.FS15_PAGE_SIZE || 18);
const REFRESH_MS = Number(process.env.FS15_REFRESH_MS || 600000);
const ENRICH_CONCURRENCY = Number(process.env.FS15_ENRICH_CONCURRENCY || 8);
const INITIAL_ENRICH = Number(process.env.FS15_INITIAL_ENRICH || 100);

let cache = [];
let lastUpdate = 0;
let refreshing = false;


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
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`FS23 HTTP ${response.status}`);
  }

  return await response.text();
}


/* =========================================================
   URL
   ========================================================= */

function absoluteUrl(url) {
  if (!url) return "";

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
  const value = cleanText(text).toUpperCase();

  if (value.includes("VF+VOSTFR")) {
    return "VF+VOSTFR";
  }

  if (value.includes("VOSTFR")) {
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

  if (/\bVO\b/.test(value)) {
    return "VO";
  }

  return "";
}


/* =========================================================
   QUALITE
   ========================================================= */

function detectQuality(text) {
  const value = cleanText(text).toUpperCase();

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

  for (const quality of qualities) {
    if (value.includes(quality)) {
      return quality;
    }
  }

  return "";
}


/* =========================================================
   NOTE
   ========================================================= */

function detectRating(text) {
  const value = cleanText(text);

  const matches =
    value.match(/\b([0-9](?:[.,][0-9])?)\b/g);

  if (!matches) {
    return 0;
  }

  const numbers = matches
    .map(value =>
      Number(value.replace(",", "."))
    )
    .filter(
      value =>
        value >= 0 &&
        value <= 10
    );

  if (!numbers.length) {
    return 0;
  }

  return numbers[numbers.length - 1];
}


/* =========================================================
   ANNEE
   ========================================================= */

function detectYear(text) {
  const match =
    cleanText(text).match(/\b(19|20)\d{2}\b/);

  return match ? match[0] : "";
}


/* =========================================================
   GENRES
   ========================================================= */

const KNOWN_GENRES = [
  "Action",
  "Animation",
  "Aventure",
  "Arts Martiaux",
  "Biopic",
  "Comédie",
  "Crime",
  "Documentaire",
  "Drame",
  "Famille",
  "Fantastique",
  "Guerre",
  "Histoire",
  "Historique",
  "Horreur",
  "Espionnage",
  "Policier",
  "Romance",
  "Science-Fiction",
  "Science fiction",
  "Spectacle",
  "Thriller",
  "Western",
  "Mystère",
  "Musique",
  "Télé-Réalité",
  "K-DRAMA"
];


/* =========================================================
   NORMALISATION GENRE
   ========================================================= */

function normalizeGenre(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  const normalized =
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const aliases = {
    "science fiction": "Science-Fiction",
    "science-fiction": "Science-Fiction",
    "tele realite": "Télé-Réalité",
    "tele-realite": "Télé-Réalité",
    "k drama": "K-DRAMA",
    "k-drama": "K-DRAMA"
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  for (const genre of KNOWN_GENRES) {
    const genreNormalized =
      genre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (normalized === genreNormalized) {
      if (genreNormalized === "science fiction") {
        return "Science-Fiction";
      }

      return genre;
    }
  }

  return "";
}


/* =========================================================
   EXTRACTION GENRES
   ========================================================= */

function extractGenres($) {

  const genres = [];

  function addGenre(value) {
    const genre = normalizeGenre(value);

    if (
      genre &&
      !genres.includes(genre)
    ) {
      genres.push(genre);
    }
  }


  /*
   * 1. PRIORITE AUX CHAMPS GENRE
   */

  $(
    "[class*='genre'], [id*='genre'], [data-genre], [data-genres]"
  ).each((_index, element) => {

    const dataGenre =
      $(element).attr("data-genre");

    const dataGenres =
      $(element).attr("data-genres");

    if (dataGenre) {
      dataGenre
        .split(/[|,;/]+/)
        .forEach(addGenre);
    }

    if (dataGenres) {
      dataGenres
        .split(/[|,;/]+/)
        .forEach(addGenre);
    }

    const text =
      cleanText($(element).text());

    if (text) {
      const match =
        text.match(
          /Genres?\s*:\s*(.+)$/i
        );

      if (match) {
        match[1]
          .split(/\s*,\s*|\s*\/\s*|\s*\|\s*/)
          .forEach(addGenre);
      }
    }
  });


  /*
   * 2. CHAMPS "Genres : ..."
   */

  $("tr, li, p, div, span").each(
    (_index, element) => {

      const text =
        cleanText($(element).text());

      if (!text) {
        return;
      }

      const match =
        text.match(
          /^Genres?\s*:\s*(.+)$/i
        );

      if (!match) {
        return;
      }

      match[1]
        .split(/\s*,\s*|\s*\/\s*|\s*\|\s*/)
        .forEach(addGenre);
    }
  );


  /*
   * 3. SECOURS SUR LE TEXTE DE LA PAGE
   */

  if (!genres.length) {

    const bodyText =
      cleanText($("body").text());

    const match =
      bodyText.match(
        /(?:^|\s)Genres?\s*:\s*([^]+?)(?=\s+Réalisateur\s*:|\s+Acteurs?\s*:|\s+Version\s*:|\s+Qualité\s*:|\s+Date de sortie\s*:|$)/i
      );

    if (match) {

      match[1]
        .split(/\s*,\s*|\s*\/\s*|\s*\|\s*/)
        .forEach(addGenre);
    }
  }


  return [...new Set(genres)];
}


/* =========================================================
   REGLE HORREUR
   =========================================================

   Horreur est accepté UNIQUEMENT si :

   Horreur
   Horreur + Thriller
   Horreur + n'importe quel autre genre

   Mais PAS :

   Thriller + Horreur
   Drame + Horreur
   Action + Thriller + Horreur

   Donc Horreur doit être le PREMIER genre.
   ========================================================= */

function isHorrorFirst(item) {

  if (
    !item ||
    !Array.isArray(item.genres) ||
    !item.genres.length
  ) {
    return false;
  }

  return (
    normalizeGenre(item.genres[0]) ===
    "Horreur"
  );
}


/* =========================================================
   CARTE
   ========================================================= */

function extractCard($, link, type) {

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

  let node = $(link);

  for (let i = 0; i < 6; i++) {

    const text =
      cleanText(node.text());

    const images =
      node.find("img");

    if (
      images.length &&
      text.length > 20
    ) {
      break;
    }

    node = node.parent();
  }

  const text =
    cleanText(node.text());

  let title =
    cleanText($(link).text());

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

    type,

    poster,

    language:
      detectLanguage(text),

    quality:
      detectQuality(text),

    rating:
      detectRating(text),

    comments: 0,
    views: 0,

    genres: [],

    country: [],
    themes: [],

    synopsis: "",
    trailer: "",

    url,

    addedAt:
      new Date().toISOString(),

    enriched: false
  };
}


/* =========================================================
   PARSE LISTING
   ========================================================= */

function parseListing(html, type) {

  const $ =
    cheerio.load(html);

  const results = [];

  const seen =
    new Set();

  $("a[href*='newsid=']").each(
    (_index, element) => {

      const item =
        extractCard(
          $,
          element,
          type
        );

      if (!item) {
        return;
      }

      if (seen.has(item.id)) {
        return;
      }

      seen.add(item.id);

      results.push(item);
    }
  );

  return results;
}


/* =========================================================
   ENRICHISSEMENT
   ========================================================= */

async function enrichItem(item) {

  if (item.enriched) {
    return item;
  }

  try {

    const html =
      await fetchPage(item.url);

    const $ =
      cheerio.load(html);

    const pageText =
      cleanText($("body").text());


    /* TITRE */

    const heading =
      $("h1")
        .first()
        .text();

    if (heading) {

      item.title =
        cleanText(heading);
    }


    /* POSTER */

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

      const detected =
        detectLanguage(
          version[1]
        );

      if (detected) {
        item.language = detected;
      }
    }


    /* SECours langue */

    if (!item.language) {

      const detected =
        detectLanguage(pageText);

      if (detected) {
        item.language = detected;
      }
    }


    /* QUALITE */

    const quality =
      pageText.match(
        /Qualité\s*:\s*([^]+)/i
      );

    if (quality) {

      const detected =
        detectQuality(
          quality[1]
        );

      if (detected) {
        item.quality = detected;
      }
    }


    /* SECOURS QUALITE */

    if (!item.quality) {

      item.quality =
        detectQuality(pageText);
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


    /* SECOURS ANNEE */

    if (!item.year) {

      item.year =
        detectYear(pageText);
    }


    /* =====================================================
       GENRES
       ===================================================== */

    item.genres =
      extractGenres($);


    /*
     * IMPORTANT :
     * On ne fabrique PAS "Horreur" simplement parce que
     * le mot apparaît quelque part.
     *
     * Horreur doit être le PREMIER genre détecté.
     */

    if (isHorrorFirst(item)) {

      /*
       * On garde Horreur en première position.
       * Les autres genres restent derrière.
       */

      item.genres = [
        "Horreur",
        ...item.genres.filter(
          genre =>
            normalizeGenre(genre) !==
            "Horreur"
        )
      ];

    }


    item.enriched = true;


    console.log(
      `FS23 genres: ${item.title} -> ${
        item.genres.join(", ") ||
        "aucun"
      }`
    );


  } catch (error) {

    console.error(
      `Erreur enrichissement ${item.id}:`,
      error.message
    );
  }

  return item;
}


/* =========================================================
   ENRICHISSEMENT PAR LOTS
   ========================================================= */

async function enrichItems(items) {

  const results = [];

  for (
    let start = 0;
    start < items.length;
    start += ENRICH_CONCURRENCY
  ) {

    const batch =
      items.slice(
        start,
        start + ENRICH_CONCURRENCY
      );

    const enriched =
      await Promise.all(
        batch.map(
          item =>
            enrichItem(item)
        )
      );

    results.push(
      ...enriched
    );

    console.log(
      `FS23 enrichissement: ${
        Math.min(
          start + batch.length,
          items.length
        )
      }/${items.length}`
    );
  }

  return results;
}


/* =========================================================
   CHARGEMENT DES 50 PAGES
   ========================================================= */

async function loadSource(source, type) {

  const all = [];

  const seen =
    new Set();

  for (
    let page = 1;
    page <= PAGES;
    page++
  ) {

    try {

      const url =
        page === 1
          ? source
          : `${source}&cstart=${page}`;

      console.log(
        `FS23 ${type}: page ${page}/${PAGES}`
      );

      const html =
        await fetchPage(url);

      const items =
        parseListing(
          html,
          type
        );

      console.log(
        `FS23 ${type}: page ${page} -> ${items.length} éléments`
      );

      for (const item of items) {

        if (!seen.has(item.id)) {

          seen.add(item.id);

          all.push(item);
        }
      }

      if (!items.length) {

        console.log(
          `FS23 ${type}: fin pagination à la page ${page}`
        );

        break;
      }

    } catch (error) {

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

async function refreshCache() {

  if (refreshing) {
    return cache;
  }

  refreshing = true;

  try {

    console.log(
      "FS15 : actualisation du catalogue..."
    );

    const [
      films,
      series
    ] =
      await Promise.all([

        loadSource(
          SOURCES.films,
          "movie"
        ),

        loadSource(
          SOURCES.series,
          "series"
        )
      ]);


    const combined = [
      ...films,
      ...series
    ];


    const unique =
      new Map();

    for (const item of combined) {

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


    cache =
      [...unique.values()];

    lastUpdate =
      Date.now();


    console.log(
      `FS15 : ${cache.length} éléments trouvés`
    );


    const firstBatch =
      cache.slice(
        0,
        INITIAL_ENRICH
      );

    await enrichItems(
      firstBatch
    );


    const remaining =
      cache.slice(
        INITIAL_ENRICH
      );


    if (remaining.length) {

      setImmediate(
        async () => {

          try {

            await enrichItems(
              remaining
            );

            console.log(
              `FS15 : enrichissement complet terminé (${cache.length} éléments)`
            );

          } catch (error) {

            console.error(
              "FS15 enrichissement arrière-plan:",
              error.message
            );
          }
        }
      );
    }


    return cache;

  } finally {

    refreshing = false;
  }
}


/* =========================================================
   FILTRE GENRE
   ========================================================= */

function filterByGenre(items, genre) {

  if (!genre) {
    return items;
  }

  const wanted =
    normalizeGenre(genre);

  if (!wanted) {
    return [];
  }


  /*
   * REGLE SPECIALE HORREUR
   */

  if (wanted === "Horreur") {

    return items.filter(item => {

      if (
        !Array.isArray(item.genres) ||
        !item.genres.length
      ) {
        return false;
      }

      /*
       * Horreur doit être le premier.
       */

      return (
        normalizeGenre(
          item.genres[0]
        ) === "Horreur"
      );
    });
  }


  /*
   * AUTRES GENRES
   */

  return items.filter(item => {

    if (
      !Array.isArray(item.genres)
    ) {
      return false;
    }

    return item.genres.some(
      itemGenre =>
        normalizeGenre(itemGenre) ===
        wanted
    );
  });
}


/* =========================================================
   PAGINATION
   ========================================================= */

function getPageNumber(options = {}) {

  if (
    options.page !== undefined
  ) {

    const page =
      Number(options.page);

    if (
      Number.isFinite(page) &&
      page >= 1
    ) {

      return Math.floor(page);
    }
  }


  if (
    options.skip !== undefined
  ) {

    const skip =
      Number(options.skip);

    if (
      Number.isFinite(skip) &&
      skip >= 0
    ) {

      return (
        Math.floor(
          skip / PAGE_SIZE
        ) + 1
      );
    }
  }


  return 1;
}


/* =========================================================
   CATALOGUE PUBLIC
   ========================================================= */

async function getCatalogue(options = {}) {

  const now =
    Date.now();


  if (!cache.length) {

    await refreshCache();

  } else if (
    now - lastUpdate >
    REFRESH_MS
  ) {

    refreshCache()
      .catch(
        error =>
          console.error(
            "FS15 refresh:",
            error.message
          )
      );
  }


  let result =
    [...cache];


  /* TYPE */

  if (options.type) {

    result =
      result.filter(
        item =>
          item.type ===
          options.type
      );
  }


  /* LANGUE */

  if (options.language) {

    result =
      result.filter(
        item =>
          String(
            item.language || ""
          )
          .toLowerCase()
          .includes(
            String(
              options.language
            ).toLowerCase()
          )
      );
  }


  /* GENRE */

  if (options.genre) {

    result =
      filterByGenre(
        result,
        options.genre
      );
  }


  /*
   * RECHERCHE
   */

  if (options.q) {

    const query =
      String(
        options.q
      )
      .toLowerCase()
      .trim();

    result =
      result.filter(item => {

        const haystack =
          [
            item.title,
            ...(item.genres || []),
            item.language,
            item.quality
          ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
  }


  /*
   * IMPORTANT :
   * On ne découpe PAS ici le catalogue.
   *
   * Les 50 pages FS23 sont déjà chargées dans cache.
   *
   * On renvoie donc tout le résultat.
   */

  console.log(
    `FS15 catalogue: type=${options.type || "all"} genre=${options.genre || "all"} -> ${result.length} éléments`
  );


  return result;
}


/* =========================================================
   EXPORT
   ========================================================= */

module.exports = {

  getCatalogue,

  refreshCache,

  filterByGenre,

  normalizeGenre,

  KNOWN_GENRES,

  PAGE_SIZE,

  PAGES
};
