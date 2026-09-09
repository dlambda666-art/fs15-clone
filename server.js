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
 */

const PAGES = Number(
  process.env.FS15_PAGES || 50
);

const PAGE_SIZE = Number(
  process.env.FS15_PAGE_SIZE || 18
);

const REFRESH_MS = Number(
  process.env.FS15_REFRESH_MS || 600000
);

const ENRICH_CONCURRENCY = Number(
  process.env.FS15_ENRICH_CONCURRENCY || 8
);

const INITIAL_ENRICH = Number(
  process.env.FS15_INITIAL_ENRICH || 100
);

let cache = [];
let lastUpdate = 0;
let refreshing = false;


/*
 * =========================================================
 * HTTP
 * =========================================================
 */

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


/*
 * =========================================================
 * URL
 * =========================================================
 */

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


/*
 * =========================================================
 * TEXTE
 * =========================================================
 */

function cleanText(value) {

  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();

}


/*
 * =========================================================
 * LANGUE
 * =========================================================
 */

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


/*
 * =========================================================
 * QUALITE
 * =========================================================
 */

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


/*
 * =========================================================
 * NOTE
 * =========================================================
 */

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


/*
 * =========================================================
 * ANNEE
 * =========================================================
 */

function detectYear(text) {

  const match =
    cleanText(text).match(
      /\b(19|20)\d{2}\b/
    );


  return match
    ? match[0]
    : "";

}


/*
 * =========================================================
 * GENRES
 * =========================================================
 */

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


/*
 * =========================================================
 * NORMALISATION GENRE
 * =========================================================
 */

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


/*
 * =========================================================
 * EXTRACTION GENRES
 * =========================================================
 */

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


  /*
   * BLOCS GENRE
   */

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


  /*
   * LIGNES GENRE
   */

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


  /*
   * SECOURS BODY
   */

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


/*
 * =========================================================
 * EXTRACTION CARTE
 * =========================================================
 */

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
      new Date().toISOString(),

    enriched: false

  };

}


/*
 * =========================================================
 * PARSE LISTING
 * =========================================================
 */

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


/*
 * =========================================================
 * ENRICHISSEMENT FICHE
 * =========================================================
 */

async function enrichItem(
  item
) {

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


    /*
     * TITRE
     */

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


    /*
     * POSTER
     */

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


    /*
     * VERSION
     */

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


    /*
     * QUALITE
     */

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


    /*
     * DATE
     */

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


    /*
     * GENRES
     */

    item.genres =
      extractGenres(
        $
      );


    /*
     * SECOURS LANGUE
     */

    if (!item.language) {

      item.language =
        detectLanguage(
          pageText
        );

    }


    /*
     * SECOURS QUALITE
     */

    if (!item.quality) {

      item.quality =
        detectQuality(
          pageText
        );

    }


    /*
     * SECOURS ANNEE
     */

    if (!item.year) {

      item.year =
        detectYear(
          pageText
        );

    }


    item.enriched =
      true;


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


/*
 * =========================================================
 * ENRICHISSEMENT PAR LOTS
 * =========================================================
 */

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


/*
 * =========================================================
 * CHARGEMENT DES PAGES FS23
 * =========================================================
 */

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
          !seen.has(
            item.id
          )
        ) {

          seen.add(
            item.id
          );

          all.push(
            item
          );

        }

      }


      if (
        !items.length
      ) {

        console.log(
          `FS23 ${type}: fin pagination à la page ${page}`
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


/*
 * =========================================================
 * REFRESH COMPLET
 * =========================================================
 */

async function refreshCache() {

  if (
    refreshing
  ) {

    return cache;

  }


  refreshing =
    true;


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


    /*
     * DEDUPLICATION
     */

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
      `FS15 : ${catalogue.length} éléments trouvés`
    );


    /*
     * IMPORTANT
     *
     * Le cache contient TOUT le catalogue.
     * Aucune coupe à 18 ici.
     */

    cache =
      catalogue;


    lastUpdate =
      Date.now();


    /*
     * PREMIER LOT ENRICHIT
     */

    const firstBatch =
      cache.slice(
        0,
        INITIAL_ENRICH
      );


    await enrichItems(
      firstBatch
    );


    /*
     * RESTE EN ARRIERE-PLAN
     */

    const remaining =
      cache.slice(
        INITIAL_ENRICH
      );


    if (
      remaining.length
    ) {

      setImmediate(
        async () => {

          try {

            await enrichItems(
              remaining
            );


            console.log(
              `FS15 : enrichissement complet terminé (${cache.length} éléments)`
            );

          }
          catch (error) {

            console.error(
              "FS15 enrichissement arrière-plan:",
              error.message
            );

          }

        }
      );

    }


    console.log(
      `FS15 : cache disponible = ${cache.length} éléments`
    );


    return cache;

  }
  finally {

    refreshing =
      false;

  }

}


/*
 * =========================================================
 * FILTRE GENRE
 * =========================================================
 */

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


/*
 * =========================================================
 * PAGE STREMIO
 * =========================================================
 */

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
          skip /
          PAGE_SIZE
        ) + 1
      );
