// src/admin/AdminDashboard.jsx
import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || (
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "https://tuna-project.onrender.com/api" // hoặc "http://localhost:5000/api" nếu bạn chạy backend ở máy
    : "https://tuna-project.onrender.com/api"
);

export const AdminDashboard = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);

  const [stats, setStats] = useState({
    totalDocs: 0,
    totalVideos: 0,
    totalSchedules: 0,
    totalUsers: 0,
    totalMessages: 0,
    pendingStudents: 0,
    pendingStaff: 0,
  });

  const [aiData, setAiData] = useState({
    dailyTokens: 0,
    dailyCost: 0,
    totalRequests: 0,
    tokenLimit: 15000,
    enabled: true,
    cacheHours: 24,
    modelName: "Gemini 1.5 Flash",
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const [topStreaks, setTopStreaks] = useState([]);
  const [topResources, setTopResources] = useState([]);

  const getHeaders = () => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, { headers: getHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          setStats({
            totalDocs: d.totalDocs || 0,
            totalVideos: d.totalVideos || 0,
            totalSchedules: d.totalSchedules || 0,
            totalUsers: d.totalStudents || 0,
            totalMessages: d.totalMessages || 0,
            pendingStudents: d.pendingStudents || 0,
            pendingStaff: d.pendingStaff || 0,
          });

          if (d.ai) setAiData(d.ai);
          if (d.auditLogs) setAuditLogs(d.auditLogs);
          if (d.topStreaks) setTopStreaks(d.topStreaks);
          if (d.topResources) setTopResources(d.topResources);
        }
      }
    } catch (e) {
      console.error("Lỗi đồng bộ Dashboard từ backend:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleToggleAi = async () => {
    const targetStatus = !aiData.enabled;
    setTogglingAi(true);
    try {
      const res = await fetch(`${API_BASE}/admin/toggle-ai`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ enabled: targetStatus }),
      });
      if (res.ok) {
        setAiData((prev) => ({ ...prev, enabled: targetStatus }));
        fetchDashboardData();
      }
    } catch (e) {
      console.error("Lỗi bật/tắt AI:", e);
    } finally {
      setTogglingAi(false);
    }
  };

  const totalPending = stats.pendingStudents + stats.pendingStaff;
  const tokenUsagePercent = aiData.tokenLimit > 0
    ? Math.min(Math.round((aiData.dailyTokens / aiData.tokenLimit) * 100), 100)
    : 0;

  const statCards = [
    { label: "Sinh Viên Đã Duyệt", value: stats.totalUsers, sub: "Đang truy cập Mini App", icon: "bi-person-check-fill", accent: "#10b981", iconBg: "#ecfdf5", action: "users" },
    { label: "Chờ Phê Duyệt Lớp", value: stats.pendingStudents, sub: "Hồ sơ sinh viên đăng ký", icon: "bi-mortarboard-fill", accent: "#f59e0b", iconBg: "#fffbeb", action: "users", highlight: stats.pendingStudents > 0 },
    { label: "Thời Khóa Biểu & Thi", value: stats.totalSchedules, sub: "Học phần được xếp lịch", icon: "bi-calendar3-range-fill", accent: "#6366f1", iconBg: "#eef2ff", action: "schedules" },
    { label: "Tài Liệu Học Tập", value: stats.totalDocs, sub: "Giáo trình, slide PDF", icon: "bi-file-earmark-text-fill", accent: "#ef4444", iconBg: "#fef2f2", action: "library" },
    { label: "Video Bài Giảng", value: stats.totalVideos, sub: "Bài giảng trực tuyến", icon: "bi-play-circle-fill", accent: "#2563eb", iconBg: "#eff6ff", action: "library" },
    { label: "Thảo Luận Diễn Đàn", value: stats.totalMessages, sub: "Tương tác cộng đồng", icon: "bi-chat-dots-fill", accent: "#06b6d4", iconBg: "#ecfeff", action: "community" },
  ];

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
        padding: "16px 20px 32px 20px",
      }}
      className="d-flex flex-column gap-3.5"
    >
      {/* 1. Header Banner */}
      <div
        className="rounded-4 p-4 text-white shadow-sm position-relative overflow-hidden w-100"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #4338ca 100%)",
        }}
      >
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
          <div>
            <span
              className="badge rounded-pill px-3 py-1.5 mb-2 fw-semibold"
              style={{ background: "rgba(255, 255, 255, 0.2)", backdropFilter: "blur(6px)" }}
            >
              Hệ Thống Quản Trị Cổng Đào Tạo 
            </span>
            <h4 className="fw-black mb-1 tracking-tight">Bảng Điều Khiển Trung Tâm</h4>
            <p className="mb-0 text-white-50 small">
              Giám sát hạn mức AI Gemini, chuỗi học tập sinh viên và nhật ký vận hành hệ thống Zalo Mini App.
            </p>
          </div>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="btn btn-light rounded-pill px-3.5 py-2 fw-bold d-inline-flex align-items-center gap-2 shadow-sm text-primary"
            style={{ fontSize: "13px" }}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? "spinner-border spinner-border-sm" : ""}`}></i>
            {loading ? "Đang đồng bộ..." : "Đồng bộ dữ liệu"}
          </button>
        </div>
      </div>

      {/* 2. Banner Thông Báo Yêu Cầu Chờ Xử Lý */}
      {totalPending > 0 && (
        <div
          className="rounded-4 p-3.5 border d-flex align-items-center justify-content-between flex-wrap gap-2 shadow-xs w-100"
          style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
        >
          <div className="d-flex align-items-center gap-3">
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "42px", height: "42px", backgroundColor: "#fef3c7", color: "#b45309" }}
            >
              <i className="bi bi-bell-fill fs-5"></i>
            </span>
            <div>
              <div className="fw-bold text-dark" style={{ fontSize: "13.5px" }}>
                Hệ thống đang có {totalPending} yêu cầu chờ phê duyệt
              </div>
              <div className="text-secondary small">
                Gồm <b>{stats.pendingStudents}</b> sinh viên đăng ký lớp và <b>{stats.pendingStaff}</b> yêu cầu cấp quyền quản trị.
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            {stats.pendingStudents > 0 && (
              <button
                onClick={() => onNavigate && onNavigate("users")}
                className="btn btn-sm btn-warning text-white fw-bold px-3 py-1.5 rounded-pill border-0 shadow-xs"
                style={{ fontSize: "12px", backgroundColor: "#d97706" }}
              >
                Duyệt sinh viên ({stats.pendingStudents}) →
              </button>
            )}
            {stats.pendingStaff > 0 && (
              <button
                onClick={() => onNavigate && onNavigate("staff")}
                className="btn btn-sm btn-outline-dark fw-bold px-3 py-1.5 rounded-pill"
                style={{ fontSize: "12px" }}
              >
                Duyệt Staff ({stats.pendingStaff}) →
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. LƯỚI 6 THẺ THỐNG KÊ (ĐƯỢC BỌC TRONG CARD CONTAINER ĐỒNG BỘ) */}
      <div className="card border rounded-4 bg-white shadow-xs w-100 overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <div className="fw-bold text-dark d-flex align-items-center gap-2.5" style={{ fontSize: "14px" }}>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "28px", height: "28px", backgroundColor: "#eff6ff", color: "#2563eb" }}
            >
              <i className="bi bi-speedometer2" style={{ fontSize: "13px" }}></i>
            </span>
            <span>Chỉ Số Học Vụ & Nền Tảng</span>
          </div>
          <span className="text-muted small">Cập nhật trực tiếp từ hệ thống</span>
        </div>

        <div className="p-3.5">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "12px",
              width: "100%",
            }}
          >
            {statCards.map((c, idx) => (
              <div
                key={idx}
                onClick={() => onNavigate && onNavigate(c.action)}
                className="border rounded-3 p-3 bg-white position-relative d-flex flex-column justify-content-between"
                style={{
                  cursor: "pointer",
                  borderColor: "#e2e8f0",
                  minHeight: "120px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.06)";
                  e.currentTarget.style.borderColor = c.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                }}
              >
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div className="pe-2">
                    <span
                      className="fw-bold text-secondary text-uppercase d-block"
                      style={{ fontSize: "11px", letterSpacing: "0.5px" }}
                    >
                      {c.label}
                    </span>
                    <div className="fw-black text-dark my-1" style={{ fontSize: "26px", lineHeight: "1.2" }}>
                      {loading ? "..." : c.value.toLocaleString()}
                    </div>
                  </div>
                  <div
                    className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                    style={{
                      width: "42px",
                      height: "42px",
                      backgroundColor: c.iconBg,
                      color: c.accent,
                      fontSize: "19px",
                    }}
                  >
                    <i className={`bi ${c.icon}`}></i>
                  </div>
                </div>

                <div className="d-flex justify-content-between align-items-center pt-2 mt-auto border-top border-light-subtle">
                  <span className="text-muted small">{c.sub}</span>
                  <i className="bi bi-chevron-right text-muted small"></i>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Thao Tác Nhanh */}
      <div className="card border rounded-4 bg-white shadow-xs w-100 overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <div className="fw-bold text-dark d-flex align-items-center gap-2.5" style={{ fontSize: "14px" }}>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "28px", height: "28px", backgroundColor: "#fef3c7", color: "#d97706" }}
            >
              <i className="bi bi-lightning-charge-fill" style={{ fontSize: "13px" }}></i>
            </span>
            <span>Thao Tác Nhanh</span>
          </div>
          <span className="text-muted small">Các phân hệ quản trị hay sử dụng</span>
        </div>

        <div className="p-3.5">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px",
              width: "100%",
            }}
          >
            {[
              { label: "Duyệt Sinh Viên", sub: "Xét hồ sơ vào lớp", icon: "bi-person-check", action: "users", color: "#059669", bg: "#ecfdf5" },
              { label: "Quản Lý Lịch Học", sub: "Lịch thi & thực hành", icon: "bi-calendar-plus", action: "schedules", color: "#2563eb", bg: "#eff6ff" },
              { label: "Thêm Tài Liệu", sub: "Giáo trình, slide PDF", icon: "bi-cloud-arrow-up", action: "library", color: "#dc2626", bg: "#fef2f2" },
              { label: "Phân Quyền Staff", sub: "Quản lý ban cán sự", icon: "bi-shield-lock", action: "staff", color: "#4b5563", bg: "#f3f4f6" },
            ].map((act, idx) => (
              <div
                key={idx}
                onClick={() => onNavigate && onNavigate(act.action)}
                className="p-3 rounded-3 border bg-white d-flex align-items-center gap-3"
                style={{
                  cursor: "pointer",
                  borderColor: "#e2e8f0",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = act.bg;
                  e.currentTarget.style.borderColor = act.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: "42px",
                    height: "42px",
                    backgroundColor: act.bg,
                    color: act.color,
                    fontSize: "20px",
                  }}
                >
                  <i className={`bi ${act.icon}`}></i>
                </div>
                <div className="overflow-hidden">
                  <div className="fw-bold text-dark text-truncate" style={{ fontSize: "13px" }}>
                    {act.label}
                  </div>
                  <small className="text-secondary d-block text-truncate" style={{ fontSize: "11px" }}>
                    {act.sub}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. CỤM TRỌNG TÂM: GATEWAY GEMINI AI & BÁO CÁO TƯƠNG TÁC */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "14px",
          width: "100%",
        }}
      >
        {/* Widget 5.1: Gateway Gemini AI */}
        <div className="card border rounded-4 bg-white d-flex flex-column justify-content-between shadow-xs overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
          <div>
            <div className="d-flex align-items-center justify-content-between px-4 py-3 border-bottom">
              <div className="fw-bold text-dark d-flex align-items-center gap-2.5" style={{ fontSize: "14px" }}>
                <span
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: "28px", height: "28px", backgroundColor: "#eff6ff", color: "#2563eb" }}
                >
                  <i className="bi bi-cpu-fill" style={{ fontSize: "13px" }}></i>
                </span>
                <span>Gateway Gemini AI</span>
              </div>
              <div className="form-check form-switch mb-0 d-flex align-items-center gap-2">
                <input
                  className="form-check-input cursor-pointer m-0"
                  type="checkbox"
                  role="switch"
                  checked={aiData.enabled}
                  disabled={togglingAi}
                  onChange={handleToggleAi}
                  style={{ cursor: "pointer" }}
                />
                <label className="form-check-label small fw-semibold text-muted">
                  {aiData.enabled ? "Hoạt động" : "Tạm dừng"}
                </label>
              </div>
            </div>

            <div className="p-3.5">
              {/* Đồng hồ Token từ CSDL */}
              <div className="p-3 rounded-3 mb-3 border" style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}>
                <div className="d-flex justify-content-between align-items-center mb-1.5">
                  <span className="text-secondary small">Tokens hôm nay:</span>
                  <span className="fw-bold text-dark">{aiData.dailyTokens.toLocaleString()} / {aiData.tokenLimit.toLocaleString()}</span>
                </div>
                <div className="progress rounded-pill bg-secondary-subtle" style={{ height: "8px" }}>
                  <div
                    className={`progress-bar rounded-pill ${tokenUsagePercent > 80 ? "bg-danger" : tokenUsagePercent > 50 ? "bg-warning" : "bg-primary"}`}
                    role="progressbar"
                    style={{ width: `${tokenUsagePercent}%` }}
                  ></div>
                </div>
                <div className="text-end mt-1">
                  <small className="text-muted" style={{ fontSize: "11px" }}>Đã dùng {tokenUsagePercent}% định mức ngày</small>
                </div>
              </div>

              {/* Chi phí & số lượt từ CSDL */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div className="p-2.5 rounded-3 border bg-white text-center" style={{ borderColor: "#e2e8f0" }}>
                  <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Chi phí ước tính</span>
                  <span className="fw-bold text-success fs-5">${aiData.dailyCost.toFixed(4)}</span>
                </div>
                <div className="p-2.5 rounded-3 border bg-white text-center" style={{ borderColor: "#e2e8f0" }}>
                  <span className="text-secondary d-block" style={{ fontSize: "11px" }}>Lượt gọi API</span>
                  <span className="fw-bold text-primary fs-5">{aiData.totalRequests.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-2.5 border-top border-light-subtle text-muted small d-flex justify-content-between align-items-center">
            <span>Mô hình: <b>{aiData.modelName}</b></span>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              Cache {aiData.cacheHours}h
            </span>
          </div>
        </div>

        {/* Widget 5.2: Báo Cáo Tương Tác Học Tập & Chuỗi Streak */}
        <div className="card border rounded-4 bg-white shadow-xs overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
          <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
            <div className="fw-bold text-dark d-flex align-items-center gap-2.5" style={{ fontSize: "14px" }}>
              <span
                className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: "28px", height: "28px", backgroundColor: "#fef2f2", color: "#dc2626" }}
              >
                <i className="bi bi-fire" style={{ fontSize: "13px" }}></i>
              </span>
              <span>Tương Tác Học Tập & Bảng Vàng Streak</span>
            </div>
            <span className="text-muted small">Cập nhật theo chu kỳ hàng ngày</span>
          </div>

          <div className="p-3.5">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              {/* Bảng Vàng Top Streak từ CSDL */}
              <div className="border-end-md pe-md-2">
                <div className="fw-semibold text-secondary mb-2" style={{ fontSize: "11.5px", letterSpacing: "0.3px" }}>
                  TOP SINH VIÊN DUY TRÌ HỌC TẬP (STREAK)
                </div>
                {topStreaks.length > 0 ? (
                  <div className="d-flex flex-column gap-2">
                    {topStreaks.map((st, i) => (
                      <div
                        key={i}
                        className="d-flex align-items-center justify-content-between p-2 rounded-3 border"
                        style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}
                      >
                        <div className="d-flex align-items-center gap-2.5 overflow-hidden pe-2">
                          <span
                            className={`rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0 ${
                              i === 0 ? "bg-warning" : i === 1 ? "bg-secondary" : "bg-dark-subtle text-dark"
                            }`}
                            style={{ width: "24px", height: "24px", fontSize: "11px" }}
                          >
                            {i + 1}
                          </span>
                          <div className="text-truncate">
                            <div className="fw-bold text-dark text-truncate" style={{ fontSize: "12.5px" }}>
                              {st.student_name}
                            </div>
                            <small className="text-secondary d-block" style={{ fontSize: "11px" }}>
                              {st.class_name || st.user_id}
                            </small>
                          </div>
                        </div>
                        <span className="badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle px-2 py-1 fw-bold flex-shrink-0">
                          🔥 {st.current_streak} ngày
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted text-center py-4 small">Chưa có dữ liệu streak sinh viên.</div>
                )}
              </div>

              {/* Học liệu tương tác cao từ CSDL */}
              <div>
                <div className="fw-semibold text-secondary mb-2" style={{ fontSize: "11.5px", letterSpacing: "0.3px" }}>
                  HỌC LIỆU TƯƠNG TÁC CAO TRONG KHO
                </div>
                {topResources.length > 0 ? (
                  <div className="d-flex flex-column gap-2">
                    {topResources.map((res, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-3 border bg-white d-flex align-items-center justify-content-between"
                        style={{ borderColor: "#f1f5f9" }}
                      >
                        <div className="d-flex align-items-center gap-2 overflow-hidden pe-2">
                          <i
                            className={`bi ${
                              res.resource_type === "video" ? "bi-play-btn-fill text-primary" : "bi-file-earmark-pdf-fill text-danger"
                            } fs-5 flex-shrink-0`}
                          ></i>
                          <div className="text-truncate">
                            <span className="fw-semibold text-dark d-block text-truncate" style={{ fontSize: "12px" }}>
                              {res.title}
                            </span>
                            <small className="text-secondary" style={{ fontSize: "10.5px" }}>
                              {res.file_type || (res.resource_type === "video" ? "MP4 / YouTube" : "Tài liệu")}
                            </small>
                          </div>
                        </div>
                        <span className="badge bg-light text-secondary border px-1.5 py-1 flex-shrink-0" style={{ fontSize: "10.5px" }}>
                          👁 {res.view_count || 0} • ⬇ {res.download_count || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted text-center py-4 small">Chưa có dữ liệu học liệu.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. NHẬT KÝ HOẠT ĐỘNG & KIỂM VẾT HỆ THỐNG */}
      <div className="card border rounded-4 bg-white shadow-xs w-100 overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom">
          <div className="fw-bold text-dark d-flex align-items-center gap-2.5" style={{ fontSize: "14px" }}>
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "28px", height: "28px", backgroundColor: "#ecfdf5", color: "#059669" }}
            >
              <i className="bi bi-shield-check" style={{ fontSize: "13px" }}></i>
            </span>
            <span>Nhật Ký Hoạt Động & Kiểm Vết (Audit Logs)</span>
          </div>
          <span className="text-muted small">Lịch sử thao tác của các cấp quản trị viên</span>
        </div>

        {/* Khung cuộn giới hạn 240px */}
        <div
          style={{
            maxHeight: "240px",
            overflowY: "auto",
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 #f8fafc",
          }}
          className="w-100"
        >
          <table className="table table-hover align-middle mb-0" style={{ fontSize: "12.5px" }}>
            <thead
              className="table-light text-secondary border-bottom position-sticky top-0 z-1"
              style={{ backgroundColor: "#f8fafc" }}
            >
              <tr>
                <th style={{ width: "20%", paddingLeft: "24px" }}>Quản Trị Viên</th>
                <th style={{ width: "15%" }}>Vai Trò</th>
                <th style={{ width: "22%" }}>Hành Động</th>
                <th style={{ width: "28%" }}>Chi Tiết Thao Tác</th>
                <th style={{ width: "15%", paddingRight: "24px" }} className="text-end">Thời Gian</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length > 0 ? (
                auditLogs.map((log, idx) => (
                  <tr key={idx}>
                    <td className="fw-bold text-dark" style={{ paddingLeft: "24px" }}>
                      {log.actor_name || "Admin"}
                    </td>
                    <td>
                      <span
                        className={`badge rounded-pill px-2.5 py-1 ${
                          log.actor_role === "super_admin"
                            ? "bg-danger-subtle text-danger border border-danger-subtle"
                            : log.actor_role === "instructor"
                            ? "bg-primary-subtle text-primary border border-primary-subtle"
                            : "bg-secondary-subtle text-secondary border border-secondary-subtle"
                        }`}
                        style={{ fontSize: "10.5px" }}
                      >
                        {log.actor_role === "super_admin" ? "Super Admin" : log.actor_role === "instructor" ? "Giảng viên" : "Moderator"}
                      </span>
                    </td>
                    <td>
                      <span className="font-monospace fw-semibold text-dark">{log.action}</span>
                    </td>
                    <td className="text-secondary text-truncate" style={{ maxWidth: "300px" }}>
                      {log.details || log.target || "Thực hiện thành công"}
                    </td>
                    <td className="text-end text-muted" style={{ paddingRight: "24px" }}>
                      {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •{" "}
                      {new Date(log.created_at).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-muted">
                    Hệ thống chưa ghi nhận sự kiện kiểm vết nào trong CSDL.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;