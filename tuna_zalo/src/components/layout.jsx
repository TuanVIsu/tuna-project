// src/components/layout.jsx
import React, { useState } from "react";
import { Header } from "./Header";
import { BottomBar } from "./BottomBar";
import { NotificationModal } from "./NotificationModal";
import logoImg from "../static/logo.png";

// Avatar mặc định học sinh 3D
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80";

export const Layout = ({ children, activeTab, setActiveTab, currentUser }) => {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Chào buổi sáng";
    if (hour < 18) return "Chào buổi chiều";
    return "Chào buổi tối";
  };

  // Lấy họ tên đầy đủ từ props hoặc localStorage
  const getRawName = () => {
    if (currentUser?.name) return currentUser.name;
    try {
      const stored = localStorage.getItem("user") || localStorage.getItem("user_info");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.name) return parsed.name;
      }
    } catch (e) {}
    return localStorage.getItem("tuna_user_name") || "Sinh viên";
  };

  // Logic lấy 2 từ cuối của tên (Ví dụ: "Nguyễn Văn A" -> "Văn A")
  const formatDisplayName = (fullName) => {
    if (!fullName) return "Sinh viên";
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 2) return fullName.trim();
    return parts.slice(-2).join(" ");
  };

  const rawName = getRawName();
  const shortName = formatDisplayName(rawName);

  // Lấy avatar từ tài khoản, nếu không có thì dùng avatar 3D
  const userAvatar = currentUser?.avatar || (() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) return JSON.parse(stored).avatar;
    } catch (e) {}
    return null;
  })() || DEFAULT_AVATAR;

  return (
    <div className="flex flex-col h-screen w-full min-w-0 bg-[#F8FAFC] text-slate-800 font-sans select-none overflow-hidden relative">
      <Header
        logoUrl={logoImg}
        userName={shortName}
        avatarUrl={userAvatar}
        greeting={getGreeting()}
        notificationCount={unreadCount}
        onNotificationClick={() => {
          setShowNotificationModal(true);
          setUnreadCount(0);
        }}
      />

      <main className="flex-1 overflow-y-auto px-4 pt-3 w-full" style={{ paddingBottom: "calc(var(--bottom-bar-height, 68px) + var(--sab, 0px) + 16px)" }}>
        {children}
      </main>

      <BottomBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <NotificationModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        onNavigate={(tab) => {
          if (setActiveTab) setActiveTab(tab);
        }}
      />
    </div>
  );
};

export default Layout;