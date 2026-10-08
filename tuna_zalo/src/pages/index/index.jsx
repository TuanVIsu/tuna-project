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
import { autoZaloLogin, getInitialUser } from "../../services/authService";

const API_BASE = "https://tuna-project.onrender.com/api";

function IndexPage() {
  const [activeTab, setActiveTab] = useState("home");
  const [currentUser, setCurrentUser] = useState(() => getInitialUser());
  const [showSchedule, setShowSchedule] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [academicProfile, setAcademicProfile] = useState(null);

  // States quản lý xác thực OTP
  const [authStep, setAuthStep] = useState(1); // 1: Nhập thông tin, 2: Nhập OTP
  const [emailUser, setEmailUser] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [className, setClassName] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const init = async () => {
      const user = await autoZaloLogin();
      if (user) setCurrentUser(user);
    };
    init();

    try {
      const savedProfile = localStorage.getItem("user_academic_profile");
      if (savedProfile && savedProfile !== "undefined") {
        setAcademicProfile(JSON.parse(savedProfile));
      }
    } catch (e) {}
  }, []);

  // Bộ đếm ngược thời gian gửi lại OTP
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // BƯỚC 1: Gửi mã OTP về email trường
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!emailUser.trim()) {
      setStatusMsg({ text: "Vui lòng nhập tên tài khoản Email trường!", type: "error" });
      return;
    }
    if (!studentCode.trim()) {
      setStatusMsg({ text: "Vui lòng nhập Mã số sinh viên (MSSV)!", type: "error" });
      return;
    }
    if (!fullName.trim()) {
      setStatusMsg({ text: "Vui lòng nhập Họ và tên sinh viên!", type: "error" });
      return;
    }

    setLoading(true);
    setStatusMsg({ text: "", type: "" });

    try {
      const cleanEmailUser = emailUser.trim().toLowerCase();
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          studentCode: cleanEmailUser,
          actualMssv: studentCode.trim().toUpperCase(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setAuthStep(2);
        setCountdown(60);
        setStatusMsg({
          text: `Mã OTP đã gửi về ${cleanEmailUser}@ctuet.edu.vn`,
          type: "success",
        });
      } else {
        setStatusMsg({ text: data.message || "Không thể gửi OTP đến email này!", type: "error" });
      }
    } catch (err) {
      setStatusMsg({ text: "Không thể kết nối đến máy chủ. Vui lòng thử lại sau!", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // BƯỚC 2: Kiểm tra OTP và kích hoạt tài khoản
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpValue || otpValue.trim().length < 6) {
      setStatusMsg({ text: "Vui lòng nhập đủ 6 chữ số OTP!", type: "error" });
      return;
    }

    setLoading(true);
    setStatusMsg({ text: "", type: "" });

    try {
      const cleanEmailUser = emailUser.trim().toLowerCase();
      const cleanMssv = studentCode.trim().toUpperCase();

      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentCode: cleanEmailUser,
          actualMssv: cleanMssv,
          otp: otpValue.trim(),
          name: fullName.trim(),
          className: className.trim() || "Chưa phân lớp",
          faculty: "Công nghệ thông tin",
        }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        const finalUser = {
          ...data.user,
          student_code: cleanMssv,
          name: fullName.trim(),
          class_name: className.trim() || data.user.class_name,
        };

        localStorage.setItem("user", JSON.stringify(finalUser));
        localStorage.setItem("tuna_current_user", JSON.stringify(finalUser));
        localStorage.setItem("tuna_user_id", finalUser.student_code);
        setCurrentUser(finalUser);
      } else {
        setStatusMsg({ text: data.message || "Mã OTP không chính xác hoặc đã hết hạn!", type: "error" });
      }
    } catch (err) {
      setStatusMsg({ text: "Lỗi kết nối máy chủ xác thực!", type: "error" });
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

  // MÀN HÌNH KHÓA: Bắt buộc xác thực danh tính qua email trường
  if (!currentUser) {
    return (
      <div className="position-fixed top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column align-items-center justify-content-center p-3 z-50">
        <div className="w-100 max-w-sm bg-white rounded-3xl p-5 shadow-2xl border border-slate-200">
          <div className="text-center mb-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#0045ce] flex items-center justify-center text-2xl mx-auto mb-2 shadow-inner">
              <i className="bi bi-shield-check"></i>
            </div>
            <h4 className="font-black text-slate-900 text-sm m-0">Xác Thực Sinh Viên</h4>
            <p className="text-[11px] text-slate-400 m-0 mt-0.5">
              Đăng nhập qua hòm thư trường <b>@ctuet.edu.vn</b>
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

          {authStep === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-2.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Email sinh viên trường *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="tên_tài_khoản"
                    value={emailUser}
                    onChange={(e) => setEmailUser(e.target.value.trim().toLowerCase())}
                    className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-black text-[#0045ce] focus:outline-none"
                  />
                  <span className="absolute right-2.5 top-2.5 text-[10.5px] font-bold text-slate-400">
                    @ctuet.edu.vn
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Mã Số Sinh Viên (MSSV) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập mã số sinh viên"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
                  className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Họ và Tên *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập đầy đủ họ và tên"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Lớp sinh hoạt
                </label>
                <input
                  type="text"
                  placeholder="Nhập mã lớp"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none"
                />
              </div>

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
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Nhập mã OTP (6 số từ email)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 text-center text-lg font-black tracking-widest text-[#0045ce] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text