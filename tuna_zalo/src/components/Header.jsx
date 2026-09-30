// src/components/Header.jsx
import React from "react";

export const Header = ({
  userName = "Minh!",
  greeting = "Chào buổi sáng",
  logoUrl = "/src/static/logo.png",
  notificationCount = 1,
  onNotificationClick,
}) => {
  return (
    <header className="px-4 py-3 bg-gradient-to-r from-[#0052FF] via-[#1E40AF] to-[#312E81] text-white flex items-center justify-between sticky top-0 z-30 w-full shadow-lg shadow-blue-950/20 select-none border-b border-white/10">
      {/* Khối Logo & Lời chào */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-md shadow-black/15 ring-2 ring-white/30">
          <img
            src={logoUrl}
            alt="TUNA Logo"
            className="w-full h-full object-contain"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>

        <div className="flex flex-col justify-center">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="text-[19px] font-black tracking-wider text-white drop-shadow-xs">
              TUNA
            </span>
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          </div>
          <p className="text-[11.5px] text-blue-100 font-medium leading-tight mt-1 m-0">
            {greeting},{" "}
            <span className="font-extrabold text-cyan-300">
              {userName}
            </span>
          </p>
        </div>
      </div>

      {/* Nút Chuông Thông Báo Glassmorphism */}
      <button
        type="button"
        onClick={onNotificationClick}
        className="relative w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 border border-white/20 flex items-center justify-center text-white transition cursor-pointer shrink-0 shadow-xs"
        title="Xem thông báo"
      >
        <svg
          className="w-[19px] h-[19px] text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {notificationCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#EF4444] border-2 border-[#1E40AF] rounded-full animate-ping"></span>
        )}
        {notificationCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#EF4444] border-2 border-[#1E40AF] rounded-full"></span>
        )}
      </button>
    </header>
  );
};

export default Header;