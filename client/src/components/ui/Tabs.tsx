interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function Tabs({ tabs, activeTab, onTabChange }: TabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-none pb-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 whitespace-nowrap relative ${
            activeTab === tab.key
              ? 'bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white shadow-md shadow-[#2563EB]/20'
              : 'bg-[#f6f3f2] text-[#5f5e5e] hover:bg-[#ebe7e7] hover:text-[#0F172A]'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
              activeTab === tab.key ? 'bg-white/20' : 'bg-black/5'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
