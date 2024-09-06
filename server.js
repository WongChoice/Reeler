const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process'); // Ensure this is required at the top of your file

const ffmpeg = require('fluent-ffmpeg');
const { google } = require('googleapis');
const { oAuth2Client, saveTokens } = require('./googleAuth');
// Set path to FFmpeg binary
const ffmpegPath = 'F:\\Github\\serverforclipper\\node_modules\\ffmpeg-static\\ffmpeg.exe';

const app = express();
const port = 8080;
app.use(express.json());

// Use cors middleware
app.use(cors());

// Serve static files (e.g., HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON request bodies
app.use(bodyParser.json());

// Initialize FFmpeg with the static path
ffmpeg.setFfmpegPath(ffmpegPath);

const clipRequestsFile = path.join(__dirname, 'clipRequests.json');
const subtitlesDir = path.join(__dirname, 'subtitles');
const outputsDir = path.join(__dirname, 'outputs');

// Ensure the directories exist
if (!fs.existsSync(subtitlesDir)) {
  fs.mkdirSync(subtitlesDir);
}

if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir);
}

// Load existing clip requests from file
let clipRequests = [];
if (fs.existsSync(clipRequestsFile)) {
  try {
    const fileData = fs.readFileSync(clipRequestsFile, 'utf8');
    clipRequests = JSON.parse(fileData);
  } catch (err) {
    console.error('Error reading clip requests file:', err);
  }
}

// Endpoint to receive clip requests with cropping parameters
app.post('/clip', (req, res) => {
  const { url, start, end, transcript, cropWidth, cropHeight, aspectRatio } = req.body;

  if (!url || !start || !end) {
    return res.status(400).send('Missing required fields: url, start, or end');
  }

  const id = Date.now();
  const newRequest = { id, url, start, end, transcript, cropWidth, cropHeight, aspectRatio, outputFileName: null };

  clipRequests.push(newRequest);

  fs.writeFile(clipRequestsFile, JSON.stringify(clipRequests, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Error writing clip requests file:', err);
      return res.status(500).send('Error saving clip request');
    }
    res.send('Clip request received');
  });
});

// Endpoint to get all clip requests
app.get('/requests', (req, res) => {
  res.json(clipRequests);
});

// Endpoint to delete a specific clip request
app.delete('/requests/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = clipRequests.findIndex(req => req.id === id);

  if (index > -1) {
    clipRequests.splice(index, 1);

    fs.writeFile(clipRequestsFile, JSON.stringify(clipRequests, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Error writing clip requests file:', err);
        return res.status(500).send('Error deleting request');
      }
      res.json({ message: 'Request deleted successfully' });
    });
  } else {
    res.status(404).json({ message: 'Request not found' });
  }
});


