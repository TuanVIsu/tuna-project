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
import { getInitialUser } from "../../services/authService";

export default function IndexPage() {
  const [activeTab, setActiveTab] = useState("home");
  const [currentUser, setCurrentUser] = useState(() => getInitialUser());
  const [showSchedule, setShowSchedule] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [academicProfile, setAcademicProfile] = useState(null);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem("user_academic_profile");
      if (savedProfile && savedProfile !== "undefined") {
        setAcademicProfile(JSON.parse(savedProfile));
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
        return <HomeSection currentUser={currentUser} onNavigate={handleNavigate} />;
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
        return <HomeSection currentUser={currentUser} onNavigate={handleNavigate} />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <div key={activeTab} className="page-transition">
        {renderContent()}
      </div>

      <ScheduleModal
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
      />

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