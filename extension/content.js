// Instagram AI Spoiler Blocker - Content Script (Hardened Extraction & Logging)
(function () {
  console.log("%c[Spoiler Blocker] Content Script active on Instagram.", "color: #00e676; font-weight: bold;");

  const BACKEND_ENDPOINT = "http://localhost:8000/analyze";

  // Elements processed or currently being evaluated
  const processedContainers = new WeakSet();
  const pendingContainers = new WeakSet();

  // Common Instagram UI words to filter out from innerText
  const UI_BOILERPLATE_REGEX = /\b(Like|Liked|Reply|Replies|Share|Shared|Send|Save|Saved|Follow|Following|View more comments|View all \d+ comments|Add a comment|Original audio|Audio|Verified|Sponsored|Suggested for you|Hide|Report)\b/gi;

  /**
   * Cleans text by stripping typical social media UI words, hashtags repetition, and excess whitespace
   */
  function cleanExtractedText(rawText) {
    if (!rawText) return "";
    return rawText
      .split("\n")
      .map(line => line.trim())
      .filter(line => {
        if (!line) return false;
        // Strip short UI button text
        if (["Like", "Reply", "Share", "Follow", "Save", "More", "View replies"].includes(line)) return false;
        if (/^\d+\s*(likes?|views?|comments?|shares?)$/i.test(line)) return false;
        return true;
      })
      .join(" ")
      .replace(UI_BOILERPLATE_REGEX, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Resilient text extraction function using parent innerText and accessible attributes
   */
  function extractTextResilient(container) {
    if (!container) return "";

    // 1. Gather all candidate text from innerText of the parent container
    let candidateText = container.innerText || container.textContent || "";

    // 2. Also check for accessibility alt tags on images/video covers
    const imageAlts = [];
    container.querySelectorAll("img[alt]").forEach((img) => {
      const alt = img.getAttribute("alt") || "";
      if (alt.length > 15 && !alt.startsWith("Profile picture") && !alt.startsWith("Photo by")) {
        imageAlts.push(alt);
      }
    });

    if (imageAlts.length > 0) {
      candidateText += " " + imageAlts.join(" ");
    }

    // 3. Clean boilerplate
    const cleaned = cleanExtractedText(candidateText);
    return cleaned;
  }

  /**
   * Queries FastAPI backend
   */
  async function checkSpoiler(textToAnalyze) {
    try {
      console.log(`%c[FETCHING BACKEND] Sending payload with length: ${textToAnalyze.length}`, "color: #00b0ff;");
      const response = await fetch(BACKEND_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: textToAnalyze
        })
      });

      if (!response.ok) {
        throw new Error(`API error HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("%c[BACKEND RESULT RECEIVED]:", "color: #76ff03; font-weight: bold;", result);
      return result;
    } catch (err) {
      console.error("[Spoiler Blocker] Failed to query AI backend:", err);
      return { is_spoiler: false, spoiled_media: [] };
    }
  }

  /**
   * Applies the initial anti-spoiler blur
   */
  function applyInitialBlur(target) {
    if (!target) return;
    target.style.filter = "blur(50px)";
    target.style.transition = "filter 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
  }

  /**
   * Gracefully removes blur
   */
  function removeBlur(target) {
    if (!target) return;
    target.style.filter = "none";
    const overlay = target.parentElement?.querySelector(".spoiler-warning-overlay");
    if (overlay) overlay.remove();
  }

  /**
   * Mounts the dynamic warning overlay
   */
  function createWarningOverlay(container, targetMedia, spoiledMedia) {
    if (!container) return;

    const oldOverlay = container.querySelector(".spoiler-warning-overlay");
    if (oldOverlay) oldOverlay.remove();

    const mediaList = Array.isArray(spoiledMedia) && spoiledMedia.length > 0 
      ? spoiledMedia.join(", ") 
      : "Plot Details";

    const overlay = document.createElement("div");
    overlay.className = "spoiler-warning-overlay";
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      background: rgba(18, 18, 18, 0.85);
      backdrop-filter: blur(12px);
      color: #ffffff;
      padding: 24px;
      box-sizing: border-box;
      text-align: center;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      user-select: none;
      transition: opacity 0.2s ease;
    `;

    overlay.innerHTML = `
      <div style="font-size: 40px; margin-bottom: 12px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">⚠️</div>
      <div style="font-size: 17px; font-weight: 700; color: #ffca28; margin-bottom: 8px; line-height: 1.3;">
        Spoiler Warning: ${mediaList}
      </div>
      <div style="font-size: 13px; color: #f5f5f5; margin-top: 6px; background: rgba(255, 255, 255, 0.2); padding: 6px 16px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.3);">
        Click to Reveal
      </div>
    `;

    overlay.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
        if (targetMedia) targetMedia.style.filter = "none";
        if (container) container.style.filter = "none";
      }, 180);
    });

    const computedPosition = window.getComputedStyle(container).position;
    if (computedPosition === "static") {
      container.style.position = "relative";
    }

    container.appendChild(overlay);
  }

  /**
   * Main inspection routine with hydration wait and debouncing
   */
  async function processPost(videoOrPostElement) {
    // Locate the post or reel container
    const container =
      videoOrPostElement.closest("article") ||
      videoOrPostElement.closest('div[role="dialog"]') ||
      videoOrPostElement.closest('section') ||
      videoOrPostElement.parentElement;

    if (!container) return;

    if (processedContainers.has(container) || pendingContainers.has(container)) {
      return;
    }
    pendingContainers.add(container);

    console.log("[Spoiler Blocker] Intercepted element:", videoOrPostElement, "Container:", container);

    // Apply immediate blur
    applyInitialBlur(videoOrPostElement);

    // Wait 500ms for Instagram to hydrate dynamic text spans (reels/feed hydration)
    setTimeout(async () => {
      try {
        let extractedText = extractTextResilient(container);

        // If initial extracted text is too short, re-check once after 400ms
        if (extractedText.length <= 10) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          extractedText = extractTextResilient(container);
        }

        console.log(`[EXTRACTED TEXT]: "${extractedText}"`);

        // If text is still under 10 chars, consider it non-spoiler/media-only and unblur
        if (!extractedText || extractedText.length <= 10) {
          console.log("[Spoiler Blocker] Extracted text too short or empty. Unblurring element.");
          removeBlur(videoOrPostElement);
          processedContainers.add(container);
          pendingContainers.delete(container);
          return;
        }

        const result = await checkSpoiler(extractedText);

        if (result && result.is_spoiler) {
          console.log("%c[APPLYING SPOILER OVERLAY]:", "color: #ff5252; font-weight: bold;", result.spoiled_media);
          createWarningOverlay(container, videoOrPostElement, result.spoiled_media);
        } else {
          console.log("[Spoiler Blocker] Content is safe. Removing blur.");
          removeBlur(videoOrPostElement);
        }

        processedContainers.add(container);
      } catch (err) {
        console.error("[Spoiler Blocker] Error in processPost:", err);
        removeBlur(videoOrPostElement);
      } finally {
        pendingContainers.delete(container);
      }
    }, 500);
  }

  /**
   * Scans a mutation node for videos or articles
   */
  function inspectNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

    if (node.matches("video")) {
      processPost(node);
      return;
    }

    const videos = node.querySelectorAll("video");
    videos.forEach((vid) => processPost(vid));

    if (node.matches("article")) {
      const v = node.querySelector("video");
      if (v) processPost(v);
    }
  }

  // MutationObserver for continuous monitoring
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        inspectNode(addedNode);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Initial check on load
  document.querySelectorAll("video").forEach((video) => {
    processPost(video);
  });
})();
