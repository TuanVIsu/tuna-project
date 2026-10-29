// src/admin/AdminDashboard.jsx
import React, { useState, useEffect, useMemo } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const AdminDashboard = ({ onNavigate, currentAdmin }) => {
  const [loading, setLoading] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);
  const [actionAlert, setActionAlert] = useState("");

  const isSuperAdmin = currentAdmin?.role === "super_admin";

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

  // Bật / tắt AI: Chặn ngay nếu không phải Super Admin
  const handleToggleAi = async () => {
    if (!isSuperAdmin) {
      setActionAlert("Bạn không có quyền thay đổi trạng thái Gemini AI Gateway. Quyền này chỉ dành cho Super Admin!");
      return;
    }

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

  const totalPending = isSuperAdmin
    ? stats.pendingStudents + stats.pendingStaff
    : stats.pendingStudents;

  const tokenUsagePercent = useMemo(() => {
    if (!aiData.tokenLimit || aiData.tokenLimit <= 0) return 0;
    return Math.min(Math.round((aiData.dailyTokens / aiData.tokenLimit) * 100), 100);
  }, [aiData.dailyTokens, aiData.tokenLimit]);

  // Bộ 6 thẻ chỉ số: Cả Giảng viên và Admin đều bấm xem & chuyển tab bình thường
  const statCards = [
    {
      label: "Sinh viên vào lớp",
      value: stats.totalUsers,
      icon: "bi-people-fill",
      color: "#059669",
      bgLight: "#ecfdf5",
      borderHover: "#10b981",
      action: "users",
    },
    {
      label: "Hồ sơ chờ duyệt",
      value: stats.pendingStudents,
      icon: "bi-clock-history",
      color: "#d97706",
      bgLight: "#fffbeb",
      borderHover: "#f59e0b",
      action: "users",
      isPendingAlert: stats.pendingStudents > 0,
    },
    {
      label: "Thời khóa biểu & thi",
      value: stats.totalSchedules,
      icon: "bi-calendar3-range-fill",
      color: "#4f46e5",
      bgLight: "#eef2ff",
      borderHover: "#6366f1",
      action: "schedules",
    },
    {
      label: "Tài liệu học tập",
      value: stats.totalDocs,
      icon: "bi-file-earmark-pdf-fill",
      color: "#dc2626",
      bgLight: "#fef2f2",
      borderHover: "#ef4444",
      action: "library",
    },
    {
      label: "Video bài giảng",
      value: stats.totalVideos,
      icon: "bi-play-circle-fill",
      color: "#2563eb",
      bgLight: "#eff6ff",
      borderHover: "#3b82f6",
      action: "library",
    },
    {
      label: "Thảo luận diễn đàn",
      value: stats.totalMessages,
      icon: "bi-chat-dots-fill",
      color: "#0891b2",
      bgLight: "#ecfeff",
      borderHover: "#06b6d4",
      action: "community",
    },
  ];

  return (
    <div className="w-100 min-vh-100 bg-[#f8fafc]" style={{ padding: "32px 40px 64px 40px", color: "#1e293b" }}>
      <div className="d-flex flex-column gap-4 mx-auto" style={{ maxWidth: "1520px" }}>
        
        {/* CẢNH BÁO KHI BỊ CHẶN HÀNH ĐỘNG TRỰC TIẾP TẠI CHỖ */}
        {actionAlert && (
          <div
            className="rounded-4 p-3 border d-flex align-items-center justify-content-between gap-3 shadow-sm"
            style={{ backgroundColor: "#fff1f2", borderColor: "#fecdd3", color: "#9f1239" }}
          >
            <div className="d-flex align-items-center gap-2.5">
              <i className="bi bi-exclamation-triangle-fill fs-5 text-danger"></i>
              <span style={{ fontSize: "13px", fontWeight: "600" }}>{actionAlert}</span>
            </div>
            <button
              onClick={() => setActionAlert("")}
              className="btn btn-sm btn-link p-0 text-danger border-0 cursor-pointer"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        )}

        {/* 1. Header Banner */}
        <div
          className="rounded-4 p-4 text-white shadow-sm position-relative overflow-hidden border-0"
          style={{
            background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)",
            boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.25)",
          }}
        >
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 position-relative z-1">
            <div className="space-y-1">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span
                  className="badge rounded-pill px-3 py-1 text-white fw-bold"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.2)", backdropFilter: "blur(4px)", fontSize: "11px" }}
                >
                  TUNA ADMIN PORTAL
                </span>
                <span className="text-white-50 small">• Information System</span>
              </div>
              <h3 className="fw-black m-0 tracking-tight text-white" style={{ fontSize: "24px" }}>
                Bảng Điều Khiển Trung Tâm
              </h3>
              <p className="text-white-50 m-0 small pt-1">
                Giám sát hạn mức AI Gemini, kế hoạch đào tạo, lịch học và kiểm duyệt sinh viên.
              </p>
            </div>

            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="btn btn-white bg-white text-primary rounded-pill px-4 py-2.5 fw-bold shadow-sm d-inline-flex align-items-center gap-2 border-0 cursor-pointer"
              style={{ fontSize: "13px" }}
            >
              <i className={`bi bi-arrow-clockwise ${loading ? "spinner-border spinner-border-sm" : ""}`}></i>
              <span>{loading ? "Đang đồng bộ..." : "Đồng bộ dữ liệu"}</span>
            </button>
          </div>
        </div>

        {/* 2. Banner Thông Báo Khi Có Yêu Cầu Chờ Duyệt */}
        {totalPending > 0 && (
          <div
            className="rounded-4 p-3.5 border d-flex align-items-center justify-content-between flex-wrap gap-3 shadow-xs"
            style={{
              backgroundColor: "#fffbeb",
              borderColor: "#fde68a",
              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.08)",
            }}
          >
            <div className="d-flex align-items-center gap-3">
              <span
                className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                style={{ width: "42px", height: "42px", backgroundColor: "#fef3c7", color: "#b45309" }}
              >
                <i className="bi bi-bell-fill fs-5"></i>
              </span>
              <div>
                <div className="fw-black text-slate-900" style={{ fontSize: "14px" }}>
                  Đang có {totalPending} yêu cầu chờ phê duyệt vào hệ thống
                </div>
                <div className="text-secondary small mt-0.5">
                  {isSuperAdmin ? (
                    <>Gồm <b>{stats.pendingStudents}</b> sinh viên đăng ký lớp và <b>{stats.pendingStaff}</b> yêu cầu cấp quyền quản trị.</>
                  ) : (
                    <>Có <b>{stats.pendingStudents}</b> sinh viên đăng ký chờ Giảng viên xác nhận vào lớp.</>
                  )}
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2">
              {stats.pendingStudents > 0 && (
                <button
                  onClick={() => onNavigate && onNavigate("users")}
                  className="btn btn-warning text-white fw-bold px-3.5 py-2 rounded-pill border-0 shadow-xs cursor-pointer"
                  style={{ fontSize: "12.5px", backgroundColor: "#d97706" }}
                >
                  Duyệt sinh viên ({stats.pendingStudents}) →
                </button>
              )}
              {stats.pendingStaff > 0 && isSuperAdmin && (
                <button
                  onClick={() => onNavigate && onNavigate("staff")}
                  className="btn btn-outline-secondary fw-bold px-3.5 py-2 rounded-pill bg-white shadow-xs"
                  style={{ fontSize: "12.5px" }}
                >
                  Duyệt Staff ({stats.pendingStaff})
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. LƯỚI 6 THẺ CHỈ SỐ */}
        <div>
          <div className="d-flex align-items-center gap-2 mb-3 px-1">
            <span
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "24px", height: "24px", backgroundColor: "#eff6ff", color: "#2563eb" }}
            >
              <i className="bi bi-speedometer2 text-xs"></i>
            </span>
            <span className="fw-black text-slate-800" style={{ fontSize: "15px" }}>
              Chỉ số học vụ & nền tảng
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "16px",
            }}
          >
            {statCards.map((c, idx) => (
              <div
                key={idx}
                onClick={() => onNavigate && onNavigate(c.action)}
                className="rounded-4 bg-white border position-relative d-flex align-items-center justify-content-between cursor-pointer"
                style={{
                  padding: "18px 22px",
                  borderColor: c.isPendingAlert ? "#f59e0b" : "#f1f5f9",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                  transition: "all 0.2s ease",
                }}
              >
                <div className="pe-2">
                  <span className="text-secondary fw-semibold d-block text-truncate mb-1" style={{ fontSize: "12.5px" }}>
                    {c.label}
                  </span>
                  <div className="fw-black text-slate-900" style={{ fontSize: "28px", lineHeight: "1.1" }}>
                    {loading ? "..." : c.value.toLocaleString()}
                  </div>
                </div>

                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{
                    width: "48px",
                    height: "48px",
                    backgroundColor: c.bgLight,
                    color: c.color,
                    fontSize: "22px",
                  }}
                >
                  <i className={`bi ${c.icon}`}></i>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. PHÍM TẮT QUẢN TRỊ (Đã bỏ ban cán sự, thay bằng Khung đào tạo & kiểm duyệt) */}
        <div>
          <div className="d-flex align-items-center gap-2 mb-3 px-1">
            <span
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "24px", height: "24px", backgroundColor: "#fffbeb", color: "#d97706" }}
            >
              <i className="bi bi-lightning-charge-fill text-xs"></i>
            </span>
            <span className="fw-black text-slate-800" style={{ fontSize: "15px" }}>
              Phím tắt quản trị
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            {[
              { label: "Duyệt sinh viên vào lớp", sub: "Xác nhận hồ sơ vào danh sách lớp", icon: "bi-person-check", action: "users", color: "#059669", bg: "#ecfdf5" },
              { label: "Kế hoạch khung đào tạo", sub: "Nhập file Excel & quản lý môn học", icon: "bi-journal-bookmark", action: "curriculum", color: "#d97706", bg: "#fffbeb" },
              { label: "Cập nhật thời khóa biểu", sub: "Lịch học, lịch thi & phòng máy", icon: "bi-calendar-plus", action: "schedules", color: "#2563eb", bg: "#eff6ff" },
              { label: "Kiểm duyệt thảo luận", sub: "Xử phạt & cảnh báo vi phạm nội quy", icon: "bi-chat-square-text", action: "community", color: "#dc2626", bg: "#fef2f2" },
            ].map((act, idx) => (
              <div
                key={idx}
                onClick={() => onNavigate && onNavigate(act.action)}
                className="bg-white border rounded-4 d-flex align-items-center gap-3 cursor-pointer"
                style={{
                  padding: "16px 20px",
                  borderColor: "#f1f5f9",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  className="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: "42px", height: "42px", backgroundColor: act.bg, color: act.color, fontSize: "20px" }}
                >
                  <i className={`bi ${act.icon}`}></i>
                </div>
                <div className="overflow-hidden">
                  <div className="fw-bold text-slate-800 text-truncate" style={{ fontSize: "14px" }}>
                    {act.label}
                  </div>
                  <div className="text-secondary text-truncate" style={{ fontSize: "11.5px" }}>
                    {act.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. GATEWAY GEMINI AI: Giảng viên chỉ xem thống kê, bấm công tắc bật/tắt sẽ bị chặn ngay */}
        <div
          className="bg-white rounded-4 border overflow-hidden"
          style={{ borderColor: "#f1f5f9", boxShadow: "0 4px 14px rgba(0,0,0,0.03)" }}
        >
          <div className="d-flex align-items-center justify-content-between px-4 py-3.5 border-bottom bg-slate-50/50" style={{ borderColor: "#f1f5f9" }}>
            <div className="fw-black text-slate-900 d-flex align-items-center gap-2" style={{ fontSize: "15px" }}>
              <i className="bi bi-cpu-fill text-primary fs-5"></i>
              <span>Cổng Điều Phối Trí Tuệ Nhân Tạo (Gemini Gateway)</span>
            </div>
            <div className="d-flex align-items-center gap-3">
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-1.5 rounded-pill">
                Model: <b>{aiData.modelName}</b> (Cache {aiData.cacheHours}h)
              </span>
              <div
                className="form-check form-switch mb-0 d-flex align-items-center gap-2"
                onClick={(e) => {
                  if (!isSuperAdmin) {
                    e.preventDefault();
                    handleToggleAi();
                  }
                }}
              >
                <input
                  className={`form-check-input ${isSuperAdmin ? "cursor-pointer" : "cursor-not-allowed"} m-0`}
                  type="checkbox"
                  role="switch"
                  checked={aiData.enabled}
                  disabled={togglingAi || !isSuperAdmin}
                  onChange={handleToggleAi}
                />
                <label className="form-check-label small fw-bold text-secondary">
                  {aiData.enabled ? "Đang bật" : "Tạm dừng"}
                  {!isSuperAdmin && " (Chỉ Admin)"}
                </label>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="row g-4 align-items-center">
              <div className="col-12 col-lg-7">
                <div className="p-3.5 rounded-3 bg-slate-50 border border-slate-100">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-secondary small fw-bold">Hạn mức Tokens trong ngày</span>
                    <span className="fw-black text-slate-900 small">
                      {aiData.dailyTokens.toLocaleString()} / {aiData.tokenLimit.toLocaleString()} Tokens
                    </span>
                  </div>
                  <div className="progress rounded-pill bg-slate-200" style={{ height: "12px" }}>
                    <div
                      className={`progress-bar rounded-pill ${tokenUsagePercent > 85 ? "bg-danger" : tokenUsagePercent > 60 ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${tokenUsagePercent}%`, transition: "width 0.4s ease" }}
                    ></div>
                  </div>
                  <div className="d-flex justify-content-between items-center mt-2 text-muted" style={{ fontSize: "12px" }}>
                    <span>Trạng thái: <b>{tokenUsagePercent >= 100 ? "Đã chạm ngưỡng giới hạn" : "Hoạt động ổn định"}</b></span>
                    <span>Tiêu thụ: <b>{tokenUsagePercent}%</b></span>
                  </div>
                </div>
              </div>

              <div className="col-12 col-lg-5">
                <div className="row g-3">
                  <div className="col-6">
                    <div className="p-3 rounded-3 border bg-white text-center shadow-2xs" style={{ borderColor: "#f1f5f9" }}>
                      <span className="text-secondary d-block fw-semibold mb-1" style={{ fontSize: "12px" }}>Chi phí ước tính</span>
                      <span className="fw-black text-emerald-600 fs-4 d-block">${aiData.dailyCost.toFixed(4)}</span>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-3 rounded-3 border bg-white text-center shadow-2xs" style={{ borderColor: "#f1f5f9" }}>
                      <span className="text-secondary d-block fw-semibold mb-1" style={{ fontSize: "12px" }}>Lượt gọi API</span>
                      <span className="fw-black text-primary fs-4 d-block">{aiData.totalRequests.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. BẢNG AUDIT LOGS: Hiển thị đúng Super Admin & Giảng viên */}
        <div
          className="bg-white rounded-4 border overflow-hidden"
          style={{ borderColor: "#f1f5f9", boxShadow: "0 4px 14px rgba(0,0,0,0.03)" }}
        >
          <div className="d-flex justify-content-between align-items-center px-4 py-3.5 border-bottom bg-slate-50/50" style={{ borderColor: "#f1f5f9" }}>
            <div className="fw-black text-slate-900 d-flex align-items-center gap-2" style={{ fontSize: "15px" }}>
              <i className="bi bi-shield-check text-emerald-600 fs-5"></i>
              <span>Nhật ký kiểm vết hệ thống (Audit Logs)</span>
            </div>
            <span className="text-muted small">Cập nhật thời gian thực</span>
          </div>

          <div className="table-responsive" style={{ maxHeight: "380px", overflowY: "auto" }}>
            <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "13px" }}>
              <thead className="bg-slate-50 text-slate-500 border-bottom position-sticky top-0 z-1" style={{ borderColor: "#f1f5f9" }}>
                <tr>
                  <th className="ps-4 py-3" style={{ width: "22%" }}>Người thực hiện</th>
                  <th style={{ width: "15%" }}>Vai trò</th>
                  <th style={{ width: "20%" }}>Hành động</th>
                  <th style={{ width: "28%" }}>Chi tiết thao tác</th>
                  <th className="pe-4 text-end" style={{ width: "15%" }}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length > 0 ? (
                  auditLogs.map((log, idx) => (
                    <tr key={idx}>
                      <td className="ps-4 fw-bold text-slate-800">
                        {log.actor_name || "Quản trị viên"}
                      </td>
                      <td>
                        <span
                          className={`badge rounded-pill px-2.5 py-1 ${
                            log.actor_role === "super_admin"
                              ? "bg-danger-subtle text-danger border border-danger-subtle"
                              : "bg-primary-subtle text-primary border border-primary-subtle"
                          }`}
                          style={{ fontSize: "11px" }}
                        >
                          {log.actor_role === "super_admin" ? "Super Admin" : "Giảng viên"}
                        </span>
                      </td>
                      <td>
                        <code className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 small">
                          {log.action}
                        </code>
                      </td>
                      <td className="text-slate-600 text-truncate" style={{ maxWidth: "340px" }}>
                        {log.details || log.target || "Thực hiện thành công"}
                      </td>
                      <td className="pe-4 text-end text-muted small font-monospace">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} •{" "}
                        {new Date(log.created_at).toLocaleDateString("vi-VN")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center py-5 text-muted">
                      Chưa ghi nhận sự kiện kiểm vết nào trong cơ sở dữ liệu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminDashboard;