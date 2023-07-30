const cluster = require("cluster");
const os = require("os");

if (!process.env.NO_CLUSTERS && cluster.isPrimary) {
  const numClusters = process.env.CLUSTERS || (os.availableParallelism ? os.availableParallelism() : (os.cpus().length || 2))

  console.log(`Primary ${process.pid} is running. Will fork ${numClusters} clusters.`);

  // Fork workers.
  for (let i = 0; i < numClusters; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Forking another one....`);
    cluster.fork();
  });

  return true;
}

const express = require("express");
const compression = require("compression");
const YouTubeJS = require("youtubei.js");

const proxyHandler = require("./etc/proxy");
const util = require("./etc/util");

let app = express();
let client;

app.use(compression());

// https://github.com/ytmous/ytmous/pull/25
app.use(function (req, res, next) {
  res.setHeader('X-Frame-Options', "SAMEORIGIN");
  res.setHeader('X-Content-Type-Options', "nosniff");
  next();
});

app.use(express.static(__dirname + "/local/public"));
app.use(express.static(__dirname + "/public"));

app.set("views", [__dirname + "/local/views", __dirname + "/views"]);
app.set("view engine", "ejs");

// Search page
app.get("/s", async (req, res) => {
  let query = req.query.q;
  let page = parseInt(req.query.p || 1);
  if (!query) return res.redirect("/");
  try {
    res.render("search.ejs", {
      res: await client.search(query),
      query: query,
      page,
    });
  } catch (error) {
    util.sendError(res, error);
  }
});

// Watch Page
app.get(["/w/:id", "/embed/:id", "/live/:id", "/shorts/:id", "/watch"], async (req, res) => {
  if (!util.validateID(req.params.id) && !util.validateID(req.query.v)) return util.sendInvalidIDError(res);
  try {
    let id = req.params.id || req.query.v;
    let info = await client.getInfo(id);
    res.render("watch.ejs", {
      id: id, info,
      comments: await util.getComments(client, id),
      captions: util.getCaptions(info)
    });
  } catch (error) {
    util.sendError(res, error);
  }
});

// Playlist page
app.get("/p/:id", async (req, res) => {
  res.status(500).render("error.ejs", {
    title: "Sorry. Not implemented yet",
    content: "Viewing playlist is not available in ytmous nightly yet."
  });
});

// Channel page
app.get("/c/:id", async (req, res) => {
  try {
    const channel = await client.getChannel(req.params.id);
    const about = await channel.getAbout();
    const videos = await channel.getVideos();

    res.render("channel.ejs", { channel, about, videos });
  } catch (err) {
    console.error("Failed to fetch channel", req.params.id, err);
    res.status(500).render("error.ejs", {
      title: "Sorry. Something went wrong",
      content: "Failed to fetch channel information:\n" + err.toString()
    });
  }
});

// Comments
app.get("/cm/:id", async (req, res) => {
  if (!util.validateID(req.params.id)) return util.sendInvalidIDError(res);
  try {
    res.render("comments.ejs", {
      id: req.params.id,
      comments: await client.getComments(req.params.id)
    });
  } catch (error) {
    util.sendError(res, error, "Failed to fetch comments");
  }
})

proxyHandler(app);

// 404 Handler
app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "A resource that you tried to get is not available.",
  });
});

app.on("error", console.error);

async function initInnerTube() {
  try {
    client = await YouTubeJS.Innertube.create({ location: process.env.GEOLOCATION || "US", cache: new YouTubeJS.UniversalCache(true, process.env.CACHE_DIR || "./.cache") });
    proxyHandler.setClient(client);

    const listener = app.listen(process.env.PORT || 3000, () => {
      console.log(process.pid, "-- Ready. ytmous is now listening on port", listener.address().port);
    });
  } catch (e) {
    console.error(process.pid, "--- Failed to initialize InnerTube. Trying again in 10 seconds....");
    console.error(e);

    setTimeout(initInnerTube, 10000);
  };
};

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);

initInnerTube();
