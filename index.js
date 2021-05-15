const ytdl = require("ytdl-core");
const ytsr = require("ytsr");
const ytpl = require("ytpl");
const get = require("miniget");
const express = require("express");
const ejs = require("ejs");
const app = express();
const live = new Map();

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
	let stream = ytdl(req.params.id, { filter: "videoandaudio", quality: "highest", dlChunkSize: 1024 * 64 });
	stream.on('info', info => {
		if (info.videoDetails.isLiveContent) {
			stream.end();
			return res.redirect(`/live/${req.params.id}/index.m3u8`);
		}
		if (info.formats[0].contentLength) res.setHeader("content-length", info.formats[0].contentLength);
		res.setHeader("content-type", info.formats[0].mimeType);
		stream.pipe(res);
	});

	stream.on('error', (err) => {
		console.error(err);
		res.status = 500;
		res.send(err.toString());
	});
});

// Live Video Handler
// In this endpoint, We're gonna handle all hls required request. Ya you know why.
app.get("/live/:id/:path", async (req, res) => {
	let info = await ytdl.getInfo(req.params.id, { filter: "videoandaudio", quality: "highest" });
	if (!info.videoDetails.isLiveContent) {
		return res.redirect(`/s/${req.params.id}`);
	} else {
		if (!live.has(req.params.id)) generateLiveURL(info);
		let stream = get(`${live.get(req.params.id)}/${req.params.path}`, {
			headers: {
				"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36"
			}
		});
		
		stream.on('error', err => {
			// Regenerate new URL Endpoint once it's known as expired Endpoint
			if (err.statusCode && err.statusCode == 403) {
				generateLiveURL(info);
				return res.redirect(req.url);
			}
			console.log(err);
			res.send(err.toString());
		});
		stream.on('response', response => {
			res.setHeader("content-type", response.headers["content-type"]);
			stream.pipe(res);
		});
	}
});

// Proxy to i.ytimg.com, Where Video Thumbnail is stored here.
app.get("/vi*", (req, res) => {
	let stream = get(`https://i.ytimg.com/${req.url.split("?")[0]}`, {
		headers: {
			"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36"
		}
	})
	stream.on('error', err => {
		console.log(err);
		res.send(err.toString());
	});
	stream.pipe(res);
});

// Proxy to yt3.ggpht.com, Where User avatar is being stored on that host.
app.get("/ytc/*", (req, res) => {
	let stream = get(`https://yt3.ggpht.com/${req.url}`, {
		headers: {
			"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36"
		}
	})
	stream.on('error', err => {
		console.log(err);
		res.send(err.toString());
	});
	stream.pipe(res);
});

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is now listening on port", listener.address().port);
});

// Automatic delete the raw endpoint if it expires
function timeoutLive(mirrorID, timeout) {
	return setTimeout(() => {
		live.delete(mirrorID);
	}, Number(timeout));
}

function generateLiveURL (info) {
	// Because the array will shorted by itself, it can caused invalid url. So we made this.
	let url = info.formats[0].url;
	let endpoint = url.split("/").filter(path => path != url.split("/").pop()).join("/");
	live.set(info.videoDetails.videoId, endpoint);
	timeoutLive(info.videoDetails.videoId, info.player_response.streamingData.expiresInSeconds);
	return Promise.resolve();
}

// Handle any unhandled promise rejection.
process.on("unhandledRejection", console.error);
