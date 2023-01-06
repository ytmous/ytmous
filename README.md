<div align="center">
  <h1>ytmous</h1>
  <p>Anonymous youtube proxy</p>
</div>

### Search, Click, and watch
ytmous is a lightweight, and Anonymous Youtube Proxy. Designed for device with limited resource.

### There's no tracker and ads
Only a simple webpage, ready for you to watch some videos in a second

### No JavaScript in frontend
There's no JavaScript in frontend, ever. Most pages were rendered in server (backend).

### Completely open source
ytmous is licensed under BSD 3 Clause and it's code is free. You can also host your own ytmous.

**DISCLAIMER:** ytmous could fetch, stream or download videos from YouTube, even copyrighted ones. Please respect all copyright laws.

## Screenshots
![ytmous_homepage.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_homepage.png)
![ytmous_mobile_search.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_search.png)
![ytmous_mobile_channel.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_channel.png)
![ytmous_mobile_playlists.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_playlists.png)
![ytmous_mobile_watch.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_mobile_watch.png)
![ytmous_desktop_watch.png](https://raw.githubusercontent.com/Yonle/ytmous/nightly/screenshots/ytmous_desktop_watch.png)

## Server Requirement
- Node v10+ (Node v14 Recommended)
- Git installed
- Fast server network connection

## Configuration
The code is reading the provided configuration from Environment Variable that comes from your system. These variable is **optional**.

- `LIMIT`: Search / Video result from playlist, channel, or search result limit. The smaller, The faster.
- `USER_AGENT`: This variable is where we fake our user agent to request youtube.
- `DLCHUNKSIZE`: Download Chunk Size. Default is 1 MB (1024 * 1024)
- `PORT`: Server port to listen to.

## Starting the server
If this is your first time running this server, You may need to install it's dependencies first by executing `npm install`. 

Therefore, you can start the server by executing:
```sh
npm start
```
or
```
PORT=3000 npm start
```

