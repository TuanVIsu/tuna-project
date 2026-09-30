// src/admin/AdminLayout.jsx
import React, { useState, useEffect, useRef } from "react";
import { AdminLogin } from "./AdminLogin";
import { ManageLibrary } from "./ManageLibrary";
import { ManageSchedules } from "./ManageSchedules";
import { ManageCurriculum } from "./ManageCurriculum";
import { ManageUsers } from "./ManageUsers";
import { ManageCommunity } from "./ManageCommunity";
import { ManageAI } from "./ManageAI";
import { AdminDashboard } from "./AdminDashboard";
import { ManageStaff } from "./ManageStaff";
import logoImg from "../assets/logo.png";
import "bootstrap-icons/font/bootstrap-icons.css";

const API_BASE = "http://localhost:5000/api";

export const AdminLayout = ({ onExitAdmin }) => {
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Quản lý thông báo Staff & Sinh viên chờ duyệt
  const [staffPendingCount, setStaffPendingCount] = useState(0);
  const [studentPendingCount, setStudentPendingCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotiDropdown, setShowNotiDropdown] = useState(false);
  const notiRef = useRef(null);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem("admin_profile");
      const savedToken = localStorage.getItem("admin_token");
      if (savedProfile && savedToken) {
        setCurrentAdmin(JSON.parse(savedProfile));
      }
    } catch (e) {}
  }, []);

  const fetchAllNotifications = async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) return;

    try {
      const headers = { Authorization: `Bearer ${token}` };

      let staffNotis = [];
      let sPending = 0;
      if (currentAdmin && currentAdmin.role === "super_admin") {
        try {
          const resStaff = await fetch(`${API_BASE}/admin/staff/notifications`, { headers });
          const dStaff = await resStaff.json();
          if (dStaff.success) {
            sPending = dStaff.totalPending || 0;
            staffNotis = (dStaff.notifications || []).map((n) => ({
              ...n,
              category: "staff",
              targetTab: "staff",
            }));
          }
        } catch (e) {}
      }

      let studentNotis = [];
      let uPending = 0;
      try {
        const resUser = await fetch(`${API_BASE}/admin/users/pending`, { headers });
        const dUser = await resUser.json();
        if (dUser.success && Array.isArray(dUser.data)) {
          uPending = dUser.data.length;
          studentNotis = dUser.data.slice(0, 5).map((u) => ({
            id: `student_${u.id}`,
            type: "student",
            category: "user",
            title: `Sinh viên: ${u.name}`,
            desc: `Xin vào lớp ${u.className || "Chưa rõ"} (MSSV: ${u.studentCode || "Chưa có"})`,
            time: u.createdAt || "Vừa gửi",
            targetTab: "users",
          }));
        }
      } catch (e) {}

      setStaffPendingCount(sPending);
      setStudentPendingCount(uPending);
      setNotifications([...studentNotis, ...staffNotis]);
    } catch (err) {
      console.error("Lỗi nạp thông báo:", err);
    }
  };

  useEffect(() => {
    if (currentAdmin) {
      fetchAllNotifications();
      const interval = setInterval(fetchAllNotifications, 15000);
      return () => clearInterval(interval);
    }
  }, [currentAdmin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notiRef.current && !notiRef.current.contains(e.target)) {
        setShowNotiDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_profile");
    setCurrentAdmin(null);
  };

  if (!currentAdmin) {
    return (
      <AdminLogin
        onLoginSuccess={(admin) => {
          setCurrentAdmin(admin);
          setActiveTab("dashboard");
        }}
        onBackToApp={onExitAdmin}
      />
    );
  }

  const totalNotiCount = staffPendingCount + studentPendingCount;

  const allMenuItems = [
    { id: "dashboard", label: "Tổng quan hệ thống", icon: "bi-grid-1x2-fill", roles: ["super_admin", "instructor"] },
    { id: "staff", label: "Tài khoản & Phê duyệt", icon: "bi-person-badge-fill", roles: ["super_admin"], badge: staffPendingCount },
    { id: "curriculum", label: "Khung CTĐT & Kế hoạch", icon: "bi-journal-bookmark-fill", roles: ["super_admin", "instructor"] },
    { id: "schedules", label: "Thời khóa biểu & Thi", icon: "bi-calendar3", roles: ["super_admin", "instructor"] },
    { id: "users", label: "Sinh viên & Học tập", icon: "bi-people-fill", roles: ["super_admin"], badge: studentPendingCount },
    { id: "library", label: "Học liệu & Bài giảng", icon: "bi-collection-play-fill", roles: ["super_admin", "instructor"] },
    { id: "ai", label: "Hệ thống AI & Token", icon: "bi-cpu-fill", roles: ["super_admin"] },
    { id: "community", label: "Kiểm duyệt Thảo luận", icon: "bi-chat-square-text-fill", roles: ["super_admin", "moderator"] },
  ];

  const visibleMenuItems = allMenuItems.filter((m) => {
    if (m.roles.includes(currentAdmin.role)) return true;
    if (currentAdmin.permissions && currentAdmin.permissions.includes(m.id)) return true;
    return false;
  });

  const getRoleBadge = (role) => {
    switch (role) {
      case "super_admin":
        return { text: "Super Admin", bg: "rgba(255, 255, 255, 0.22)", color: "#ffffff", border: "rgba(255, 255, 255, 0.4)" };
      case "instructor":
        return { text: "Giảng viên", bg: "rgba(255, 255, 255, 0.18)", color: "#ffffff", border: "rgba(255, 255, 255, 0.3)" };
      default:
        return { text: "Ban cán sự", bg: "rgba(254, 240, 138, 0.25)", color: "#fef08a", border: "rgba(254, 240, 138, 0.4)" };
    }
  };

  const roleMeta = getRoleBadge(currentAdmin.role);

  return (
    <div
      className="d-flex w-100 position-fixed top-0 start-0 z-3 overflow-hidden"
      style={{
        height: "100vh",
        backgroundColor: "#F1F5F9",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <style>{`
        .sidebar-item-btn {
          transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .sidebar-item-btn:hover:not(.active-tab) {
          background-color: rgba(255, 255, 255, 0.14) !important;
          color: #ffffff !important;
          transform: translateX(4px);
        }
        .sidebar-item-btn:hover:not(.active-tab) i {
          transform: scale(1.1);
          color: #ffffff !important;
        }
        .sidebar-item-btn.active-tab {
          transform: scale(1.01);
          box-shadow: 0 6px 16px -2px rgba(15, 23, 42, 0.25) !important;
        }
        .sidebar-item-btn.active-tab i {
          color: #1d4ed8 !important;
        }
        .action-icon-hover {
          transition: all 0.2s ease;
        }
        .action-icon-hover:hover {
          background-color: #f1f5f9 !important;
          transform: rotate(15deg) scale(1.05);
          color: #1d4ed8 !important;
        }
        .logout-btn-hover {
          transition: all 0.2s ease;
        }
        .logout-btn-hover:hover {
          background-color: rgba(239, 68, 68, 0.35) !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
        }
        .noti-item-hover {
          transition: background-color 0.15s ease, border-left-color 0.15s ease;
          border-left: 3px solid transparent;
        }
        .noti-item-hover:hover {
          background-color: #F8FAFC !important;
          border-left-color: #2563EB !important;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.4);
        }
      `}</style>

      {sidebarOpen && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-slate-900 bg-opacity-60 backdrop-blur-sm d-lg-none"
          style={{ zIndex: 1040, backdropFilter: "blur(4px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`d-flex flex-column justify-content-between p-3 flex-shrink-0 ${
          sidebarOpen ? "position-fixed top-0 start-0 h-100 shadow-2xl" : "d-none d-lg-flex position-relative h-100"
        }`}
        style={{
          width: "275px",
          minWidth: "275px",
          maxWidth: "275px",
          background: "linear-gradient(195deg, #1e40af 0%, #1e3a8a 60%, #172554 100%)",
          boxShadow: "6px 0 28px rgba(15, 23, 42, 0.16)",
          zIndex: 1050,
        }}
      >
        <div className="d-flex flex-column position-relative z-1 overflow-hidden">
          {/* Brand Header */}
          <div className="d-flex align-items-center justify-content-between px-2 py-2 mb-3">
            <div className="d-flex align-items-center gap-2.5 overflow-hidden">
{/* KHUNG LOGO BO TRÒN SQUIRCLE ĐỒNG DẠNG HÌNH MẪU */}
              <div
                className="d-flex align-items-center justify-content-center bg-white shadow-sm flex-shrink-0"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "16px",
                  padding: "5px",
                  boxShadow: "0 0 0 3px rgba(255, 255, 255, 0.25), 0 4px 12px rgba(0, 0, 0, 0.15)",
                  transition: "transform 0.25s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <img
                  src={logoImg}
                  alt="Logo"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </div>
              <div className="overflow-hidden">
                <h6 className="mb-0 fw-black text-white text-truncate d-flex align-items-center gap-1.5" style={{ fontSize: "15px", letterSpacing: "-0.2px" }}>
                       TUNA Portal
                  <span className="badge rounded-pill bg-blue-400 text-slate-950 px-1.5 py-0.5" style={{ fontSize: "9px" }}>PRO</span>
                </h6>
                <span style={{ color: "rgba(191, 219, 254, 0.8)", fontSize: "11px", fontWeight: "600" }}>
                       Quản Trị Đào Tạo
                </span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="btn btn-sm text-white d-lg-none p-1 rounded-circle hover:bg-white/20 transition"
            >
              <i className="bi bi-x-lg fs-5"></i>
            </button>
          </div>

          {/* Profile Card */}
          <div
            className="p-3 mb-3 text-white position-relative shadow-sm"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              borderRadius: "18px",
            }}
          >
            <div className="d-flex align-items-center justify-content-between mb-1.5">
              <span style={{ fontSize: "9.5px", fontWeight: "800", color: "#93c5fd", letterSpacing: "0.8px" }}>
                TÀI KHOẢN
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "700",
                  padding: "2px 8px",
                  borderRadius: "20px",
                  backgroundColor: roleMeta.bg,
                  color: roleMeta.color,
                  border: `1px solid ${roleMeta.border}`,
                  letterSpacing: "0.2px",
                }}
              >
                {roleMeta.text}
              </span>
            </div>
            <div className="text-white fw-bold text-truncate" style={{ fontSize: "13.5px" }}>
              {currentAdmin.full_name || "Ban Quản Trị Hệ Thống"}
            </div>
            <div className="text-truncate mt-0.5" style={{ color: "rgba(224, 242, 254, 0.75)", fontSize: "11px" }}>
              {currentAdmin.email || currentAdmin.username}
            </div>
          </div>

          {/* Menu Items */}
          <div className="d-flex flex-column gap-1.5 overflow-y-auto pe-1 custom-scrollbar" style={{ maxHeight: "calc(100vh - 295px)" }}>
            <span className="px-2 py-1 text-uppercase fw-extrabold" style={{ fontSize: "9.5px", color: "#93c5fd", opacity: 0.8, letterSpacing: "0.8px" }}>
              Phân Hệ Quản Lý
            </span>
            {visibleMenuItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                    fetchAllNotifications();
                  }}
                  className={`btn text-start d-flex align-items-center border-0 position-relative sidebar-item-btn ${
                    isActive ? "active-tab" : ""
                  }`}
                  style={{
                    padding: "9.5px 12px",
                    borderRadius: "13px",
                    fontSize: "12.5px",
                    fontWeight: isActive ? "800" : "600",
                    color: isActive ? "#1e40af" : "rgba(241, 245, 249, 0.88)",
                    backgroundColor: isActive ? "#ffffff" : "transparent",
                  }}
                >
                  <i
                    className={`bi ${item.icon}`}
                    style={{
                      fontSize: "16px",
                      marginRight: "11px",
                      transition: "transform 0.2s ease, color 0.2s ease",
                      color: isActive ? "#1e40af" : "rgba(191, 219, 254, 0.75)",
                    }}
                  ></i>
                  <span className="text-truncate flex-grow-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span
                      className="badge rounded-pill bg-rose-500 text-white ms-auto me-1 shadow-sm"
                      style={{ fontSize: "10px", padding: "3px 6.5px", fontWeight: "800" }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <i className="bi bi-chevron-right ms-auto fw-bold" style={{ fontSize: "11px", color: "#1e40af" }}></i>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Sidebar */}
        <div className="pt-3 d-flex flex-column gap-2 position-relative z-1" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.12)" }}>
          <button
            onClick={handleLogout}
            className="btn text-start d-flex align-items-center border-0 px-3 py-2.5 text-white logout-btn-hover"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.22)", fontSize: "12.5px", fontWeight: "700", borderRadius: "12px" }}
          >
            <i className="bi bi-box-arrow-right me-2.5 fs-6 text-rose-300"></i>
            <span>Đăng xuất hệ thống</span>
          </button>
        </div>
      </aside>

      {/* KHUNG NỘI DUNG CHÍNH */}
      <div className="flex-grow-1 d-flex flex-column overflow-hidden h-100 min-vw-0" style={{ backgroundColor: "#F8FAFC" }}>
        {/* Header */}
        <header
          className="px-3 px-md-4 py-2 border-bottom d-flex align-items-center justify-content-between z-2 flex-shrink-0 bg-white"
          style={{ borderColor: "#E2E8F0", height: "62px", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}
        >
          <div className="d-flex align-items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="btn btn-light d-lg-none p-1.5 rounded-2xl border me-1 d-flex align-items-center justify-content-center action-icon-hover"
              style={{ width: "38px", height: "38px" }}
            >
              <i className="bi bi-list fs-5 text-slate-700"></i>
            </button>

            <span className="text-slate-400 small fw-semibold d-none d-sm-inline" style={{ fontSize: "12.5px" }}>
              Hệ thống quản trị
            </span>
            <span className="text-slate-300 small d-none d-sm-inline font-bold">/</span>
            <div className="d-flex align-items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 d-inline-block"></span>
              <h6 className="mb-0 fw-black text-truncate" style={{ fontSize: "14px", color: "#1e3a8a" }}>
                {allMenuItems.find((m) => m.id === activeTab)?.label || "Tổng quan"}
              </h6>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2 gap-sm-3">
            {/* Chuông thông báo */}
            <div className="position-relative" ref={notiRef}>
              <button
                onClick={() => setShowNotiDropdown(!showNotiDropdown)}
                className="btn btn-light rounded-circle position-relative border d-flex align-items-center justify-content-center p-0 action-icon-hover"
                style={{ width: "38px", height: "38px", backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" }}
              >
                <i className="bi bi-bell-fill text-slate-500 fs-6"></i>
                {totalNotiCount > 0 && (
                  <span
                    className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-white shadow-sm"
                    style={{ fontSize: "9px", padding: "3.5px 5.5px", animation: "pulse 2s infinite" }}
                  >
                    {totalNotiCount}
                  </span>
                )}
              </button>

              {showNotiDropdown && (
                <div
                  className="position-absolute end-0 mt-2 card border-0 shadow-2xl rounded-4 overflow-hidden z-3"
                  style={{
                    width: "min(350px, 92vw)",
                    border: "1px solid #e2e8f0",
                    animation: "fadeIn 0.15s ease-out forwards",
                  }}
                >
                  <div className="p-3 border-bottom bg-slate-50 d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-1.5">
                      <i className="bi bi-bell-fill text-blue-600"></i>
                      <h6 className="mb-0 fw-black text-slate-900" style={{ fontSize: "13px" }}>Yêu Cầu Chờ Duyệt</h6>
                    </div>
                    <span className="badge bg-rose-500 text-white rounded-pill font-bold" style={{ fontSize: "10.5px" }}>
                      {totalNotiCount} yêu cầu
                    </span>
                  </div>

                  <div className="overflow-y-auto" style={{ maxHeight: "290px" }}>
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-muted small">
                        <i className="bi bi-check2-circle fs-2 text-emerald-500 d-block mb-1.5"></i>
                        Không có yêu cầu nào đang chờ duyệt.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            setActiveTab(n.targetTab);
                            setShowNotiDropdown(false);
                          }}
                          className="p-3 border-bottom bg-white noti-item-hover cursor-pointer"
                        >
                          <div className="d-flex align-items-center justify-content-between mb-1">
                            <span
                              className={`badge rounded-md font-extrabold ${
                                n.type === "student"
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : "bg-blue-100 text-blue-900 border border-blue-300"
                              }`}
                              style={{ fontSize: "9px" }}
                            >
                              {n.type === "student" ? "XIN VÀO LỚP" : n.type === "access" ? "CẤP QUYỀN" : "MẬT KHẨU"}
                            </span>
                            <small className="text-slate-400 font-semibold" style={{ fontSize: "10px" }}>{n.time}</small>
                          </div>
                          <div className="fw-black text-slate-800 small text-truncate">{n.title}</div>
                          <small className="text-slate-500 d-block text-truncate mt-0.5">{n.desc}</small>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-2.5 border-top bg-slate-50 d-flex justify-content-between">
                    {studentPendingCount > 0 && (
                      <button
                        onClick={() => {
                          setActiveTab("users");
                          setShowNotiDropdown(false);
                        }}
                        className="btn btn-link btn-sm text-decoration-none fw-bold p-0 text-amber-700 hover:text-amber-800"
                        style={{ fontSize: "11px" }}
                      >
                        Duyệt sinh viên ({studentPendingCount}) →
                      </button>
                    )}
                    {staffPendingCount > 0 && currentAdmin.role === "super_admin" && (
                      <button
                        onClick={() => {
                          setActiveTab("staff");
                          setShowNotiDropdown(false);
                        }}
                        className="btn btn-link btn-sm text-decoration-none fw-bold p-0 text-blue-700 hover:text-blue-800 ms-auto"
                        style={{ fontSize: "11px" }}
                      >
                        Duyệt Staff ({staffPendingCount}) →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Trạng thái hệ thống */}
            <span
              className="badge rounded-pill d-none d-sm-flex align-items-center gap-1.5 px-3 py-1.5 shadow-2xs"
              style={{ backgroundColor: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", fontSize: "11.5px", fontWeight: "700" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              Trực tuyến
            </span>
          </div>
        </header>

        {/* Nội dung View */}
        <main className="p-3 p-md-4 flex-grow-1 overflow-y-auto w-100" style={{ backgroundColor: "#F8FAFC" }}>
          {activeTab === "dashboard" && <AdminDashboard onNavigate={setActiveTab} />}
          {activeTab === "staff" && <ManageStaff />}
          {activeTab === "curriculum" && <ManageCurriculum />}
          {activeTab === "schedules" && <ManageSchedules />}
          {activeTab === "users" && <ManageUsers />}
          {activeTab === "library" && <ManageLibrary />}
          {activeTab === "ai" && <ManageAI />}
          {activeTab === "community" && <ManageCommunity />}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;