const fs = require("fs");
const path = require("path");

const LOCAL_FILE = path.join(
  __dirname,
  "..",
  "data",
  "catalog.json"
);

let remoteCache = [];
let lastUpdate = 0;

const REFRESH_MS = Number(
  process.env.CATALOG_REFRESH_MS || 300000
);

function normalize(item, index) {
  return {
    id: String(item.id ?? `item-${index}`),

    title: String(
      item.title ??
      item.name ??
      "Sans titre"
    ),

    year: item.year ?? "",

    type:
      item.type === "series"
        ? "series"
        : "movie",

    poster:
      item.poster ??
      item.image ??
      "",

    language:
      item.language ??
      item.lang ??
      "",

    quality:
      item.quality ??
      item.type_quality ??
      "",

    genres:
      Array.isArray(item.genres)
        ? item.genres
        : [],

    country:
      Array.isArray(item.country)
        ? item.country
        : [],

    themes:
      Array.isArray(item.themes)
        ? item.themes
        : [],

    addedAt:
      item.addedAt ??
      item.added_at ??
      new Date(0).toISOString(),

    rating:
      Number(item.rating ?? item.score ?? 0),

    comments:
      Number(item.comments ?? 0),

    views:
      Number(item.views ?? 0),

    synopsis:
      item.synopsis ??
      item.description ??
      "",

    trailer:
      item.trailer ??
      ""
  };
}


function loadLocal() {

  try {

    if (!fs.existsSync(LOCAL_FILE)) {
      return [];
    }

    const raw =
      fs.readFileSync(
        LOCAL_FILE,
        "utf8"
      );

    const data =
      JSON.parse(raw);

    return Array.isArray(data)
      ? data.map(normalize)
      : [];

  } catch (error) {

    console.error(
      "Erreur catalogue local :",
      error.message
    );

    return [];

  }
}


async function loadRemote() {

  const url =
    process.env.CATALOG_URL;

  if (!url) {
    return [];
  }

  try {

    const response =
      await fetch(url, {
        headers: {
          "Accept":
            "application/json"
        }
      });

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    const data =
      await response.json();

    if (!Array.isArray(data)) {

      throw new Error(
        "La source doit retourner un tableau JSON"
      );

    }

    return data.map(normalize);

  } catch (error) {

    console.error(
      "Erreur source distante :",
      error.message
    );

    return [];

  }
}


async function getCatalogue() {

  const now = Date.now();

  if (
    remoteCache.length &&
    now - lastUpdate < REFRESH_MS
  ) {

    return remoteCache;

  }


  if (process.env.CATALOG_URL) {

    const remote =
      await loadRemote();

    if (remote.length) {

      remoteCache =
        remote;

      lastUpdate =
        now;

      return remoteCache;

    }

  }


  return loadLocal();

}


module.exports = {
  getCatalogue,
  normalize
};
