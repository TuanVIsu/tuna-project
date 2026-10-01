// src/admin/ManageUsers.jsx
import React, { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

export const ManageUsers = () => {
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'pending'
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [options, setOptions] = useState({
    majors: [],
    cohorts: [],
    classes: {},
  });

  // Bộ lọc
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMajor, setSelectedMajor] = useState("all");
  const [selectedCohort, setSelectedCohort] = useState("all");

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);

  // Floating Action Menu (Fixed không bị cắt)
  const [activeMenuData, setActiveMenuData] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const menuDropdownRef = useRef(null);

  const [editFormData, setEditFormData] = useState({
    name: "",
    studentCode: "",
    className: "",
    faculty: "",
    totalCredits: 0,
    isActive: true,
    isVerified: true,
    verificationStatus: "approved",
  });

  const getHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
  });

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target)) {
        setActiveMenuData(null);
      }
    };
    const handleScroll = () => setActiveMenuData(null);

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  // 1. Tải danh mục Ngành & Khóa
  useEffect(() => {
    const fetchMetaOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/schedules/admin/meta-options`, {
          headers: getHeaders(),
        });
        const d = await res.json();
        if (d.success && d.data) {
          setOptions(d.data);
        }
      } catch (e) {
        console.error("Lỗi nạp danh mục:", e);
      }
    };
    fetchMetaOptions();
  }, []);

  // 2. Tải danh sách người dùng
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        search: searchTerm,
        major: selectedMajor,
        cohort: selectedCohort,
      }).toString();

      const res = await fetch(`${API_BASE}/admin/users?${q}`, {
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success) setUsers(d.data || []);
    } catch (e) {
      console.error("Lỗi tải danh sách người dùng:", e);
    } finally {
      setLoading(false);
    }
  };

  // 3. Tải danh sách chờ phê duyệt
  const fetchPendingUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/pending`, {
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success) setPendingUsers(d.data || []);
    } catch (e) {
      console.error("Lỗi tải hàng chờ phê duyệt:", e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPendingUsers();
    setCurrentPage(1);
    setActiveMenuData(null);
  }, [selectedMajor, selectedCohort]);

  const handleVerify = async (userId, action) => {
    setActiveMenuData(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users/verify`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ userId, action }),
      });
      const d = await res.json();
      if (d.success) {
        fetchPendingUsers();
        fetchUsers();
      } else {
        alert(d.message || "Không thể thực hiện thao tác");
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleToggleStatus = async (user) => {
    setActiveMenuData(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users/${user.id}/toggle-status`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === user.id ? { ...u, isActive: d.isActive } : u))
        );
      }
    } catch (e) {
      alert("Lỗi máy chủ khi cập nhật trạng thái");
    }
  };

  const handleDeleteUser = async (userId, name) => {
    setActiveMenuData(null);
    if (!window.confirm(`Xác nhận xóa tài khoản "${name}" khỏi hệ thống?`)) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (e) {
      alert("Lỗi khi xóa người dùng");
    }
  };

  const handleOpenEdit = (user) => {
    setActiveMenuData(null);
    setEditingUser(user);
    setEditFormData({
      name: user.name || "",
      studentCode: user.studentCode || "",
      className: user.className || "",
      faculty: user.faculty || options.majors[0]?.majorName || "",
      totalCredits: user.totalCredits || 0,
      isActive: user.isActive !== false,
      isVerified: user.isVerified === true,
      verificationStatus: user.verificationStatus || "approved",
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${editingUser.id}`, {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify(editFormData),
      });
      const d = await res.json();
      if (d.success) {
        setEditingUser(null);
        fetchUsers();
        fetchPendingUsers();
      } else {
        alert(d.message || "Cập nhật thất bại!");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const toggleActionMenu = (e, u) => {
    e.stopPropagation();
    if (activeMenuData && activeMenuData.user.id === u.id) {
      setActiveMenuData(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 170;

    let top = rect.bottom + 6;
    if (spaceBelow < menuHeight) {
      top = rect.top - menuHeight - 6;
    }

    setActiveMenuData({
      user: u,
      top,
      right: window.innerWidth - rect.right,
    });
  };

  const displayList = activeTab === "pending" ? pendingUsers : users;
  const totalPages = Math.ceil(displayList.length / itemsPerPage) || 1;
  const paginatedData = displayList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="d-flex flex-column gap-3 w-100">
      {/* 1. Banner cảnh báo khi có sinh viên chờ duyệt */}
      {pendingUsers.length > 0 && activeTab !== "pending" && (
        <div
          className="rounded-4 p-3 border d-flex align-items-center justify-content-between flex-wrap gap-2 shadow-sm"
          style={{
            backgroundColor: "#fffbeb",
            borderColor: "#fde68a",
            color: "#92400e",
          }}
        >
          <div className="d-flex align-items-center gap-2.5">
            <span
              className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
              style={{
                width: "36px",
                height: "36px",
                backgroundColor: "#fef3c7",
                color: "#b45309",
              }}
            >
              <i className="bi bi-bell-fill fs-5 animate-pulse"></i>
            </span>
            <div>
              <div className="fw-bold" style={{ fontSize: "13px" }}>
                Có {pendingUsers.length} yêu cầu đăng ký tham gia lớp đang chờ phê duyệt
              </div>
              <small style={{ fontSize: "11.5px", color: "#b45309" }}>
                Sinh viên chưa được duyệt sẽ không thể xem thời khóa biểu chính thức của lớp.
              </small>
            </div>
          </div>

          <button
            onClick={() => setActiveTab("pending")}
            className="btn btn-sm fw-bold px-3 py-1 rounded-pill shadow-xs border-0 text-white"
            style={{
              backgroundColor: "#d97706",
              fontSize: "12px",
            }}
          >
            Kiểm tra ngay ({pendingUsers.length})
          </button>
        </div>
      )}

      {/* 2. Header Toolbar & Bộ lọc Responsive */}
      <div className="p-3 bg-white rounded-4 shadow-sm border d-flex flex-column gap-2.5">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h6 className="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
              <i className="bi bi-people-fill text-primary fs-5"></i>
              Quản Lý Sinh Viên & Phê Duyệt Vào Lớp
            </h6>
            <small className="text-muted" style={{ fontSize: "11.5px" }}>
              Danh mục ngành và khóa đồng bộ thời gian thực từ CSDL đào tạo
            </small>
          </div>

          <div className="p-1 bg-slate-100 rounded-pill border d-inline-flex gap-1 overflow-x-auto flex-nowrap">
            <button
              onClick={() => setActiveTab("all")}
              className={`btn btn-sm rounded-pill px-3 py-1 fw-bold border-0 transition text-nowrap ${
                activeTab === "all"
                  ? "btn-primary text-white shadow-sm"
                  : "text-secondary bg-transparent hover:text-dark"
              }`}
              style={{ fontSize: "12px" }}
            >
              Tất cả sinh viên ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("pending")}
              className={`btn btn-sm rounded-pill px-3 py-1 fw-bold border-0 transition position-relative text-nowrap ${
                activeTab === "pending"
                  ? "btn-warning text-dark shadow-sm"
                  : "text-secondary bg-transparent hover:text-dark"
              }`}
              style={{ fontSize: "12px" }}
            >
              Chờ duyệt vào lớp
              {pendingUsers.length > 0 && (
                <span className="badge rounded-pill bg-danger ms-1.5 px-2 py-0.5 text-white">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Thanh lọc đa tầng chuẩn Grid Responsive */}
        <div className="row g-2 pt-2 border-top">
          <div className="col-12 col-md-5">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Tìm Kiếm Sinh Viên
            </label>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white border-end-0 text-muted ps-2.5">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchUsers()}
                placeholder="Tìm tên Zalo, MSSV, mã lớp..."
                className="form-control form-control-sm rounded-end-3 bg-white border-start-0 shadow-none fw-semibold"
                style={{ fontSize: "12px" }}
              />
            </div>
          </div>

          <div className="col-6 col-md-4">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Ngành Đào Tạo
            </label>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả chuyên ngành</option>
              {options.majors.map((m) => (
                <option key={m.majorCode} value={m.majorName}>
                  [{m.majorCode}] {m.majorName}
                </option>
              ))}
            </select>
          </div>

          <div className="col-4 col-md-2">
            <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
              Khóa Tuyển Sinh
            </label>
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả khóa</option>
              {options.cohorts.map((c) => (
                <option key={c} value={c}>
                  Khóa {c}
                </option>
              ))}
            </select>
          </div>

          <div className="col-2 col-md-1 d-flex align-items-end">
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedMajor("all");
                setSelectedCohort("all");
                fetchUsers();
                fetchPendingUsers();
              }}
              className="btn btn-outline-secondary btn-sm w-100 fw-semibold rounded-3 shadow-none d-flex align-items-center justify-content-center"
              style={{ height: "31px", fontSize: "12px" }}
              title="Đặt lại bộ lọc"
            >
              <i className="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Bảng Danh Sách Sinh Viên */}
      <div className="rounded-4 p-4 shadow-sm bg-white border">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-1.5 rounded-pill fw-bold">
            {activeTab === "pending"
              ? `Hàng chờ phê duyệt (${pendingUsers.length} hồ sơ)`
              : "Danh sách sinh viên đã kích hoạt"}
          </span>
          <small className="text-muted fw-semibold">
            Tổng: <b>{displayList.length}</b> tài khoản
          </small>
        </div>

        <div className="table-responsive" style={{ minHeight: "260px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "860px" }}>
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th className="ps-3" style={{ minWidth: "220px" }}>Sinh Viên (Zalo)</th>
                <th style={{ minWidth: "150px" }}>MSSV / Lớp</th>
                <th style={{ minWidth: "180px" }}>Chuyên Ngành</th>
                {activeTab === "all" ? (
                  <>
                    <th className="text-center" style={{ minWidth: "90px" }}>Tín Chỉ</th>
                    <th className="text-center" style={{ minWidth: "120px" }}>Chuỗi Học</th>
                    <th className="text-center" style={{ minWidth: "130px" }}>Xác Thực</th>
                    <th className="text-center" style={{ minWidth: "110px" }}>Trạng Thái</th>
                  </>
                ) : (
                  <th style={{ minWidth: "160px" }}>Thời Gian Yêu Cầu</th>
                )}
                <th className="text-end pe-3" style={{ width: "80px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">Đang nạp dữ liệu...</td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    {activeTab === "pending"
                      ? "Không có yêu cầu tham gia lớp nào đang chờ duyệt."
                      : "Không tìm thấy sinh viên nào phù hợp tiêu chí."}
                  </td>
                </tr>
              ) : (
                paginatedData.map((u) => (
                  <tr key={u.id}>
                    <td className="ps-3">
                      <div className="d-flex align-items-center gap-2.5">
                        <img
                          src={
                            u.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=185bf0&color=fff`
                          }
                          alt="Avatar"
                          className="rounded-circle border"
                          style={{ width: "36px", height: "36px", objectFit: "cover" }}
                        />
                        <div>
                          <span className="fw-bold text-dark d-block text-truncate" style={{ maxWidth: "160px" }}>
                            {u.name}
                          </span>
                          <code className="text-muted" style={{ fontSize: "10.5px" }}>
                            {u.zaloId ? `${u.zaloId.slice(0, 12)}...` : "Chưa gắn ID"}
                          </code>
                        </div>
                      </div>
                    </td>

                    <td>
                      {u.studentCode ? (
                        <div className="d-flex flex-column align-items-start gap-0.5">
                          <span
                            className="font-monospace fw-bold px-2 py-0.5 rounded-1 border"
                            style={{
                              fontSize: "11px",
                              backgroundColor: "#eff6ff",
                              color: "#1d4ed8",
                              borderColor: "#bfdbfe",
                            }}
                          >
                            {u.studentCode}
                          </span>
                          <span className="text-muted fw-semibold" style={{ fontSize: "11px" }}>
                            Lớp: <b className="text-dark">{u.className || "Chưa có"}</b>
                          </span>
                        </div>
                      ) : (
                        <span className="badge bg-light text-muted border">Chưa có MSSV</span>
                      )}
                    </td>

                    <td className="fw-semibold text-secondary">
                      {u.faculty || "Hệ Thống Thông Tin"}
                    </td>

                    {activeTab === "all" ? (
                      <>
                        <td className="text-center">
                          <span className="badge bg-light text-dark border px-2.5 py-1 fw-bold">
                            {u.totalCredits || 0} tín
                          </span>
                        </td>

                        <td className="text-center">
                          {Number(u.currentStreak) > 0 ? (
                            <span
                              className="badge text-white px-2.5 py-1 rounded-pill fw-bold"
                              style={{
                                background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
                                fontSize: "11px",
                              }}
                            >
                              🔥 {u.currentStreak} ngày
                            </span>
                          ) : (
                            <span className="text-muted small">0 ngày</span>
                          )}
                        </td>

                        <td className="text-center">
                          {u.isVerified ? (
                            <span
                              className="badge rounded-pill px-2.5 py-1 fw-bold"
                              style={{
                                background: "#ecfdf5",
                                color: "#059669",
                                border: "1px solid #a7f3d0",
                                fontSize: "11px",
                              }}
                            >
                              ✓ Đã vào lớp
                            </span>
                          ) : u.verificationStatus === "rejected" ? (
                            <span
                              className="badge rounded-pill px-2.5 py-1 fw-bold"
                              style={{
                                background: "#fef2f2",
                                color: "#dc2626",
                                border: "1px solid #fecaca",
                                fontSize: "11px",
                              }}
                            >
                              ✕ Bị từ chối
                            </span>
                          ) : (
                            <span
                              className="badge rounded-pill px-2.5 py-1 fw-bold"
                              style={{
                                background: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                                fontSize: "11px",
                              }}
                            >
                              ⏳ Chờ duyệt
                            </span>
                          )}
                        </td>

                        <td className="text-center">
                          <span
                            className={`badge rounded-pill px-2 py-0.5 fw-bold ${
                              u.isActive
                                ? "bg-success-subtle text-success border border-success-subtle"
                                : "bg-danger-subtle text-danger border border-danger-subtle"
                            }`}
                            style={{ fontSize: "10.5px" }}
                          >
                            {u.isActive ? "Hoạt động" : "Bị khóa"}
                          </span>
                        </td>
                      </>
                    ) : (
                      <td className="text-secondary fw-semibold small">
                        {u.createdAt || "Vừa gửi"}
                      </td>
                    )}

                    <td className="text-end pe-3">
                      <button
                        type="button"
                        onClick={(e) => toggleActionMenu(e, u)}
                        className="btn btn-sm btn-light rounded-circle d-inline-flex align-items-center justify-content-center p-0 border"
                        style={{ width: "32px", height: "32px", color: "#64748b" }}
                      >
                        <i className="bi bi-three-dots-vertical fs-6"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 4. Thanh Phân Trang (Luôn hiển thị đầy đủ kể cả khi chỉ có 1 dòng) */}
        {!loading && (
          <div className="d-flex flex-wrap justify-content-between align-items-center pt-3 mt-2 border-top gap-2">
            <div className="d-flex align-items-center gap-2">
              <small className="text-muted fw-bold">Hiển thị:</small>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="form-select form-select-sm fw-bold border rounded-2 py-0 px-2"
                style={{ width: "65px", height: "28px", fontSize: "11.5px" }}
              >
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
              </select>
              <small className="text-muted" style={{ fontSize: "12px" }}>
                (Dòng <b>{displayList.length ? (currentPage - 1) * itemsPerPage + 1 : 0}</b> -{" "}
                <b>{Math.min(currentPage * itemsPerPage, displayList.length)}</b> / <b>{displayList.length}</b> tài khoản)
              </small>
            </div>

            <div className="d-flex align-items-center gap-1 ms-auto">
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                title="Trang đầu"
              >
                <i className="bi bi-chevron-double-left small"></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title="Trang trước"
              >
                <i className="bi bi-chevron-left small"></i>
              </button>

              <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "12px" }}>
                {currentPage} / {totalPages}
              </span>

              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                title="Trang sau"
              >
                <i className="bi bi-chevron-right small"></i>
              </button>
              <button
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Trang cuối"
              >
                <i className="bi bi-chevron-double-right small"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. FLOATING ACTION MENU FIXED (Nổi lên trên cùng, không bị che) */}
      {activeMenuData && (
        <div
          ref={menuDropdownRef}
          className="card border-0 shadow-lg rounded-3 py-1 text-start position-fixed"
          style={{
            width: "175px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
            zIndex: 99999,
            top: `${activeMenuData.top}px`,
            right: `${activeMenuData.right}px`,
          }}
        >
          {!activeMenuData.user.isVerified && (
            <>
              <button
                type="button"
                onClick={() => handleVerify(activeMenuData.user.id, "approve")}
                className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-success border-0 bg-transparent fw-bold"
              >
                <i className="bi bi-check-circle-fill"></i>
                <span>Duyệt vào lớp</span>
              </button>
              <button
                type="button"
                onClick={() => handleVerify(activeMenuData.user.id, "reject")}
                className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent fw-bold"
              >
                <i className="bi bi-x-circle-fill"></i>
                <span>Từ chối</span>
              </button>
              <div className="dropdown-divider my-1 border-top" style={{ borderColor: "#f1f5f9" }}></div>
            </>
          )}

          <button
            type="button"
            onClick={() => handleOpenEdit(activeMenuData.user)}
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent"
          >
            <i className="bi bi-pencil text-primary"></i>
            <span>Chỉnh sửa hồ sơ</span>
          </button>

          <button
            type="button"
            onClick={() => handleToggleStatus(activeMenuData.user)}
            className={`dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 border-0 bg-transparent fw-semibold ${
              activeMenuData.user.isActive ? "text-warning" : "text-success"
            }`}
          >
            <i className={`bi ${activeMenuData.user.isActive ? "bi-lock-fill" : "bi-unlock-fill"}`}></i>
            <span>{activeMenuData.user.isActive ? "Khóa tài khoản" : "Mở tài khoản"}</span>
          </button>

          <div className="dropdown-divider my-1 border-top" style={{ borderColor: "#f1f5f9" }}></div>

          <button
            type="button"
            onClick={() => handleDeleteUser(activeMenuData.user.id, activeMenuData.user.name)}
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent"
          >
            <i className="bi bi-trash3"></i>
            <span>Xóa sinh viên</span>
          </button>
        </div>
      )}

      {/* 6. Modal Sửa Hồ Sơ */}
      {editingUser && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "460px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2">
                <h6 className="fw-bold mb-0 text-dark">Cập Nhật Hồ Sơ Sinh Viên</h6>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="btn btn-sm btn-light rounded-circle p-0"
                  style={{ width: "28px", height: "28px" }}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                      Họ và tên *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="form-control form-control-sm rounded-3 shadow-none fw-bold"
                    />
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        MSSV
                      </label>
                      <input
                        type="text"
                        value={editFormData.studentCode}
                        onChange={(e) => setEditFormData({ ...editFormData, studentCode: e.target.value })}
                        className="form-control form-control-sm rounded-3 shadow-none font-monospace fw-bold text-primary"
                      />
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Lớp Sinh Hoạt
                      </label>
                      <input
                        type="text"
                        value={editFormData.className}
                        onChange={(e) => setEditFormData({ ...editFormData, className: e.target.value })}
                        className="form-control form-control-sm rounded-3 shadow-none fw-bold"
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-8">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Chuyên Ngành
                      </label>
                      <select
                        value={editFormData.faculty}
                        onChange={(e) => setEditFormData({ ...editFormData, faculty: e.target.value })}
                        className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                      >
                        {options.majors.map((m) => (
                          <option key={m.majorCode} value={m.majorName}>
                            {m.majorName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>
                        Tín Chỉ
                      </label>
                      <input
                        type="number"
                        value={editFormData.totalCredits}
                        onChange={(e) => setEditFormData({ ...editFormData, totalCredits: Number(e.target.value) })}
                        className="form-control form-control-sm rounded-3 shadow-none fw-bold"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-light rounded-3 border d-flex flex-column gap-2 mt-1">
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="modalVerifySwitch"
                        checked={editFormData.isVerified}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setEditFormData({
                            ...editFormData,
                            isVerified: val,
                            verificationStatus: val ? "approved" : "pending",
                          });
                        }}
                      />
                      <label className="form-check-label small fw-bold text-dark" htmlFor="modalVerifySwitch">
                        Phê duyệt vào lớp chính khóa
                      </label>
                    </div>

                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="modalActiveSwitch"
                        checked={editFormData.isActive}
                        onChange={(e) => setEditFormData({ ...editFormData, isActive: e.target.checked })}
                      />
                      <label className="form-check-label small fw-bold text-dark" htmlFor="modalActiveSwitch">
                        Kích hoạt tài khoản người dùng
                      </label>
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="btn btn-light rounded-pill px-3.5 py-1.5 small border"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary rounded-pill px-4 py-1.5 small border-0 text-white"
                    style={{ background: "#185bf0" }}
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsers;