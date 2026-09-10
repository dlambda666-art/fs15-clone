const cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";

const SOURCES = {
  films: `${BASE_URL}/index.php?category=films&do=cat`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};

const PAGES = Number(process.env.FS15_PAGES || 50);
const PAGE_SIZE = Number(process.env.FS15_PAGE_SIZE || 50);
const REFRESH_MS = Number(process.env.FS15_REFRESH_MS || 600000);
const ENRICH_CONCURRENCY = Number(
  process.env.FS15_ENRICH_CONCURRENCY || 8
);

let cache = [];
let lastUpdate = 0;
let refreshing = false;


/* =========================================================
   CATEGORIES FS23
   ========================================================= */

const FILM_GENRE_CATEGORIES = {
  "Action": "actions",
  "Aventure": "aventures",
  "Animation": "animations",
  "Arts Martiaux": "arts-martiaux",
  "Biopic": "biopics",
  "Comédie": "comedies",
  "Drame": "drames",
  "Documentaire": "documentaires",
  "Horreur": "horreurs",
  "Historique": "historiques",
  "Espionnage": "espionnages",
  "Famille": "familles",
  "Fantastique": "fantastiques",
  "Guerre": "guerres",
  "Policier": "policiers",
  "Romance": "romances",
  "Science-Fiction": "science-fictions",
  "Spectacle": "spectacles",
  "Thriller": "thrillers",
  "Western": "westerns"
};


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
   NORMALISATION
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
   EXTRACTION GENRES FICHE
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

    const match =
      text.match(
        /Genres?\s*:\s*(.+)$/i
      );

    if (match) {
      match[1]
        .split(/\s*,\s*|\s*\/\s*|\s*\|\s*/)
        .forEach(addGenre);
    }
  });


  /*
   * Recherche directe de Genre: / Genres:
   */

  $("body *").each((_index, element) => {

    if ($(element).children().length > 0) {
      return;
    }

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
  });


  return [...new Set(genres)];
}


/* =========================================================
   CARTE
   ========================================================= */

function extractCard($, link, type, forcedGenre = "") {

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

  const image =
    node.find("img").first();

  let poster = "";

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

  const genres = [];

  if (forcedGenre) {
    genres.push(
      normalizeGenre(forcedGenre)
    );
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

    genres,

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

function parseListing(
  html,
  type,
  forcedGenre = ""
) {

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
          type,
          forcedGenre
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

    $("img").each((_index, element) => {

      if (item.poster) {
        return;
      }

      const src =
        $(element).attr("src") ||
        $(element).attr("data-src") ||
        $(element).attr("data-lazy-src") ||
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
      }
    });


    /* LANGUE */

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

    if (!item.language) {

      item.language =
        detectLanguage(pageText);
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

    if (!item.quality) {

      item.quality =
        detectQuality(pageText);
    }


    /* ANNEE */

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

    if (!item.year) {

      item.year =
        detectYear(pageText);
    }


    /* GENRES */

    const extractedGenres =
      extractGenres($);

    for (const genre of extractedGenres) {

      if (!item.genres.includes(genre)) {

        item.genres.push(genre);
      }
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

    await Promise.all(
      batch.map(
        item =>
          enrichItem(item)
      )
    );

    console.log(
      `FS15 enrichissement: ${
        Math.min(
          start + batch.length,
          items.length
        )
      }/${items.length}`
    );
  }

  return items;
}


/* =========================================================
   CHARGEMENT SOURCE GENERALE
   ========================================================= */

async function loadSource(
  source,
  type
) {

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
        `FS23 ${type}: page ${page} -> ${items.length}`
      );

      for (const item of items) {

        if (!seen.has(item.id)) {

          seen.add(item.id);

          all.push(item);
        }
      }

      if (!items.length) {
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
   CHARGEMENT D'UNE CATEGORIE GENRE
   ========================================================= */

async function loadGenreCategory(
  genre,
  slug,
  type = "movie"
) {

  const source =
    `${BASE_URL}/index.php?category=${slug}&do=cat`;

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
        `FS23 GENRE ${genre}: page ${page}/${PAGES}`
      );

      const html =
        await fetchPage(url);

      const items =
        parseListing(
          html,
          type,
          genre
        );

      console.log(
        `FS23 GENRE ${genre}: ${items.length}`
      );

      for (const item of items) {

        if (!seen.has(item.id)) {

          seen.add(item.id);

          all.push(item);
        }
      }

      if (!items.length) {
        break;
      }

    } catch (error) {

      console.error(
        `FS23 genre ${genre} page ${page}:`,
        error.message
      );
    }
  }

  return all;
}


