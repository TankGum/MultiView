import React, { useState, useEffect, useRef } from 'react'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2'
import Volume2 from 'lucide-react/dist/esm/icons/volume-2'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'
import GripVertical from 'lucide-react/dist/esm/icons/grip-vertical'

interface StreamInfo {
  tabId: number
  title: string
  stream: MediaStream
}

const MAX_STREAMS = 12

export default function Dashboard() {
  const [streams, setStreams] = useState<StreamInfo[]>([])
  const [selectedOrder, setSelectedOrder] = useState<number[]>([])
  const [draggingTabId, setDraggingTabId] = useState<number | null>(null)
  const streamsRef = useRef<StreamInfo[]>([])
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({})
  const pendingRemoteIceCandidates = useRef<Record<string, RTCIceCandidateInit[]>>({})
  const activeSourceByTab = useRef<Record<number, { frameId: number; score: number }>>({})
  const selectedTabIds = useRef<number[]>([])

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'REGISTER_DASHBOARD' });

    chrome.storage.local.get(['selectedTabIds'], (result: { [key: string]: any }) => {
      const storedIds = Array.isArray(result.selectedTabIds) ? result.selectedTabIds.slice(0, MAX_STREAMS) : [];
      selectedTabIds.current = storedIds;
      setSelectedOrder(storedIds);
      if (storedIds.length > 0) {
        chrome.runtime.sendMessage({
          type: 'START_STREAMS',
          tabIds: storedIds
        });
      }
    });

    const handleMessage = async (message: any) => {
      if (message.type === 'SIGNAL_OFFER') {
        handleOffer(
          message.offer,
          message.sourceTabId,
          message.sourceTitle,
          message.sourceFrameId ?? 0,
          message.videoScore ?? 0
        );
      } else if (message.type === 'SIGNAL_ICE_CANDIDATE') {
        handleRemoteIceCandidate(message.candidate, message.sourceTabId, message.sourceFrameId ?? 0);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    const retryTimer = window.setInterval(() => {
      if (selectedTabIds.current.length === 0) return;

      const activeTabIds = new Set(streamsRef.current.map(s => s.tabId));
      const missingTabs = selectedTabIds.current.filter(id => !activeTabIds.has(id));
      if (missingTabs.length > 0) {
        chrome.runtime.sendMessage({
          type: 'START_STREAMS',
          tabIds: missingTabs
        });
      }
    }, 8000);

    return () => {
      clearInterval(retryTimer);
      chrome.runtime.onMessage.removeListener(handleMessage);
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
      pendingRemoteIceCandidates.current = {};
      activeSourceByTab.current = {};
    };
  }, []);

  useEffect(() => {
    streamsRef.current = streams;
  }, [streams]);

  const getConnectionKey = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

  const reorderTabs = (sourceTabId: number, targetTabId: number) => {
    if (sourceTabId === targetTabId) return

    setSelectedOrder(prev => {
      const base = prev.length > 0 ? [...prev] : visibleStreams.map(s => s.tabId)
      const sourceIndex = base.indexOf(sourceTabId)
      const targetIndex = base.indexOf(targetTabId)
      if (sourceIndex < 0 || targetIndex < 0) return prev

      base.splice(sourceIndex, 1)
      base.splice(targetIndex, 0, sourceTabId)

      selectedTabIds.current = base
      chrome.storage.local.set({ selectedTabIds: base.slice(0, MAX_STREAMS) })
      return base
    })
  }

  const queueRemoteIceCandidate = (connectionKey: string, candidate: RTCIceCandidateInit) => {
    if (!pendingRemoteIceCandidates.current[connectionKey]) {
      pendingRemoteIceCandidates.current[connectionKey] = [];
    }
    pendingRemoteIceCandidates.current[connectionKey].push(candidate);
  };

  const flushRemoteIceCandidates = async (connectionKey: string) => {
    const pc = peerConnections.current[connectionKey];
    const queued = pendingRemoteIceCandidates.current[connectionKey];
    if (!pc || !pc.remoteDescription || !queued || queued.length === 0) {
      return;
    }

    pendingRemoteIceCandidates.current[connectionKey] = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('Error flushing ICE candidate in dashboard:', e);
      }
    }
  };

  const closeConnection = (connectionKey: string) => {
    const existing = peerConnections.current[connectionKey];
    if (existing) {
      existing.close();
      delete peerConnections.current[connectionKey];
    }
    delete pendingRemoteIceCandidates.current[connectionKey];
  };

  const handleOffer = async (
    offer: RTCSessionDescriptionInit,
    sourceTabId: number,
    sourceTitle: string,
    sourceFrameId: number,
    videoScore: number
  ) => {
    if (!Number.isInteger(sourceTabId)) return;
    if (selectedTabIds.current.length > 0 && !selectedTabIds.current.includes(sourceTabId)) return;

    const currentSource = activeSourceByTab.current[sourceTabId];
    if (currentSource && currentSource.frameId !== sourceFrameId && currentSource.score > videoScore) {
      return;
    }

    if (currentSource && currentSource.frameId !== sourceFrameId) {
      closeConnection(getConnectionKey(sourceTabId, currentSource.frameId));
    }
    activeSourceByTab.current[sourceTabId] = { frameId: sourceFrameId, score: videoScore };

    const connectionKey = getConnectionKey(sourceTabId, sourceFrameId);
    closeConnection(connectionKey);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnections.current[connectionKey] = pc;
    if (!pendingRemoteIceCandidates.current[connectionKey]) pendingRemoteIceCandidates.current[connectionKey] = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        chrome.runtime.sendMessage({
          type: 'SIGNAL_ICE_CANDIDATE_FROM_DASHBOARD',
          candidate: event.candidate,
          targetTabId: sourceTabId,
          targetFrameId: sourceFrameId
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        const active = activeSourceByTab.current[sourceTabId];
        if (active && active.frameId === sourceFrameId) {
          delete activeSourceByTab.current[sourceTabId];
          setStreams(prev => prev.filter(s => s.tabId !== sourceTabId));
        }
      }
    };

    pc.ontrack = (event) => {
      const active = activeSourceByTab.current[sourceTabId];
      if (!active || active.frameId !== sourceFrameId) return;

      const stream = event.streams[0];
      setStreams(prev => {
        // Keep unique tabs, update stream
        const filtered = prev.filter(s => s.tabId !== sourceTabId);
        return [...filtered, { tabId: sourceTabId, title: sourceTitle, stream }].slice(0, MAX_STREAMS);
      });
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushRemoteIceCandidates(connectionKey);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      chrome.runtime.sendMessage({
        type: 'SIGNAL_ANSWER',
        answer: answer,
        targetTabId: sourceTabId,
        targetFrameId: sourceFrameId
      });
    } catch (e) { console.error('Offer handling error:', e); }
  };

  const handleRemoteIceCandidate = async (candidate: RTCIceCandidateInit, sourceTabId: number, sourceFrameId: number) => {
    const active = activeSourceByTab.current[sourceTabId];
    const connectionKey = getConnectionKey(sourceTabId, sourceFrameId);

    // Ignore candidates from lower-priority frames once a source is selected.
    if (active && active.frameId !== sourceFrameId) {
      return;
    }

    const pc = peerConnections.current[connectionKey];
    if (!pc || !pc.remoteDescription) {
      queueRemoteIceCandidate(connectionKey, candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding ICE candidate in dashboard:', e);
    }
  };

  const gridClass = () => {
    const count = streams.length
    if (count <= 1) return 'grid-cols-1 grid-rows-1'
    if (count <= 2) return 'grid-cols-2 grid-rows-1'
    if (count <= 4) return 'grid-cols-2 grid-rows-2'
    if (count <= 6) return 'grid-cols-3 grid-rows-2'
    if (count <= 9) return 'grid-cols-3 grid-rows-3'
    return 'grid-cols-4 grid-rows-3'
  }

  const orderMap = new Map(selectedOrder.map((tabId, index) => [tabId, index]))
  const visibleStreams = [...streams]
    .sort((a, b) => {
      const aOrder = orderMap.has(a.tabId) ? orderMap.get(a.tabId)! : Number.MAX_SAFE_INTEGER
      const bOrder = orderMap.has(b.tabId) ? orderMap.get(b.tabId)! : Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.tabId - b.tabId
    })
    .slice(0, MAX_STREAMS)
  const selectedCount = Math.min(
    selectedOrder.length > 0 ? selectedOrder.length : visibleStreams.length,
    MAX_STREAMS
  )

  return (
      <div className="h-screen w-screen bg-black overflow-hidden flex flex-col">
      <header className="h-12 px-6 bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 border-b border-gray-800/50 backdrop-blur-sm flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"></div>
          <p className="text-sm font-medium text-gray-300 tracking-tight">
            Watch multiple tabs in one view
          </p>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-4">
          {/* Counter badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/30 backdrop-blur-sm hover:border-blue-500/50 transition-colors">
            <span className="text-xs font-semibold text-blue-300 tracking-wide">
              {selectedCount}/{MAX_STREAMS}
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
          </div>

          {/* Drag hint */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/40 hover:bg-gray-800/60 transition-colors">
            <span className="text-xs font-medium text-gray-400 tracking-tight">
              Tip: Drag tabs to reorder
            </span>
          </div>
        </div>
      </header>

      <main className={`flex-1 grid gap-1 p-1 overflow-y-auto ${gridClass()}`}>
        {visibleStreams.length === 0 ? (
          <div className="col-span-full row-span-full flex items-center justify-center text-gray-500 flex-col gap-2">
            <p className="text-xl">Waiting for videos...</p>
            <p className="text-sm">Make sure selected tabs are active and videos are playing.</p>
          </div>
        ) : (
          visibleStreams.map((s) => (
            <VideoCell
              key={s.tabId}
              streamInfo={s}
              onDragStart={() => setDraggingTabId(s.tabId)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingTabId !== null) reorderTabs(draggingTabId, s.tabId)
                setDraggingTabId(null)
              }}
              onDragEnd={() => setDraggingTabId(null)}
            />
          ))
        )}
      </main>
    </div>
  )
}

interface VideoCellProps {
  streamInfo: StreamInfo
  onDragStart: () => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: () => void
  onDragEnd: () => void
}

function VideoCell({ streamInfo, onDragStart, onDragOver, onDrop, onDragEnd }: VideoCellProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (videoRef.current && streamInfo.stream) {
      videoRef.current.srcObject = streamInfo.stream;
    }
  }, [streamInfo.stream]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="relative bg-gray-900 group overflow-hidden border border-gray-800 flex items-center justify-center"
    >
      <div className="absolute top-2 left-2 z-10 bg-black/70 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap max-w-[90%] truncate">
        {streamInfo.title}
      </div>

      <button
        className="absolute top-2 right-2 z-10 p-1.5 bg-black/60 rounded text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
        onClick={async () => {
          try {
            await chrome.tabs.update(streamInfo.tabId, { active: true });
          } catch (error) {
            console.error('Failed to open source tab:', error);
          }
        }}
        title="Go to source tab"
      >
        <ExternalLink size={16} />
      </button>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain"
      />

      <div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-1.5 bg-black/60 rounded hover:bg-black/80 text-white"
        >
          <Volume2 size={16} className={isMuted ? 'text-red-500' : 'text-white'} />
        </button>
        <button
          className="p-1.5 bg-black/60 rounded hover:bg-black/80 text-white"
          onClick={() => videoRef.current?.requestFullscreen()}
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  )
}
