const cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";
const PAGES = Number(process.env.FS15_PAGES || 50);
const PAGE_SIZE = Number(process.env.FS15_PAGE_SIZE || 18);
const REFRESH_MS = Number(process.env.FS15_REFRESH_MS || 600000);
const ENRICH_CONCURRENCY = Number(
  process.env.FS15_ENRICH_CONCURRENCY || 24
);

let cache = [];
let lastUpdate = 0;
let refreshing = false;


/* =========================================================
   SOURCES
   ========================================================= */

const SOURCES = {
  films: `${BASE_URL}/index.php?category=film-commu&do=cat`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};


/*
 * Routes réelles du site source.
 *
 * Elles restent disponibles comme référence,
 * mais NE servent PLUS à attribuer artificiellement
 * un genre aux films.
 */
const GENRE_SOURCES = {
  "Action": "/films/actions/",
  "Aventure": "/films/aventures/",
  "Animation": "/films/animations/",
  "Arts Martiaux": "/art-martiaux/",
  "Biopic": "/films/biopics/",
  "Comédie": "/films/comedies/",
  "Drame": "/films/drames/",
  "Documentaire": "/films/documentaires/",
  "Horreur": "/films/epouvante-horreurs/",
  "Historique": "/films/historiques/",
  "Espionnage": "/films/espionnages/",
  "Famille": "/films/familles/",
  "Fantastique": "/films/fantastiques/",
  "Guerre": "/films/guerres/",
  "Policier": "/films/policiers/",
  "Romance": "/films/romances/",
  "Science-Fiction": "/films/science-fictions/",
  "Spectacle": "/xfsearch/genre-1/spectacle/",
  "Thriller": "/films/thrillers/",
  "Western": "/films/westerns/"
};


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
  "Spectacle",
  "Thriller",
  "Western",
  "Mystère",
  "Musique",
  "Judiciaire",
  "Médical",
  "K-DRAMA",
  "Télé-Réalité"
];


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


  return response.text();

}


/* =========================================================
   URL
   ========================================================= */

