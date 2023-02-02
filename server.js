const m3u8stream = require("m3u8stream");
const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const ytcs = require("@freetube/yt-comment-scraper");
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
const urlreg = /(https?:\/\/[^\s]+)/g;

// User Agent
// This is where we fake our request to youtube.
const user_agent = process.env.USER_AGENT || "googlebot";

//     END OF CONFIGURATION    //

let infos = {
  timeouts: {},
  HLSOrigin: {},
};

function getSize(url, opt) {
  return new Promise((resolv, reject) => {
    this.req = miniget(url, opt)
      .on("response", (res) => {
        this.req.destroy();
        resolv(res.headers["content-length"]);
      })
      .on("error", reject);
  });
}

function getCaptions(id, sub) {
  try {
    this.captions =
      infos[id].player_response.captions.playerCaptionsTracklistRenderer
        .captionTracks;
    if (!this.captions || !this.captions.length) return [];
    if (!sub) return captions;

    return this.captions.filter((c) => c.vssId === sub);
  } catch {
    return [];
  }
}

async function getComments(opt) {
  try {
    return await ytcs.getComments(opt);
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function putInfoToCache(info) {
  if (process.env.NO_CACHE) return;

  this.id = info.videoDetails.videoId;
  this.timeout = info.player_response.streamingData.expiresInSeconds;

  infos[this.id] = JSON.parse(JSON.stringify(info));

  if (infos.timeouts[this.id]) clearTimeout(infos.timeouts[this.id]);
  infos.timeouts[this.id] = setTimeout(() => {
    delete infos[this.id];
  }, parseInt(this.timeout));

  infos[this.id].comments = await getComments({ videoId: this.id });

  return;
}

app.set("views", [__dirname + "/local/views", __dirname + "/views"]);
app.set("view engine", "ejs");

app.use(express.static(__dirname + "/local/public"));
app.use(express.static(__dirname + "/public"));

// Trigger to limit caching
app.use(["/w/*", "/s/*"], (req, res, next) => {
  this.IDs = Object.keys(infos);
  if (this.IDs.length > (process.env.VIDINFO_LIMIT || 20)) {
    delete infos[this.IDs.shift()];
  }

  next();
});

// Home page
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Search page
app.get("/s", async (req, res) => {
  this.query = req.query.q;
  this.page = parseInt(req.query.p || 1);
  if (!this.query) return res.redirect("/");
  try {
    res.render("search.ejs", {
      res: await ytsr(this.query, { limit, pages: this.page }),
      query: this.query,
      page: this.page,
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
  if (!ytdl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid video ID",
      content: "Your requested video is invalid. Check your URL and try again.",
    });
  try {
    this.info = await ytdl.getInfo(req.params.id);

    if (!this.info.formats.length) {
      return res.status(500).render("error.ejs", {
        title: "Region Lock",
        content: "Sorry. This video is not available for this server country.",
      });
    }

    await putInfoToCache(this.info);

    res.render("watch.ejs", {
      id: req.params.id,
      info: this.info,
      q: req.query,
      captions: getCaptions(req.params.id).map((i) => {
        return {
          name: i.name.simpleText,
          languangeCode: i.languangeCode,
          vssId: i.vssId,
        };
      }),

      comments: infos[req.params.id].comments,
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
// From now on, This endpoint will just redirect to stream page
app.get("/e/:id", async (req, res) => {
  if (!req.params.id) return res.redirect("/");
  res.redirect("/s/" + req.params.id);
});

// Playlist page
app.get("/p/:id", async (req, res) => {
  if (!ytpl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid playlist ID",
      content:
        "Your requested playlist is invalid. Check your URL and try again.",
    });
  this.page = parseInt(req.query.p || 1);
  try {
    res.render("playlist.ejs", {
      playlist: await ytpl(req.params.id, { limit, pages: this.page }),
      page: this.page,
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
  if (!ytpl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid channel ID",
      content:
        "Your requested channel is invalid. Check your URL and try again.",
    });
  this.page = parseInt(req.query.p || 1);
  try {
    res.render("channel.ejs", {
      channel: await ytpl(req.params.id, { limit, pages: this.page }),
      page: this.page,
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "ytpl Error",
      content: error,
    });
  }
});

app.get("/cm/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id))
    return res.status(400).render("error.ejs", {
      title: "Invalid video ID",
      content:
        "Your requested video comment is invalid. Check your URL and try again.",
    });

  try {
    this.opt = {
      videoId: req.params.id,
    };

    if (req.query.continuation) opt.continuation = req.query.continuation;

    this.comments = await getComments(opt);
    this.comments.comments = this.comments.comments.map((ch) => {
      ch.authorThumb.map((t) => {
        t.url = "/yt3" + new URL(t.url).pathname;
        return t;
      });

      return ch;
    });

    res.render("comments.ejs", {
      id: req.params.id,
      comments: this.comments,
      isContinuation: req.query.continuations ? true : false
    });
  } catch (error) {
    console.error(error);
    res.status(500).render("error.ejs", {
      title: "FreeTube YouTube comment scraper Error",
      content: error,
    });
  }
});

// API Endpoints
if (!process.env.NO_API_ENDPOINTS) {
  app.get("/api/", (req, res) => {
    res.json(["/api/search", "/api/getPlaylistInfo", "/api/getVideoInfo"]);
  });

  app.get("/api/search", async (req, res) => {
    try {
      this.result = await ytsr(req.query.q, {
        limit,
        pages: req.query.page || 1,
      });
      delete this.result.continuation;

      this.json = JSON.stringify(this.result).replace(
        RegExp("https://i.ytimg.com/", "g"),
        "/"
      );
      this.json = this.json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(this.json));
    } catch (e) {
      res.status(500).end(
        JSON.stringify({
          error: {
            description: e.toString(),
            code: 2,
          },
        })
      );
    }
  });

  app.get("/api/getPlaylistInfo/:id", async (req, res) => {
    if (!ytpl.validateID(req.params.id))
      return res
        .status(400)
        .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    try {
      this.result = await ytpl(req.params.id, {
        limit,
        pages: req.query.page || 1,
      });
      delete this.result.continuation;

      this.json = JSON.stringify(this.result).replace(
        RegExp("https://i.ytimg.com/", "g"),
        "/"
      );
      this.json = this.json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(this.json));
    } catch (e) {
      res.status(500).end(
        JSON.stringify({
          error: {
            description: e.toString(),
            code: 2,
          },
        })
      );
    }
  });

  app.get("/api/getVideoInfo/:id", async (req, res) => {
    if (!ytdl.validateID(req.params.id))
      return res
        .status(400)
        .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    try {
      this.info = await ytdl.getInfo(req.params.id);
      putInfoToCache(this.info);

      this.json = JSON.stringify({
        ...this.info.videoDetails,
        related_videos: this.info.related_videos,
        streams: this.info.formats.map((i) => {
          i.url = "/s/" + req.params.id + "?itag=" + i.itag;
          return i;
        }),
        captions: getCaptions(req.params.id).map((i) => {
          return {
            name: i.name.simpleText,
            languangeCode: i.languangeCode,
            vssId: i.vssId,
            url: "/cc/" + req.params.id + "?vssId=" + i.vssId,
          };
        }),
      });

      this.json = this.json.replace(RegExp("https://i.ytimg.com/", "g"), "/");
      this.json = this.json.replace(RegExp("https://yt3.ggpht.com", "g"), "/yt3");

      // Just make it simple. As long it works.
      res.json(JSON.parse(json));
    } catch (e) {
      return res.status(500).end(
        JSON.stringify({
          error: {
            description: e.toString(),
            code: 2,
          },
        })
      );
    }
  });

  app.get("/api/getComments/:id", async (req, res) => {
    if (!ytdl.validateID(req.params.id))
      return res
        .status(400)
        .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));
    this.comments = infos[req.params.id] && infos[req.params.id].comments;

    if (!this.comments || req.query.continuation) {
      try {
        this.opt = {
          videoId: req.params.id,
        };

        if (req.query.continuation) opt.continuation = req.query.continuation;

        this.comments = await getComments(this.opt);

        this.comments.comments = this.comments.comments.map((ch) => {
          ch.authorThumb.map((t) => {
            t.url = "/yt3" + new URL(t.url).pathname;
            return t;
          });

          return ch;
        });

        res.json(this.comments);
      } catch (err) {
        return res.status(500).end(
          JSON.stringify({
            error: {
              description: err.toString(),
              code: 2,
            },
          })
        );
      }
    }
  });
}

// Proxy Area
// This is where we make everything became anonymous

// Video Streaming
app.get("/s/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id)) return res.redirect("/");
  try {
    this.info = infos[req.params.id];
    if (!this.info) {
      this.info = await ytdl.getInfo(req.params.id);
      putInfoToCache(info);
    }

    this.formats = info.formats.filter((format) =>
      req.query.itag
        ? req.query.itag == format.itag
        : format.hasVideo && format.hasAudio
    );

    if (!this.formats.length) {
      return res.status(500).send("This stream is unavailable.");
    }

    this.headers = {
      "user-agent": user_agent,
    };

    // If user is seeking a video
    if (req.headers.range) {
      this.headers.range = req.headers.range;
    } else {
      this.headers.range = "bytes=0-";
    }

    if (this.formats[0].isHLS) {
      this.request = miniget(formats[0].url, {
        headers: {
          "user-agent": headers["user-agent"],
        },
      }).on("response", async (r) => {
        ["content-type", "cache-control"].forEach((hed) => {
          this.head = r.headers[hed];
          if (this.head) res.setHeader(hed, this.head);
        });

        this.body = await request.text();

        // Get the URLs
        this.urls = this.body.match(urlreg);
        if (!this.urls)
          return res.status(500).end(
            JSON.stringify({
              error: {
                description: "No URL for m3u8 chunks",
                code: 2,
              },
            })
          );

        this.infos.HLSOrigin[req.params.id] = [];

        this.urls.forEach((url) => {
          // We just need the initial host, But not the Segment path
          this.splitted = url.split("index.m3u8");

          if (!infos.HLSOrigin[req.params.id].includes(this.splitted[0]))
            infos.HLSOrigin[req.params.id].push(this.splitted[0]);

          this.body = this.body.replace(
            this.splitted[0],
            `/hs/${req.params.id}/${infos.HLSOrigin[req.params.id].length - 1}/`
          );
        });

        res.end(this.body);
      });

      return;
    }

    if (this.formats[0].isDashMPD) {
      return m3u8stream(this.formats[0].url, {
        chunkReadahead: +this.info.live_chunk_readahead,
        requestOptions: { headers: { "user-agent": this.headers["user-agent"] } },
        parser: this.formats[0].isDashMPD ? "dash-mpd" : "m3u8",
        id: this.formats[0].itag,
      })
        .on("error", (err) => {
          res.status(500).end(err.toString());
          console.error(err);
        })
        .pipe(res);
    }

    this.h = this.headers.range
      ? this.headers.range.split(",")[0].split("-")
      : ["bytes=0"];

    this.headersSetted = false;
    if (!this.info.streamSize) this.info.streamSize = {};
    if (!this.info.streamSize[this.formats[0].itag]) {
      this.info.streamSize[this.formats[0].itag] = await getSize(this.formats[0].url, {
        headers: { "user-agent": this.headers["user-agent"] },
      });
    }

    this.streamSize = this.info.streamSize[this.formats[0].itag] - this.h[0].slice(6);
    this.isSeeking = false;

    if (this.streamSize != this.info.streamSize[this.formats[0].itag]) this.isSeeking = true;
    if (parseInt(this.h[1])) this.isSeeking = true;
    this.sentSize = 0;
    this.lastConnErr = 0;

    if (this.info.streamSize[this.formats[0].itag]) {
      if (!this.streamSize || parseInt(this.h[1]) > this.info.streamSize[this.formats[0].itag])
        return res.status(416).end("416 Range Not Satisfiable");
      res
        .status(isSeeking ? 206 : 200)
        .setHeader("content-length", parseInt(this.h[1]) || this.streamSize);

      this.getChunk = function getChunk(beginRange) {
        beginRange = parseInt(beginRange);

        this.endRange =
          beginRange + parseInt(process.env.DLCHUNKSIZE || 1024 * 1024);
        if (
          this.endRange > this.streamSize ||
          this.endRange > this.info.streamSize[this.formats[0].itag]
        )
          this.endRange = this.info.streamSize[this.formats[0].itag];
        if (this.endRange > parseInt(this.h[1])) this.endRange = parseInt(this.h[1]);

        this.headers.range = `bytes=${beginRange}-${this.endRange}`;

        this.s = miniget(this.formats[0].url, { headers: this.headers })
          .on("response", (r) => {
            if (this.headersSetted) return;

            if (this.isSeeking && r.headers["content-range"])
              res.setHeader("content-range", r.headers["content-range"]);
            ["accept-ranges", "content-type", "cache-control"].forEach(
              (hed) => {
                this.head = r.headers[hed];
                if (this.head) res.setHeader(hed, this.head);
                this.headersSetted = true;
              }
            );

            this.lastConnErr = 0;
          })

          .on("error", (err) => {
            console.error(err);
            if (
              req.connection.destroyed ||
              req.connection.ended ||
              req.connection.closed
            )
              return;
            if (
              this.lastConnErr > 3 ||
              this.sentSize >= this.streamSize ||
              this.sentSize >= this.info.streamSize[this.formats[0].itag]
            )
              return res.end();
            this.getChunk(this.endRange + 1);
            this.lastConnErr++;
          })

          .on("data", (c) => {
            if (
              req.connection.destroyed ||
              req.connection.ended ||
              req.connection.closed
            )
              return this.s.destroy();
            res.write(c);
            sentSize += c.length;
          })

          .on("end", (_) => {
            if (
              req.connection.destroyed ||
              req.connection.ended ||
              req.connection.closed
            )
              return;
            if (this.sentSize >= this.streamSize) {
              return res.end();
            }

            this.getChunk(this.endRange + 1);
          });
      }

      this.getChunk(this.h[0].slice(6));
    } else {
      this.s = miniget(formats[0].url, { headers: this.headers })
        .on("error", (err) => {
          if (
            req.connection.destroyed ||
            req.connection.ended ||
            req.connection.closed
          )
            return;
          res.end();
        })
        .on("response", (r) => {
          res.status(r.statusCode);
          [
            "accept-ranges",
            "content-type",
            "content-range",
            "content-length",
            "cache-control",
          ].forEach((hed) => {
            this.head = r.headers[hed];
            if (this.head) res.setHeader(hed, this.head);
          });

          this.s.pipe(res);
        });
    }

    res.on("error", (err) => {
      console.error(err);
    });
  } catch (error) {
    res.status(500).end(error.toString());
  }
});

// Proxy to subtitles
app.get("/cc/:id", async (req, res) => {
  if (!ytdl.validateID(req.params.id))
    return res
      .status(400)
      .end(JSON.stringify({ error: { description: "Invalid ID", code: 1 } }));

  try {
    if (!infos[req.params.id]) {
      this.info = await ytdl.getInfo(req.params.id);
      putInfoToCache(this.info);
    }

    if (!req.query.vssId)
      return res.json(
        getCaptions(req.params.id).map((i) => {
          return {
            name: i.name.simpleText,
            languangeCode: i.languangeCode,
            vssId: i.vssId,
            url: "/cc/" + req.params.id + "?vssId=" + i.vssId,
          };
        })
      );

    this.caption = getCaptions(req.params.id, req.query.vssId)[0];
    if (!caption)
      return res.status(500).end(
        JSON.stringify({
          error: {
            description: "No subtitle found.",
            code: 3,
          },
        })
      );

    miniget(caption.baseUrl + (req.query.fmt ? "&fmt=" + req.query.fmt : ""), {
      headers: {
        "user-agent": user_agent,
      },
    })
      .on("error", (err) => {
        console.log(err);
        res.status(500).end(err.toString());
      })
      .pipe(res);
  } catch (err) {
    return res.status(500).end(
      JSON.stringify({
        error: {
          description: e.toString(),
          code: 2,
        },
      })
    );
  }
});

// Proxy for HLS chunks
app.get("/hs/:id/:on/*", (req, res) => {
  this.origin = infos.HLSOrigin[req.params.id];
  if (!origin || !origin[req.params.on])
    return res.status(400).end(
      JSON.stringify({
        error: {
          description: "No origin chunk url for " + req.params.id,
          code: 3,
        },
      })
    );

  if (!req.params[0])
    return res.status(400).end(
      JSON.stringify({
        error: {
          description: "No fullpath provided",
          code: 1,
        },
      })
    );

  this.stream = miniget(
    origin[req.params.on] + req.url.split("/").slice(4).join("/"),
    {
      headers: {
        "user-agent": user_agent,
        range: req.headers.range || "bytes=0-",
      },
    }
  );

  this.stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  this.stream.on("response", (origin) => {
    ["accept-ranges", "content-range", "content-type", "cache-control"].forEach(
      (hed) => {
        this.head = origin.headers[hed];
        if (this.head) res.setHeader(hed, this.head);
      }
    );
    this.stream.pipe(res);
  });
});

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get(["/vi*", "/sb/*"], (req, res) => {
  this.stream = miniget("https://i.ytimg.com" + req.url, {
    headers: {
      "user-agent": user_agent,
      range: req.headers.range || "bytes=0-",
    },
  });
  this.stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  this.stream.on("response", (origin) => {
    res.setHeader("content-type", origin.headers["content-type"]);
    res.setHeader("content-length", origin.headers["content-length"]);
    this.stream.pipe(res);
  });
});

// Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
app.get(["/yt3/*", "/ytc/*"], (req, res) => {
  if (req.url.startsWith("/yt3/")) req.url = req.url.slice(4);
  this.stream = miniget("https://yt3.ggpht.com" + req.url, {
    headers: {
      "user-agent": user_agent,
      range: req.headers.range || "bytes=0-",
    },
  });

  this.stream.on("error", (err) => {
    console.log(err);
    res.status(500).end(err.toString());
  });

  this.stream.on("response", (origin) => {
    res.setHeader("content-type", origin.headers["content-type"]);
    res.setHeader("content-length", origin.headers["content-length"]);
    this.stream.pipe(res);
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render("error.ejs", {
    title: "404 Not found",
    content: "A resource that you tried to get is not found or deleted.",
  });
});

app.on("error", console.error);

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is now listening on port", listener.address().port);
});

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);

let lastMemoryUsage = null;
setInterval(() => {
  const { rss, external } = process.memoryUsage();
  this.memoryUsage = (rss + external) / 1024 / 1024;

  if (Math.ceil(this.memoryUsage) == Math.ceil(lastMemoryUsage)) return;
  console.log(
    new Date().toLocaleTimeString(),
    "Memory Usage:",
    this.memoryUsage.toFixed(2) + "M"
  );

  lastMemoryUsage = this.memoryUsage;
}, 1000);
