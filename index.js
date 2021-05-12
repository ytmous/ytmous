const ytdl = require("ytdl-core");
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

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is now listening on port", listener.address().port);
});

process.on("unhandledRejection", console.error);
