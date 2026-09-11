const cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";

const PAGES = Number(process.env.FS15_PAGES || 50);
const PAGE_SIZE = Number(process.env.FS15_PAGE_SIZE || 18);
const REFRESH_MS = Number(process.env.FS15_REFRESH_MS || 600000);
const ENRICH_CONCURRENCY = Number(
  process.env.FS15_ENRICH_CONCURRENCY || 8
);

let cache = [];
let lastUpdate = 0;
let refreshing = false;


/* =========================================================
   SOURCES
   ========================================================= */

const SOURCES = {
  films: `${BASE_URL}/films/`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};


/* =========================================================
   ROUTES REELLES DU SITE SOURCE
   ========================================================= */

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


  for (const quality of qualities) {

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
      .map(
        v =>
          Number(
            v.replace(",", ".")
          )
      )
      .filter(
        v =>
          v >= 0 &&
          v <= 10
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
        /\b(19|20)\d{2}\b/
      );


  return match
    ? match[0]
    : "";
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

    "science-fiction":
      "Science-Fiction",

    "tele realite":
      "Télé-Réalité",

    "tele-realite":
      "Télé-Réalité",

    "k drama":
      "K-DRAMA",

    "k-drama":
      "K-DRAMA",

    "historique":
      "Historique",

    "histoire":
      "Histoire",

    "mystere":
      "Mystère"
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

      if (
        gn === "science fiction"
      ) {
        return "Science-Fiction";
      }


      return genre;
    }
  }


  return "";
}


/* =========================================================
   AJOUT GENRE UNIQUE
   ========================================================= */

