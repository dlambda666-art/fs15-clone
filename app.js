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
   CATALOGUE
   ========================================================= */

app.get("/catalog", async (req, res) => {

  try {

    const catalogue =
      await getCatalogue();


    /* -----------------------------------------------------
       FILTRE TYPE
       ----------------------------------------------------- */

    let results =
      [...catalogue];


    if (req.query.type) {

      const type =
        String(req.query.type)
          .toLowerCase()
          .trim();


      results =
        results.filter(item =>
          String(item.type || "")
            .toLowerCase() === type
        );

    }


    /* -----------------------------------------------------
       FILTRE GENRE
       ----------------------------------------------------- */

    if (req.query.genre) {

      const genre =
        String(req.query.genre)
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
              .toLowerCase() === genre
          );

        });

    }


    /* -----------------------------------------------------
       REPONSE
       ----------------------------------------------------- */

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
