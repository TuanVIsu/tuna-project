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
import { autoZaloLogin, getInitialUser } from "../../services/authService";

const API_BASE = "https://tuna-project.onrender.com/api";

function IndexPage() {
  const [activeTab, setActiveTab] = useState("home");
  const [currentUser, setCurrentUser] = useState(() => getInitialUser());
  const [showSchedule, setShowSchedule] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // States quản lý xác thực thành viên
  const [email, setEmail] = useState("");
  const [userCode, setUserCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const init = async () => {
      const user = await autoZaloLogin();
      if (user) setCurrentUser(user);
    };
    init();
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setStatusMsg({ text: "Vui lòng nhập địa chỉ email của bạn!", type: "error" });
      return;
    }
    if (!cleanEmail.endsWith(".ctuet.edu.vn")) {
      setStatusMsg({ text: "Email phải có đuôi kết thúc bằng .ctuet.edu.vn!", type: "error" });
      return;
    }
    if (!userCode.trim()) {
      setStatusMsg({ text: "Vui lòng nhập MSSV hoặc Mã định danh!", type: "error" });
      return;
    }
    if (!fullName.trim()) {
      setStatusMsg({ text: "Vui lòng nhập Họ và tên!", type: "error" });
      return;
    }

    setLoading(true);
    setStatusMsg({ text: "", type: "" });

    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();

      if (data.success) {
        setOtpSent(true);
        setCountdown(60);
        setStatusMsg({
          text: `Mã OTP đã gửi về ${data.targetEmail || cleanEmail}`,
          type: "success",
        });
      } else {
        setStatusMsg({ text: data.message || "Không thể gửi OTP!", type: "error" });
      }
    } catch (err) {
      setStatusMsg({ text: "Không thể kết nối máy chủ xác thực!", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpValue || otpValue.trim().length < 6) {
      setStatusMsg({ text: "Vui lòng nhập đủ 6 chữ số OTP!", type: "error" });
      return;
    }

    setLoading(true);
    setStatusMsg({ text: "", type: "" });

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = userCode.trim().toUpperCase();

      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          userCode: cleanCode,
          otp: otpValue.trim(),
          name: fullName.trim(),
        }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        const finalUser = {
          ...data.user,
          student_code: cleanCode,
          name: fullName.trim(),
        };

        localStorage.setItem("user", JSON.stringify(finalUser));
        localStorage.setItem("tuna_current_user", JSON.stringify(finalUser));
        localStorage.setItem("tuna_user_id", finalUser.student_code);
        setCurrentUser(finalUser);
      } else {
        setStatusMsg({ text: data.message || "Mã OTP không đúng hoặc đã hết hạn!", type: "error" });
      }
    } catch (err) {
      setStatusMsg({ text: "Lỗi kết nối máy chủ khi xác thực!", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (target) => {
    if (target === "schedule") setShowSchedule(true);
    else if (target === "library") setShowLibrary(true);
    else if (["home", "timeline", "aihub", "tasks", "docs", "community", "profile", "streak"].includes(target)) {
      setActiveTab(target);
    } else if (target === "ranking") {
      setActiveTab("streak");
    }
  };

  // MÀN HÌNH KHÓA: Nhập email đuôi .ctuet.edu.vn và mã OTP
  if (!currentUser) {
    return (
      <div className="position-fixed top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column align-items-center justify-content-center p-3 z-50">
        <div className="w-100 max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200">
          <div className="text-center mb-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0045ce] flex items-center justify-center text-2xl mx-auto mb-2 shadow-inner">
              <i className="bi bi-shield-check"></i>
            </div>
            <h4 className="font-black text-slate-900 text-sm m-0">Xác Thực Thành Viên CTUT</h4>
            <p className="text-[11px] text-slate-400 m-0 mt-0.5">
              Dành cho tài khoản email kết thúc bằng <b>.ctuet.edu.vn</b>
            </p>
          </div>

          {statusMsg.text && (
            <div
              className={`p-2.5 rounded-xl text-xs font-semibold mb-3 leading-snug ${
                statusMsg.type === "error"
                  ? "bg-rose-50 text-rose-600 border border-rose-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="space-y-2.5">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Địa chỉ Email trường *
              </label>
              <input
                type="email"
                required
                disabled={otpSent}
                placeholder="Nhập email đuôi .ctuet.edu.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                className="w-full py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-black text-[#0045ce] focus:outline-none disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Mã Số Sinh Viên / Mã Cán Bộ *
              </label>
              <input
                type="text"
                required
                disabled={otpSent}
                placeholder="Nhập mã số cá nhân"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none uppercase disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                Họ và Tên *
              </label>
              <input
                type="text"
                required
                disabled={otpSent}
                placeholder="Nhập đầy đủ họ và tên"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none disabled:opacity-60"
              />
            </div>

            {otpSent && (
              <div className="pt-1">
                <label className="text-[11px] font-bold text-emerald-700 block mb-1">
                  Nhập mã OTP (6 chữ số trong email) *
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  className="w-full p-2.5 bg-emerald-50 rounded-xl border border-emerald-300 text-center text-lg font-black tracking-widest text-[#0045ce] focus:outline-none"
                />
              </div>
            )}

            {!otpSent ? (
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#0045ce] hover:bg-blue-700 text-white font-black rounded-xl text-xs border-0 cursor-pointer shadow-md active:scale-95 transition mt-2 flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <>
                    <i className="bi bi-send-fill"></i>
                    <span>Nhận mã OTP qua Email</span>
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs border-0 cursor-pointer shadow-md active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  {loading ? (
                    <span className="spinner-border spinner-border-sm"></span>
                  ) : (
                    <>
                      <i className="bi bi-check-circle-fill"></i>
                      <span>Xác nhận & Vào ứng dụng</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                      setOtpValue("");
                    }}
                    className="text-slate-400 hover:text-slate-600 font-bold border-0 bg-transparent cursor-pointer p-0"
                  >
                    ← Sửa lại thông tin
                  </button>

                  <button
                    type="button"
                    disabled={countdown > 0}
                    onClick={handleSendOtp}
                    className="text-[#0045ce] disabled:text-slate-400 font-bold border-0 bg-transparent cursor-pointer p-0"
                  >
                    {countdown > 0 ? `Gửi lại sau (${countdown}s)` : "Gửi lại OTP"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // Giao diện chính của ứng dụng
  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <HomeSection currentUser={currentUser} onNavigate={handleNavigate} />;
      case "streak":
        return <StreakLeaderboardSection currentUser={currentUser} onBack={() => setActiveTab("home")} />;
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
        return <DocsSection currentUser={currentUser} onNavigateToAIHub={() => setActiveTab("aihub")} />;
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

      <ScheduleModal isOpen={showSchedule} onClose={() => setShowSchedule(false)} />
      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        userMajor={currentUser?.faculty || "Hệ Thống Thông Tin"}
        onNavigateToDocs={() => {
          setShowLibrary(false);
          setActiveTab("docs");
        }}
      />
    </Layout>
  );
}

export default IndexPage;