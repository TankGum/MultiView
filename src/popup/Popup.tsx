import { useState, useEffect } from 'react'
import Monitor from 'lucide-react/dist/esm/icons/monitor'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link'

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

      <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1 custom-scrollbar">
        {tabs.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No active tabs found.</p>
        ) : (
          tabs.map(tab => {
            const isSelected = selectedTabs.includes(tab.id)
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
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-gray-900" />
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
