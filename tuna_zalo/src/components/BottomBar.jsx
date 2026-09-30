import React from "react";

export const BottomBar = ({ activeTab, setActiveTab }) => {
  const tabs = [
    {
      id: "home",
      label: "Trang chủ",
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
      ),
    },
    {
      id: "aihub",
      label: "AI Hub",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="7.5" />
          <path strokeLinecap="round" d="M12 9v3l2 2M9 4.5V2m6 2.5V2" />
        </svg>
      ),
    },
    {
      id: "docs",
      label: "Tài liệu",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: "community",
      label: "Cộng đồng",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      id: "profile",
      label: "Thông tin",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-2 py-2 flex justify-between items-center z-40 select-none shadow-[0_-8px_25px_rgba(0,82,255,0.07)]">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 flex justify-center items-center border-0 bg-transparent p-0 cursor-pointer active:scale-95 transition-transform duration-150 outline-none"
          >
            <div
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-2xl transition-all duration-200 ease-out ${
                isActive
                  ? "bg-gradient-to-r from-[#0052FF] to-[#2563EB] text-white font-extrabold shadow-md shadow-blue-500/30 scale-105"
                  : "text-slate-500 font-semibold hover:text-[#0052FF]"
              }`}
            >
              <span className={`transition-transform duration-200 ${isActive ? "scale-110 drop-shadow-xs" : "scale-100"}`}>
                {tab.icon}
              </span>
              <span className="text-[10px] mt-1 whitespace-nowrap leading-none tracking-tight">
                {tab.label}
              </span>
            </div>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomBar;