// src/content/index.ts
console.log('MultiView: Advanced Content Script Loaded');

let peerConnection: RTCPeerConnection | null = null;
let videoStream: MediaStream | null = null;
let captureInterval: number | null = null;
let pendingIceCandidates: RTCIceCandidateInit[] = [];
let activeVideoScore = 0;
let fallbackCanvas: HTMLCanvasElement | null = null;
let fallbackRenderId: number | null = null;

// Deep search for video elements, including Shadow DOM
function findEveryVideo(root: Document | ShadowRoot | Element = document): HTMLVideoElement[] {
  let videos = Array.from(root.querySelectorAll('video'));
  
  // Search in shadow roots
  const allElements = root.querySelectorAll('*');
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      videos = [...videos, ...findEveryVideo(el.shadowRoot)];
    }
  }
  
  // Search in iframes (if same-origin)
  const iframes = root.querySelectorAll('iframe');
  for (const iframe of Array.from(iframes)) {
    try {
      if (iframe.contentDocument) {
        videos = [...videos, ...findEveryVideo(iframe.contentDocument)];
      }
    } catch (e) {
      // Cross-origin iframe, handled by the content script injected into it
    }
  }
  
  return videos;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INIT_CAPTURE') {
    startCapture();
  } else if (message.type === 'SIGNAL_ANSWER') {
    handleAnswer(message.answer);
  } else if (message.type === 'SIGNAL_ICE_CANDIDATE_FROM_DASHBOARD') {
    handleIceCandidate(message.candidate);
  }
});

async function startCapture() {
  if (captureInterval) clearInterval(captureInterval);
  
  let attempts = 0;
  captureInterval = window.setInterval(async () => {
    const allVideos = findEveryVideo();
    
    // Filter for "real" videos (have dimensions and a source)
    const validVideos = allVideos.filter(v => {
      const width = Math.max(v.videoWidth || 0, v.offsetWidth || 0);
      const height = Math.max(v.videoHeight || 0, v.offsetHeight || 0);
      const hasArea = (width * height) >= 4096;
      const isReady = v.readyState >= 1 || v.currentTime > 0 || !v.paused;
      return hasArea && isReady;
    });

    // Sort by computed score to avoid tiny/paused/low-quality candidates.
    const video = validVideos.sort((a, b) => {
      return getVideoScore(b) - getVideoScore(a);
    })[0];

    attempts++;

    if (video) {
      clearInterval(captureInterval!);
      captureInterval = null;
      setupVideoAndStart(video);
    } else if (attempts > 90) {
      clearInterval(captureInterval!);
      console.error('MultiView: No valid video found after 90s');
    }
  }, 1000);
}

function setupVideoAndStart(video: HTMLVideoElement) {
  console.log('MultiView: Found target video:', video);
  activeVideoScore = getVideoScore(video);

  // Prevent video from freezing when tab is inactive
  // We do this by "touching" the video element frequently
  const keepAlive = () => {
    if (video && !video.paused) {
      // Some players might throttle if not visible, so we mimic interaction
    }
  };
  const aliveTimer = setInterval(keepAlive, 2000);

  // Initial start
  actuallyStart(video);

  // Re-sync on major events
  const events = ['loadeddata', 'play', 'playing'];
  events.forEach(ev => {
    video.addEventListener(ev, () => {
      if (!videoStream || videoStream.getTracks().length === 0) {
        actuallyStart(video);
      }
    }, { once: true });
  });
}

async function actuallyStart(video: HTMLVideoElement) {
  try {
    const stream = await getCompatibleStream(video);
    if (!stream) {
      throw new Error('No compatible stream source found');
    }

    // Wait for tracks if they are not immediate
    if (stream.getTracks().length === 0 || stream.getVideoTracks().length === 0) {
      console.log('MultiView: Waiting for tracks...');
      setTimeout(() => actuallyStart(video), 1000);
      return;
    }

    videoStream = stream;
    console.log('MultiView: Stream ready with', stream.getTracks().length, 'tracks');

    if (peerConnection) peerConnection.close();

    peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pendingIceCandidates = [];

    stream.getTracks().forEach((track: MediaStreamTrack) => {
      peerConnection!.addTrack(track, stream);
      
      // If a track stops, try to restart
      track.onended = () => {
        console.log('MultiView: Track ended, restarting...');
        actuallyStart(video);
      };
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        chrome.runtime.sendMessage({
          type: 'SIGNAL_ICE_CANDIDATE',
          candidate: event.candidate
        });
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    chrome.runtime.sendMessage({
      type: 'SIGNAL_OFFER',
      offer: offer,
      videoScore: activeVideoScore
    });

  } catch (error) {
    console.error('MultiView Capture Error:', error);
  }
}

async function getCompatibleStream(video: HTMLVideoElement): Promise<MediaStream | null> {
  cleanupFallbackCapture();

  // Primary path for sites that support media capture directly.
  // @ts-ignore
  const directStream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
  if (directStream && directStream.getVideoTracks().length > 0) {
    return directStream;
  }

  // Fallback path for players where captureStream is missing/empty.
  const fallbackStream = createCanvasFallbackStream(video, directStream);
  if (fallbackStream && fallbackStream.getVideoTracks().length > 0) {
    return fallbackStream;
  }

  return directStream;
}

function createCanvasFallbackStream(video: HTMLVideoElement, directStream: MediaStream | null): MediaStream | null {
  const width = Math.max(video.videoWidth || 0, video.offsetWidth || 0);
  const height = Math.max(video.videoHeight || 0, video.offsetHeight || 0);
  if (width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const draw = () => {
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      fallbackRenderId = requestAnimationFrame(draw);
    } catch (error) {
      // SecurityError on protected/tainted sources cannot be bypassed.
      console.warn('MultiView: Canvas fallback blocked for this player', error);
      cleanupFallbackCapture();
    }
  };
  fallbackCanvas = canvas;
  fallbackRenderId = requestAnimationFrame(draw);

  const fps = 30;
  const canvasStream = canvas.captureStream(fps);
  if (directStream) {
    directStream.getAudioTracks().forEach((audioTrack) => {
      canvasStream.addTrack(audioTrack);
    });
  }

  return canvasStream;
}

function cleanupFallbackCapture() {
  if (fallbackRenderId !== null) {
    cancelAnimationFrame(fallbackRenderId);
    fallbackRenderId = null;
  }
  fallbackCanvas = null;
}

async function handleAnswer(answer: RTCSessionDescriptionInit) {
  if (peerConnection) {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      await flushPendingIceCandidates();
    } catch (e) { console.error('Error setting answer:', e); }
  }
}

async function handleIceCandidate(candidate: RTCIceCandidateInit) {
  if (!peerConnection || !peerConnection.remoteDescription) {
    pendingIceCandidates.push(candidate);
    return;
  }

  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error('Error adding ICE candidate in content script:', e);
  }
}

async function flushPendingIceCandidates() {
  if (!peerConnection || !peerConnection.remoteDescription || pendingIceCandidates.length === 0) {
    return;
  }

  const candidates = [...pendingIceCandidates];
  pendingIceCandidates = [];

  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error flushing ICE candidate in content script:', e);
    }
  }
}

function getVideoScore(video: HTMLVideoElement): number {
  const width = Math.max(video.videoWidth || 0, video.offsetWidth || 0);
  const height = Math.max(video.videoHeight || 0, video.offsetHeight || 0);
  const areaScore = width * height;
  const playingBonus = video.paused ? 0 : 500000;
  const readyBonus = video.readyState >= 3 ? 100000 : 0;
  return areaScore + playingBonus + readyBonus;
}
