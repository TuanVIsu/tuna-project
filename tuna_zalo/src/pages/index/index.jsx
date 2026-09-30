// src/pages/index/index.jsx
import React, { useState, useEffect } from "react";
import Layout from "../../components/layout";
import { HomeSection } from "./HomeSection";
import { AIHubSection } from "./AIHubSection";
import { ChatSection } from "./ChatSection";
import { DocsSection } from "./DocsSection";
import { TasksSection } from "./TasksSection";
import { TimelinePage } from "./TimelinePage";
import { ProfileSection } from "./ProfileSection";
import { StreakLeaderboardSection } from "./StreakLeaderboardSection";
import { ScheduleModal } from "../../components/ScheduleModal";
import { LibraryModal } from "../../components/LibraryModal";
import { handleZaloLogin } from "../../services/authService";

export default function IndexPage() {
  const [activeTab, setActiveTab] = useState("home");
  const [currentUser, setCurrentUser] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [academicProfile, setAcademicProfile] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const user = await handleZaloLogin();
        if (user) setCurrentUser(user);
      } catch (err) {
        console.error("Lỗi đăng nhập:", err);
      }
    };
    initAuth();

    try {
      const saved = localStorage.getItem("user_academic_profile");
      if (saved && saved !== "undefined") {
        setAcademicProfile(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Lỗi đọc dữ liệu học tập:", e);
    }
  }, []);

  const handleNavigate = (target) => {
    if (target === "schedule") {
      setShowSchedule(true);
    } else if (target === "library") {
      setShowLibrary(true);
    } else if (
      ["home", "timeline", "aihub", "tasks", "docs", "community", "profile", "streak"].includes(target)
    ) {
      setActiveTab(target);
    } else if (target === "ranking") {
      setActiveTab("streak");
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return (
          <HomeSection
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        );
      case "streak":
        return (
          <StreakLeaderboardSection
            currentUser={currentUser}
            onBack={() => setActiveTab("home")}
          />
        );
      case "timeline":
        return (
          <TimelinePage
            onBack={() => setActiveTab("home")}
            onNavigateToTasks={() => setActiveTab("tasks")}
            onNavigateToDocs={() => setActiveTab("docs")}
            onOpenScheduleModal={() => setShowSchedule(true)}
          />
        );
      case "aihub":
        return <AIHubSection currentUser={currentUser} onNavigate={handleNavigate} />;
      case "tasks":
        return <TasksSection currentUser={currentUser} onNavigate={handleNavigate} />;
      case "docs":
        return <DocsSection currentUser={currentUser} onNavigate={handleNavigate} />;
      case "community":
        return <ChatSection currentUser={currentUser} />;
      case "profile":
        return <ProfileSection currentUser={currentUser} />;
      default:
        return (
          <HomeSection
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <div key={activeTab} className="page-transition">
        {renderContent()}
      </div>

      {/* Modal Lịch học */}
      <ScheduleModal
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
      />

      {/* Modal Thư viện Admin & Video */}
      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        userMajor={academicProfile?.major || "Hệ Thống Thông Tin"}
        onNavigateToDocs={() => {
          setShowLibrary(false);
          setActiveTab("docs");
        }}
      />
    </Layout>
  );
}