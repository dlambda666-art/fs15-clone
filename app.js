const express = require("express");
const { getCatalogue } = require("./server.js");

const app = express();

const PORT = Number(process.env.PORT || 7860);


/* =========================================================
   ACCUEIL
   ========================================================= */

app.get("/", (_req, res) => {

  res.json({
    name: "FS15 Clone",
    status: "ok"
  });

});


/* =========================================================
   HEALTH
   ========================================================= */

app.get("/health", (_req, res) => {

  res.json({
    status: "ok"
  });

});


/* =========================================================
   FILTRAGE DU CATALOGUE
   ========================================================= */

function filterCatalogue(catalogue, type, genre) {

  let results = [...catalogue];


  /* -------------------------------------------------------
     TYPE
     ------------------------------------------------------- */

  if (type) {

    const wantedType =
      String(type)
        .toLowerCase()
        .trim();

    results =
      results.filter(item =>
        String(item.type || "")
          .toLowerCase()
          .trim() === wantedType
      );

  }


  /* -------------------------------------------------------
     GENRE
     ------------------------------------------------------- */

  if (genre) {

    const wantedGenre =
      String(genre)
        .replace(/\.json$/i, "")
        .trim()
        .toLowerCase();


    results =
      results.filter(item => {

        if (!Array.isArray(item.genres)) {
          return false;
        }


        return item.genres.some(itemGenre =>
          String(itemGenre)
            .trim()
            .toLowerCase() === wantedGenre
        );

      });

  }


  return results;

}


/* =========================================================
   EXTRA STREMIO
   ========================================================= */

function getGenreFromExtra(extra) {

  if (!extra) {
    return "";
  }


  let value =
    decodeURIComponent(
      String(extra)
    );


  value =
    value.replace(
      /\.json$/i,
      ""
    );


  const match =
    value.match(
      /(?:^|&)genre=([^&]+)/i
    );


  if (!match) {
    return "";
  }


  return decodeURIComponent(
    match[1]
  );

}


/* =========================================================
   CATALOGUE DIRECT
   =========================================================
   
   Exemple :
   /catalog
   /catalog?type=movie&genre=Horreur

   ========================================================= */

app.get("/catalog", async (req, res) => {

  try {

    const catalogue =
      await getCatalogue();


    const results =
      filterCatalogue(
        catalogue,
        req.query.type,
        req.query.genre
      );


    res.json(results);

  }

  catch (error) {

    console.error(
      "Erreur catalogue FS23:",
      error
    );


    res
      .status(500)
      .json({
        error: error.message
      });

  }

});


/* =========================================================
   CATALOGUE STREMIO
   =========================================================
   
   Formats acceptés :

   /catalog/movie/fs15-films.json

   /catalog/movie/fs15-films/genre=Horreur.json

   /catalog/series/fs15-series.json

   /catalog/series/fs15-series/genre=Horreur.json

   ========================================================= */

app.get(
  "/catalog/:type/:id/:extra?",
  async (req, res) => {

    try {

      const catalogue =
        await getCatalogue();


      const type =
        String(
          req.params.type || ""
        )
        .toLowerCase()
        .trim();


      const genre =
        getGenreFromExtra(
          req.params.extra
        );


      const results =
        filterCatalogue(
          catalogue,
          type,
          genre
        );


      /* ---------------------------------------------------
         FORMAT STREMIO
         --------------------------------------------------- */

      res.json({

        metas:
          results.map(item => ({

            id:
              String(item.id),

            type:
              item.type,

            name:
              item.title,

            poster:
              item.poster || undefined,

            year:
              item.year
                ? Number(item.year)
                : undefined,

            description:
              item.synopsis || undefined,

            genres:
              Array.isArray(item.genres)
                ? item.genres
                : [],

            rating:
              item.rating || undefined

          }))

      });

    }

    catch (error) {

      console.error(
        "Erreur catalogue Stremio FS23:",
        error
      );


      res
        .status(500)
        .json({
          metas: [],
          error: error.message
        });

    }

  }
);


/* =========================================================
   DEMARRAGE
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `FS15 Clone démarré sur le port ${PORT}`
    );

  }
);
