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

let cache = [];
let lastUpdate = 0;


/* =========================================================
   GENRES AUTORISES
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
  "Histoire",
  "Historique",
  "Horreur",
  "Espionnage",
  "Guerre",
  "Judiciaire",
  "Médical",
  "Musique",
  "Mystère",
  "Policier",
  "Romance",
  "Science-Fiction",
  "Spectacle",
  "Télé-Réalité",
  "Thriller",
  "Western",
  "K-Drama"
];


/* =========================================================
   NORMALISATION GENRE
   ========================================================= */

function genreKey(value) {

  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐-‒–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


const GENRE_MAP = new Map(
  KNOWN_GENRES.map(
    genre => [genreKey(genre), genre]
  )
);


function normalizeGenre(value) {

  const key = genreKey(value);

  return GENRE_MAP.get(key) || "";
}


/* =========================================================
   EXTRACTION GENRES — VERSION VERROUILLEE
   ========================================================= */

function extractGenres($, pageText) {

  const found = [];


  /* -------------------------------------------------------
     1. PRIORITE AU HTML

     On cherche un élément contenant exactement
     "Genre" / "Genres", puis on récupère uniquement
     son environnement immédiat.
     ------------------------------------------------------- */

  $("*").each((_index, element) => {

    if (found.length >= 10) {
      return;
    }

    const elementText =
      cleanText($(element).text());

    if (!elementText) {
      return;
    }

    /*
     * On ne veut pas parcourir de gros blocs.
     * Un élément contenant énormément de texte est
     * probablement une fiche entière.
     */

    if (elementText.length > 250) {
      return;
    }

    const labelMatch =
      elementText.match(
        /^Genres?\s*:\s*(.+)$/i
      );

    if (!labelMatch) {
      return;
    }

    const value =
      cleanText(labelMatch[1]);

    addGenresFromText(value, found);

  });


  /* -------------------------------------------------------
     2. FALLBACK TEXTE

     Si le HTML ne permet pas de récupérer le champ,
     on extrait seulement la petite zone située après
     "Genre:" et AVANT le champ suivant.
     ------------------------------------------------------- */

  if (!found.length) {

    const text =
      cleanText(pageText);

    const match =
      text.match(
        /(?:^|\s)Genres?\s*:\s*(.{1,180}?)(?=\s+(?:Réalisateur|Réalisatrice|Acteur|Acteurs|Actrice|Version|Qualité|Date de sortie|Date de sortie française|Budget du Film|Langue d'origine|Pays|Durée|Année|Production|Distribution)\s*:|$)/i
      );

    if (match) {

      addGenresFromText(
        match[1],
        found
      );

    }

  }


  return [
    ...new Set(found)
  ];
}


/* =========================================================
   AJOUT GENRES — WHITELIST STRICTE
   ========================================================= */

function addGenresFromText(text, target) {

  if (!text) {
    return;
  }


  const value =
    cleanText(text);


  /*
   * On ne fait PAS confiance aveuglément au texte.
   *
   * On compare uniquement avec la liste blanche
   * KNOWN_GENRES.
   */

  for (const genre of KNOWN_GENRES) {

    const key =
      genreKey(genre);

    /*
     * Construction d'une regex sûre.
     * Elle accepte :
     *
     * Action
     * Action, Thriller
     * Science-Fiction
     * Science Fiction
     */

    const escaped =
      genre
        .replace(
          /[-/\\^$*+?.()|[\]{}]/g,
          "\\$&"
        );

    const variants = [
      escaped
    ];

    if (
      genre === "Science-Fiction"
    ) {
      variants.push(
        "Science\\s*[- ]?\\s*Fiction"
      );
    }

    if (
      genre === "K-Drama"
    ) {
      variants.push(
        "K[- ]?Drama"
      );
    }

    const regex =
      new RegExp(
        `(?:^|[,;/|\\s])(${variants.join("|")})(?=$|[,;/|\\s])`,
        "i"
      );

    if (regex.test(value)) {

      const normalized =
        normalizeGenre(genre);

      if (
        normalized &&
        !target.includes(normalized)
      ) {

        target.push(
          normalized
        );

      }

    }

  }

}


/* =========================================================
   HTTP
   ========================================================= */

async function fetchPage(url) {

  const response =
    await fetch(url, {
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

  const matches =
    cleanText(text).match(
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

  return numbers.length
    ? numbers[numbers.length - 1]
    : 0;
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

  }
  catch {

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

    comments: 0,
    views: 0,

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


    /* -----------------------------------------------------
       TITRE
       ----------------------------------------------------- */

    const heading =
      $("h1").first().text();

    if (heading) {

      item.title =
        cleanText(
          heading
        );

    }


    /* -----------------------------------------------------
       AFFICHE
       ----------------------------------------------------- */

    $("img").each(
      (_index, image) => {

        if (item.poster) {
          return;
        }

        const src =
          $(image).attr("src") ||
          $(image).attr("data-src") ||
          $(image).attr("data-lazy-src") ||
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

      }
    );


    /* -----------------------------------------------------
       VERSION
       ----------------------------------------------------- */

    const version =
      pageText.match(
        /Version\s*:\s*([^]+?)(?=\s+Qualité\s*:|$)/i
      );

    if (version) {

      item.language =
        cleanText(
          version[1]
        );

    }


    /* -----------------------------------------------------
       QUALITE
       ----------------------------------------------------- */

    const quality =
      pageText.match(
        /Qualité\s*:\s*([^]+?)(?=\s+Date de sortie\s*:|$)/i
      );

    if (quality) {

      item.quality =
        cleanText(
          quality[1]
        );

    }


    /* -----------------------------------------------------
       DATE
       ----------------------------------------------------- */

    const release =
      pageText.match(
        /Date de sortie\s*:\s*([^]+?)(?=\s+(?:Budget du Film|Langue d'origine|Image)\s*:|$)/i
      );

    if (release) {

      item.year =
        detectYear(
          release[1]
        );

    }


    /* -----------------------------------------------------
       GENRES
       ----------------------------------------------------- */

    item.genres =
      extractGenres(
        $,
        pageText
      );


    /*
     * SECURITE ABSOLUE :
     * genres doit TOUJOURS être un tableau contenant
     * uniquement des genres de KNOWN_GENRES.
     */

    item.genres =
      item.genres
        .map(normalizeGenre)
        .filter(Boolean);

    item.genres =
      [
        ...new Set(
          item.genres
        )
      ];


    /* -----------------------------------------------------
       LANGUE DE SECOURS
       ----------------------------------------------------- */

    if (!item.language) {

      item.language =
        detectLanguage(
          pageText
        );

    }


    /* -----------------------------------------------------
       QUALITE DE SECOURS
       ----------------------------------------------------- */

    if (!item.quality) {

      item.quality =
        detectQuality(
          pageText
        );

    }


    /* -----------------------------------------------------
       ANNEE DE SECOURS
       ----------------------------------------------------- */

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
        start + ENRICH_CONCURRENCY
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
          start + batch.length,
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


  /* -------------------------------------------------------
     DERNIER FILTRE DE SECURITE AVANT CACHE
     ------------------------------------------------------- */

  for (const item of limited) {

    item.genres =
      Array.isArray(item.genres)
        ? item.genres
            .map(normalizeGenre)
            .filter(Boolean)
        : [];

    item.genres =
      [
        ...new Set(
          item.genres
        )
      ];

  }


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
