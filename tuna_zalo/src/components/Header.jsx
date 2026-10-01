// src/components/Header.jsx
import React from "react";

export const Header = ({
  userName = "Sinh viên",
  greeting = "Chào buổi chiều",
  avatarUrl = "",
  logoUrl = "/src/static/logo.png",
  notificationCount = 1,
  onNotificationClick,
  onSearchClick,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full select-none shadow-sm">
      {/* ================= TẦNG 1: TOP BAR XANH NATIVE ================= */}
      <div className="bg-[#0052FF] text-white">
        {/* Khoảng đệm an toàn né vạch pin / giờ */}
        <div style={{ height: "env(safe-area-inset-top, 38px)" }} />

        <div className="flex items-center justify-between px-4 h-11">
          {/* Logo để nổi tự nhiên, không đóng khung hộp thô */}
          <div className="flex items-center gap-2">
<img
  src={logoUrl}
  alt="Logo"
  className="w-7 h-7 object-contain"
  style={{ filter: "drop-shadow(0 0 2px rgba(255, 255, 255, 0.9))" }}
  onError={(e) => {
    e.target.style.display = "none";
  }}
/>
            <span className="text-[17px] font-black tracking-wide text-white drop-shadow-xs">
              TUNA
            </span>
          </div>

          {/* Vùng chừa cho cụm nút Zalo Native (...) và (X) */}
          <div className="w-[88px] h-full" />
        </div>
      </div>

      {/* ================= TẦNG 2: THÔNG TIN SINH VIÊN ================= */}
      <div className="bg-white px-4 py-2.5 flex items-center justify-between border-b border-slate-100 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          {/* Avatar viền kép mỏng tinh tế, không dùng viền đỏ */}
          <div className="relative w-10 h-10 rounded-full p-0.5 bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-xs shrink-0">
            <div className="w-full h-full rounded-full overflow-hidden bg-white p-[1.5px]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-full"
                  onError={(e) => {
                    e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=1E40AF&color=fff&bold=true`;
                  }}
                />
              ) : (
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=1E40AF&color=fff&bold=true`}
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-full"
                />
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-800 truncate block leading-tight">
              {greeting},{" "}
              <b className="text-blue-600 font-extrabold">{userName}!</b>
            </span>
            <span className="text-[10px] text-slate-400 font-medium block truncate mt-0.5">
              Hệ thống học tập & AI cá nhân hóa
            </span>
          </div>
        </div>

        {/* Cụm công cụ bên phải */}
        <div className="flex items-center gap-1.5 shrink-0">


          <button
            type="button"
            onClick={onNotificationClick}
            className="relative w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center border-0 text-slate-600 transition active:scale-95 cursor-pointer"
            title="Thông báo"
          >
            <i className="bi bi-bell text-sm"></i>
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
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