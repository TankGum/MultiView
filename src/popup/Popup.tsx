import { useState, useEffect } from 'react'
import Monitor from 'lucide-react/dist/esm/icons/monitor'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'
import GripVertical from 'lucide-react/dist/esm/icons/grip-vertical'
import X from 'lucide-react/dist/esm/icons/x'

interface TabInfo {
  id: number
  title: string
  url: string
  favIconUrl?: string
}

const MAX_TABS = 12

export default function Popup() {
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [selectedTabs, setSelectedTabs] = useState<number[]>([])
  const [limitWarning, setLimitWarning] = useState('')
  const [draggingSelectedId, setDraggingSelectedId] = useState<number | null>(null)

  useEffect(() => {
    // Load previously selected tabs from storage
    chrome.storage.local.get(['selectedTabIds'], (result: { [key: string]: any }) => {
      if (result.selectedTabIds) {
        setSelectedTabs(result.selectedTabIds.slice(0, MAX_TABS));
      }
    });
    scanTabs();
  }, [])

  // Auto-save selection when it changes
  useEffect(() => {
    chrome.storage.local.set({ selectedTabIds: selectedTabs.slice(0, MAX_TABS) });
  }, [selectedTabs]);

  const scanTabs = async () => {
    const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
    const filteredTabs = allTabs
      .filter(tab => tab.id !== undefined)
      .map(tab => ({
        id: tab.id!,
        title: tab.title || 'Untitled',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl
      }))
    setTabs(filteredTabs)
    const validIds = new Set(filteredTabs.map(tab => tab.id))
    setSelectedTabs(prev => prev.filter(id => validIds.has(id)))
  }

  const toggleTab = (id: number) => {
    setSelectedTabs(prev => {
      if (prev.includes(id)) {
        setLimitWarning('')
        return prev.filter(t => t !== id)
      }
      if (prev.length >= MAX_TABS) {
        setLimitWarning(`Maximum ${MAX_TABS} tabs`)
        return prev
      }
      setLimitWarning('')
      return [...prev, id]
    })
  }

  const openDashboard = async () => {
    const limitedTabs = selectedTabs.slice(0, MAX_TABS)
    // Ensure storage is up to date before opening
    await chrome.storage.local.set({ selectedTabIds: limitedTabs });
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  }

  const moveSelectedTab = (sourceId: number, targetId: number) => {
    if (sourceId === targetId) return
    setSelectedTabs(prev => {
      const sourceIndex = prev.indexOf(sourceId)
      const targetIndex = prev.indexOf(targetId)
      if (sourceIndex < 0 || targetIndex < 0) return prev

      const next = [...prev]
      next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, sourceId)
      return next
    })
  }

  const removeSelectedTab = (id: number) => {
    setSelectedTabs(prev => prev.filter(tabId => tabId !== id))
  }

  const tabMap = new Map(tabs.map(tab => [tab.id, tab]))
  const selectedTabInfos = selectedTabs
    .map(id => tabMap.get(id))
    .filter((tab): tab is TabInfo => Boolean(tab))

  return (
    <div className="w-96 p-4 bg-gray-900 text-white min-h-[500px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Monitor size={24} className="text-blue-400" />
          MultiView
        </h1>
        <button 
          onClick={scanTabs}
          className="p-1 hover:bg-gray-800 rounded-full transition-colors"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      <div className="mb-4 border border-gray-800 rounded-lg bg-gray-950/40 p-2">
        <div className="text-xs text-gray-400 mb-2">Selected Order (drag to sort)</div>
        <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {selectedTabInfos.length === 0 ? (
            <p className="text-[11px] text-gray-500 py-1 px-2">No selected tabs yet.</p>
          ) : (
            selectedTabInfos.map((tab, index) => (
              <div
                key={`selected-${tab.id}`}
                draggable
                onDragStart={() => setDraggingSelectedId(tab.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingSelectedId !== null) moveSelectedTab(draggingSelectedId, tab.id)
                  setDraggingSelectedId(null)
                }}
                onDragEnd={() => setDraggingSelectedId(null)}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800 border border-gray-700"
              >
                <GripVertical size={14} className="text-gray-500 flex-shrink-0 cursor-grab" />
                <span className="text-[10px] text-blue-300 w-5 text-center">{index + 1}</span>
                <span className="text-xs text-white truncate flex-1">{tab.title}</span>
                <button
                  onClick={() => removeSelectedTab(tab.id)}
                  className="text-gray-400 hover:text-white"
                  title="Remove from selection"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1 custom-scrollbar">
        {tabs.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No active tabs found.</p>
        ) : (
          tabs.map(tab => {
            const isSelected = selectedTabs.includes(tab.id)
            const selectedIndex = selectedTabs.indexOf(tab.id)
            const isDisabled = !isSelected && selectedTabs.length >= MAX_TABS
            return (
            <div 
              key={tab.id}
              className={`p-3 rounded-lg border transition-all flex items-center gap-3 ${
                isSelected 
                  ? 'border-blue-500 bg-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)] cursor-pointer' 
                  : `border-gray-700 bg-gray-800 hover:border-gray-600 ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`
              }`}
              onClick={() => {
                if (!isDisabled) toggleTab(tab.id)
              }}
            >
              <div className="relative flex-shrink-0">
                {tab.favIconUrl ? (
                  <img src={tab.favIconUrl} className="w-6 h-6 rounded" alt="" />
                ) : (
                  <div className="w-6 h-6 bg-gray-700 rounded flex items-center justify-center text-[10px]">?</div>
                )}
                {isSelected && (
                  <div className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-blue-500 rounded-full border border-gray-900 text-[9px] leading-3 flex items-center justify-center text-white">
                    {selectedIndex + 1}
                  </div>
                )}
              </div>
              <div className="flex-1 truncate">
                <div className="text-sm font-semibold truncate leading-tight mb-0.5">{tab.title}</div>
                <div className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                  {new URL(tab.url).hostname}
                </div>
              </div>
            </div>
            )
          })
        )}
      </div>

      <div className="pt-4 border-t border-gray-800">
        <button
          disabled={selectedTabs.length === 0}
          onClick={openDashboard}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl font-bold flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
        >
          View Selected ({Math.min(selectedTabs.length, MAX_TABS)}/{MAX_TABS})
          <ExternalLink size={18} />
        </button>
        {limitWarning && (
          <p className="text-[10px] text-red-500 text-center mt-2">{limitWarning}</p>
        )}
        <p className="text-[10px] text-gray-500 text-center mt-2 italic">
          Tip: Supports up to {MAX_TABS} tabs. Keep videos playing in selected tabs.
        </p>
      </div>
    </div>
  )
}
