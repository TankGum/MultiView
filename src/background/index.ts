// background/index.ts
chrome.runtime.onInstalled.addListener(() => {
  console.log('MultiView Extension Installed');
});

// Store dashboard tab ID to know where to send signals
let dashboardTabId: number | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Register dashboard
  if (message.type === 'REGISTER_DASHBOARD') {
    dashboardTabId = sender.tab?.id || null;
    console.log('Dashboard registered:', dashboardTabId);
    return;
  }

  // Forward signals between content scripts and dashboard
  if (message.type === 'SIGNAL_OFFER' || message.type === 'SIGNAL_ICE_CANDIDATE') {
    if (dashboardTabId !== null) {
      chrome.tabs.sendMessage(dashboardTabId, {
        ...message,
        sourceTabId: sender.tab?.id,
        sourceTitle: sender.tab?.title,
        sourceFrameId: sender.frameId ?? 0
      }).catch((error) => {
        console.error('Failed to forward signal to dashboard:', error);
        dashboardTabId = null;
      });
    }
  }

  if (message.type === 'SIGNAL_ANSWER' || message.type === 'SIGNAL_ICE_CANDIDATE_FROM_DASHBOARD') {
    if (message.targetTabId) {
      const targetFrameId = Number.isInteger(message.targetFrameId) ? message.targetFrameId : null;
      if (targetFrameId !== null) {
        chrome.tabs.sendMessage(message.targetTabId, message, { frameId: targetFrameId }).catch((error) => {
          console.error('Failed to send signal to content frame:', error);
        });
      } else {
        chrome.tabs.sendMessage(message.targetTabId, message).catch((error) => {
          console.error('Failed to send signal to content tab:', error);
        });
      }
    }
  }
  
  // Handle start stream request from popup/dashboard
  if (message.type === 'START_STREAMS') {
    if (sender.tab?.id) {
      // Treat sender as active dashboard to avoid race with REGISTER_DASHBOARD
      dashboardTabId = sender.tab.id;
    }

    const rawTabIds: unknown[] = Array.isArray(message.tabIds) ? message.tabIds : [];
    const numericTabIds: number[] = rawTabIds.filter(
      (id): id is number => typeof id === 'number' && Number.isInteger(id)
    );
    const tabIds = Array.from(new Set<number>(numericTabIds)).slice(0, 12);
    tabIds.forEach(async (id: number) => {
      try {
        await chrome.tabs.sendMessage(id, { type: 'INIT_CAPTURE' });
      } catch (e) {
        console.log(`Tab ${id} not ready, attempting to inject content script...`);
        try {
          const manifest = chrome.runtime.getManifest();
          const contentScriptPath = manifest.content_scripts?.[0]?.js?.[0];
          
          if (!contentScriptPath) {
            throw new Error('Content script path not found in manifest');
          }

          await chrome.scripting.executeScript({
            target: { tabId: id, allFrames: true },
            files: [contentScriptPath]
          });
          // Wait a bit for script to initialize then try again
          setTimeout(() => {
            chrome.tabs.sendMessage(id, { type: 'INIT_CAPTURE' }).catch(err => 
              console.error(`Failed to reach tab ${id} after injection:`, err)
            );
          }, 500);
        } catch (injectionError) {
          console.error(`Could not inject script into tab ${id}:`, injectionError);
        }
      }
    });
  }
});
