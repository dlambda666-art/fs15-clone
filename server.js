const cheerio = require("cheerio");

const BASE_URL = "https://fs23.lol";

const SOURCES = {
  films: `${BASE_URL}/index.php?category=films&do=cat`,
  series: `${BASE_URL}/index.php?category=s-tv&do=cat`
};

/*
 * =========================================================
 * CONFIGURATION
 * =========================================================
 *
 * 50 pages × environ 18 éléments = jusqu'à 900 éléments
 * par catégorie.
 *
 * Les pages FS23 étant triées du plus récent au plus ancien,
 * les nouveautés restent naturellement en tête.
 */

const PAGES = Number(
  process.env.FS15_PAGES || 50
);

const REFRESH_MS = Number(
  process.env.FS15_REFRESH_MS || 600000
);

const PAGE_SIZE = Number(
  process.env.FS15_PAGE_SIZE || 18
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

    "k drama":
      "K-DRAMA",

    "k-drama":
      "K-DRAMA"

  };

  if (
    aliases[normalized]
  ) {

    return aliases[
      normalized
    ];

  }

  for (
    const genre of KNOWN_GENRES
  ) {

    const genreNormalized =
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
      normalized ===
      genreNormalized
    ) {

      if (
        genreNormalized ===
        "science fiction"
      ) {

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

    const genre =
      normalizeGenre(value);

    if (
      genre &&
      !genres.includes(genre)
    ) {

      genres.push(genre);

    }

  }


  /* -------------------------------------------------------
     BLOCS GENRE
     ------------------------------------------------------- */

  $(
    "[class*='genre'], [id*='genre'], [data-genre], [data-genres]"
  )
    .each(
      (_index, element) => {

        const text =
          cleanText(
            $(element).text()
          );

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
              addGenre
            );

        }

        if (dataGenres) {

          dataGenres
            .split(
              /[|,;/]+/
            )
            .forEach(
              addGenre
            );

        }

        if (text) {

          const match =
            text.match(
              /Genres?\s*:\s*(.+)$/i
            );

          if (match) {

            match[1]
              .split(
                /\s*,\s*/
              )
              .forEach(
                addGenre
              );

          }

        }

      }
    );


  /* -------------------------------------------------------
     LIGNES GENRE :
     ------------------------------------------------------- */

  $(
    "tr, li, p, div, span"
  )
    .each(
      (_index, element) => {

        const text =
          cleanText(
            $(element).text()
          );

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
          .split(
            /\s*,\s*/
          )
          .forEach(
            addGenre
          );

      }
    );


  /* -------------------------------------------------------
     SECOURS BODY
     ------------------------------------------------------- */

  if (!genres.length) {

    const bodyText =
      cleanText(
        $("body").text()
      );

    const match =
      bodyText.match(

        /(?:^|\s)Genres?\s*:\s*([^]+?)(?=\s+Réalisateur\s*:|\s+Acteurs?\s*:|\s+Version\s*:|\s+Qualité\s*:)/i

      );

    if (match) {

      match[1]
        .split(
          /\s*,\s*/
        )
        .forEach(
          addGenre
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
   EXTRACTION CARTE
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
      node.find(
        "img"
      ).first();

    title =
      cleanText(
        image.attr(
          "alt"
        )
      );

  }

  if (!title) {
    return null;
  }

  let poster = "";

  const image =
    node.find(
      "img"
    ).first();

  if (image.length) {

    poster =
      image.attr(
        "data-src"
      ) ||

      image.attr(
        "data-lazy-src"
      ) ||

      image.attr(
        "src"
      ) ||

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

  }
  catch {

    return null;

  }

  return {

    id,

    title,

    year:
      detectYear(
        text
      ),

    type,

    poster,

    language:
      detectLanguage(
        text
      ),

    quality:
      detectQuality(
        text
      ),

    rating:
      detectRating(
        text
      ),

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
    cheerio.load(
      html
    );

  const results = [];

  const seen =
    new Set();

  $("a[href*='newsid=']")
    .each(
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

        if (
          seen.has(
            item.id
          )
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
   ENRICHISSEMENT FICHE
   ========================================================= */

async function enrichItem(
  item
) {

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


    /* TITRE */

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


    /* POSTER */

    const images =
      $("img");

    for (
      let i = 0;
      i < images.length;
      i++
    ) {

      const src =
        $(images[i]).attr(
          "src"
        ) ||

        $(images[i]).attr(
          "data-src"
        ) ||

        $(images[i]).attr(
          "data-lazy-src"
        ) ||

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
          absoluteUrl(
            src
          );

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


    /* GENRES */

    item.genres =
      extractGenres(
        $
      );


    /* SECOURS LANGUE */

    if (!item.language) {

      item.language =
        detectLanguage(
          pageText
        );

    }


    /* SECOURS QUALITE */

    if (!item.quality) {

      item.quality =
        detectQuality(
          pageText
        );

    }


    /* SECOURS ANNEE */

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

  }
  catch (error) {

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

async function enrichItems(
  items
) {

  const results = [];

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

    const enriched =
      await Promise.all(
        batch.map(
          item =>
            enrichItem(
              item
            )
        )
      );

    results.push(
      ...enriched
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

  return results;

}


/* =========================================================
   CHARGEMENT DES PAGES
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

      /*
       * Page 1 = URL normale
       * Page suivante = cstart
       */

      const url =
        page === 1
          ? source
          : `${source}&cstart=${page}`;


      console.log(
        `FS23 ${type}: page ${page}/${PAGES}`
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
        `FS23 ${type}: page ${page} -> ${items.length} éléments`
      );


      for (
        const item of items
      ) {

        if (
          !item.id ||
          seen.has(
            item.id
          )
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


      /*
       * On arrête seulement si FS23
       * ne retourne réellement plus rien.
       */

      if (
        !items.length
      ) {

        console.log(
          `FS23 ${type}: fin de pagination à la page ${page}`
        );

        break;

      }

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
   REFRESH CACHE
   ========================================================= */

async function refreshCache() {

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


  /* DEDUPLICATION */

  const unique =
    new Map();

  for (
    const item of combined
  ) {

    if (
      !item.id ||
      unique.has(
        item.id
      )
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


  console.log(
    `FS15 : ${catalogue.length} éléments uniques avant enrichissement`
  );


  /*
   * TOUT est enrichi.
   *
   * C'est indispensable pour que les genres
   * puissent être paginés correctement.
   */

  cache =
    await enrichItems(
      catalogue
    );


  /*
   * On conserve l'ordre FS23 :
   *
   * nouveautés -> anciens
   *
   * Donc les nouveautés restent toujours
   * au début du catalogue.
   */

  lastUpdate =
    Date.now();


  console.log(
    `FS15 : cache complet = ${cache.length} éléments`
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
    return [];
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
   PAGINATION
   ========================================================= */

function paginate(
  items,
  page = 1,
  pageSize = PAGE_SIZE
) {

  page =
    Math.max(
      1,
      Number(page) || 1
    );

  pageSize =
    Math.max(
      1,
      Number(pageSize) || PAGE_SIZE
    );


  const total =
    items.length;


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total /
        pageSize
      )
    );


  /*
   * Si on demande une page trop élevée,
   * on renvoie une page vide plutôt que
   * de boucler ou de casser la route.
   */

  if (
    page > totalPages
  ) {

    return {

      items: [],

      page,

      pageSize,

      total,

      totalPages

    };

  }


  const start =
    (page - 1) *
    pageSize;


  const end =
    start +
    pageSize;


  return {

    items:
      items.slice(
        start,
        end
      ),

    page,

    pageSize,

    total,

    totalPages

  };

}


/* =========================================================
   CATALOGUE PUBLIC
   ========================================================= */

async function getCatalogue(
  options = {}
) {

  const now =
    Date.now();


  if (
    !cache.length ||
    now -
      lastUpdate >
      REFRESH_MS
  ) {

    await refreshCache();

  }


  let result =
    [...cache];


  /* -------------------------------------------------------
     TYPE
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     GENRE
     ------------------------------------------------------- */

  if (
    options.genre
  ) {

    result =
      filterByGenre(
        result,
        options.genre
      );

  }


  /*
   * IMPORTANT :
   *
   * On ne fait PLUS :
   *
   * result.slice(0, 80)
   *
   * avant la pagination.
   *
   * Le genre est d'abord filtré sur
   * l'ensemble des éléments disponibles.
   */


  /* -------------------------------------------------------
     PAGINATION
     ------------------------------------------------------- */

  const page =
    Number(
      options.page ||
      options.p ||
      1
    );


  const pageSize =
    Number(
      options.pageSize ||
      options.limit ||
      PAGE_SIZE
    );


  const paginated =
    paginate(
      result,
      page,
      pageSize
    );


  /*
   * Compatibilité :
   *
   * getCatalogue() continue de retourner
   * directement un tableau.
   *
   * Les informations de pagination sont
   * ajoutées au tableau pour que app.js
   * puisse éventuellement les utiliser.
   */

  const output =
    paginated.items;


  output.page =
    paginated.page;

  output.pageSize =
    paginated.pageSize;

  output.total =
    paginated.total;

  output.totalPages =
    paginated.totalPages;


  console.log(
    `FS15 catalogue: ${
      options.type || "all"
    }${
      options.genre
        ? ` / ${options.genre}`
        : ""
    } -> page ${
      paginated.page
    }/${paginated.totalPages} -> ${
      paginated.items.length
    } éléments`
  );


  return output;

}


/* =========================================================
   EXPORT
   ========================================================= */

module.exports = {

  getCatalogue,

  refreshCache,

  filterByGenre,

  normalizeGenre,

  paginate,

  KNOWN_GENRES,

  PAGE_SIZE,

  PAGES

};
