const undici = require("undici");
const util = require("./util");

let user_agent = process.env.USER_AGENT || "googlebot";
let urlreg = /(https?:\/\/[^\s]+)/g;
let client = null;
let HLSOrigin = {};

module.exports = (app) => {
  // Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
  app.get(["/vi*", "/sb/*"], (req, res) =>
    util.proxy("https://i.ytimg.com" + req.url, req, res, user_agent)
  );

  // Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
  app.get(["/yt3/*", "/ytc/*"], (req, res) => {
    if (req.url.startsWith("/yt3/")) req.url = req.url.slice(4)
    util.proxy("https://yt3.ggpht.com" + req.url, req, res, user_agent);
  });

  app.get("/s/:id", async (req, res) => {
    if (!util.validateID(req.params.id)) return res.redirect("/");
    try {
      let info = await client.getInfo(req.params.id);

      let streamingData = util.filterFormat(info.streaming_data?.formats, req.query.itag);
      let isAdaptiveFormat = util.filterFormat(info.streaming_data?.adaptive_formats, req.query.itag);

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

      streamingData.url += "&cpr=" + info.cpr;

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
        let request = await undici.request(streamingData.url, {
          headers: {
            "User-Agent": headers["User-Agent"],
          },
        })

        for (hed of ["Content-Type", "Cache-Control"]) {
          const head = request.headers[hed.toLowerCase()];
          if (head) res.setHeader(hed, head);
        };

        let body = "";
        for await (const data of request.body) {
          body += data;
        }

        // Get the URLs
        let urls = body.match(urlreg);
        if (!urls) return util.sendError(res, "No URL for m3u8 chunks", "No chunk found", 500, true);

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

        return res.end(body);
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
        streamingData.content_length = await util.getSize(streamingData.url, user_agent);
      }

      let beginRange = h[0].startsWith("bytes=") ? h[0].slice(6) : h[0];
      let streamSize = h[1]
        ? parseInt(h[1]) + 1 - beginRange || 1
        : streamingData.content_length - beginRange;
      let isSeeking = req.headers.range ? true : false;

      if (streamSize != streamingData.content_length) isSeeking = true;
      if (parseInt(h[1])) isSeeking = true;

      if (streamingData.content_length && streamingData.isAdaptive) {
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

        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "private, max-age=21299");
        res.setHeader("Content-Type", streamingData.mime_type);

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
        util.proxy(streamingData.url, req, res, user_agent);
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

      util.proxy(caption.base_url + (req.query.fmt ? "&fmt=" + req.query.fmt : ""), req, res, user_agent);
    } catch (err) {
      util.sendError(res, err, "Failed to fetch video info.", 500, true);
    }
  });

  app.get("/hs/:id/:on/*", async (req, res) => {
    let origin = HLSOrigin[req.params.id];
    if (!origin || !origin[req.params.on])
      return util.sendError(res, "No origin chunk URL for " + req.params.id, "Failed to forward M3U8.", 400, true, 3);

    if (!req.params[0])
      return util.sendError(res, "No fullpath provided for " + req.params.id, "No full path.", 400, true, 3);

    try {
      const request = await undici.request(
        origin[req.params.on] + req.url.split("/").slice(4).join("/"),
        {
          headers: {
            "User-Agent": user_agent,
            Range: req.headers.range || "bytes=0-",
          },
        }
      );

      for (hed of ["Accept-Ranges", "Content-Range", "Content-Type", "Cache-Control"]) {
        const head = request.headers[hed.toLowerCase()];
        if (head) res.setHeader(hed, head);
      }

      if (request.headers["content-type"] === "application/vnd.apple.mpegurl") {
        let body = "";
        for await (const data of request.body) {
          body += data;
        }

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

      for await (const data of request.body) {
        res.write(data);
      }
      res.end();
    } catch (err) {
      console.error(err);
      util.sendError(res, err, "Failed to fetch M3U8.", 500, true);
    }
  });
};

module.exports.setClient = (newClient) => (client = newClient);
