let startTime = null;
let endTime = null;
let videoElement = null;

// Create and style the segment button
function createSegmentButton() {
  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) {
    console.log('Controls not found.');
    return;
  }

  // Check for an existing button
  const existingButton = document.querySelector('#ytp-clip-button');
  if (existingButton) {
    console.log('Button already exists.');
    return;
  }

  // Create the button
  const segmentButton = document.createElement('button');
  segmentButton.id = 'ytp-clip-button';
  segmentButton.innerHTML = 'Mark Segment';
  segmentButton.style.backgroundColor = '#FF0000'; // Red background
  segmentButton.style.color = '#FFFFFF'; // White text
  segmentButton.style.border = 'none';
  segmentButton.style.borderRadius = '5px'; // More rounded corners
  segmentButton.style.padding = '8px 15px'; // Larger padding
  segmentButton.style.marginLeft = '10px';
  segmentButton.style.cursor = 'pointer';
  segmentButton.style.fontSize = '14px'; // Slightly larger text
  segmentButton.style.fontWeight = 'bold';
  segmentButton.style.position = 'relative'; // Ensure correct positioning
  segmentButton.style.zIndex = '1000'; // Ensure it appears above other elements
  segmentButton.title = 'Mark a segment on the video timeline';

  // Set up button click handler
  segmentButton.onclick = async () => {
    if (!videoElement) {
      alert('Video element not found.');
      return;
    }

    if (startTime === null) {
      startTime = videoElement.currentTime;
      alert(`Start time marked at ${startTime.toFixed(2)} seconds. Now, click again to mark the end time.`);
    } else if (endTime === null) {
      endTime = videoElement.currentTime;
      if (endTime <= startTime) {
        alert('End time must be greater than start time. Please try again.');
        endTime = null; // Reset end time
        return;
      }

      alert(`End time marked at ${endTime.toFixed(2)} seconds. Clipping from ${startTime.toFixed(2)} to ${endTime.toFixed(2)} seconds.`);

      // Extract the transcript text with timestamps
      const transcript = await extractTranscript(startTime, endTime);

      const videoUrl = window.location.href;
      chrome.runtime.sendMessage({
        action: 'sendClipInfo',
        data: {
          url: videoUrl,
          start: startTime,
          end: endTime,
          transcript: transcript // Include transcript with timestamps in the data sent
        }
      });

      alert('Segment marked and sent with transcript!');
      // Reset times after segment is marked
      startTime = null;
      endTime = null;
    } else {
      alert('Segment already marked. Please reload the page to mark a new segment.');
    }
  };

  // Ensure the button is flexibly aligned
  controls.style.display = 'flex';
  controls.style.justifyContent = 'flex-end';

  // Append the button to the right controls
  controls.insertBefore(segmentButton, controls.lastElementChild);
  console.log('Button added to controls.');
}

// Function to extract transcript with timestamps
async function extractTranscript(startTime, endTime) {
  // Wait for the transcript to load if necessary
  await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time for dynamic content

  const transcriptElements = document.querySelectorAll('#segments-container > ytd-transcript-segment-renderer');
  let transcriptData = [];
  let previousSegment = null;
  let hasStarted = false;

  for (const el of transcriptElements) {
    const timestampElement = el.querySelector('.segment-timestamp.style-scope.ytd-transcript-segment-renderer');
    const segmentTextElement = el.querySelector('.segment-text.style-scope.ytd-transcript-segment-renderer');

    if (timestampElement && segmentTextElement) {
      const timestampText = timestampElement.textContent.trim();
      const [minutes, seconds] = timestampText.split(':').map(Number);
      const timestamp = minutes * 60 + seconds;

      // Capture the previous segment if we are at or before the start time
      if (timestamp < startTime) {
        previousSegment = { time: timestampText, text: segmentTextElement.textContent.trim() };
      } else if (!hasStarted && timestamp >= startTime) {
        // Include the previous segment before starting extraction if it exists
        if (previousSegment) {
          transcriptData.push(previousSegment);
        }

        // Start capturing from the current segment
        transcriptData.push({ time: timestampText, text: segmentTextElement.textContent.trim() });
        hasStarted = true;
      } else if (hasStarted && timestamp <= endTime) {
        // Continue capturing until we exceed the end time
        transcriptData.push({ time: timestampText, text: segmentTextElement.textContent.trim() });

        // If this is the segment right after the one we should start from, ensure it's captured
        if (previousSegment && !hasStarted) {
          transcriptData.push(previousSegment); // Start from the previous segment
          hasStarted = true;
        }
      } else if (hasStarted && timestamp > endTime) {
        // Stop capturing once we exceed the end time
        break;
      }

      // Update the previous segment to the current one
      previousSegment = { time: timestampText, text: segmentTextElement.textContent.trim() };
    }
  }

  return transcriptData;
}



// Initialize when the YouTube video player is available
function initialize() {
  const videoElements = document.querySelectorAll('video');
  if (videoElements.length > 0) {
    videoElement = videoElements[0];
    createSegmentButton();
  }
}

// Wait for the video player to fully load before initializing
const observer = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList') {
      initialize();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial check in case the player is already loaded
initialize();
