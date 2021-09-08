const m3u8stream = require("m3u8stream");
const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const miniget = require("miniget");
const express = require("express");
const ejs = require("ejs");
const app = express();

//        CONFIGURATION        //

// Result Limit
// By default, ytsr & ytpl result limit is 100.
// For ytmous, The search result default is 50.
// Change it as many as you want. 0 for all result without limit.
// The smaller, The faster.
const limit = process.env.LIMIT || 50;

// User Agent
// This is where we fake our request to youtube.
const user_agent =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

//     END OF CONFIGURATION    //

app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

// Home page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Search page
app.get("/s", async (req, res) => {
  let query = req.query.q;
  let page = Number(req.query.p || 1);
  if (!query) return res.redirect("/");
  try {
    res.render("search.ejs", {
      res: await ytsr(query, { limit, pages: page }),
      query: query,
      page,
    });
  } catch (error) {
    console.error(error);
    try {
      res.status(500).render("error.ejs", {
        title: "ytsr Error",
        content: error,
      });
    } catch (error) {
      console.error(error);
    }
  }
});

// Watch Page
app.get("/w/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  try {
    let info = await ytdl.getInfo(req.params.id);
    if (
      !info.formats.filter((format) => format.hasVideo && format.hasAudio)
        .length
    ) {
      return res.status(500).render("error.ejs", {
        title: "Region Lock",
        content: "Sorry. This video is not available for this server country.",
      });
    }

    res.render("watch.ejs", {
      id: req.params.id,
      info,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytdl Error",
      content: error,
    });
  }
});

// Embed Page
app.get("/e/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  try {
    let info = await ytdl.getInfo(req.params.id);
    if (
      !info.formats.filter((format) => format.hasVideo && format.hasAudio)
        .length
    ) {
      return res
        .status(500)
        .send("This Video is not Available for this Server Region.");
    }

    res.render("embed.ejs", {
      id: req.params.id,
      info,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(error.toString());
  }
});

// Playlist page
app.get("/p/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  let page = Number(req.query.p || 1);
  try {
    res.render("playlist.ejs", {
      playlist: await ytpl(req.params.id, { limit, pages: page }),
      page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytpl Error",
      content: error,
    });
  }
});

// Channel page
app.get("/c/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  let page = Number(req.query.p || 1);
  try {
    res.render("channel.ejs", {
      channel: await ytpl(req.params.id, { limit, pages: page }),
      page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytpl Error",
      content: error,
    });
  }
});

// Proxy Area
// This is where we make everything became anonymous

// Video Streaming
app.get("/s/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  try {
    let info = await ytdl.getInfo(req.params.id);
    info.formats = info.formats.filter(
      (format) => format.hasVideo && format.hasAudio
    );

    if (!info.formats.length) {
      return res
        .status(500)
        .send("This Video is not Available for this Server Region.");
    }

    let headers = {
      "user-agent": user_agent,
    };

    // If user is seeking a video
    if (req.headers.range) {
      headers.range = req.headers.range;
    }

    res.setHeader("content-type", "video/mp4");
    if (info.videoDetails.isLiveContent && info.formats[0].type == "video/ts") {
      return m3u8stream(info.formats[0].url)
        .on("error", (err) => {
          res.status(500).send(err.toString());
          console.error(err);
        })
        .pipe(res);
    }

    let stream = miniget(info.formats[0].url, {
      headers,
    })
      .on("response", (resp) => {
        if (resp.headers["accept-ranges"])
          res.setHeader("accept-ranges", resp.headers["accept-ranges"]);
        if (resp.headers["content-length"])
          res.setHeader("content-length", resp.headers["content-length"]);
        if (resp.headers["content-type"])
          res.setHeader("content-type", resp.headers["content-type"]);
        if (resp.headers["content-range"])
          res.setHeader("content-range", resp.headers["content-range"]);
        if (resp.headers["connection"])
          res.setHeader("connection", resp.headers["connection"]);
        if (resp.headers["cache-control"])
          res.setHeader("cache-control", resp.headers["cache-control"]);
        stream.pipe(res.status(resp.statusCode));
      })
      .on("error", (err) => {
        res.status(500).send(err.toString());
      });
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get("/vi*", (req, res) => {
  let stream = miniget(`https://i.ytimg.com/${req.url.split("?")[0]}`, {
    headers: {
      "user-agent": user_agent,
    },
  });
  stream.on("error", (err) => {
    console.log(err);
    res.status(500).send(err.toString());
  });
  stream.pipe(res);
});

// Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
app.get("/ytc/*", (req, res) => {
  let stream = miniget(`https://yt3.ggpht.com/${req.url}`, {
    headers: {
      "user-agent": user_agent,
    },
  });
  stream.on("error", (err) => {
    console.log(err);
    res.status(500).send(err.toString());
  });
  stream.pipe(res);
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "A resource that you tried to get is not found or deleted.",
  });
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is now listening on port", listener.address().port);
});

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);
