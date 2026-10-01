// tuna_zalo/src/pages/index/index.jsx
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
import { autoZaloLogin, handleZaloLogin, getInitialUser } from "../../services/authService";

function IndexPage() {
  const [activeTab, setActiveTab] = useState("home");
  const [currentUser, setCurrentUser] = useState(() => getInitialUser());
  const [showSchedule, setShowSchedule] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [academicProfile, setAcademicProfile] = useState(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const user = await autoZaloLogin();
      if (user) {
        setCurrentUser(user);
        setShowAuthPrompt(false);
      } else {
        const cached = localStorage.getItem("tuna_current_user");
        if (!cached || cached.includes("zalo_dev_")) {
          setShowAuthPrompt(true);
        }
      }
    };

    initAuth();

    try {
      const savedProfile = localStorage.getItem("user_academic_profile");
      if (savedProfile && savedProfile !== "undefined") {
        setAcademicProfile(JSON.parse(savedProfile));
      }
    } catch (e) {}
  }, []);

  const handleConnectZaloNow = async () => {
    setIsLoggingIn(true);
    try {
      const loggedUser = await handleZaloLogin();
      if (loggedUser) {
        setCurrentUser(loggedUser);
        setShowAuthPrompt(false);
      }
    } catch (err) {
      alert("Không thể kết nối Zalo: " + err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

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
        return (
          <DocsSection
            currentUser={currentUser}
            onNavigateToAIHub={() => setActiveTab("aihub")}
          />
        );
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

      {showAuthPrompt && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.75)", zIndex: 9999, backdropFilter: "blur(5px)" }}
        >
          <div className="bg-white rounded-3xl p-4 w-100 text-center shadow-2xl" style={{ maxWidth: "340px" }}>
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl mx-auto mb-3 shadow-inner">
              <i className="bi bi-shield-check"></i>
            </div>
            <h5 className="font-black text-slate-900 text-sm mb-1">Kết Nối Tài Khoản Zalo</h5>
            <p className="text-[11.5px] text-slate-500 mb-4 leading-relaxed font-medium">
              Đồng bộ họ tên, hình đại diện và dữ liệu học tập của bạn vào hệ thống TUNA.
            </p>
            <div className="d-flex flex-column gap-2">
              <button
                onClick={handleConnectZaloNow}
                disabled={isLoggingIn}
                className="w-100 py-2.5 bg-[#0068FF] text-white font-black rounded-xl border-0 shadow-md active:scale-95 transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
              >
                {isLoggingIn ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <>
                    <i className="bi bi-lightning-fill text-amber-300"></i> Cho phép kết nối Zalo
                  </>
                )}
              </button>
              <button
                onClick={() => setShowAuthPrompt(false)}
                className="w-100 py-2 bg-transparent text-slate-400 font-bold border-0 cursor-pointer text-xs"
              >
                Để sau (Dùng tài khoản mẫu)
              </button>
            </div>
          </div>
        </div>
      )}

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

export default IndexPage;