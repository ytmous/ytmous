const ytdl = require("ytdl-core");
const { get } = require("https");
const express = require("express");
const ejs = require("ejs");
const app = express();
const { search } = require("./core.js");

app.use(express.static(__dirname + "/public"));
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

app.get("/search", async (req, res) => {
	let query = req.query.q;
	if (!query) return res.redirect("/");

	res.render("search.ejs", {
		res: await search(query),
		query
	});
});

app.get("/watch/:id", async (req, res) => {
	try {
		res.render("watch.ejs", {
			id: req.params.id,
			info: await ytdl.getInfo("https://www.youtube.com/watch?v=" + req.params.id)
		});
	} catch (error) {
		console.error(error);
		res.redirect('/');
	}
});

app.get("/stream/:id", (req, res) => {
	let stream = ytdl("https://www.youtube.com/watch?v=" + req.params.id, { filter: "videoandaudio", quality: "highest" });
	stream.on('info', () => {
		stream.pipe(res);
	});

	stream.on('error', (err) => {
		console.error(err);
		response.send(err.toString());
	});
});

app.get("/vi/*", (req, res) => {
	get({
		hostname: "i.ytimg.com",
		path: req.url,
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

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is now listening on port", listener.address().port);
});

process.on("unhandledRejection", console.error);
