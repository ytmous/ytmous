<div align="center">
	<img src="https://github.com/Yonle/ytmous/blob/master/public/banner.png?raw=true">
	<p>A anonymous Youtube that does not spy on you.</p>
</div>

## ❄Feature
- 0% 📰Ads
- 0% 💸Tracker
- 0% 📃Logging
- 📩Download Youtube Videos while you watch them
- 🔮Using Bootstrap 5 with [plyr.js](https://plyr.io) as video player

## Requirements
- Node v10+ (Node v14 Recommended)
- Git installed
- 500MB RAM (1 GB Recommended);

## 🎁Installation
```bash
git clone https://github.com/Yonle/ytmous
cd ytmous
npm install
```

## 🖊Configuration
This code is reading a config from Environment Variable that comes from your system.
- `LIMIT`: Search / Video result from playlist, channel, or search result limit. The smaller, The faster.
- `PROTOCOL`: This variable is used for m3u8 stream. Default: `https` for deploying

## 📡Starting Server
```bash
npm start
```
Or
```bash
PORT=3000 npm start
```

## 💻Screenshots
![homepage](https://github.com/Yonle/ytmous/blob/master/Screenshots/homepage.png?raw=true)
![search](https://github.com/Yonle/ytmous/blob/master/Screenshots/search.png?raw=true)
![watch](https://github.com/Yonle/ytmous/blob/master/Screenshots/watch.png?raw=true)

## ❗NOTE
In Browser based **Chromium**, Seeking Video may not work properly. It's recommended to use **Firefox** for Streaming Video.

## 📠Community
- [Discord](https://discord.gg/9S3ZCDR)
- [Telegram](https://t.me/yonlecoder)