app.post('/export', async (req, res) => {
  const { id } = req.body;
  const clipRequest = clipRequests.find(req => req.id === id);

  if (!clipRequest) {
    return res.status(404).json({ message: 'Clip request not found' });
  }

  const { url, start, end } = clipRequest;
  const videoFilePath = path.join(__dirname, 'public', `video-${id}.mp4`).replace(/\\/g, '/');
  const audioFilePath = path.join(__dirname, 'public', `audio-${id}.aac`).replace(/\\/g, '/');
  const trimmedVideoFilePath = path.join(__dirname, 'public', `trimmed-video-${id}.mp4`).replace(/\\/g, '/');
  const trimmedAudioFilePath = path.join(__dirname, 'public', `trimmed-audio-${id}.aac`).replace(/\\/g, '/');
  const outputFileName = `clip-${id}.mp4`;
  const outputFilePath = path.join(__dirname, 'public', outputFileName).replace(/\\/g, '/');

  console.log(`Exporting clip: URL=${url}, Start=${start}, End=${end}`);

  try {
    // Function to get stream URLs
    function getStreamUrls(url) {
      try {
        const output = execSync(`yt-dlp -f bestvideo+bestaudio -g ${url}`).toString();
        const [videoUrl, audioUrl] = output.trim().split('\n');
        console.log(videoUrl);
        return { videoUrl, audioUrl };
      } catch (err) {
        throw new Error(`Failed to get stream URLs: ${err.message}`);
      }
    }

    // Function to stream and trim video
    function streamAndTrimVideo(videoUrl, start, end, outputFilePath) {
      return new Promise((resolve, reject) => {
        const duration = end - start;

        ffmpeg()
          .input(videoUrl)
          .inputOptions([
            `-ss ${start}`, // Seek to start time
            `-t ${duration}` // Duration
          ])
          .outputOptions([
            '-c:v libx264', // High-quality video codec
            '-crf 18', // High-quality setting
            '-preset slow', // Better quality
            '-vf scale=1920:1080' // Ensure video is at least 1080p
          ])
          .output(outputFilePath)
          .on('end', () => resolve())
          .on('error', (err) => {
            console.error(`FFmpeg error during video streaming and trimming: ${err}`);
            reject(err);
          })
          .run();
      });
    }

    // Function to stream and trim audio
    function streamAndTrimAudio(audioUrl, start, end, outputFilePath) {
      return new Promise((resolve, reject) => {
        const duration = end - start;

        ffmpeg()
          .input(audioUrl)
          .inputOptions([
            `-ss ${start}`, // Seek to start time
            `-t ${duration}` // Duration
          ])
          .outputOptions([
            '-c:a aac', // Audio codec
            '-b:a 192k' // Audio bitrate
          ])
          .output(outputFilePath)
          .on('end', () => resolve())
          .on('error', (err) => {
            console.error(`FFmpeg error during audio streaming and trimming: ${err}`);
            reject(err);
          })
          .run();
      });
    }

    // Function to merge video and audio
    function mergeVideoAndAudio(videoFilePath, audioFilePath, outputFilePath) {
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(videoFilePath)
          .input(audioFilePath)
          .outputOptions([
            '-c:v copy', // Copy video codec to avoid re-encoding
            '-c:a aac', // Audio codec
            '-b:a 192k', // Audio bitrate
            '-shortest' // Use the shortest input duration
          ])
          .output(outputFilePath)
          .on('end', () => resolve())
          .on('error', (err) => {
            console.error(`FFmpeg error during merge: ${err}`);
            reject(err);
          })
          .run();
      });
    }

    // Step 1: Get direct stream URLs
    console.log('Getting stream URLs...');
    const { videoUrl, audioUrl } = getStreamUrls(url);

    // Step 2: Stream and trim video
    console.log('Starting video streaming and trimming...');
    await streamAndTrimVideo(videoUrl, start, end, trimmedVideoFilePath);
    console.log('Video streaming and trimming completed.');

    // Verify the trimmed video file exists
    if (!fs.existsSync(trimmedVideoFilePath)) {
      throw new Error(`Trimmed video file does not exist: ${trimmedVideoFilePath}`);
    }

    // Step 3: Stream and trim audio
    console.log('Starting audio streaming and trimming...');
    await streamAndTrimAudio(audioUrl, start, end, trimmedAudioFilePath);
    console.log('Audio streaming and trimming completed.');

    // Verify the trimmed audio file exists
    if (!fs.existsSync(trimmedAudioFilePath)) {
      throw new Error(`Trimmed audio file does not exist: ${trimmedAudioFilePath}`);
    }

    // Step 4: Merge video and audio
    console.log('Starting video and audio merge...');
    await mergeVideoAndAudio(trimmedVideoFilePath, trimmedAudioFilePath, outputFilePath);
    console.log('Video and audio merge completed.');

    // Verify the output file exists
    if (!fs.existsSync(outputFilePath)) {
      throw new Error(`Output file does not exist: ${outputFilePath}`);
    }

    console.log(`Clip exported successfully: ${outputFileName}`);

    // Step 5: Update the clip request with the output file name
    clipRequest.outputFileName = outputFileName;
    fs.writeFile(clipRequestsFile, JSON.stringify(clipRequests, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Error updating clip request file:', err);
        return res.status(500).send('Error updating clip request');
      }
      res.json({ message: 'Clip exported successfully', outputFileName });
    });
  } catch (err) {
    console.error('Error during process:', err);
    res.status(500).send(`Error during process: ${err.message}`);
  }
});



// Convert time in MM:SS to seconds
function timeToSeconds(time) {
  const parts = time.split(':').map(Number);
  let seconds = 0;

  if (parts.length === 3) {
    // Format: "hours:minutes:seconds"
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    // Format: "minutes:seconds"
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    // Format: "seconds"
    seconds = parts[0];
  }

  return seconds;
}


function secondsToSRTTime(seconds) {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toFixed(3).replace('.', ',').padStart(6, '0');
  return `${hours}:${minutes}:${secs}`;
}