function pushGenre(list, value) {

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
   EXTRACTION GENRES
   ========================================================= */

function extractGenres($) {

  const genres = [];


  /* -------------------------------------------------------
     1. LIENS DE GENRES DU SITE SOURCE
     ------------------------------------------------------- */

  $("a[href]").each(
    (_i, element) => {

      const href =
        $(element).attr("href") || "";


      const text =
        cleanText(
          $(element).text()
        );


      /*
       * Le site source utilise notamment :
       *
       * xfname=genre-1
       * xf=Action
       *
       * ou des routes /films/actions/
       */

      if (
        /xfname\s*=\s*genre-1/i.test(
          href
        )
      ) {

        let value = "";


        try {

          const full =
            new URL(
              href,
              BASE_URL
            );


          value =
            full.searchParams.get(
              "xf"
            ) || "";

        } catch {
          value = "";
        }


        if (!value) {

          const match =
            href.match(
              /[?&]xf=([^&#]+)/i
            );


          if (match) {

            try {
              value =
                decodeURIComponent(
                  match[1]
                );
            } catch {
              value =
                match[1];
            }
          }
        }


        pushGenre(
          genres,
          value || text
        );
      }


      /*
       * Deuxième forme :
       *
       * /films/actions/
       * /films/thrillers/
       * etc.
       */

      const pathMatch =
        href.match(
          /\/films\/([^/?#]+)\/?/i
        );


      if (
        pathMatch &&
        text
      ) {

        pushGenre(
          genres,
          text
        );
      }
    }
  );


  /* -------------------------------------------------------
     2. ATTRIBUTS DATA
     ------------------------------------------------------- */

  $(
    "[data-genre], [data-genres]"
  ).each(
    (_i, element) => {

      const dataGenre =
        $(element).attr(
          "data-genre"
        );


      const dataGenres =
        $(element).attr(
          "data-genres"
        );


      if (dataGenre) {

        dataGenre
          .split(
            /[|,;/]+/
          )
          .forEach(
            value =>
              pushGenre(
                genres,
                value
              )
          );
      }


      if (dataGenres) {

        dataGenres
          .split(
            /[|,;/]+/
          )
          .forEach(
            value =>
              pushGenre(
                genres,
                value
              )
          );
      }
    }
  );


  /* -------------------------------------------------------
     3. GENRES : ...
     ------------------------------------------------------- */

  $(
    "tr, li, p, div, span"
  ).each(
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


      match[1]
        .split(
          /\s*,\s*|\s*\/\s*|\s*\|\s*|\s*;\s*/
        )
        .forEach(
          value =>
            pushGenre(
              genres,
              value
            )
        );
    }
  );


  /* -------------------------------------------------------
     4. CLASSES / IDS CONTENANT GENRE
     ------------------------------------------------------- */

  $(
    "[class*='genre'], [id*='genre']"
  ).each(
    (_i, element) => {

      const text =
        cleanText(
          $(element).text()
        );


      const match =
        text.match(
          /Genres?\s*:\s*(.+)$/i
        );


      if (match) {

        match[1]
          .split(
            /\s*,\s*|\s*\/\s*|\s*\|\s*|\s*;\s*/
          )
          .forEach(
            value =>
              pushGenre(
                genres,
                value
              )
          );
      }
    }
  );


  /* -------------------------------------------------------
     5. SECOURS : BODY
     ------------------------------------------------------- */

  if (!genres.length) {

    const bodyText =
      cleanText(
        $("body").text()
      );


    const match =
      bodyText.match(
        /(?:^|\s)Genres?\s*:\s*([^]+?)(?=\s+Réalisateur\s*:|\s+Acteurs?\s*:|\s+Version\s*:|\s+Qualité\s*:|\s+Date de sortie\s*:|$)/i
      );


    if (match) {

      match[1]
        .split(
          /\s*,\s*|\s*\/\s*|\s*\|\s*|\s*;\s*/
        )
        .forEach(
          value =>
            pushGenre(
              genres,
              value
            )
        );
    }
  }


  return [
    ...new Set(
      genres
    )
  ];
}


/* =========================================================
   FUSION GENRES
   ========================================================= */

function mergeGenres(
  existing,
  detected
) {

  const merged = [];


  for (
    const genre of (
      Array.isArray(existing)
        ? existing
        : []
    )
  ) {

    pushGenre(
      merged,
      genre
    );
  }


  for (
    const genre of (
      Array.isArray(detected)
        ? detected
        : []
    )
  ) {

    pushGenre(
      merged,
      genre
    );
  }


  return [
    ...new Set(
      merged
    )
  ];
}


/* =========================================================
   CARTE
   ========================================================= */

function extractCard(
  $,
  link,
  type,
  forcedGenre = ""
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


  for (
    let i = 0;
    i < 8;
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
      text.length > 15
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


  let poster = "";


  const image =
    node
      .find("img")
      .first();


  if (image.length) {

    poster =
      image.attr("data-src") ||
      image.attr("data-lazy-src") ||
      image.attr("data-original") ||
      image.attr("src") ||
      "";
  }


  poster =
    absoluteUrl(
      poster
    );


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

    genres:
      forcedGenre
        ? [forcedGenre]
        : [],

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
    (_i, element) => {

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


      if (
        seen.has(item.id)
      ) {
        return;
      }


      seen.add(
        item.id
      );


      results.push(
        item
      );
    }
  );


  return results;
}


/* =========================================================
   ENRICHISSEMENT
   ========================================================= */

async function enrichItem(item) {

  if (
    item.enriched
  ) {
    return item;
  }


  try {

    const html =
      await fetchPage(
        item.url
      );


    const $ =
      cheerio.load(
        html
      );


    const pageText =
      cleanText(
        $("body").text()
      );


    /* -----------------------------------------------------
       TITRE
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       POSTER
       ----------------------------------------------------- */

    const imageSelectors = [

      "img[src*='tmdb']",

      "img[data-src*='tmdb']",

      "img[src*='poster']",

      "img[data-src*='poster']",

      "img[src*='upload']",

      "img[data-src*='upload']"
    ];


    for (
      const selector of imageSelectors
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
          absoluteUrl(
            src
          );

        break;
      }
    }


    /* -----------------------------------------------------
       LANGUE
       ----------------------------------------------------- */

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

      const detected =
        detectLanguage(
          pageText
        );


      if (detected) {

        item.language =
          detected;
      }
    }


    /* -----------------------------------------------------
       QUALITE
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       ANNEE
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       GENRES
       ----------------------------------------------------- */

    const detectedGenres =
      extractGenres($);


    /*
     * IMPORTANT
     *
     * AVANT :
     *
     * item.genres = detectedGenres
     *
     * Ce qui détruisait le genre récupéré
     * depuis la catégorie source.
     *
     * MAINTENANT :
     *
     * on fusionne.
     */

    item.genres =
      mergeGenres(
        item.genres,
        detectedGenres
      );


    item.enriched =
      true;


    console.log(
      `FS15 genres: ${item.title} -> ${
        item.genres.length
          ? item.genres.join(", ")
          : "aucun"
      }`
    );


  } catch (error) {

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

async function enrichItems(
  items
) {

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
          enrichItem(
            item
          )
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
   PAGINATION D'UNE CATEGORIE
   ========================================================= */

function buildPageUrl(
  source,
  page
) {

  if (
    page === 1
  ) {
    return source;
  }


  const separator =
    source.includes("?")
      ? "&"
      : "?";


  return `${source}${separator}cstart=${page}`;
}


/* =========================================================
   CHARGEMENT CATEGORIE
   ========================================================= */

async function loadGenreSource(
  genre,
  path
) {

  const source =
    absoluteUrl(
      path
    );


  const all = [];

  const seen =
    new Set();


  console.log(
    `FS15 : ===== GENRE ${genre} =====`
  );


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
        `FS15 ${genre}: page ${page}/${PAGES}`
      );


      const html =
        await fetchPage(
          url
        );


      const items =
        parseListing(
          html,
          "movie",
          genre
        );


      console.log(
        `FS15 ${genre}: page ${page} -> ${items.length} éléments`
      );


      if (
        !items.length
      ) {

        console.log(
          `FS15 ${genre}: fin à la page ${page}`
        );

        break;
      }


      for (
        const item of items
      ) {

        if (
          !item.id ||
          seen.has(item.id)
        ) {
          continue;
        }


        seen.add(
          item.id
        );


        /*
         * Le genre de la catégorie est
         * TOUJOURS conservé.
         */

        item.genres =
          mergeGenres(
            item.genres,
            [genre]
          );


        all.push(
          item
        );
      }


    } catch (error) {

      console.error(
        `FS15 ${genre} page ${page}:`,
        error.message
      );
    }
  }


  console.log(
    `FS15 ${genre}: TOTAL ${all.length}`
  );


  return all;
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
        await fetchPage(
          url
        );


      const items =
        parseListing(
          html,
          type
        );


      console.log(
        `FS15 ${type}: page ${page} -> ${items.length}`
      );


      if (
        !items.length
      ) {
        break;
      }


      for (
        const item of items
      ) {

        if (
          !item.id ||
          seen.has(item.id)
        ) {
          continue;
        }


        seen.add(
          item.id
        );


        all.push(
          item
        );
      }


    } catch (error) {

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
      `FS15 : ${PAGES} pages par genre`
    );


    console.log(
      "========================================"
    );


    const genreEntries =
      Object.entries(
        GENRE_SOURCES
      );


    const genreResults = [];


    const GENRE_CONCURRENCY = 3;


    for (
      let start = 0;
      start < genreEntries.length;
      start += GENRE_CONCURRENCY
    ) {

      const batch =
        genreEntries.slice(
          start,
          start + GENRE_CONCURRENCY
        );


      const results =
        await Promise.all(
          batch.map(
            ([genre, path]) =>
              loadGenreSource(
                genre,
                path
              )
          )
        );


      genreResults.push(
        ...results
      );
    }


    /* -----------------------------------------------------
       CATALOGUE GENERAL
       ----------------------------------------------------- */

    let generalFilms = [];


    try {

      generalFilms =
        await loadGeneralSource(
          SOURCES.films,
          "movie"
        );


    } catch (error) {

      console.error(
        "FS15 films général:",
        error.message
      );
    }


    /* -----------------------------------------------------
       SERIES
       ----------------------------------------------------- */

    let series = [];


    try {

      series =
        await loadGeneralSource(
          SOURCES.series,
          "series"
        );


    } catch (error) {

      console.error(
        "FS15 séries:",
        error.message
      );
    }


    /* -----------------------------------------------------
       FUSION
       ----------------------------------------------------- */

    const combined = [

      ...generalFilms,

      ...series,

      ...genreResults.flat()
    ];


    const unique =
      new Map();


    for (
      const item of combined
    ) {

      if (!item.id) {
        continue;
      }


      if (
        !unique.has(item.id)
      ) {

        unique.set(
          item.id,
          {
            ...item,

            genres:
              mergeGenres(
                [],
                item.genres
              )
          }
        );


        continue;
      }


      const existing =
        unique.get(
          item.id
        );


      /* ---------------------------------------------------
         FUSION GENRES
         --------------------------------------------------- */

      existing.genres =
        mergeGenres(
          existing.genres,
          item.genres
        );


      /* ---------------------------------------------------
         MEILLEURES METADONNEES
         --------------------------------------------------- */

      if (
        !existing.poster &&
        item.poster
      ) {

        existing.poster =
          item.poster;
      }


      if (
        !existing.year &&
        item.year
      ) {

        existing.year =
          item.year;
      }


      if (
        !existing.language &&
        item.language
      ) {

        existing.language =
          item.language;
      }


      if (
        !existing.quality &&
        item.quality
      ) {

        existing.quality =
          item.quality;
      }
    }


    cache =
      [...unique.values()];


    console.log(
      `FS15 : ${cache.length} éléments uniques`
    );


    /* -----------------------------------------------------
       ENRICHISSEMENT
       ----------------------------------------------------- */

    console.log(
      `FS15 : enrichissement de ${cache.length} éléments...`
    );


    await enrichItems(
      cache
    );


    /* -----------------------------------------------------
       NORMALISATION FINALE
       ----------------------------------------------------- */

    for (
      const item of cache
    ) {

      if (
        !Array.isArray(
          item.genres
        )
      ) {

        item.genres = [];
      }


      item.genres =
        mergeGenres(
          [],
          item.genres
        );
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


  } finally {

    refreshing =
      false;
  }
}


/* =========================================================
   FILTRE HORREUR
   ========================================================= */

function isAllowedHorror(
  item
) {

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
      .filter(
        Boolean
      );


  if (
    !genres.includes(
      "Horreur"
    )
  ) {
    return false;
  }


  if (
    genres.includes(
      "Drame"
    ) ||
    genres.includes(
      "Comédie"
    ) ||
    genres.includes(
      "Romance"
    )
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


  if (
    wanted === "Horreur"
  ) {

    return items.filter(
      item =>
        isAllowedHorror(
          item
        )
    );
  }


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
   PAGINATION API
   ========================================================= */

function getPageNumber(
  options = {}
) {

  if (
    options.page !== undefined
  ) {

    const page =
      Number(
        options.page
      );


    if (
      Number.isFinite(page) &&
      page >= 1
    ) {

      return Math.floor(
        page
      );
    }
  }


  if (
    options.skip !== undefined
  ) {

    const skip =
      Number(
        options.skip
      );


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
   CATALOGUE
   ========================================================= */

async function getCatalogue(
  options = {}
) {

  const now =
    Date.now();


  if (
    !cache.length
  ) {

    await refreshCache();

  }


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
            item.language || ""
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

  GENRE_SOURCES,

  PAGE_SIZE,

  PAGES
};
