// src/components/Header.jsx
import React from "react";

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80";

export const Header = ({
  userName = "Sinh viên",
  greeting = "Chào buổi tối",
  avatarUrl = "",
  logoUrl = "/src/static/logo.png",
  notificationCount = 1,
  onNotificationClick,
  onSearchClick,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full select-none shadow-xs">
      {/* TẦNG 1: TOP BAR */}
      <div className="bg-[#0045ce] text-white w-full">
        <div className="safe-top-spacer" style={{ height: "max(var(--sat, 0px), 38px)" }} />

        <div className="flex items-center justify-between px-4 h-[50px]">
          <div className="flex items-center gap-2.5 min-w-0 -translate-y-[6px]">
            <img
              src={logoUrl}
              alt="Logo"
              className="w-9 h-9 object-contain shrink-0"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
            <span className="text-[22px] font-bold tracking-tight text-white leading-none">
              TUNA
            </span>
          </div>

          <div className="w-[105px] h-full shrink-0 pointer-events-none" />
        </div>
      </div>

      {/* TẦNG 2: THÔNG TIN SINH VIÊN */}
      <div className="bg-white px-4 py-2.5 flex items-center justify-between border-b border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] w-full">
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          {/* Avatar dạng ảnh đại diện học tập */}
          <div className="relative w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-2xs shrink-0">
            <div className="w-full h-full rounded-full overflow-hidden bg-white p-[1px]">
              <img
                src={avatarUrl || DEFAULT_AVATAR}
                alt="Avatar"
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  e.target.src = DEFAULT_AVATAR;
                }}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-[14px] font-semibold text-slate-900 truncate block leading-snug">
              {greeting},{" "}
              <b className="text-[#0045ce] font-bold">{userName}!</b>
            </span>
            <span className="text-[11px] text-slate-400 font-normal block truncate mt-0.5">
              Hệ thống học tập & AI cá nhân hóa
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onSearchClick && (
            <button
              type="button"
              onClick={onSearchClick}
              className="w-9 h-9 rounded-full bg-slate-100/80 hover:bg-slate-200/80 flex items-center justify-center border-0 text-slate-700 transition active:scale-95 cursor-pointer"
              title="Tìm kiếm"
            >
              <i className="bi bi-search text-[15px]"></i>
            </button>
          )}

          <button
            type="button"
            onClick={onNotificationClick}
            className="relative w-9 h-9 rounded-full bg-slate-100/80 hover:bg-slate-200/80 flex items-center justify-center border-0 text-slate-700 transition active:scale-95 cursor-pointer"
            title="Thông báo"
          >
            <i className="bi bi-bell text-[16px]"></i>
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-[#ef4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;