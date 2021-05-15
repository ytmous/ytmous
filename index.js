const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const { get } = require("https");
const express = require("express");
const ejs = require("ejs");
const app = express();

app.use(express.static(__dirname + "/public"));

// Home page 
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

// Search page
app.get("/s", async (req, res) => {
	let query = req.query.q;
	if (!query) return res.redirect("/");
	try {
		res.render("search.ejs", {
			res: await ytsr(query),
			query: query
		});
	} catch (error) {
		console.error(error);
		try {
			res.send(error)
		} catch (error) {
			console.error(error);
		}
	}
});

// Watch Page
app.get("/w/:id", async (req, res) => {
	if (!req.params.id) return res.redirect("/");
	try {
		res.render("watch.ejs", {
			id: req.params.id,
			info: await ytdl.getInfo("https://www.youtube.com/watch?v=" + req.params.id)
		});
	} catch (error) {
		console.error(error);
		res.send(error.toString());
	}
});

// Playlist page
app.get("/p/:id", async (req, res) => {
	if (!req.params.id) return res.redirect("/");
	try {
		res.render("playlist.ejs", {
			playlist: await ytpl(req.params.id)
		});
	} catch (error) {
		console.error(error);
		res.send(error.toString());
	}
});

// Channel page
app.get("/c/:id", async (req, res) => {
	if (!req.params.id) return res.redirect("/");
	try {
		res.render("channel.ejs", {
			channel: await ytpl(req.params.id)
		});
	} catch (error) {
		console.error(error);
		res.send(error.toString());
	}
});

// CDN
app.get("/s/:id", (req, res) => {
	let stream = ytdl("https://www.youtube.com/watch?v=" + req.params.id, { filter: "videoandaudio", quality: "highest" });
	stream.on('info', info => {
		if (info.videoFormat.contentLength) res.setHeader("content-length", info.formats[0].contentLength);
		res.setHeader("content-type", info.videoFormat.mimeType);
		stream.pipe(res);
	});

	stream.on('error', (err) => {
		console.error(err);
		res.status = 500;
		res.send(err.toString());
	});
});

// Proxy to i.ytimg.com
app.get("/vi*", (req, res) => {
	get({
		hostname: "i.ytimg.com",
		path: req.url.split("?")[0],
		headers: {
			"user-agent": req.headers["user-agent"] || "ytmous - ytimg"
		}
	}, stream => {
		stream.pipe(res);
		stream.on("error", (err) => {
			console.error(err);
			try {
				res.send(err.toString());
			} catch (error) {
				console.error(error);
			}
		});
	}).on('error', (err) => {
		console.error(err);
		try {
			res.send(err.toString());
		} catch (error) {
			console.error(error);
		}
	});
});

// Proxy to yt3.ggpht.com
app.get("/ytc/*", (req, res) => {
	get({
		hostname: "yt3.ggpht.com",
		path: req.url,
		headers: {
			"user-agent": req.headers["user-agent"] || "ytmous - ytimg"
		}
	}, stream => {
		stream.pipe(res);
		stream.on('error', (err) => {
			console.error(err);
			try {
				res.send(err.toString());
			} catch (error) {
				console.error(error);
			}
		});
	}).on('error', (err) => {
		console.error(err);
		try {
			res.send(err.toString());
		} catch (error) {
			console.error(error);
		}
	});
});

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is now listening on port", listener.address().port);
});

process.on("unhandledRejection", console.error);
