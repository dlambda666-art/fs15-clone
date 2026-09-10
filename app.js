const express = require("express");
const path = require("path");
const { getCatalogue } = require("./server.js");

const app = express();

const PORT = Number(process.env.PORT || 7860);
const PAGE_SIZE = Number(process.env.FS15_PAGE_SIZE || 50);

const FRENCH_POSTER_BASE = String(
  process.env.FRENCH_POSTER_BASE ||
  "https://lambda666-french-poster.hf.space"
).replace(/\/$/, "");

const POSTER_CACHE_MS = Number(
  process.env.FS15_POSTER_CACHE_MS || 600000
);

const posterCache = new Map();
const posterInflight = new Map();


/* =========================================================
   WEB
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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "FS15 Clone"
  });
});


/* =========================================================
   IMDb
   ========================================================= */

async function getImdbId(item) {

  if (!item) {
    return "";
  }

  for (
    const value of [
      item.imdb,
      item.imdbId,
      item.imdb_id
    ]
  ) {

    const match =
      String(value || "")
        .match(/tt\d{7,10}/i);

    if (match) {
      return match[0].toLowerCase();
    }
  }

  if (!item.url) {
    return "";
  }

  try {

    const response =
      await fetch(
        item.url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language":
              "fr-FR,fr;q=0.9,en;q=0.8"
          },
          signal:
            AbortSignal.timeout(12000)
        }
      );

    if (!response.ok) {
      return "";
    }

    const html =
      await response.text();

    const match =
      html.match(
        /tt\d{7,10}/i
      );

    return match
      ? match[0].toLowerCase()
      : "";

  } catch (error) {

    console.log(
      `[FS15] IMDb ${item.id}: ${error.message}`
    );

    return "";
  }
}


/* =========================================================
   FRENCH POSTER
   =========================================================

   IMPORTANT :

   On appelle :

   /poster/ttXXXXXXXX.svg

   et PAS directement /vf.svg ou /vostfr.svg.

   C'est French Poster qui regarde la fiche FS23
   et détermine automatiquement :

   VF
   VOSTFR
   VF + VOSTFR

   Donc le mécanisme s'applique à chaque affiche.
   ========================================================= */

async function resolvePoster(item) {

  const fallback =
    item?.poster || "";

  if (!item) {
    return fallback;
  }

  const key =
    String(
      item.id ||
      item.title ||
      ""
    );

  const cached =
    posterCache.get(key);

  if (
    cached &&
    Date.now() - cached.time <
      POSTER_CACHE_MS
  ) {

    return cached.url;
  }

  if (
    posterInflight.has(key)
  ) {

    return posterInflight.get(key);
  }


  const promise =
    (async () => {

      const imdbId =
        await getImdbId(item);

      if (!imdbId) {

        posterCache.set(
          key,
          {
            time: Date.now(),
            url: fallback
          }
        );

        return fallback;
      }


      const posterUrl =
        `${FRENCH_POSTER_BASE}/poster/${imdbId}.svg?v=fs15`;


      posterCache.set(
        key,
        {
          time: Date.now(),
          url: posterUrl
        }
      );

      return posterUrl;

    })()
    .finally(
      () =>
        posterInflight.delete(key)
    );


  posterInflight.set(
    key,
    promise
  );

  return promise;
}


async function withFrenchPosters(
  items
) {

  return Promise.all(
    items.map(
      async item => ({
        ...item,
        poster:
          await resolvePoster(item)
      })
    )
  );
}


/* =========================================================
   API CATALOGUE
   ========================================================= */

app.get(
  "/api/catalog",
  async (
    req,
    res
  ) => {

    try {

      const page =
        Math.max(
          1,
          Number(
            req.query.page || 1
          )
        );

      const offset =
        (page - 1) *
        PAGE_SIZE;


      let items =
        await getCatalogue({

          type:
            req.query.type,

          genre:
            req.query.genre,

          language:
            req.query.language,

          q:
            req.query.q

        });


      const sort =
        req.query.sort ||
        "new";


      if (
        sort === "rating"
      ) {

        items.sort(
          (a, b) =>
            Number(
              b.rating || 0
            ) -
            Number(
              a.rating || 0
            )
        );

      } else if (
        sort === "comments"
      ) {

        items.sort(
          (a, b) =>
            Number(
              b.comments || 0
            ) -
            Number(
              a.comments || 0
            )
        );

      } else if (
        sort === "views"
      ) {

        items.sort(
          (a, b) =>
            Number(
              b.views || 0
            ) -
            Number(
              a.views || 0
            )
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


      const total = items.length;

items = await withFrenchPosters(items);

      res.json({

        page,

        pageSize:
          PAGE_SIZE,

        total,

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
   FICHE
   ========================================================= */

app.get(
  "/api/item/:id",
  async (
    req,
    res
  ) => {

    try {

      const items =
        await getCatalogue({});


      const item =
        items.find(
          x =>
            String(x.id) ===
            String(
              req.params.id
            )
        );


      if (!item) {

        return res
          .status(404)
          .json({
            error:
              "Élément introuvable"
          });
      }


      const [
        enriched
      ] =
        await withFrenchPosters(
          [item]
        );


      res.json(
        enriched
      );

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
   STREMIO
   ========================================================= */

app.get(
  /^\/catalog\/([^/]+)\/([^/]+)$/,
  async (
    req,
    res
  ) => {

    try {

      const type =
        req.params[0] ===
        "series"
          ? "series"
          : "movie";


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


      let items =
        await getCatalogue({

          type,

          genre

        });


      items =
        items.slice(
          skip,
          skip + PAGE_SIZE
        );


      items =
        await withFrenchPosters(
          items
        );


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

              language:
                item.language ||
                undefined,

              tags:
                [
                  item.language,
                  item.quality
                ].filter(
                  Boolean
                ),

              imdbRating:
                Number(
                  item.rating || 0
                ) ||
                undefined

            })
          )

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
   START
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `FS15 Clone démarré sur le port ${PORT}`
    );

    console.log(
      `French Poster : ${FRENCH_POSTER_BASE}`
    );

  }
);
