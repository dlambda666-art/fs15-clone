const express = require("express");
const { getCatalogue } = require("./server.js");

const app = express();

const PORT = Number(process.env.PORT || 7860);


/* =========================================================
   MANIFEST
   ========================================================= */

const GENRES = [
  "Action",
  "Animation",
  "Aventure",
  "Comédie",
  "Crime",
  "Documentaire",
  "Drame",
  "Famille",
  "Fantastique",
  "Histoire",
  "Horreur",
  "Musique",
  "Mystère",
  "Romance",
  "Science-Fiction",
  "Thriller",
  "Guerre",
  "Western"
];


const manifest = {

  id: "com.lambda666.fs15clone",

  version: "1.0.0",

  name: "FS15 Clone",

  description:
    "Catalogue français dynamique FS23",

  logo:
    "https://www.google.com/s2/favicons?domain=fs23.lol",

  resources: [
    "catalog"
  ],

  types: [
    "movie",
    "series"
  ],

  catalogs: [

    {
      type: "movie",
      id: "fs15-films",
      name: "FS15 Films",

      extra: [
        {
          name: "genre",
          isRequired: false,
          options: GENRES
        }
      ]
    },

    {
      type: "series",
      id: "fs15-series",
      name: "FS15 Séries",

      extra: [
        {
          name: "genre",
          isRequired: false,
          options: GENRES
        }
      ]
    }

  ]

};


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
   MANIFEST
   ========================================================= */

app.get("/manifest.json", (_req, res) => {

  res.json(manifest);

});


/* =========================================================
   CATALOGUE BRUT
   =========================================================
   Cette route reste volontairement intacte
   pour nos tests.
   ========================================================= */

app.get("/catalog", async (_req, res) => {

  try {

    const catalogue =
      await getCatalogue();

    res.json(catalogue);

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
   CATALOGUE NUVIO / STREMIO
   ========================================================= */

app.get(
  "/catalog/:type/:id.json",
  async (req, res) => {

    try {

      const catalogue =
        await getCatalogue();


      const type =
        req.params.type;


      const genre =
        req.query.genre
          ? String(req.query.genre)
          : "";


      /* ---------------------------------------------------
         TYPE
         --------------------------------------------------- */

      let items =
        catalogue.filter(
          item =>
            item.type === type
        );


      /* ---------------------------------------------------
         GENRE
         --------------------------------------------------- */

      if (genre) {

        items =
          items.filter(item =>

            Array.isArray(item.genres) &&

            item.genres.some(
              value =>
                String(value)
                  .toLowerCase() ===
                genre.toLowerCase()
            )

          );

      }


      /* ---------------------------------------------------
         FORMAT STREMIO / NUVIO
         --------------------------------------------------- */

      const metas =
        items.map(item => {

          const meta = {

            id:
              item.id,

            type:
              item.type,

            name:
              item.title,

            poster:
              item.poster || undefined,

            description:
              item.synopsis || undefined,

            releaseInfo:
              item.year || undefined,

            genres:
              Array.isArray(item.genres)
                ? item.genres
                : []

          };


          if (
            item.rating &&
            Number(item.rating) > 0
          ) {

            meta.imdbRating =
              Number(item.rating);

          }


          return meta;

        });


      res.json({
        metas
      });

    }

    catch (error) {

      console.error(
        "Erreur catalogue Nuvio:",
        error
      );

      res
        .status(500)
        .json({
          metas: []
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