function convertToSRT(subtitles, srtFilePath, starttime) {
  if (!Array.isArray(subtitles)) {
    throw new TypeError('Expected an array of subtitles');
  }

  let baseStartTime = starttime;

  const srtContent = subtitles.map((subtitle, index) => {
    const startTimeInSeconds = timeToSeconds(subtitle.time) - baseStartTime;

    let endTimeInSeconds;
    if (index < subtitles.length - 1) {
      endTimeInSeconds = timeToSeconds(subtitles[index + 1].time) - baseStartTime;
    } else {
      endTimeInSeconds = startTimeInSeconds + 5; // Default to 5 seconds duration for the last subtitle
    }

    const formattedStartTime = secondsToSRTTime(startTimeInSeconds);
    const formattedEndTime = secondsToSRTTime(endTimeInSeconds);

    return `${index + 1}\n${formattedStartTime} --> ${formattedEndTime}\n${subtitle.text}`;
  }).join('\n\n');

  fs.writeFileSync(srtFilePath, srtContent, 'utf-8');
}


// Handle POST request to add subtitles
app.post('/add-subtitle', (req, res) => {
  const { id, subtitleText, bgColor, textColor, fontsize } = req.body;

  const clipRequest = clipRequests.find(req => req.id === id);
  if (!clipRequest || !clipRequest.outputFileName) {
    return res.status(404).json({ message: 'Clip request not found or clip not yet exported' });
  }

  const textColorFFmpeg = `&H${textColor.slice(1).match(/.{2}/g).reverse().join('')}&`;
  const bgColorFFmpeg = bgColor ? `&H${bgColor.slice(1).match(/.{2}/g).reverse().join('')}&` : '&H000000&';

  // Path for output SRT file
  const srtFilePath = path.join('public', 'subtitles', `${id}.srt`).replace(/\\/g, '/');
console.log(srtFilePath);
console.log(subtitleText);
console.log(clipRequest.start);

const srtDirPath = path.join('public', 'subtitles');
if (!fs.existsSync(srtDirPath)) {
  fs.mkdirSync(srtDirPath, { recursive: true });
}


  // Convert JSON transcript to SRT format
  try {
    convertToSRT(subtitleText, srtFilePath, clipRequest.start );
  } catch (err) {
    console.error('Error converting subtitles to SRT:', err);
    return res.status(500).json({ message: 'Error converting subtitles to SRT' });
  }

  // Path for video file
  const videoFilePath = path.join(__dirname, 'public', clipRequest.outputFileName).replace(/\\/g, '/');

  // Generate a temporary output file name
  const tempOutputFileName = `temp-output-clip-${id}.mp4`;
  const tempOutputFilePath = path.join(__dirname, 'public', tempOutputFileName).replace(/\\/g, '/');

  console.log(`Processing video with FFmpeg`);
  console.log(`Video File Path: ${videoFilePath}`);
  console.log(`SRT File Path: ${srtFilePath}`);
  console.log(`Temporary Output File Path: ${tempOutputFilePath}`);

  // Use FFmpeg to process the video
  ffmpeg(videoFilePath)
    .input(srtFilePath)
    .outputOptions([
     // `-vf subtitles=${srtFilePath}:force_style='FontSize=${fontsize},PrimaryColour=${textColorFFmpeg},BackColour=${bgColorFFmpeg},Alignment=2,OutlineColour=${bgColorFFmpeg},MarginV=50,BorderStyle=3,Outline=2,Shadow=0'`
     `-vf subtitles=${srtFilePath}:force_style='FontSize=${fontsize},PrimaryColour=${textColorFFmpeg},BackColour=${bgColorFFmpeg},Alignment=2,OutlineColour=${bgColorFFmpeg},MarginV=50'`

    ])
    .output(tempOutputFilePath)
    .on('end', () => {
      console.log('Subtitle embedding completed successfully.');

      // Check if the temporary file exists before renaming
      fs.access(tempOutputFilePath, fs.constants.F_OK, (err) => {
        if (err) {
          console.error('Temporary file does not exist:', err);
          return res.status(500).json({ message: 'Temporary file does not exist' });
        }

        // Replace the original file with the processed file
        fs.rename(tempOutputFilePath, videoFilePath, (err) => {
          if (err) {
            console.error('Error replacing original file:', err);
            return res.status(500).json({ message: 'Error replacing original file' });
          }

          // Update clipRequest with the same output file name
          clipRequest.outputFileName = path.basename(videoFilePath);

          fs.writeFile(clipRequestsFile, JSON.stringify(clipRequests, null, 2), 'utf8', (err) => {
            if (err) {
              console.error('Error updating clip request file:', err);
              return res.status(500).json({ message: 'Error updating clip request' });
            }
            res.json({ message: 'Subtitle embedding completed successfully', fileName: path.basename(videoFilePath) });
          });
        });
      });
    })
    .on('error', (err) => {
      console.error('Error embedding subtitle:', err);
      res.status(500).json({ message: 'Error embedding subtitle' });
    })
    .run();
});




