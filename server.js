const cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";

const SOURCES = {
  films: `${BASE_URL}/index.php?category=films&do=cat`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};

const PAGES = Number(process.env.FS15_PAGES || 8);
const REFRESH_MS = Number(process.env.FS15_REFRESH_MS || 600000);
const MAX_RESULTS = Number(process.env.FS15_MAX_RESULTS || 80);
const ENRICH_CONCURRENCY = Number(
  process.env.FS15_ENRICH_CONCURRENCY || 6
);

/* =========================================================
   CACHE
   ========================================================= */

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

  const matches = value.match(
    /\b([0-9](?:[.,][0-9])?)\b/g
  );

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
  const match = cleanText(text).match(
    /\b(19|20)\d{2}\b/
  );

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
  "Science fiction",
  "Science-Fiction",
  "Spectacle",
  "Thriller",
  "Western",
  "Mystère",
  "Musique"
];

/* =========================================================
   NORMALISATION GENRE
   ========================================================= */

function normalizeGenre(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  for (const genre of KNOWN_GENRES) {
    const genreNormalized = genre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (normalized === genreNormalized) {
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

  /* Méthode 1 : élément exact "Genre:" */

  $("body")
    .find("*")
    .each((_index, element) => {
      const text = cleanText(
        $(element).text()
      );

      if (!text) {
        return;
      }

      const match = text.match(
        /^Genre\s*:\s*(.+)$/i
      );

      if (!match) {
        return;
      }

      match[1]
        .split(/\s*,\s*/)
        .forEach(addGenre);
    });

  /* Méthode 2 : texte brut */

  if (!genres.length) {
    const bodyText = cleanText(
      $("body").text()
    );

    const match = bodyText.match(
      /(?:^|\s)Genre\s*:\s*([^]+?)(?=\s+Réalisateur\s*:|\s+Acteurs?\s*:|\s+Version\s*:)/i
    );

    if (match) {
      match[1]
        .split(/\s*,\s*/)
        .forEach(addGenre);
    }
  }

  return [...new Set(genres)];
}

/* =========================================================
   EXTRACTION CARTE
   ========================================================= */

function extractCard($, link, type) {
  const href = $(link).attr("href");

  if (
    !href ||
    !href.includes("newsid=")
  ) {
    return null;
  }

  const url = absoluteUrl(href);

  let node = $(link);

  for (let i = 0; i < 6; i++) {
    const text = cleanText(node.text());
    const images = node.find("img");

    if (
      images.length &&
      text.length > 20
    ) {
      break;
    }

    node = node.parent();
  }

  const text = cleanText(node.text());

  let title = cleanText(
    $(link).text()
  );

  if (!title) {
    const image = node.find("img").first();

    title = cleanText(
      image.attr("alt")
    );
  }

  if (!title) {
    return null;
  }

  let poster = "";

  const image = node.find("img").first();

  if (image.length) {
    poster =
      image.attr("data-src") ||
      image.attr("data-lazy-src") ||
      image.attr("src") ||
      "";
  }

  poster = absoluteUrl(poster);

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
    year: detectYear(text),
    type,
    poster,
    language: detectLanguage(text),
    quality: detectQuality(text),
    rating: detectRating(text),
    comments: 0,
    views: 0,
    genres: [],
    country: [],
    themes: [],
    synopsis: "",
    trailer: "",
    url,
    addedAt: new Date().toISOString()
  };
}

/* =========================================================
   PARSE LISTING
   ========================================================= */

function parseListing(html, type) {
  const $ = cheerio.load(html);

  const results = [];
  const seen = new Set();

  $("a[href*='newsid=']")
    .each((_index, element) => {
      const item = extractCard(
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
    });

  return results;
}

/* =========================================================
   ENRICHISSEMENT
   ========================================================= */

async function enrichItem(item) {
  try {
    const html = await fetchPage(
      item.url
    );

    const $ = cheerio.load(html);

    const pageText = cleanText(
      $("body").text()
    );

    /* TITRE */

    const heading =
      $("h1").first().text();

    if (heading) {
      item.title = cleanText(
        heading
      );
    }

    /* POSTER */

    const images = $("img");

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
        cleanText(version[1]);
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
        .split("Date de sortie")[0]
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

    /* GENRES */

    item.genres =
      extractGenres($);

    /* SECOURS */

    if (!item.language) {
      item.language =
        detectLanguage(
          pageText
        );
    }

    if (!item.quality) {
      item.quality =
        detectQuality(
          pageText
        );
    }

    if (!item.year) {
      item.year =
        detectYear(
          pageText
        );
    }

    console.log(
      `FS23 genres: ${item.title} -> ${
        item.genres.join(", ") ||
        "aucun"
      }`
    );

    return item;

  } catch (error) {
    console.error(
      `Erreur enrichissement ${item.id}:`,
      error.message
    );

    return item;
  }
}

/* =========================================================
   CONCURRENCE
   ========================================================= */

async function enrichItems(items) {
  const results = [];

  for (
    let i = 0;
    i < items.length;
    i += ENRICH_CONCURRENCY
  ) {
    const batch =
      items.slice(
        i,
        i + ENRICH_CONCURRENCY
      );

    const enriched =
      await Promise.all(
        batch.map(
          enrichItem
        )
      );

    results.push(
      ...enriched
    );
  }

  return results;
}

/* =========================================================
   CHARGEMENT D'UNE SOURCE
   ========================================================= */

async function loadSource(
  source,
  type
) {
  const all = [];

  for (
    let page = 1;
    page <= PAGES;
    page++
  ) {
    try {
      let url = source;

      if (page > 1) {
        url =
          `${source}&page=${page}`;
      }

      console.log(
        `FS23 ${type} page ${page}`
      );

      const html =
        await fetchPage(url);

      const items =
        parseListing(
          html,
          type
        );

      all.push(...items);

      if (!items.length) {
        break;
      }

    } catch (error) {
      console.error(
        `Erreur page ${page}:`,
        error.message
      );
    }
  }

  return all;
}

/* =========================================================
   CHARGEMENT COMPLET
   ========================================================= */

async function refreshCache() {
  console.log(
    "FS15 : actualisation du catalogue..."
  );

  const films =
    await loadSource(
      SOURCES.films,
      "movie"
    );

  const series =
    await loadSource(
      SOURCES.series,
      "series"
    );

  let items = [
    ...films,
    ...series
  ];

  const unique = [];
  const seen = new Set();

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    unique.push(item);
  }

  items = unique;

  console.log(
    `FS15 : ${items.length} éléments trouvés`
  );

  /*
   * On enrichit avant de limiter.
   * Les genres sont donc réellement récupérés.
   */

  const enriched =
    await enrichItems(
      items
    );

  cache = enriched.slice(
    0,
    MAX_RESULTS
  );

  lastUpdate =
    Date.now();

  console.log(
    `FS15 : catalogue prêt avec ${cache.length} éléments`
  );

  return cache;
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
    normalizeGenre(
      genre
    );

  if (!wanted) {
    return items;
  }

  return items.filter(
    item =>
      Array.isArray(item.genres) &&
      item.genres.some(
        itemGenre =>
          normalizeGenre(
            itemGenre
          ) === wanted
      )
  );
}

/* =========================================================
   CATALOGUE PUBLIC
   ========================================================= */

async function getCatalogue(
  options = {}
) {
  const now = Date.now();

  if (
    !cache.length ||
    now - lastUpdate > REFRESH_MS
  ) {
    await refreshCache();
  }

  let result = [...cache];

  /* TYPE */

  if (options.type) {
    result = result.filter(
      item =>
        item.type ===
        options.type
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
  KNOWN_GENRES
};
