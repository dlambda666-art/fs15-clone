const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 7860;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const catalog = [];

function sortNewest(items) {
  return [...items].sort(
    (a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0)
  );
}

app.get("/api/catalog", (req, res) => {
  let items = catalog;

  const { type, genre, language, q } = req.query;

  if (type) {
    items = items.filter(item => item.type === type);
  }

  if (genre) {
    items = items.filter(item =>
      Array.isArray(item.genres) &&
      item.genres.some(
        g => g.toLowerCase() === genre.toLowerCase()
      )
    );
  }

  if (language) {
    items = items.filter(item =>
      String(item.language || "")
        .toLowerCase()
        .includes(language.toLowerCase())
    );
  }

  if (q) {
    const search = q.toLowerCase();

    items = items.filter(item =>
      String(item.title || "")
        .toLowerCase()
        .includes(search)
    );
  }

  res.json({
    items: sortNewest(items),
    count: items.length
  });
});

app.get("/api/categories", (_req, res) => {
  const genres = [
    ...new Set(
      catalog.flatMap(item =>
        Array.isArray(item.genres) ? item.genres : []
      )
    )
  ].sort();

  res.json({
    types: ["movie", "series"],
    languages: ["VF", "VOSTFR", "VF+VOSTFR", "VO"],
    genres
  });
});

app.get("/api/item/:id", (req, res) => {
  const item = catalog.find(
    entry => String(entry.id) === String(req.params.id)
  );

  if (!item) {
    return res.status(404).json({
      error: "Fiche introuvable"
    });
  }

  res.json(item);
});

app.listen(PORT, () => {
  console.log(`FS15 Clone lancé sur le port ${PORT}`);
});