function absoluteUrl(url) {

  if (!url) {
    return "";
  }


  if (/^https?:\/\//i.test(url)) {
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

    "WEB-DL",
    "WEBDL",
    "WEBRIP",

    "BLURAY",
    "BLU-RAY",

    "BRRIP",
    "DVDRIP",

    "HD"

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

  const matches =
    cleanText(text)
      .match(
        /\b([0-9](?:[.,][0-9])?)\b/g
      );


  if (!matches) {
    return 0;
  }


  const numbers =
    matches
      .map(
        value =>
          Number(
            value.replace(",", ".")
          )
      )
      .filter(
        value =>
          value >= 0 &&
          value <= 10
      );


  return numbers.length
    ? numbers[numbers.length - 1]
    : 0;

}


/* =========================================================
   ANNEE
   ========================================================= */

function detectYear(text) {

  const match =
    cleanText(text)
      .match(
        /\b(?:19|20)\d{2}\b/
      );


  return match
    ? match[0]
    : "";

}


/* =========================================================
   NORMALISATION GENRE
   ========================================================= */

function normalizeGenre(value) {

  const text =
    cleanText(value);


  if (!text) {
    return "";
  }


  const normalized =
    text
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toLowerCase()
      .replace(
        /[-_]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  const aliases = {

    "science fiction":
      "Science-Fiction",

    "tele realite":
      "Télé-Réalité",

    "k drama":
      "K-DRAMA",

    "mystere":
      "Mystère",

    "medical":
      "Médical"

  };


  if (
    aliases[normalized]
  ) {

    return aliases[normalized];

  }


  for (
    const genre of KNOWN_GENRES
  ) {

    const gn =
      genre
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toLowerCase()
        .replace(
          /[-_]+/g,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    if (
      normalized === gn
    ) {

      return genre;

    }

  }


  return "";

}


/* =========================================================
   AJOUT GENRE
   ========================================================= */

function pushGenre(
  list,
  value
) {

  const genre =
    normalizeGenre(value);


  if (
    genre &&
    !list.includes(genre)
  ) {

    list.push(genre);

  }

}


/* =========================================================
   DECOUPAGE GENRES
   ========================================================= */

function splitGenreText(value) {

  return cleanText(value)

    .replace(
      /^Genres?\s*:\s*/i,
      ""
    )

    .split(
      /\s*,\s*|\s*&\s*|\s*\/\s*|\s*\|\s*|\s*;\s*/
    )

    .map(cleanText)

    .filter(Boolean);

}


/* =========================================================
   EXTRACTION GENRES
   =========================================================

   SOURCE DE VERITE :

   Le site original indique les genres directement
   dans la fiche du film.

   Exemple :

   Genre: Action, Thriller

   On lit donc la fiche elle-même.
   ========================================================= */

function extractGenres($) {

  const genres = [];


  /*
   * GENRES PAR LIENS
   */

  $(
    ".facts .genres a, " +
    ".genres a, " +
    "a[href*='xfname=genre-1']"
  ).each(
    (_i, element) => {

      const text =
        cleanText(
          $(element).text()
        );


      const href =
        $(element).attr("href") ||
        "";


      let value =
        text;


      try {

        const parsed =
          new URL(
            href,
            BASE_URL
          );


        value =
          parsed.searchParams.get(
            "xf"
          ) ||
          text;

      }

      catch (_) {}


      pushGenre(
        genres,
        value
      );

    }
  );


  /*
   * FORME :
   *
   * Genre: Action, Thriller
   */

  $("body *").each(
    (_i, element) => {

      const text =
        cleanText(
          $(element).text()
        );


      const match =
        text.match(
          /^Genres?\s*:\s*(.+)$/i
        );


      if (!match) {
        return;
      }


      for (
        const value of
        splitGenreText(
          match[1]
        )
      ) {

        pushGenre(
          genres,
          value
        );

      }

    }
  );


  /*
   * SECOURS :
   *
   * recherche dans le texte complet
   */

  if (!genres.length) {

    const bodyText =
      cleanText(
        $("body").text()
      );


    const match =
      bodyText.match(

        /(?:^|\s)Genres?\s*:\s*([^]+?)(?=\s+Réalisateur\s*:|\s+Acteurs?\s*:|\s+Version\s*:|\s+Qualité\s*:|\s+Date de sortie\s*:|\s+Langue d'origine\s*:|$)/i

      );


    if (match) {

      for (
        const value of
        splitGenreText(
          match[1]
        )
      ) {

        pushGenre(
          genres,
          value
        );

      }

    }

  }


  return [
    ...new Set(genres)
  ];

}


/* =========================================================
   CARTE
   ========================================================= */

function extractCard(
  $,
  link,
  type
) {

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


  /*
   * Remonte jusqu'au conteneur de la carte.
   */

  for (
    let i = 0;
    i < 8;
    i++
  ) {

    if (
      node.find("img").length &&
      cleanText(
        node.text()
      ).length > 15
    ) {

      break;

    }


    const parent =
      node.parent();


    if (!parent.length) {
      break;
    }


    node =
      parent;

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

    title =
      cleanText(
        node
          .find("img")
          .first()
          .attr("alt")
      );

  }


  if (!title) {
    return null;
  }


  const image =
    node
      .find("img")
      .first();


  const poster =
    absoluteUrl(

      image.attr("data-src") ||

      image.attr("data-lazy-src") ||

      image.attr("data-original") ||

      image.attr("src") ||

      ""

    );


  let id = "";


  try {

    id =
      new URL(url)
        .searchParams
        .get("newsid") ||
      "";

  }

  catch (_) {

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

    /*
     * IMPORTANT :
     *
     * Aucun genre provenant de la liste.
     *
     * Les vrais genres seront récupérés
     * sur la fiche lors de l'enrichissement.
     */

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

function parseListing(
  html,
  type
) {

  const $ =
    cheerio.load(html);


  const results = [];

  const seen =
    new Set();


  $("a[href*='newsid=']").each(
    (_i, element) => {

      const item =
        extractCard(
          $,
          element,
          type
        );


      if (
        !item ||
        !item.id ||
        seen.has(item.id)
      ) {

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

    console.log(
      `FS15 fiche: ${item.id}`
    );


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


    /* =====================================================
       TITRE
       ===================================================== */

    const heading =
      $("h1")
        .first()
        .text();


    if (heading) {

      item.title =
        cleanText(
          heading
        );

    }


    /* =====================================================
       POSTER
       ===================================================== */

    const imageSelectors = [

      "img[src*='tmdb']",

      "img[data-src*='tmdb']",

      "img[src*='poster']",

      "img[data-src*='poster']",

      "img[src*='upload']",

      "img[data-src*='upload']"

    ];


    for (
      const selector of
      imageSelectors
    ) {

      const img =
        $(selector)
          .first();


      if (!img.length) {
        continue;
      }


      const src =

        img.attr("data-src") ||

        img.attr("data-lazy-src") ||

        img.attr("src") ||

        "";


      if (src) {

        item.poster =
          absoluteUrl(src);

        break;

      }

    }


    /* =====================================================
       LANGUE
       ===================================================== */

    const version =
      pageText.match(

        /Version\s*:\s*([^]+?)(?=\s+Qualité|\s+Date de sortie|$)/i

      );


    if (version) {

      const detected =
        detectLanguage(
          version[1]
        );


      if (detected) {

        item.language =
          detected;

      }

    }


    if (!item.language) {

      item.language =
        detectLanguage(
          pageText
        );

    }


    /* =====================================================
       QUALITE
       ===================================================== */

    const quality =
      pageText.match(

        /Qualité\s*:\s*([^]+?)(?=\s+Date de sortie|$)/i

      );


    if (quality) {

      const detected =
        detectQuality(
          quality[1]
        );


      if (detected) {

        item.quality =
          detected;

      }

    }


    if (!item.quality) {

      item.quality =
        detectQuality(
          pageText
        );

    }


    /* =====================================================
       ANNEE
       ===================================================== */

    const release =
      pageText.match(
        /Date de sortie\s*:\s*([^]+)/i
      );


    if (release) {

      const detected =
        detectYear(
          release[1]
        );


      if (detected) {

        item.year =
          detected;

      }

    }


    if (!item.year) {

      item.year =
        detectYear(
          pageText
        );

    }


    /* =====================================================
       GENRES
       =====================================================

       C'EST ICI QUE LE VRAI GENRE EST RECUPERE.
       */

    item.genres =
      extractGenres($);


    /* =====================================================
       SYNOPSIS
       ===================================================== */

    const synopsis =
      $("meta[name='description']")
        .attr("content");


    if (synopsis) {

      item.synopsis =
        cleanText(
          synopsis
        );

    }


    item.enriched =
      true;


    console.log(
      `FS15 genres: ${item.title} -> ${
        item.genres.join(", ") ||
        "aucun"
      }`
    );

  }

  catch (error) {

    console.error(
      `FS15 enrichissement ${item.id}:`,
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
   PAGINATION
   ========================================================= */

function buildPageUrl(
  source,
  page
) {

  if (page === 1) {
    return source;
  }


  const separator =
    source.includes("?")
      ? "&"
      : "?";


  return (
    `${source}${separator}cstart=${page}`
  );

}


/* =========================================================
   CHARGEMENT GENERAL
   ========================================================= */

async function loadGeneralSource(
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
        buildPageUrl(
          source,
          page
        );


      console.log(
        `FS15 ${type}: page ${page}/${PAGES}`
      );


      const html =
        await fetchPage(url);


      const items =
        parseListing(
          html,
          type
        );


      console.log(
        `FS15 ${type}: page ${page} -> ${items.length}`
      );


      if (!items.length) {

        break;

      }


      let newItems = 0;


      for (
        const item of items
      ) {

        if (
          !item.id ||
          seen.has(item.id)
        ) {

          continue;

        }


        seen.add(item.id);

        all.push(item);

        newItems++;

      }


      /*
       * Protection :
       *
       * si cstart renvoie exactement
       * la même page, on arrête.
       */

      if (!newItems) {

        console.log(
          `FS15 ${type}: page répétée, arrêt à ${page}`
        );

        break;

      }

    }

    catch (error) {

      console.error(
        `FS15 ${type} page ${page}:`,
        error.message
      );

    }

  }


  return all;

}


/* =========================================================
   REFRESH COMPLET
   ========================================================= */

async function refreshCache() {

  if (refreshing) {
    return cache;
  }


  refreshing = true;


  try {

    console.log(
      "========================================"
    );


    console.log(
      "FS15 : ACTUALISATION COMPLETE"
    );


    console.log(
      `FS15 : ${PAGES} pages maximum par source`
    );


    console.log(
      "FS15 : genres lus directement sur les fiches"
    );


    console.log(
      "========================================"
    );


    let films = [];

    let series = [];


    /* =====================================================
       FILMS
       ===================================================== */

    try {

      films =
        await loadGeneralSource(
          SOURCES.films,
          "movie"
        );

    }

    catch (error) {

      console.error(
        "FS15 films:",
        error.message
      );

    }


    /* =====================================================
       SERIES
       ===================================================== */

    try {

      series =
        await loadGeneralSource(
          SOURCES.series,
          "series"
        );

    }

    catch (error) {

      console.error(
        "FS15 séries:",
        error.message
      );

    }


    /* =====================================================
       DEDUPLICATION
       ===================================================== */

    const unique =
      new Map();


    for (
      const item of [
        ...films,
        ...series
      ]
    ) {

      if (
        !item.id ||
        unique.has(item.id)
      ) {

        continue;

      }


      unique.set(
        item.id,
        {
          ...item,

          /*
           * Les genres sont volontairement
           * vides avant lecture de la fiche.
           */

          genres: []

        }
      );

    }


    cache =
      [
        ...unique.values()
      ];


    console.log(
      `FS15 : ${cache.length} éléments uniques avant enrichissement`
    );


    /* =====================================================
       ENRICHISSEMENT
       ===================================================== */

    await enrichItems(
      cache
    );


    /* =====================================================
       NORMALISATION FINALE DES GENRES
       ===================================================== */

    for (
      const item of cache
    ) {

      item.genres =
        [
          ...new Set(

            (
              Array.isArray(
                item.genres
              )
                ? item.genres
                : []
            )

              .map(
                normalizeGenre
              )

              .filter(Boolean)

          )
        ];

    }


    lastUpdate =
      Date.now();


    console.log(
      "========================================"
    );


    console.log(
      `FS15 : CATALOGUE PRÊT : ${cache.length}`
    );


    console.log(
      "========================================"
    );


    return cache;

  }

  finally {

    refreshing =
      false;

  }

}


/* =========================================================
   FILTRE HORREUR
   ========================================================= */

function isAllowedHorror(item) {

  if (
    !item ||
    !Array.isArray(
      item.genres
    )
  ) {

    return false;

  }


  const genres =
    item.genres
      .map(
        normalizeGenre
      )
      .filter(Boolean);


  /*
   * Horreur obligatoire.
   */

  if (
    !genres.includes(
      "Horreur"
    )
  ) {

    return false;

  }


  /*
   * Exclusions :
   *
   * Drame
   * Comédie
   * Romance
   */

  if (
    genres.includes("Drame") ||
    genres.includes("Comédie") ||
    genres.includes("Romance")
  ) {

    return false;

  }


  return true;

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
    return [];
  }


  /*
   * HORREUR
   */

  if (
    wanted === "Horreur"
  ) {

    return items.filter(
      isAllowedHorror
    );

  }


  /*
   * AUTRES GENRES
   */

  return items.filter(
    item => {

      if (
        !Array.isArray(
          item.genres
        )
      ) {

        return false;

      }


      return item.genres.some(
        itemGenre =>
          normalizeGenre(
            itemGenre
          ) === wanted
      );

    }
  );

}


/* =========================================================
   CATALOGUE
   ========================================================= */

async function getCatalogue(
  options = {}
) {

  const now =
    Date.now();


  /*
   * PREMIER CHARGEMENT
   */

  if (!cache.length) {

    await refreshCache();

  }


  /*
   * REFRESH AUTOMATIQUE
   */

  else if (
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


  /* =====================================================
     TYPE
     ===================================================== */

  if (
    options.type
  ) {

    result =
      result.filter(
        item =>
          item.type ===
          options.type
      );

  }


  /* =====================================================
     LANGUE
     ===================================================== */

  if (
    options.language
  ) {

    const wanted =
      String(
        options.language
      )
        .toLowerCase();


    result =
      result.filter(
        item =>
          String(
            item.language ||
            ""
          )
            .toLowerCase()
            .includes(
              wanted
            )
      );

  }


  /* =====================================================
     GENRE
     ===================================================== */

  if (
    options.genre
  ) {

    result =
      filterByGenre(
        result,
        options.genre
      );

  }


  /* =====================================================
     RECHERCHE
     ===================================================== */

  if (
    options.q
  ) {

    const query =
      String(
        options.q
      )
        .toLowerCase()
        .trim();


    result =
      result.filter(
        item => {

          const haystack =
            [

              item.title,

              ...(item.genres || []),

              item.language,

              item.quality,

              item.year

            ]
              .join(" ")
              .toLowerCase();


          return haystack.includes(
            query
          );

        }
      );

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

  GENRE_SOURCES,

  PAGE_SIZE,

  PAGES

};