// Endpoint to download an exported clip
app.get('/download/:id', (req, res) => {
  const id = Number(req.params.id);
  const clipRequest = clipRequests.find(req => req.id === id);

  if (clipRequest && clipRequest.outputFileName) {
    const filePath = path.join(__dirname, 'public', clipRequest.outputFileName);
    res.download(filePath, clipRequest.outputFileName, (err) => {
      if (err) {
        console.error('Error downloading clip:', err);
        res.status(500).send('Error downloading clip');
      }
    });
  } else {
    res.status(404).json({ message: 'Clip not found or not yet exported' });
  }
});


// Endpoint to crop a video
// Server-side cropping logic
// Server-side cropping logic
app.post('/crop-video', (req, res) => {
  const { id, ratio } = req.body;
  const clipRequest = clipRequests.find(req => req.id === id);

  if (!clipRequest || !clipRequest.outputFileName) {
    return res.status(404).json({ message: 'Clip request not found or clip not yet exported' });
  }

  const inputFilePath = path.join(__dirname, 'public', clipRequest.outputFileName);
  const uniqueId = Date.now();  // Unique identifier to avoid overwriting
  const finalOutputFileName = `cropped-${id}-${uniqueId}.mp4`;
  const finalOutputFilePath = path.join(__dirname, 'public', finalOutputFileName);

  let cropFilter = '';
  let scaleFilter = '';
  
  if (ratio === '9:16') {
    // For 9:16 ratio with fixed height of 360 pixels
    const cropWidth = 1080 * 9 / 16; // Calculate width based on 9:16 ratio
    cropFilter = `crop=${cropWidth}:1080:(in_w-${cropWidth})/2:0`; // Crop width to 9/16 of the height
    scaleFilter = ''; // No scaling needed if you just need to crop
  } else if (ratio === '1:1') {
    // For 1:1 ratio
    cropFilter = 'crop=in_h:in_h'; // Crop to square
    scaleFilter = 'scale=1080:1080'; // Scale to square resolution
  } else if (ratio === 'center') {
    // Center the video and pad to a vertical (9:16) format with target dimensions 360x640
    const targetWidth = 1080;  // Target width
    const targetHeight = 1920; // Target height
  
    // Scale the video to fit within the target dimensions, preserving aspect ratio
    cropFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`;
  
    // Pad the video to fit exactly the target dimensions while centering it
    scaleFilter = `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`;
  } else {
    return res.status(400).json({ message: 'Invalid ratio specified' });
  }

  // Construct the filter options
  const filterOptions = [cropFilter, scaleFilter].filter(Boolean).join(',');

  // Using FFmpeg to crop the video
  const ffmpegCommand = ffmpeg(inputFilePath)
    .outputOptions([`-vf ${filterOptions}`])
    .output(finalOutputFilePath)
    .on('end', () => {
      console.log(`Video cropped successfully: ${finalOutputFileName}`);

      clipRequest.outputFileName = finalOutputFileName;
      fs.writeFile(clipRequestsFile, JSON.stringify(clipRequests, null, 2), 'utf8', (err) => {
        if (err) {
          console.error('Error updating clip request file:', err);
          return res.status(500).json({ message: 'Error updating clip request' });
        }
        res.json({ message: 'Video cropped successfully', outputFileName: finalOutputFileName });
      });
    })
    .on('error', (err) => {
      console.error('Error cropping video:', err);
      res.status(500).json({ message: 'Error cropping video', error: err.message });
    })
    .on('stderr', (stderr) => {
      console.error('FFmpeg stderr:', stderr);
    })
    .run();
});
app.post('/add-additional-text', (req, res) => {
  const { id, additionalText, bgColor, textColor, fontsize } = req.body;
  
  // Find the clip request
  const clipRequest = clipRequests.find(req => req.id === id);
  if (!clipRequest) {
    return res.status(404).json({ message: 'Clip request not found' });
  }

  // Define the input file path
  const inputFileName = clipRequest.outputFileName;
  const inputFilePath = path.join('public', inputFileName).replace(/\\/g, '/');
  console.log(`Input file path: ${inputFilePath}`);

  // Define a temporary output file path
  const tempOutputFileName = `temp-${inputFileName}`;
  const tempOutputFilePath = path.join('public', tempOutputFileName).replace(/\\/g, '/');
  console.log(`Temporary output file path: ${tempOutputFilePath}`);

  // Ensure colors are in correct format
  console.log(`Text Color: ${textColor}`);
  console.log(`Background Color: ${bgColor}`);
  console.log(`Additional Text: ${additionalText}`);
  console.log(`Font Size: ${fontsize}`);

  // Path to font file
  const fontfile = path.join('public', 'fonts', 'NotoSansDevanagari-VariableFont_wdth,wght.ttf').replace(/\\/g, '/');

  // Create the FFmpeg command for embedding additional text with background color and box
// Create the FFmpeg command for embedding additional text with background color and box
ffmpeg()
  .input(inputFilePath)
  .outputOptions([
    `-vf`,
    `drawtext=fontfile='${fontfile}':text='${additionalText.replace(/'/g, "\\'")}':fontsize=${fontsize}:fontcolor=${textColor.replace('#', '')}:x=(w-text_w)/2:y=(h-text_h)/5:box=1:boxcolor=${bgColor.replace('#', '')}@0.9:boxborderw=10`
  ])
  .output(tempOutputFilePath)
  .on('end', () => {
    console.log(`Additional text embedded successfully to temp file: ${tempOutputFileName}`);

    // Replace the original file with the temporary file
    fs.rename(tempOutputFilePath, inputFilePath, (err) => {
      if (err) {
        console.error('Error replacing the original file:', err);
        return res.status(500).send('Error replacing the original file');
      }

      // Update the clip request with the new file name (if needed)
      clipRequest.outputFileName = inputFileName;

      // Save the updated clip requests to file
      fs.writeFile(clipRequestsFile, JSON.stringify(clipRequests, null, 2), 'utf8', (err) => {
        if (err) {
          console.error('Error updating clip request file:', err);
          return res.status(500).send('Error updating clip request');
        }
        res.json({ message: 'Additional text embedded successfully', outputFileName: inputFileName });
      });
    });
  })
  .on('error', (err) => {
    console.error('Error embedding additional text:', err);
    res.status(500).send('Error embedding additional text');
  })
  .run();


});



