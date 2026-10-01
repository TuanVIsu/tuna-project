// src/components/layout.jsx
import React, { useState } from "react";
import { Header } from "./Header";
import { BottomBar } from "./BottomBar";
import { NotificationModal } from "./NotificationModal";
import logoImg from "../static/logo.png";

export const Layout = ({ children, activeTab, setActiveTab, currentUser }) => {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(1);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Chào buổi sáng";
    if (hour < 18) return "Chào buổi chiều";
    return "Chào buổi tối";
  };

  const displayName = currentUser?.name || localStorage.getItem("tuna_user_name") || "Minh";

  return (
    <div className="flex flex-col h-screen w-full min-w-0 bg-[#F8FAFC] text-slate-800 font-sans select-none overflow-hidden relative">
      {/* Header tự quản lý safe-area chính xác */}
      <Header
        logoUrl={logoImg}
        userName={displayName}
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