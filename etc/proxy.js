const miniget = require("miniget");
const util = require("./util");

let user_agent = process.env.USER_AGENT || "googlebot";
let urlreg = /(https?:\/\/[^\s]+)/g;
let client = null;
let HLSOrigin = {};

module.exports = (app) => {
  // Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
  app.get(["/vi*", "/sb/*"], (req, res) => {
    const stream = miniget("https://i.ytimg.com" + req.url, {
      headers: {
        "User-Agent": user_agent,
        Range: req.headers.range || "bytes=0-",
      },
    });
    stream.on("error", (err) => {
      console.log(err);
      res.status(500).end(err.toString());
    });

    stream.on("response", (origin) => {
      res.setHeader("Content-Type", origin.headers["content-type"]);
      res.setHeader("Content-Length", origin.headers["content-length"]);
      stream.pipe(res);
    });
  });

  // Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
  app.get(["/yt3/*", "/ytc/*"], (req, res) => {
    if (req.url.startsWith("/yt3/")) req.url = req.url.slice(4);
    const stream = miniget("https://yt3.ggpht.com" + req.url, {
      headers: {
        "User-Agent": user_agent,
        Range: req.headers.range || "bytes=0-",
      },
    });

    stream.on("error", (err) => {
      console.log(err);
      res.status(500).end(err.toString());
    });

    stream.on("response", (origin) => {
      res.setHeader("Content-Type", origin.headers["content-type"]);
      res.setHeader("Content-Length", origin.headers["content-length"]);
      stream.pipe(res);
    });
  });

  app.get("/s/:id", async (req, res) => {
    if (!util.validateID(req.params.id)) return res.redirect("/");
    try {
      let info = await client.getInfo(req.params.id);

      let streamingData = util.filterFormat(info.streaming_data.formats, req.query.itag);
      let isAdaptiveFormat = util.filterFormat(info.streaming_data.adaptive_formats, req.query.itag);

      if (!streamingData && isAdaptiveFormat) {
        streamingData = isAdaptiveFormat;
        streamingData.isAdaptive = true;
      };

      if (info.basic_info.is_live && info.streaming_data.hls_manifest_url) {
        streamingData = {};
        streamingData.isHLS = true;
        streamingData.url = info.streaming_data.hls_manifest_url;
      }

      if (!streamingData) {
        return util.sendError(res, "This stream is unavailable", "Unavailable stream", 500, true);
      }

      if (!streamingData.url)
        streamingData.url = await streamingData.decipher(client.session.player);

      let headers = {
        "User-Agent": user_agent,
      };

      // If user is seeking a video
      if (req.headers.range) {
        headers.Range = req.headers.range;
      } else {
        headers.Range = "bytes=0-";
      }

      if (streamingData.isHLS) {
        let request = miniget(streamingData.url, {
          headers: {
            "User-Agent": headers["User-Agent"],
          },
        }).on("response", async (r) => {
          ["Content-Type", "Cache-Control"].forEach((hed) => {
            let head = r.headers[hed.toLowerCase()];
            if (head) res.setHeader(hed, head);
          });

          let body = await request.text();

          // Get the URLs
          let urls = body.match(urlreg);
          if (!urls)
            return util.sendError(res, "No URL for m3u8 chunks", "No chunk found", 500, true);

          HLSOrigin[req.params.id] = [];

          urls.forEach((url) => {
            // We just need the initial host, But not the Segment path
            let splitted = url.split("index.m3u8");

            if (!HLSOrigin[req.params.id].includes(splitted[0]))
              HLSOrigin[req.params.id].push(splitted[0]);

            body = body.replace(
              splitted[0],
              `${req.headers["x-forwarded-proto"] || "http"}://${req.headers["host"]}/hs/${req.params.id}/${
                HLSOrigin[req.params.id].length - 1
              }/`
            );
          });

          res.end(body);
        }).on('error', err => {
          res.status(500).end(err.toString());
          console.error(err);
        });

        return;
      }

      if (streamingData.isDashMPD) {
        return m3u8stream(streamingData.url, {
          chunkReadahead: +streamingData.live_chunk_readahead,
          requestOptions: { headers: { "User-Agent": headers["User-Agent"] } },
          parser: streamingData.isDashMPD ? "dash-mpd" : "m3u8",
          id: streamingData.itag,
        })
          .on("error", (err) => {
            res.status(500).end(err.toString());
            console.error(err);
          })
          .pipe(res);
      }

      let h = headers.Range
        ? headers.Range.split(",")[0].split("-")
        : ["bytes=0"];

      if (!streamingData.content_length) {
        streamingData.content_length = await util.getSize(streamingData.url, {
          headers: { "User-Agent": headers["User-Agent"] },
        });
      }

      let beginRange = h[0].startsWith("bytes=") ? h[0].slice(6) : h[0];
      let streamSize = h[1]
        ? parseInt(h[1]) + 1 - beginRange || 1
        : streamingData.content_length - beginRange;
      let isSeeking = req.headers.range ? true : false;

      if (streamSize != streamingData.content_length) isSeeking = true;
      if (parseInt(h[1])) isSeeking = true;

      if (streamingData.content_length) {
        if (!streamSize || parseInt(h[1]) >= streamingData.content_length)
          return res.status(416).end("416 Range Not Satisfiable");
        res
          .status(isSeeking ? 206 : 200)
          .setHeader("Content-Length", streamSize);

        if (isSeeking)
          res.setHeader(
            "Content-Range",
            `bytes ${beginRange}-${h[1] || streamingData.content_length - 1}/${
              streamingData.content_length
            }`
          );

        util.getChunk(
          beginRange,
          req,
          res,
          headers,
          streamingData,
          streamSize,
          isSeeking,
          h
        );
      } else {
        let s = miniget(streamingData.url, { headers })
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
              "Accept-Ranges",
              "Content-Type",
              "Content-Range",
              "Content-Length",
              "Cache-Control",
            ].forEach((hed) => {
              let head = r.headers[hed.toLowerCase()];
              if (head) res.setHeader(hed, head);
            });

            s.pipe(res);
          });
      }

      res.on("error", (err) => {
        console.error(err);
      });
    } catch (error) {
      console.error(error);
      res.status(500).end(error.toString());
    }
  });

  // Proxy to subtitles
  app.get("/cc/:id", async (req, res) => {
    if (!util.validateID(req.params.id))
      return util.sendInvalidID(res, true);

    try {
      let info = await client.getInfo(req.params.id);

      if (!req.query.vss_id)
        return res.json(
          util.getCaptions(req.params.id).map((i) => {
            return {
              name: i.name.text,
              languange_code: i.languange_code,
              vss_id: i.vss_id,
              url: "/cc/" + req.params.id + "?vss_id=" + i.vss_id,
            };
          })
        );

      let caption = util.getCaptions(info, req.query.vss_id)[0];
      if (!caption)
        return util.sendError(res, `No subtitle found for ${req.query.vss_id}`, "No subtitle found", 500, true);

      miniget(
        caption.base_url + (req.query.fmt ? "&fmt=" + req.query.fmt : ""),
        {
          headers: {
            "User-Agent": user_agent,
          },
        }
      )
        .on("error", (err) => {
          console.log(err);
          return util.sendError(res, err, "Failed to fetch Subtitle.", 500, true);
        })
        .pipe(res);
    } catch (err) {
      return util.sendError(res, err, "Failed to fetch video info.", 500, true);
    }
  });

  app.get("/hs/:id/:on/*", (req, res) => {
    let origin = HLSOrigin[req.params.id];
    if (!origin || !origin[req.params.on])
      return util.sendError(res, "No origin chunk URL for " + req.params.id, "Failed to forward M3U8.", 400, true, 3);

    if (!req.params[0])
      return util.sendError(res, "No fullpath provided for " + req.params.id, "No full path.", 400, true, 3);

    const stream = miniget(
      origin[req.params.on] + req.url.split("/").slice(4).join("/"),
      {
        headers: {
          "User-Agent": user_agent,
          Range: req.headers.range || "bytes=0-",
        },
      }
    );

    stream.on("error", (err) => {
      console.log(err);
      return util.sendError(res, err, "Failed to fetch M3U8.", 500, true);
    });

    stream.on("response", async (origin) => {
      ["Accept-Ranges", "Content-Range", "Content-Type", "Cache-Control"].forEach(
        (hed) => {
          let head = origin.headers[hed.toLowerCase()];
          if (head) res.setHeader(hed, head);
        }
      );

      if (origin.headers["content-type"] === "application/vnd.apple.mpegurl") {
        let body = await stream.text();
        let urls = body.match(urlreg);
        if (!urls)
          return util.sendError(res, "No URL for m3u8 chunks", "No chunk found", 500, true);

        urls.forEach((url) => {
          // We just need the initial host, But not the Segment path
          let splitted = url.split("index.m3u8");

          if (!HLSOrigin[req.params.id].includes(splitted[0]))
            HLSOrigin[req.params.id].push(splitted[0]);

          body = body.replace(                                                                                                    splitted[0],
            `${req.headers["x-forwarded-proto"] || "http"}://${req.headers["host"]}/hs/${req.params.id}/${
              HLSOrigin[req.params.id].length - 1
            }/`
          );
        });

        return res.end(body);
      }

      stream.pipe(res);
    });
  });
};

module.exports.setClient = (newClient) => (client = newClient);