/* =========================================================
   CACHE GENERAL
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

    const unique =
      new Map();

    for (
      const item of [
        ...films,
        ...series
      ]
    ) {

      if (
        item.id &&
        !unique.has(item.id)
      ) {

        unique.set(
          item.id,
          item
        );
      }
    }

    cache =
      [...unique.values()];

    console.log(
      `FS15 : ${cache.length} éléments trouvés`
    );

    await enrichItems(cache);

    lastUpdate =
      Date.now();

    console.log(
      `FS15 : catalogue enrichi`
    );

    return cache;

  } finally {

    refreshing = false;
  }
}


/* =========================================================
   FILTRE GENRE
   ========================================================= */

function filterByGenre(
  items,
  genre
) {

  if (!genre) {
    return items;
  }

  const wanted =
    normalizeGenre(genre);

  if (!wanted) {
    return [];
  }


  /* HORREUR */

  if (wanted === "Horreur") {

    return items.filter(item => {

      const genres =
        Array.isArray(item.genres)
          ? item.genres.map(
              normalizeGenre
            )
          : [];

      return (
        genres.includes("Horreur") &&
        !genres.includes("Drame") &&
        !genres.includes("Comédie") &&
        !genres.includes("Romance")
      );
    });
  }


  /* AUTRES GENRES */

  return items.filter(item => {

    const genres =
      Array.isArray(item.genres)
        ? item.genres.map(
            normalizeGenre
          )
        : [];

    return genres.includes(wanted);
  });
}


/* =========================================================
   CATALOGUE
   ========================================================= */

async function getCatalogue(
  options = {}
) {

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


  /*
   * GENRE :
   *
   * On utilise DIRECTEMENT la catégorie FS23.
   *
   * C'est elle qui détermine quels films
   * appartiennent réellement au genre.
   */

  if (
    options.genre &&
    options.type !== "series"
  ) {

    const wanted =
      normalizeGenre(
        options.genre
      );

    const slug =
      FILM_GENRE_CATEGORIES[wanted];

    if (slug) {

      console.log(
        `FS15 : chargement direct catégorie ${wanted}`
      );

      let genreItems =
        await loadGenreCategory(
          wanted,
          slug,
          "movie"
        );

      /*
       * Horreur :
       * on enlève explicitement les genres
       * interdits lorsque les informations
       * sont disponibles.
       */

      if (wanted === "Horreur") {

        genreItems =
          genreItems.filter(item => {

            const genres =
              item.genres || [];

            return !genres.some(
              genre => {

                const value =
                  normalizeGenre(
                    genre
                  );

                return (
                  value === "Drame" ||
                  value === "Comédie" ||
                  value === "Romance"
                );
              }
            );
          });
      }

      return genreItems;
    }
  }


  /* CATALOGUE NORMAL */

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


  /* GENRE FALLBACK */

  if (options.genre) {

    result =
      filterByGenre(
        result,
        options.genre
      );
  }


  /* RECHERCHE */

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

        return haystack.includes(
          query
        );
      });
  }


  console.log(
    `FS15 catalogue: type=${
      options.type || "all"
    } genre=${
      options.genre || "all"
    } -> ${
      result.length
    } éléments`
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
