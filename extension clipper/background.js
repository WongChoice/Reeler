chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "sendClipInfo") {
      fetch("http://localhost:8080/clip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message.data),
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then(result => {
        console.log("Success:", result);
      })
      .catch(error => {
        console.error("Error:", error);
      });
    }
  });
  