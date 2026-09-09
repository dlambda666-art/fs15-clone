const express = require("express");
const path = require("path");

const {
  getCatalogue
} = require("./server.js");

const app = express();

const PORT = Number(
  process.env.PORT || 7860
);


/* =========================================================
   INTERFACE WEB
   ========================================================= */

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.get("/", (_req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
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
   OUTILS PAGINATION
   ========================================================= */

function getSkip(req) {

  const value =
    Number(req.query.skip);

  if (
    Number.isFinite(value) &&
    value >= 0
  ) {
    return Math.floor(value);
  }

  return 0;

}


function getPage(req) {

  const value =
    Number(req.query.page);

  if (
    Number.isFinite(value) &&
    value >= 1
  ) {
    return Math.floor(value);
  }

  return 1;

}


/* =========================================================
   API CATALOGUE WEB
   ========================================================= */

app.get(
  "/api/catalog",
  async (req, res) => {

    try {

      const skip =
        getSkip(req);

      const page =
        getPage(req);


      let items =
        await getCatalogue({

          type:
            req.query.type,

          genre:
            req.query.genre,

          skip,

          page

        });


      /* =====================================================
         LANGUE
         ===================================================== */

      if (req.query.language) {

        const language =
          String(
            req.query.language
          ).toUpperCase();

        items =
          items.filter(item =>
            String(
              item.language || ""
            )
              .toUpperCase()
              .includes(language)
          );

      }


      /* =====================================================
         RECHERCHE
         ===================================================== */

      if (req.query.q) {

        const q =
          String(
            req.query.q
          )
            .trim()
            .toLowerCase();

        if (q) {

          items =
            items.filter(item => {

              const title =
                String(
                  item.title || ""
                )
                  .toLowerCase();

              return title.includes(q);

            });

        }

      }


      /* =====================================================
         TRI
         ===================================================== */

      const sort =
        req.query.sort || "new";


      if (sort === "rating") {

        items.sort(
          (a, b) =>
            Number(b.rating || 0) -
            Number(a.rating || 0)
        );

      }

      else if (sort === "comments") {

        items.sort(
          (a, b) =>
            Number(b.comments || 0) -
            Number(a.comments || 0)
        );

      }

      else if (sort === "views") {

        items.sort(
          (a, b) =>
            Number(b.views || 0) -
            Number(a.views || 0)
        );

      }

      else {

        items.sort(
          (a, b) =>
            String(
              b.addedAt || ""
            ).localeCompare(
              String(
                a.addedAt || ""
              )
            )
        );

      }


      /* =====================================================
         REPONSE
         ===================================================== */

      res.json({

        items,

        page,

        skip,

        pageSize: 18,

        hasMore:
          items.length === 18

      });

    }

    catch (error) {

      console.error(
        "Erreur API catalogue :",
        error
      );

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================================================
   API FICHE
   ========================================================= */

app.get(
  "/api/item/:id",
  async (req, res) => {

    try {

      const items =
        await getCatalogue();

      const item =
        items.find(
          entry =>
            String(entry.id) ===
            String(req.params.id)
        );


      if (!item) {

        return res
          .status(404)
          .json({

            error:
              "Élément introuvable"

          });

      }


      res.json(item);

    }

    catch (error) {

      console.error(
        "Erreur fiche :",
        error
      );

      res.status(500).json({

        error:
          error.message

      });

    }

  }
);


/* =========================================================
   CATALOGUE STREMIO
   ========================================================= */

app.get(
  /^\/catalog\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/,
  async (req, res) => {

    try {

      const type =
        req.params[0] === "series"
          ? "series"
          : "movie";


      /*
       * EXTRA STREMIO
       *
       * Exemple :
       *
       * genre=Horreur
       * genre=Horreur&skip=18
       * genre=Science-Fiction&skip=36
       */

      const extra =
        req.params[2] || "";


      let genre = "";
      let skip = 0;


      if (extra) {

        const decoded =
          decodeURIComponent(
            extra
          );


        const genreMatch =
          decoded.match(
            /(?:^|&)genre=([^&]+)/i
          );


        if (genreMatch) {

          genre =
            decodeURIComponent(
              genreMatch[1]
            );

        }


        const skipMatch =
          decoded.match(
            /(?:^|&)skip=(\d+)/i
          );


        if (skipMatch) {

          skip =
            Number(
              skipMatch[1]
            );

        }

      }


      const items =
        await getCatalogue({

          type,

          genre,

          skip

        });


      res.json({

        metas:

          items.map(
            item => ({

              id:
                String(
                  item.id
                ),

              type:
                item.type,

              name:
                item.title,

              poster:
                item.poster ||
                undefined,

              releaseInfo:
                item.year
                  ? String(
                      item.year
                    )
                  : undefined,

              description:
                item.synopsis ||
                undefined,

              genres:
                Array.isArray(
                  item.genres
                )
                  ? item.genres
                  : [],

              imdbRating:
                Number(
                  item.rating || 0
                ) || undefined

            })
          )

      });

    }

    catch (error) {

      console.error(
        "Erreur catalogue Stremio :",
        error
      );

      res.status(500).json({

        error:
          error.message

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
