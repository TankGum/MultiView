import { useState, useEffect } from 'react'
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

  return (
    <div className="w-[360px] h-[500px] p-3 bg-gray-900 text-white overflow-hidden flex flex-col">
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <img src="/icon-32.png" className="w-5 h-5 rounded" alt="MultiView icon" />
            Select Tabs
          </h1>
          <button
            onClick={scanTabs}
            className="p-1 hover:bg-gray-800 rounded-full transition-colors"
            title="Refresh tabs"
            aria-label="Refresh tabs"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <button
          disabled={selectedTabs.length === 0}
          onClick={openDashboard}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
        >
          View Selected ({Math.min(selectedTabs.length, MAX_TABS)}/{MAX_TABS})
          <ExternalLink size={16} />
        </button>
        {limitWarning && (
          <p className="text-[10px] text-red-500 text-center mt-2">{limitWarning}</p>
        )}
        <div className="h-px bg-gray-800 my-3" />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
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
              className={`p-2.5 rounded-lg border transition-all flex items-center gap-2.5 ${
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
                <div className="text-[13px] font-semibold truncate leading-tight mb-0.5">{tab.title}</div>
                <div className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                  {new URL(tab.url).hostname}
                </div>
              </div>
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}
