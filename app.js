const express = require("express");
const path = require("path");

const {
  getCatalogue
} = require("./server.js");

const app = express();

const PORT = Number(
  process.env.PORT || 7860
);

const PAGE_SIZE = Number(
  process.env.FS15_PAGE_SIZE || 18
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
   API CATALOGUE WEB
   ========================================================= */

app.get(
  "/api/catalog",
  async (req, res) => {

    try {

      const page = Math.max(
        1,
        Number(req.query.page || 1)
      );

      const offset =
        (page - 1) * PAGE_SIZE;

      let items =
        await getCatalogue({
          type: req.query.type,
          genre: req.query.genre,
          limit: PAGE_SIZE,
          offset
        });

      /* LANGUE */

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

      /* RECHERCHE */

      if (req.query.q) {

        const q =
          String(
            req.query.q
          )
            .trim()
            .toLowerCase();

        if (q) {

          items =
            items.filter(item =>
              String(
                item.title || ""
              )
                .toLowerCase()
                .includes(q)
            );
        }
      }

      /* TRI */

      const sort =
        req.query.sort || "new";

      if (sort === "rating") {

        items.sort(
          (a, b) =>
            Number(b.rating || 0) -
            Number(a.rating || 0)
        );

      } else if (sort === "comments") {

        items.sort(
          (a, b) =>
            Number(b.comments || 0) -
            Number(a.comments || 0)
        );

      } else if (sort === "views") {

        items.sort(
          (a, b) =>
            Number(b.views || 0) -
            Number(a.views || 0)
        );

      } else {

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

      res.json({
        page,
        pageSize: PAGE_SIZE,
        items
      });

    } catch (error) {

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
        await getCatalogue({
          limit: 0
        });

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

    } catch (error) {

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
  /^\/catalog\/([^/]+)\/([^/]+)$/,
  async (req, res) => {

    try {

      const type =
        req.params[0] ===
        "series"
          ? "series"
          : "movie";

      /*
       * Stremio envoie généralement
       * skip pour demander la page suivante.
       */

      const skip =
        Math.max(
          0,
          Number(
            req.query.skip || 0
          )
        );

      const genre =
        req.query.genre ||
        undefined;

      const pageSize =
        PAGE_SIZE;

      const items =
        await getCatalogue({
          type,
          genre,
          limit: pageSize,
          offset: skip
        });

      res.json({

        metas:
          items.map(item => ({

            id:
              String(item.id),

            type:
              item.type,

            name:
              item.title,

            poster:
              item.poster ||
              undefined,

            releaseInfo:
              item.year
                ? String(item.year)
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

          }))

      });

    } catch (error) {

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

    console.log(
      `FS15 : ${PAGE_SIZE} éléments par page`
    );

  }
);
