// src/admin/ManageStaff.jsx
import React, { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || (
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "https://tuna-project.onrender.com/api" // hoặc "http://localhost:5000/api" nếu bạn chạy backend ở máy
    : "https://tuna-project.onrender.com/api"
);

export const ManageStaff = () => {
  const [subTab, setSubTab] = useState("staff_list"); // 'staff_list' | 'access_requests' | 'password_resets'
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);
  const [passwordResets, setPasswordResets] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);

  // State Modal Xét duyệt
  const [selectedAccessReq, setSelectedAccessReq] = useState(null);
  const [selectedResetReq, setSelectedResetReq] = useState(null);
  const [customPasswordInput, setCustomPasswordInput] = useState("Admin@123");
  const [submittingAction, setSubmittingAction] = useState(false);

  const menuRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [newStaff, setNewStaff] = useState({
    email: "",
    fullName: "",
    role: "instructor",
    password: "Admin@123",
  });

  const [editFormData, setEditFormData] = useState({
    fullName: "",
    email: "",
    role: "instructor",
    password: "",
  });

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
  });

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Tải đồng bộ tất cả yêu cầu của Staff ngay lập tức để hiện đúng Badge đỏ
  const fetchAllStaffData = async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const [resStaff, resAccess, resReset] = await Promise.all([
        fetch(`${API_BASE}/admin/staff`, { headers }),
        fetch(`${API_BASE}/admin/staff/access-requests`, { headers }),
        fetch(`${API_BASE}/admin/staff/password-resets`, { headers }),
      ]);

      const [dStaff, dAccess, dReset] = await Promise.all([
        resStaff.json(),
        resAccess.json(),
        resReset.json(),
      ]);

      if (dStaff.success) setStaffList(dStaff.data || []);
      if (dAccess.success) setAccessRequests(dAccess.data || []);
      if (dReset.success) setPasswordResets(dReset.data || []);
    } catch (err) {
      console.error("Lỗi đồng bộ dữ liệu quản trị:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllStaffData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setActiveMenuId(null);
  }, [subTab]);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/staff`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(newStaff),
      });
      const data = await res.json();
      if (data.success) {
        alert("✅ Tạo tài khoản thành công!");
        setShowCreateModal(false);
        setNewStaff({ email: "", fullName: "", role: "instructor", password: "Admin@123" });
        fetchAllStaffData();
      } else {
        alert(data.message || "Lỗi tạo tài khoản");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleOpenEdit = (st) => {
    setEditingStaff(st);
    setEditFormData({
      fullName: st.fullName,
      email: st.email,
      role: st.role,
      password: "",
    });
    setActiveMenuId(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    try {
      const res = await fetch(`${API_BASE}/admin/staff/${editingStaff.id}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(editFormData),
      });
      const data = await res.json();
      if (data.success) {
        setEditingStaff(null);
        fetchAllStaffData();
      } else {
        alert(data.message || "Lỗi cập nhật");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleToggleStaff = async (st) => {
    setActiveMenuId(null);
    if (!window.confirm(`Đổi trạng thái hoạt động của "${st.fullName}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/staff/${st.id}/toggle`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) fetchAllStaffData();
      else alert(data.message);
    } catch (err) {
      alert("Lỗi máy chủ");
    }
  };

  const handleDeleteStaff = async (st) => {
    setActiveMenuId(null);
    if (!window.confirm(`Xóa vĩnh viễn tài khoản "${st.fullName}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/staff/${st.id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) fetchAllStaffData();
      else alert(data.message);
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const executeApproveAccess = async (action) => {
    if (!selectedAccessReq) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/admin/staff/approve-access`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          requestId: selectedAccessReq.id,
          email: selectedAccessReq.email,
          fullName: selectedAccessReq.fullName,
          role: selectedAccessReq.requestedRole,
          action,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedAccessReq(null);
        fetchAllStaffData();
      } else {
        alert(data.message || "Lỗi xử lý yêu cầu");
      }
    } catch (e) {
      alert("Lỗi kết nối");
    } finally {
      setSubmittingAction(false);
    }
  };

  const executeApproveReset = async () => {
    if (!selectedResetReq || !customPasswordInput.trim()) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/admin/staff/approve-reset-password`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          requestId: selectedResetReq.id,
          email: selectedResetReq.email,
          newPassword: customPasswordInput.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedResetReq(null);
        fetchAllStaffData();
      } else {
        alert(data.message || "Lỗi xử lý");
      }
    } catch (e) {
      alert("Lỗi kết nối");
    } finally {
      setSubmittingAction(false);
    }
  };

  const getBadgeStyle = (status) => {
    if (status === "approved") {
      return { background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", text: "Đã duyệt" };
    }
    if (status === "rejected") {
      return { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", text: "Từ chối" };
    }
    return { background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", text: "Chờ duyệt" };
  };

  const roleOrder = { super_admin: 1, instructor: 2, moderator: 3 };

  const getSortedAndFilteredDataset = () => {
    let list = [];
    if (subTab === "staff_list") {
      list = [...staffList].sort((a, b) => {
        const orderA = roleOrder[a.role] || 99;
        const orderB = roleOrder[b.role] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.fullName.localeCompare(b.fullName, "vi");
      });
    } else if (subTab === "access_requests") {
      list = [...accessRequests].sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return (roleOrder[a.requestedRole] || 99) - (roleOrder[b.requestedRole] || 99);
      });
    } else if (subTab === "password_resets") {
      list = [...passwordResets].sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return 0;
      });
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (item) =>
        item.fullName?.toLowerCase().includes(term) ||
        item.email?.toLowerCase().includes(term) ||
        item.username?.toLowerCase().includes(term)
    );
  };

  const pendingAccessCount = accessRequests.filter((r) => r.status === "pending").length;
  const pendingResetCount = passwordResets.filter((p) => p.status === "pending").length;

  const dataset = getSortedAndFilteredDataset();
  const totalPages = Math.ceil(dataset.length / itemsPerPage) || 1;
  const paginatedData = dataset.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="d-flex flex-column gap-3 w-100">
      {/* 1. Header Toolbar - 3 Tab chuẩn chỉnh */}
      <div
        className="p-2.5 rounded-4 shadow-sm d-flex align-items-center justify-content-between gap-2 bg-white flex-nowrap"
        style={{ border: "1px solid #e2e8f0" }}
      >
        <div className="d-flex gap-1.5 overflow-x-auto flex-shrink-1">
          {[
            { id: "staff_list", label: "Tài Khoản Quản Trị", count: staffList.length, icon: "bi-people-fill", badgeColor: "" },
            { id: "access_requests", label: "Cấp Quyền", count: pendingAccessCount, icon: "bi-shield-check", badgeColor: "bg-danger text-white" },
            { id: "password_resets", label: "Đổi Mật Khẩu", count: pendingResetCount, icon: "bi-key-fill", badgeColor: "bg-danger text-white" },
          ].map((tab) => {
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className="btn rounded-pill px-3.5 py-2 fw-semibold d-flex align-items-center gap-2 border-0 text-nowrap"
                style={{
                  fontSize: "12.5px",
                  background: isActive ? "linear-gradient(180deg, #185bf0 0%, #1546cd 100%)" : "#f8fafc",
                  color: isActive ? "#ffffff" : "#64748b",
                  boxShadow: isActive ? "0 4px 10px rgba(24, 91, 240, 0.2)" : "none",
                }}
              >
                <i className={`bi ${tab.icon}`}></i>
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`badge rounded-pill ${tab.badgeColor || ""}`}
                    style={{
                      fontSize: "10px",
                      backgroundColor: !tab.badgeColor ? (isActive ? "rgba(255,255,255,0.25)" : "#e2e8f0") : undefined,
                      color: !tab.badgeColor ? (isActive ? "#ffffff" : "#475569") : undefined,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {subTab === "staff_list" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn rounded-pill px-3.5 py-2 fw-semibold shadow-sm d-flex align-items-center gap-1.5 border-0 text-white text-nowrap flex-shrink-0"
            style={{ fontSize: "12.5px", background: "linear-gradient(180deg, #185bf0 0%, #1546cd 100%)" }}
          >
            <i className="bi bi-person-plus-fill"></i>
            <span>+ Thêm Quản Trị</span>
          </button>
        )}
      </div>

      {/* 2. Bảng Danh Sách */}
      <div className="rounded-4 p-4 shadow-sm bg-white" style={{ border: "1px solid #e2e8f0" }}>
        <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-3">
          <div className="input-group input-group-sm" style={{ maxWidth: "340px", width: "100%" }}>
            <span className="input-group-text bg-light border-end-0 text-muted"><i className="bi bi-search"></i></span>
            <input
              type="text"
              placeholder="Tìm theo tên, email, tài khoản..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="form-control bg-light border-start-0 fw-semibold"
              style={{ fontSize: "12.5px" }}
            />
          </div>
          <small className="text-muted fw-semibold">Tổng: <b>{dataset.length}</b> bản ghi</small>
        </div>

        {/* BẢNG 1: TÀI KHOẢN ADMIN */}
        {subTab === "staff_list" && (
          <div className="table-responsive" style={{ minHeight: "260px" }}>
            <table className="table table-hover align-middle mb-0" style={{ minWidth: "750px" }}>
              <thead className="table-light">
                <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase text-nowrap">
                  <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                  <th>Họ Và Tên</th>
                  <th>Tài Khoản / Email</th>
                  <th>Vai Trò</th>
                  <th>Trạng Thái</th>
                  <th className="text-end pe-3" style={{ width: "80px" }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "13px" }}>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-5 text-muted">Đang nạp danh sách...</td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-5 text-muted">Không có tài khoản nào.</td></tr>
                ) : (
                  paginatedData.map((st, index) => {
                    const virtualIndex = (currentPage - 1) * itemsPerPage + index + 1;
                    const isNearBottom = index >= Math.max(0, paginatedData.length - 2);

                    return (
                      <tr key={st.id} className="text-nowrap">
                        <td className="fw-bold text-muted text-center" style={{ fontSize: "12px" }}>
                          {virtualIndex < 10 ? `#0${virtualIndex}` : `#${virtualIndex}`}
                        </td>
                        <td className="fw-bold text-dark">{st.fullName}</td>
                        <td>
                          <span className="fw-semibold text-primary d-block">{st.email || "—"}</span>
                          <code className="text-muted" style={{ fontSize: "11px" }}>{st.username}</code>
                        </td>
                        <td>
                          <span
                            className="badge rounded-pill px-2.5 py-1 fw-bold"
                            style={{
                              background: st.role === "super_admin" ? "#fef2f2" : st.role === "instructor" ? "#eff6ff" : "#fefce8",
                              color: st.role === "super_admin" ? "#dc2626" : st.role === "instructor" ? "#185bf0" : "#ca8a04",
                              border: `1px solid ${st.role === "super_admin" ? "#fecaca" : "#bfdbfe"}`,
                              fontSize: "10.5px",
                            }}
                          >
                            {st.role === "super_admin" ? "Super Admin" : st.role === "instructor" ? "Giảng viên" : "Ban cán sự"}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge rounded-pill px-2.5 py-1 fw-semibold"
                            style={{
                              background: st.isActive ? "#ecfdf5" : "#fef2f2",
                              color: st.isActive ? "#059669" : "#dc2626",
                              border: `1px solid ${st.isActive ? "#a7f3d0" : "#fecaca"}`,
                              fontSize: "10.5px",
                            }}
                          >
                            {st.isActive ? "Hoạt động" : "Đang khóa"}
                          </span>
                        </td>
                        <td className="text-end pe-3 position-relative">
                          {st.role !== "super_admin" ? (
                            <div className="d-inline-block position-relative" ref={activeMenuId === st.id ? menuRef : null}>
                              <button
                                type="button"
                                onClick={() => setActiveMenuId(activeMenuId === st.id ? null : st.id)}
                                className="btn btn-sm btn-light rounded-circle d-flex align-items-center justify-content-center p-0 border"
                                style={{ width: "32px", height: "32px" }}
                              >
                                <i className="bi bi-three-dots-vertical fs-6"></i>
                              </button>

                              {activeMenuId === st.id && (
                                <div
                                  className="position-absolute end-0 card border-0 shadow-lg rounded-3 py-1 text-start"
                                  style={{
                                    width: "155px",
                                    backgroundColor: "#ffffff",
                                    border: "1px solid #e2e8f0",
                                    fontSize: "12px",
                                    zIndex: 1060,
                                    ...(isNearBottom ? { bottom: "34px" } : { top: "34px" }),
                                  }}
                                >
                                  <button onClick={() => handleOpenEdit(st)} className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent">
                                    <i className="bi bi-pencil text-primary"></i> <span>Chỉnh sửa</span>
                                  </button>
                                  <button onClick={() => handleToggleStaff(st)} className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 border-0 bg-transparent" style={{ color: st.isActive ? "#d97706" : "#059669" }}>
                                    <i className={`bi ${st.isActive ? "bi-lock" : "bi-unlock"}`}></i> <span>{st.isActive ? "Khóa" : "Kích hoạt"}</span>
                                  </button>
                                  <div className="dropdown-divider my-1 border-top"></div>
                                  <button onClick={() => handleDeleteStaff(st)} className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent">
                                    <i className="bi bi-trash3"></i> <span>Xóa</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted small">Cố định</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* BẢNG 2: CẤP QUYỀN */}
        {subTab === "access_requests" && (
          <div className="table-responsive" style={{ minHeight: "260px" }}>
            <table className="table table-hover align-middle mb-0" style={{ minWidth: "860px" }}>
              <thead className="table-light">
                <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase text-nowrap">
                  <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                  <th>Thời Gian</th>
                  <th>Họ Tên</th>
                  <th>Email Google</th>
                  <th>Đề Xuất</th>
                  <th>Lý Do</th>
                  <th>Trạng Thái</th>
                  <th className="text-end pe-3" style={{ width: "120px" }}>Xử Lý</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "13px" }}>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-5 text-muted">Đang tải...</td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-5 text-muted">Chưa có yêu cầu nào.</td></tr>
                ) : (
                  paginatedData.map((r, index) => {
                    const virtualIndex = (currentPage - 1) * itemsPerPage + index + 1;
                    const badge = getBadgeStyle(r.status);
                    return (
                      <tr key={r.id} className="text-nowrap">
                        <td className="fw-bold text-muted text-center" style={{ fontSize: "12px" }}>
                          {virtualIndex < 10 ? `#0${virtualIndex}` : `#${virtualIndex}`}
                        </td>
                        <td className="small text-muted">{r.createdAt}</td>
                        <td className="fw-bold text-dark">{r.fullName}</td>
                        <td className="text-primary fw-medium">{r.email}</td>
                        <td>
                          <span className="badge rounded-pill px-2.5 py-1 bg-primary-subtle text-primary border border-primary-subtle fw-semibold">
                            {r.requestedRole === "instructor" ? "Giảng viên" : "Moderator"}
                          </span>
                        </td>
                        <td className="text-secondary small text-truncate" style={{ maxWidth: "220px" }} title={r.reason}>
                          {r.reason || "—"}
                        </td>
                        <td>
                          <span
                            className="badge rounded-pill px-2.5 py-1 fw-semibold"
                            style={{
                              background: badge.background,
                              color: badge.color,
                              border: badge.border,
                              fontSize: "11px",
                            }}
                          >
                            {badge.text}
                          </span>
                        </td>
                        <td className="text-end pe-3">
                          <button
                            type="button"
                            onClick={() => setSelectedAccessReq(r)}
                            className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold ${
                              r.status === "pending" ? "btn-primary text-white border-0 shadow-sm" : "btn-light border text-secondary"
                            }`}
                            style={{ fontSize: "11.5px", background: r.status === "pending" ? "#185bf0" : "" }}
                          >
                            {r.status === "pending" ? "Xét duyệt" : "Chi tiết"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* BẢNG 3: ĐỔI MẬT KHẨU */}
        {subTab === "password_resets" && (
          <div className="table-responsive" style={{ minHeight: "260px" }}>
            <table className="table table-hover align-middle mb-0" style={{ minWidth: "820px" }}>
              <thead className="table-light">
                <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase text-nowrap">
                  <th style={{ width: "50px", textAlign: "center" }}>STT</th>
                  <th>Thời Gian</th>
                  <th>Họ Tên</th>
                  <th>Email</th>
                  <th>Ghi Chú</th>
                  <th>Trạng Thái</th>
                  <th className="text-end pe-3" style={{ width: "120px" }}>Xử Lý</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "13px" }}>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-5 text-muted">Đang nạp yêu cầu...</td></tr>
                ) : paginatedData.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-5 text-muted">Không có yêu cầu nào.</td></tr>
                ) : (
                  paginatedData.map((p, index) => {
                    const virtualIndex = (currentPage - 1) * itemsPerPage + index + 1;
                    const isApproved = p.status === "approved";
                    return (
                      <tr key={p.id} className="text-nowrap">
                        <td className="fw-bold text-muted text-center" style={{ fontSize: "12px" }}>
                          {virtualIndex < 10 ? `#0${virtualIndex}` : `#${virtualIndex}`}
                        </td>
                        <td className="small text-muted">{p.createdAt}</td>
                        <td className="fw-bold text-dark">{p.fullName || "Quản trị viên"}</td>
                        <td className="text-danger fw-semibold">{p.email}</td>
                        <td className="text-secondary small text-truncate" style={{ maxWidth: "220px" }} title={p.note}>
                          {p.note || "—"}
                        </td>
                        <td>
                          <span
                            className="badge rounded-pill px-2.5 py-1 fw-semibold"
                            style={{
                              background: isApproved ? "#ecfdf5" : "#fffbeb",
                              color: isApproved ? "#059669" : "#d97706",
                              border: isApproved ? "1px solid #a7f3d0" : "1px solid #fde68a",
                              fontSize: "11px",
                            }}
                          >
                            {isApproved ? "Đã đặt lại" : "Chờ xử lý"}
                          </span>
                        </td>
                        <td className="text-end pe-3">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedResetReq(p);
                              setCustomPasswordInput("Admin@123");
                            }}
                            className={`btn btn-sm rounded-pill px-3 py-1 fw-semibold ${
                              p.status === "pending" ? "btn-danger text-white border-0 shadow-sm" : "btn-light border text-secondary"
                            }`}
                            style={{ fontSize: "11.5px", background: p.status === "pending" ? "#EF4444" : "" }}
                          >
                            {p.status === "pending" ? "Đặt lại MK" : "Cấp lại"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Phân trang */}
        {!loading && dataset.length > itemsPerPage && (
          <div className="d-flex flex-wrap justify-content-between align-items-center pt-3 mt-2 border-top gap-2">
            <small className="text-muted" style={{ fontSize: "12px" }}>
              Hiển thị <b>{(currentPage - 1) * itemsPerPage + 1}</b> - <b>{Math.min(currentPage * itemsPerPage, dataset.length)}</b> trên <b>{dataset.length}</b> bản ghi
            </small>

            <div className="d-flex align-items-center gap-1">
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                <i className="bi bi-chevron-double-left small"></i>
              </button>
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                <i className="bi bi-chevron-left small"></i>
              </button>
              <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "12px" }}>
                {currentPage} / {totalPages}
              </span>
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                <i className="bi bi-chevron-right small"></i>
              </button>
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                <i className="bi bi-chevron-double-right small"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: THÊM TÀI KHOẢN MỚI */}
      {showCreateModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "420px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">Thêm Quản Trị Viên</h6>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleCreateStaff}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Họ và tên *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Nguyễn Văn A"
                      value={newStaff.fullName}
                      onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none"
                    />
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Email đăng nhập *</label>
                    <input
                      type="email"
                      required
                      placeholder="VD: a@ctuet.edu.vn"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none"
                    />
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Vai trò</label>
                    <select
                      value={newStaff.role}
                      onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                      className="form-select form-select-sm rounded-3 shadow-none"
                    >
                      <option value="instructor">Giảng viên / Trợ giảng</option>
                      <option value="moderator">Ban cán sự / Moderator</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Mật khẩu khởi tạo</label>
                    <input
                      type="text"
                      value={newStaff.password}
                      onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none font-monospace"
                    />
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-2 pb-4 d-flex justify-content-end gap-2">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary rounded-pill px-3.5 py-1.5 small border-0 text-white" style={{ background: "#185bf0" }}>
                    Lưu tài khoản
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CHỈNH SỬA TÀI KHOẢN */}
      {editingStaff && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "420px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">Chỉnh Sửa Quản Trị Viên</h6>
                <button type="button" onClick={() => setEditingStaff(null)} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Họ và tên *</label>
                    <input
                      type="text"
                      required
                      value={editFormData.fullName}
                      onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none"
                    />
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Email đăng nhập *</label>
                    <input
                      type="email"
                      required
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none"
                    />
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Vai trò</label>
                    <select
                      value={editFormData.role}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                      className="form-select form-select-sm rounded-3 shadow-none"
                    >
                      <option value="instructor">Giảng viên / Trợ giảng</option>
                      <option value="moderator">Ban cán sự / Moderator</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Đặt lại mật khẩu mới (Tùy chọn)</label>
                    <input
                      type="password"
                      placeholder="Để trống nếu không đổi"
                      value={editFormData.password}
                      onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none"
                    />
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-2 pb-4 d-flex justify-content-end gap-2">
                  <button type="button" onClick={() => setEditingStaff(null)} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                    Hủy
                  </button>
                  <button type="submit" className="btn btn-primary rounded-pill px-3.5 py-1.5 small border-0 text-white" style={{ background: "#185bf0" }}>
                    Lưu thay đổi
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: XÉT DUYỆT CẤP QUYỀN STAFF */}
      {selectedAccessReq && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "440px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">Xét Duyệt Cấp Quyền</h6>
                <button type="button" onClick={() => setSelectedAccessReq(null)} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                <div className="p-3 rounded-3 bg-light border">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fw-bold text-dark">{selectedAccessReq.fullName}</span>
                    <span className="badge rounded-pill bg-primary-subtle text-primary">
                      {selectedAccessReq.requestedRole === "instructor" ? "Giảng viên" : "Moderator"}
                    </span>
                  </div>
                  <div className="text-secondary small mb-2">{selectedAccessReq.email}</div>
                  <div className="small p-2.5 bg-white rounded-2 border">
                    <span className="text-muted d-block">{selectedAccessReq.reason || "Không có nội dung ghi chú."}</span>
                  </div>
                </div>

                {selectedAccessReq.status === "pending" && (
                  <small className="text-muted">
                    * Khi duyệt, mật khẩu khởi tạo mặc định sẽ là <code>Admin@123</code>.
                  </small>
                )}
              </div>

              <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                <button type="button" onClick={() => setSelectedAccessReq(null)} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                  Đóng
                </button>
                {selectedAccessReq.status === "pending" && (
                  <>
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => executeApproveAccess("reject")}
                      className="btn btn-light text-danger rounded-pill px-3 py-1.5 small border"
                    >
                      Từ chối
                    </button>
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => executeApproveAccess("approve")}
                      className="btn btn-primary rounded-pill px-3.5 py-1.5 small border-0 text-white"
                      style={{ background: "#185bf0" }}
                    >
                      {submittingAction ? "Đang xử lý..." : "Phê duyệt ngay"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CẤP LẠI MẬT KHẨU STAFF */}
      {selectedResetReq && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "420px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">Đặt Lại Mật Khẩu</h6>
                <button type="button" onClick={() => setSelectedResetReq(null)} className="btn btn-sm btn-light rounded-circle p-0" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                <div className="p-3 rounded-3 bg-light border">
                  <span className="fw-bold text-dark d-block">{selectedResetReq.fullName || "Quản trị viên"}</span>
                  <span className="text-danger small d-block">{selectedResetReq.email}</span>
                  {selectedResetReq.note && (
                    <small className="text-muted d-block mt-1">Ghi chú: "{selectedResetReq.note}"</small>
                  )}
                </div>

                <div>
                  <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                    Mật khẩu mới cấp lại *
                  </label>
                  <input
                    type="text"
                    required
                    value={customPasswordInput}
                    onChange={(e) => setCustomPasswordInput(e.target.value)}
                    className="form-control form-control-sm rounded-3 shadow-none font-monospace"
                  />
                </div>
              </div>

              <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                <button type="button" onClick={() => setSelectedResetReq(null)} className="btn btn-light rounded-pill px-3 py-1.5 small border">
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !customPasswordInput.trim()}
                  onClick={executeApproveReset}
                  className="btn btn-danger rounded-pill px-3.5 py-1.5 small border-0 text-white"
                  style={{ background: "#EF4444" }}
                >
                  {submittingAction ? "Đang xử lý..." : "Cập nhật mật khẩu"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageStaff;