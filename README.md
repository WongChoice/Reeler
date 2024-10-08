# 🎬 Chrome Extension for Fetching Video Links and Timestamps 🎥

This project features a **Chrome Extension** that directly fetches the video link and timestamps from videos and sends them to a server running locally on the same machine. The server processes the timestamps, clips the video, and makes it reel-ready for sharing on social media platforms.

## Features 🚀

### ✨ Chrome Extension
- **Fetches video links and timestamps** directly from the video being played.
- A simple interface to **mark the start and end times** for clipping the desired portion of the video.
- Automatically sends the video link and timestamps to the server for processing.
- Compatible with popular video platforms such as YouTube.

### ✨ Server Reel Tool
- **Local server** running on the same machine receives video link and timestamps from the extension.
- Uses **FFmpeg** to precisely clip the video based on the timestamps and optimize it for social media reels.
- **Subtitles** can be added, styled, and positioned on the video for enhanced clarity.
- Outputs high-quality, social media-ready video clips.

## How it Works 💡

1. **Fetch Video Link**: The extension automatically captures the link of the currently playing video.
2. **Mark Timestamps**: Use the extension to select the start and end timestamps of the video segment you want to clip.
3. **Send to Server**: The extension sends the video link and timestamps to the server running on the same machine.
4. **Clip & Export**: The server processes the request and generates a reel-ready video clip.

## Installation 🛠️

### Chrome Extension
1. Clone this repository.
2. Navigate to `chrome://extensions/` in your browser.
3. Enable **Developer Mode**.
4. Click on **Load unpacked** and select the `extension` folder from this repo.

### Server Setup
1. Clone this repository to your local machine.
2. Run `npm install` to install dependencies.
3. Set up FFmpeg on your system (if not already installed).
4. Start the server using:
   ```bash
   node server.js
   ```

## Usage 💻

1. **Play a video** on a supported platform (e.g., YouTube).
2. **Use the Chrome Extension** to fetch the video link and mark the timestamps for the segment you want to clip.
3. **Send the video link and timestamps** to the local server by submitting them through the extension.
4. **Download the clipped video**, processed by the server, and share it as a reel.

## Demo Video 📹

Check out the YouTube video explaining how this extension works:



<a href="https://www.youtube.com/watch?v=E01K0_HJFtM">
    <img src="https://img.youtube.com/vi/E01K0_HJFtM/maxresdefault.jpg" alt="Watch the video" style="width: 200px; height: auto;">
</a>


## Technologies Used 🛠️
- **Chrome Extension**: HTML, CSS, JavaScript
- **Backend Server**: Express.js, FFmpeg
- **Video Processing**: FFmpeg for clipping and subtitle embedding
