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
    <div 
      className="flex flex-col h-screen w-full max-w-[420px] mx-auto bg-gradient-to-b from-[#FFFFFF] via-[#FFFFFF] to-[#F7F9FC] text-slate-800 font-sans select-none overflow-hidden relative shadow-2xl"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Header */}
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

      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-3 w-full">
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