// Handle upload to YouTube
// Endpoint to handle video uploads to YouTube
// Endpoint to handle video uploads to YouTube
// Endpoint to handle video uploads to YouTube
// Endpoint to start OAuth2 flow
app.get('/auth/google', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload'],
  });
  res.redirect(authUrl);
});

// Callback endpoint to handle authorization code
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    saveTokens(tokens);
    oAuth2Client.setCredentials(tokens); // Set credentials
    res.send('Authorization successful! You can close this tab.');
  } catch (error) {
    console.error('Error during OAuth2 callback:', error);
    res.status(500).send('Failed to authenticate. Please try again.');
  }
});

// Endpoint to handle video uploads to YouTube
app.post('/upload-to-youtube', async (req, res) => {
  const { id, title, description, tags } = req.body;

  // Find the clip request
  const clipRequest = clipRequests.find(req => req.id === id);
  if (!clipRequest) {
    return res.status(404).json({ message: 'Clip request not found' });
  }

  // Define the input file path
  const inputFileName = clipRequest.outputFileName;
  const videoFilePath = path.resolve(__dirname, 'public', inputFileName);

  // Validate required fields
  if (!title || !description || !tags) {
    return res.status(400).json({ message: 'Title, description, and tags are required.' });
  }

  // Ensure tags is a string or handle as array
  let tagsArray;
  if (typeof tags === 'string') {
    tagsArray = tags.split(',').map(tag => tag.trim());
  } else if (Array.isArray(tags)) {
    tagsArray = tags.map(tag => tag.trim());
  } else {
    return res.status(400).json({ message: 'Invalid tags format. Must be a string or an array.' });
  }

  try {
    // Initialize the YouTube API client
    const youtube = google.youtube({ version: 'v3', auth: oAuth2Client });

    // Prepare video metadata and file for upload
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title,
          description,
          tags: tagsArray, // Use the processed tags array
        },
        status: {
          privacyStatus: 'private', // Options: 'private', 'unlisted', 'public'
        },
      },
      media: {
        body: fs.createReadStream(videoFilePath), // Ensure the file exists and the path is correct
      },
    });

    res.json({ message: 'Upload successful', videoId: response.data.id });
  } catch (error) {
    console.error('Error uploading to YouTube:', error.message);
    res.status(500).json({ message: 'Failed to upload to YouTube. Please try again.' });
  }
});




// Serve the HTML page for user interaction
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
