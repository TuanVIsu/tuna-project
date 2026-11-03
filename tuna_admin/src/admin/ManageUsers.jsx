// src/admin/ManageUsers.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

const removeVietnameseTones = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
};

export const ManageUsers = () => {
  const [activeTab, setActiveTab] = useState("all");
  const [users, setUsers] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [options, setOptions] = useState({
    majors: [],
    cohorts: [],
    classes: {},
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMajor, setSelectedMajor] = useState("all");
  const [selectedCohort, setSelectedCohort] = useState("all");
  const [selectedClass, setSelectedClass] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);

  const [activeMenuData, setActiveMenuData] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const menuDropdownRef = useRef(null);

  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    studentCode: "",
    className: "",
    faculty: "",
    totalCredits: 0,
  });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

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

  useEffect(() => {
    let isMounted = true;
    const fetchMetaOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/schedules/admin/meta-options`, {
          headers: getHeaders(),
        });
        const d = await res.json();
        if (isMounted && d.success && d.data) {
          setOptions(d.data);
        }
      } catch (e) {
        console.warn("Lỗi nạp danh mục:", e);
      }
    };
    fetchMetaOptions();
    return () => { isMounted = false; };
  }, [getHeaders]);

  const safeFetchUsersApi = useCallback(async (endpoint, reqOptions = {}) => {
    try {
      let res = await fetch(`${API_BASE}/users${endpoint}`, {
        ...reqOptions,
        headers: getHeaders(),
      });
      if (res.status === 404) {
        res = await fetch(`${API_BASE}/admin/users${endpoint}`, {
          ...reqOptions,
          headers: getHeaders(),
        });
      }
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [getHeaders]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        major: selectedMajor,
        cohort: selectedCohort,
        className: selectedClass,
      }).toString();

      const d = await safeFetchUsersApi(`?${q}`);
      if (d.success) setUsers(d.data || []);
    } catch (e) {
      console.error("Lỗi tải danh sách người dùng:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedMajor, selectedCohort, selectedClass, safeFetchUsersApi]);

  const fetchPendingUsers = useCallback(async () => {
    try {
      const d = await safeFetchUsersApi(`/pending`);
      if (d.success) setPendingUsers(d.data || []);
    } catch (e) {
      console.error("Lỗi tải hàng chờ phê duyệt:", e);
    }
  }, [safeFetchUsersApi]);

  const fetchUsersRef = useRef(fetchUsers);
  const fetchPendingUsersRef = useRef(fetchPendingUsers);
  useEffect(() => {
    fetchUsersRef.current = fetchUsers;
    fetchPendingUsersRef.current = fetchPendingUsers;
  });

  useEffect(() => {
    fetchUsers();
    fetchPendingUsers();
    setCurrentPage(1);
    setActiveMenuData(null);
  }, [fetchUsers, fetchPendingUsers]);

  // Socket realtime
  useEffect(() => {
    const socketUrl = API_BASE.replace('/api', '');
    const socket = io(socketUrl);

    socket.on("student_profile_updated", () => {
      fetchUsersRef.current();
      fetchPendingUsersRef.current();
    });

    return () => {
      socket.off("student_profile_updated");
      socket.disconnect();
    };
  }, []);

  // Tách thực thể tìm kiếm thông minh
// Hàm tạo tên viết tắt từ chuỗi tiếng Việt (VD: "Hệ Thống Thông Tin" -> "httt")
const getInitials = (str) => {
  if (!str) return "";
  return removeVietnameseTones(str)
    .split(/\s+/)
    .map((word) => word[0])
    .join("");
};

// ... trong useMemo parsedNL:
const parsedNL = useMemo(() => {
  const raw = searchTerm.trim();
  if (!raw) return null;

  const normalized = removeVietnameseTones(raw);
  let detectedCohort = null;
  let detectedMajor = null;
  let detectedStatus = null;

  // 1. Nhận diện Khóa tuyển sinh
  const cohortMatch = normalized.match(/k\s*(\d{2})|khoa\s*(\d{2})/);
  if (cohortMatch) {
    const num = cohortMatch[1] || cohortMatch[2];
    detectedCohort = `K${num}`;
  }

  // 2. Nhận diện Chuyên ngành HOÀN TOÀN TỰ ĐỘNG TỪ CSDL
  if (Array.isArray(options.majors)) {
    for (const m of options.majors) {
      const normMajorName = removeVietnameseTones(m.majorName || "");
      const normMajorCode = removeVietnameseTones(m.majorCode || "");
      const initials = getInitials(m.majorName || "");

      // Khớp theo: Tên ngành không dấu, Mã ngành, hoặc Chữ cái viết tắt
      const isMatch =
        (normMajorName && normalized.includes(normMajorName)) ||
        (normMajorCode && normalized.includes(normMajorCode)) ||
        (initials && new RegExp(`\\b${initials}\\b`).test(normalized));

      if (isMatch) {
        detectedMajor = m.majorName;
        break;
      }
    }
  }

  // 3. Nhận diện Trạng thái phê duyệt
  if (normalized.includes("cho duyet") || normalized.includes("chua duyet") || normalized.includes("pending")) {
    detectedStatus = "pending";
  } else if (normalized.includes("da vao lop") || normalized.includes("da duyet") || normalized.includes("approved")) {
    detectedStatus = "approved";
  } else if (normalized.includes("tu choi") || normalized.includes("rejected")) {
    detectedStatus = "rejected";
  }

  // 4. Lọc bỏ các từ khóa cấu trúc để lấy ra keyword tên/MSSV thực tế
  let cleanedKeyword = normalized
    .replace(/sinh vien|sv|danh sach|tim|ho so|tat ca|cho duyet|chua duyet|da duyet|da vao lop|tu choi/g, "")
    .replace(/k\s*\d{2}|khoa\s*\d{2}/g, "");

  // Tự động xóa tên ngành/mã ngành tìm được ra khỏi keyword
  if (Array.isArray(options.majors)) {
    options.majors.forEach((m) => {
      const normName = removeVietnameseTones(m.majorName || "");
      const normCode = removeVietnameseTones(m.majorCode || "");
      const initials = getInitials(m.majorName || "");
      if (normName) cleanedKeyword = cleanedKeyword.replace(new RegExp(normName, "g"), "");
      if (normCode) cleanedKeyword = cleanedKeyword.replace(new RegExp(normCode, "g"), "");
      if (initials) cleanedKeyword = cleanedKeyword.replace(new RegExp(`\\b${initials}\\b`, "g"), "");
    });
  }

  return {
    cohort: detectedCohort,
    major: detectedMajor,
    status: detectedStatus,
    keyword: cleanedKeyword.trim(),
  };
}, [searchTerm, options.majors]); // Bắt buộc phụ thuộc options.majors để cập nhật khi API tải xong

  const filteredUsers = useMemo(() => {
    let source = activeTab === "pending" ? pendingUsers : users;

    return source.filter((u) => {
      if (selectedCohort !== "all") {
        const cohortDigits = selectedCohort.replace(/\D/g, "");
        const uClass = String(u.className || "").toUpperCase();
        const uCode = String(u.studentCode || "").toUpperCase();
        const matchCohort = uClass.includes(selectedCohort.toUpperCase()) || 
          (cohortDigits && (uClass.includes(cohortDigits) || uCode.startsWith(cohortDigits)));
        if (!matchCohort) return false;
      }

      if (parsedNL?.cohort) {
        const cohortDigits = parsedNL.cohort.replace(/\D/g, "");
        const uClass = String(u.className || "").toUpperCase();
        const uCode = String(u.studentCode || "").toUpperCase();
        const matchCohort = uClass.includes(parsedNL.cohort.toUpperCase()) ||
          (cohortDigits && (uClass.includes(cohortDigits) || uCode.startsWith(cohortDigits)));
        if (!matchCohort) return false;
      }

      if (selectedMajor !== "all" && u.faculty !== selectedMajor) return false;
      if (selectedClass !== "all" && !String(u.className || "").toLowerCase().includes(selectedClass.toLowerCase())) return false;

      if (parsedNL) {
        if (parsedNL.major) {
          const uFaculty = removeVietnameseTones(u.faculty || "");
          const targetFac = removeVietnameseTones(parsedNL.major);
          if (!uFaculty.includes(targetFac)) return false;
        }

        if (parsedNL.status === "pending" && (u.verificationStatus !== "pending" && u.isVerified)) return false;
        if (parsedNL.status === "approved" && u.verificationStatus !== "approved" && !u.isVerified) return false;
        if (parsedNL.status === "rejected" && u.verificationStatus !== "rejected") return false;

        if (parsedNL.keyword) {
          const normName = removeVietnameseTones(u.name || "");
          const normEmail = removeVietnameseTones(u.email || u.zaloId || "");
          const normCode = removeVietnameseTones(u.studentCode || "");
          const normClass = removeVietnameseTones(u.className || "");

          const isMatch = normName.includes(parsedNL.keyword) ||
                          normEmail.includes(parsedNL.keyword) ||
                          normCode.includes(parsedNL.keyword) ||
                          normClass.includes(parsedNL.keyword);
          if (!isMatch) return false;
        }
      }

      return true;
    });
  }, [activeTab, pendingUsers, users, parsedNL, selectedMajor, selectedCohort, selectedClass]);

  const handleVerify = async (userId, action) => {
    setActiveMenuData(null);
    try {
      const d = await safeFetchUsersApi(`/verify`, {
        method: "POST",
        body: JSON.stringify({ userId, action }),
      });
      if (d.success) {
        await Promise.all([fetchPendingUsers(), fetchUsers()]);
      } else {
        alert(d.message || "Không thể thực hiện thao tác");
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ");
    }
  };

  const handleDeleteUser = async (userId, name) => {
    setActiveMenuData(null);
    if (!window.confirm(`Xác nhận xóa vĩnh viễn tài khoản "${name}" khỏi cơ sở dữ liệu?`)) return;

    try {
      const d = await safeFetchUsersApi(`/${userId}`, { method: "DELETE" });
      if (d.success) {
        alert("Đã xóa sinh viên thành công!");
        await Promise.all([fetchUsers(), fetchPendingUsers()]);
      } else {
        alert(d.message || "Không thể xóa sinh viên này!");
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ khi xóa");
    }
  };

  const handleOpenEdit = (user) => {
    setActiveMenuData(null);
    setEditingUser(user);
    setEditFormData({
      name: user.name || "",
      email: user.email || "",
      studentCode: user.studentCode || "",
      className: user.className || "",
      faculty: user.faculty || options.majors[0]?.majorName || "Hệ Thống Thông Tin",
      totalCredits: user.totalCredits || 0,
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const d = await safeFetchUsersApi(`/${editingUser.id}`, {
        method: "PUT",
        body: JSON.stringify(editFormData),
      });

      if (d.success) {
        setEditingUser(null);
        await Promise.all([fetchUsers(), fetchPendingUsers()]);
        alert(d.message || "Đã cập nhật hồ sơ! Sinh viên đã được chuyển về tab Chờ duyệt.");
        setActiveTab("pending");
      } else {
        alert(d.message || d.error || "Cập nhật thất bại!");
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
    const menuHeight = 150;

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

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedData = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="d-flex flex-column gap-4 w-100" style={{ color: "#1e293b" }}>
      {/* 1. KHỐI ĐIỀU KHIỂN & BỘ LỌC */}
      <div 
        className="bg-white rounded-4 p-4 border shadow-sm mb-2"
        style={{ borderColor: "#e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}
      >
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 pb-1">
          <div className="d-flex align-items-center gap-3">
            <span
              className="rounded-3 d-flex align-items-center justify-content-center text-white flex-shrink-0"
              style={{
                width: "40px",
                height: "40px",
                background: "linear-gradient(135deg, #185bf0 0%, #2563eb 100%)",
              }}
            >
              <i className="bi bi-people-fill fs-5"></i>
            </span>
            <div>
              <h6 className="fw-black text-dark mb-0 fs-6">
                Quản Lý Sinh Viên & Phê Duyệt Vào Lớp
              </h6>
              <small className="text-secondary fw-medium" style={{ fontSize: "12px" }}>
                Đồng bộ dữ liệu thời gian thực giữa Zalo Mini App và Cơ sở dữ liệu đào tạo
              </small>
            </div>
          </div>

          <div className="p-1 bg-slate-100 rounded-pill border d-inline-flex gap-1 overflow-x-auto flex-nowrap" style={{ borderColor: "#e2e8f0" }}>
            <button
              onClick={() => { setActiveTab("all"); setCurrentPage(1); }}
              className={`btn btn-sm rounded-pill px-3.5 py-1.5 fw-bold border-0 transition text-nowrap cursor-pointer ${
                activeTab === "all" ? "btn-primary text-white shadow-xs" : "text-secondary bg-transparent hover:text-dark"
              }`}
              style={{ fontSize: "12px", background: activeTab === "all" ? "#185bf0" : "transparent" }}
            >
              Tất cả sinh viên ({users.length})
            </button>
            <button
              onClick={() => { setActiveTab("pending"); setCurrentPage(1); }}
              className={`btn btn-sm rounded-pill px-3.5 py-1.5 fw-bold border-0 transition position-relative text-nowrap cursor-pointer ${
                activeTab === "pending" ? "btn-warning text-dark shadow-xs" : "text-secondary bg-transparent hover:text-dark"
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

        {/* Thanh tìm kiếm & bộ lọc */}
        <div className="row g-2.5 pt-1 align-items-end">
          <div className="col-12 col-md-4">
            <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "15px" }}>
              <label className="form-label text-uppercase text-secondary fw-bold mb-0 d-block" style={{ fontSize: "10px" }}>
                Tìm kiếm thông minh (Tự nhiên)
              </label>
            </div>
            <div className="input-group input-group-sm" style={{ height: "32px" }}>
              <span className="input-group-text bg-white border-end-0 text-primary ps-2.5 d-flex align-items-center justify-content-center" style={{ borderColor: "#e2e8f0", height: "32px" }}>
                <i className="bi bi-stars"></i>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="VD: K23 HTTT, hoặc tên, MSSV..."
                className="form-control form-control-sm rounded-end-3 bg-white border-start-0 shadow-none fw-semibold"
                style={{ fontSize: "12px", borderColor: "#e2e8f0", height: "32px" }}
              />
            </div>
          </div>

          <div className="col-6 col-md-3">
            <div className="mb-1" style={{ minHeight: "15px" }}>
              <label className="form-label text-uppercase text-secondary fw-bold mb-0 d-block text-truncate" style={{ fontSize: "10px" }}>
                Ngành Đào Tạo
              </label>
            </div>
            <select
              value={selectedMajor}
              onChange={(e) => setSelectedMajor(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0", height: "32px" }}
            >
              <option value="all">Tất cả chuyên ngành</option>
              {options.majors.map((m) => (
                <option key={m.majorCode} value={m.majorName}>
                  [{m.majorCode}] {m.majorName}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <div className="mb-1" style={{ minHeight: "15px" }}>
              <label className="form-label text-uppercase text-secondary fw-bold mb-0 d-block" style={{ fontSize: "10px" }}>
                Khóa Tuyển Sinh
              </label>
            </div>
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="form-select form-select-sm rounded-3 bg-white shadow-none fw-semibold"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0", height: "32px" }}
            >
              <option value="all">Tất cả khóa</option>
              {options.cohorts.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="col-8 col-md-2">
            <div className="mb-1" style={{ minHeight: "15px" }}>
              <label className="form-label text-uppercase text-secondary fw-bold mb-0 d-block" style={{ fontSize: "10px" }}>
                Lớp Sinh Hoạt
              </label>
            </div>
            <input
              type="text"
              value={selectedClass === "all" ? "" : selectedClass}
              onChange={(e) => setSelectedClass(e.target.value.trim() || "all")}
              placeholder="VD: HTTT2311"
              className="form-control form-control-sm rounded-3 bg-white shadow-none fw-semibold font-monospace text-primary"
              style={{ fontSize: "12.5px", borderColor: "#e2e8f0", height: "32px" }}
            />
          </div>

          <div className="col-4 col-md-1">
            <div className="mb-1" style={{ minHeight: "15px" }}></div>
            <button
              onClick={() => {
                setSearchTerm("");
                setSelectedMajor("all");
                setSelectedCohort("all");
                setSelectedClass("all");
              }}
              className="btn btn-outline-secondary btn-sm w-100 fw-bold rounded-3 shadow-none d-flex align-items-center justify-content-center cursor-pointer bg-white"
              style={{ height: "32px", fontSize: "12px", borderColor: "#e2e8f0" }}
              title="Đặt lại bộ lọc"
            >
              <i className="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
        </div>
      </div>

      {/* 2. BẢNG DANH SÁCH */}
      <div className="rounded-4 p-4 shadow-sm bg-white border" style={{ borderColor: "#e2e8f0" }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className={`badge px-3 py-1.5 rounded-pill fw-bold border ${
            activeTab === "pending" ? "bg-warning-subtle text-dark border-warning-subtle" : "bg-primary-subtle text-primary border-primary-subtle"
          }`} style={{ fontSize: "11px" }}>
            {activeTab === "pending" ? `Hàng chờ phê duyệt (${pendingUsers.length} hồ sơ)` : "Danh sách sinh viên đã duyệt"}
          </span>
          <small className="text-muted fw-semibold">Tổng: <b>{filteredUsers.length}</b> tài khoản</small>
        </div>

        <div className="table-responsive" style={{ minHeight: "260px" }}>
          <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "860px" }}>
            <thead className="table-light">
              <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                <th className="ps-3" style={{ width: "270px" }}>Sinh Viên</th>
                <th style={{ width: "160px" }}>MSSV / Lớp</th>
                <th style={{ width: "180px" }}>Chuyên Ngành</th>
                <th className="text-center" style={{ width: "100px" }}>Tín Chỉ</th>
                <th className="text-center" style={{ width: "110px" }}>Chuỗi Học</th>
                <th className="text-center" style={{ width: "130px" }}>Phê Duyệt</th>
                <th className="text-end pe-3" style={{ width: "70px" }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody style={{ fontSize: "13px" }}>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-5 text-muted">Đang nạp dữ liệu...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    {activeTab === "pending" ? "Không có sinh viên nào đang chờ duyệt vào lớp." : "Không tìm thấy sinh viên nào phù hợp."}
                  </td>
                </tr>
              ) : (
                paginatedData.map((u) => (
                  <tr key={u.id}>
                    <td className="ps-3">
                      <div className="d-flex align-items-center gap-2.5">
                        <img
                          src={u.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || "SV")}&background=185bf0&color=fff`}
                          alt="Avatar"
                          className="rounded-circle border"
                          style={{ width: "36px", height: "36px", objectFit: "cover" }}
                        />
                        <div>
                          <span className="fw-bold text-dark d-block text-truncate" style={{ maxWidth: "190px" }}>
                            {u.name}
                          </span>
                          <span className="text-muted d-block text-truncate font-mono" style={{ fontSize: "10.5px", maxWidth: "190px" }}>
                            {u.email || u.zaloId || "Chưa có email"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="d-flex flex-column gap-0.5">
                        {u.studentCode ? (
                          <span
                            className="font-monospace fw-bold px-2 py-0.5 rounded-1 border d-inline-block text-truncate"
                            style={{
                              fontSize: "11px",
                              backgroundColor: "#eff6ff",
                              color: "#1d4ed8",
                              borderColor: "#bfdbfe",
                              maxWidth: "110px",
                            }}
                          >
                            {u.studentCode}
                          </span>
                        ) : (
                          <span className="text-danger small fst-italic">Thiếu MSSV</span>
                        )}
                        <span className="small font-monospace fw-bold text-primary" style={{ fontSize: "11px" }}>
                          {u.className || "Chưa xếp lớp"}
                        </span>
                      </div>
                    </td>

                    <td className="fw-semibold text-secondary">{u.faculty || "Hệ Thống Thông Tin"}</td>
                    <td className="text-center"><span className="badge bg-light text-dark border px-2.5 py-1 fw-bold">{u.totalCredits || 0} tín</span></td>
                    <td className="text-center">
                      {Number(u.currentStreak) > 0 ? (
                        <span className="badge text-white px-2.5 py-1 rounded-pill fw-bold" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", fontSize: "11px" }}>
                          🔥 {u.currentStreak} ngày
                        </span>
                      ) : (
                        <span className="text-muted small">0 ngày</span>
                      )}
                    </td>
                    <td className="text-center">
                      {u.verificationStatus === "approved" || (u.isVerified && u.verificationStatus !== "pending") ? (
                        <span className="badge rounded-pill px-2.5 py-1 fw-bold" style={{ background: "#ecfdf5", color: "#059669", border: "1px solid #a7f3d0", fontSize: "11px" }}>
                          ✓ Đã vào lớp
                        </span>
                      ) : u.verificationStatus === "rejected" ? (
                        <span className="badge rounded-pill px-2.5 py-1 fw-bold" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", fontSize: "11px" }}>
                          ✕ Bị từ chối
                        </span>
                      ) : (
                        <span className="badge rounded-pill px-2.5 py-1 fw-bold" style={{ background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", fontSize: "11px" }}>
                          ⏳ Chờ duyệt
                        </span>
                      )}
                    </td>
                    <td className="text-end pe-3">
                      <button
                        type="button"
                        onClick={(e) => toggleActionMenu(e, u)}
                        className="btn btn-sm btn-light rounded-circle d-inline-flex align-items-center justify-content-center p-0 border cursor-pointer"
                        style={{ width: "30px", height: "30px", color: "#64748b" }}
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

        {/* Phân Trang */}
        {!loading && (
          <div className="d-flex flex-wrap justify-content-between align-items-center pt-3 mt-2 border-top gap-2" style={{ borderColor: "#f1f5f9" }}>
            <div className="d-flex align-items-center gap-2">
              <small className="text-muted fw-bold">Hiển thị:</small>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="form-select form-select-sm fw-bold border rounded-2 py-0 px-2 cursor-pointer shadow-none"
                style={{ width: "65px", height: "28px", fontSize: "11.5px", borderColor: "#e2e8f0" }}
              >
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
              </select>
              <small className="text-muted" style={{ fontSize: "12px" }}>
                (Dòng <b>{filteredUsers.length ? (currentPage - 1) * itemsPerPage + 1 : 0}</b> - <b>{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</b> / <b>{filteredUsers.length}</b> tài khoản)
              </small>
            </div>

            <div className="d-flex align-items-center gap-1 ms-auto">
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none cursor-pointer" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                <i className="bi bi-chevron-double-left small"></i>
              </button>
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none cursor-pointer" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                <i className="bi bi-chevron-left small"></i>
              </button>
              <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "12px" }}>{currentPage} / {totalPages}</span>
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none cursor-pointer" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                <i className="bi bi-chevron-right small"></i>
              </button>
              <button className="btn btn-sm btn-light border px-2 py-1 rounded-2 shadow-none cursor-pointer" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                <i className="bi bi-chevron-double-right small"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Menu rút gọn (Chỉ giữ Duyệt, Sửa hồ sơ và Xóa) */}
      {activeMenuData && (
        <div
          ref={menuDropdownRef}
          className="card border-0 shadow-lg rounded-3 py-1 text-start position-fixed"
          style={{
            width: "180px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
            zIndex: 99999,
            top: `${activeMenuData.top}px`,
            right: `${activeMenuData.right}px`,
          }}
        >
          {(!activeMenuData.user.isVerified || activeMenuData.user.verificationStatus === "pending") && (
            <>
              <button 
                type="button" 
                onClick={() => handleVerify(activeMenuData.user.id, "approve")} 
                disabled={!activeMenuData.user.studentCode}
                className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-success border-0 bg-transparent fw-bold cursor-pointer"
              >
                <i className="bi bi-check-circle-fill"></i>
                <span>Duyệt vào lớp</span>
              </button>
              <button 
                type="button" 
                onClick={() => handleVerify(activeMenuData.user.id, "reject")} 
                className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent fw-bold cursor-pointer"
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
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent cursor-pointer fw-semibold"
          >
            <i className="bi bi-pencil text-primary"></i>
            <span>Chỉnh sửa hồ sơ</span>
          </button>

          <div className="dropdown-divider my-1 border-top" style={{ borderColor: "#f1f5f9" }}></div>

          <button 
            type="button" 
            onClick={() => handleDeleteUser(activeMenuData.user.id, activeMenuData.user.name)} 
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent cursor-pointer fw-semibold"
          >
            <i className="bi bi-trash3"></i>
            <span>Xóa sinh viên</span>
          </button>
        </div>
      )}

      {/* Modal Sửa Hồ Sơ */}
      {editingUser && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "460px" }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="d-flex align-items-center justify-content-between px-4 pt-4 pb-2 border-bottom" style={{ borderColor: "#f1f5f9" }}>
                <h6 className="fw-bold mb-0 text-dark">Cập Nhật Hồ Sơ Sinh Viên</h6>
                <button type="button" onClick={() => setEditingUser(null)} className="btn btn-sm btn-light rounded-circle p-0 cursor-pointer" style={{ width: "28px", height: "28px" }}>
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                <div className="modal-body px-4 py-3 d-flex flex-column gap-2.5">
                  <div className="alert alert-warning py-1.5 px-2.5 small mb-1 border-warning-subtle text-dark" style={{ fontSize: "11px" }}>
                    <i className="bi bi-info-circle-fill me-1 text-warning"></i>
                    Lưu ý: Mọi chỉnh sửa sẽ đưa sinh viên về hàng <b>Chờ duyệt (Pending)</b> để xác thực lại.
                  </div>

                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Họ và tên *</label>
                    <input type="text" required value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="form-control form-control-sm rounded-3 shadow-none fw-bold" />
                  </div>
                  <div>
                    <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Email OTP</label>
                    <input type="email" value={editFormData.email} disabled className="form-control form-control-sm rounded-3 shadow-none bg-light text-muted fw-semibold" />
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>MSSV</label>
                      <input type="text" value={editFormData.studentCode} onChange={(e) => setEditFormData({ ...editFormData, studentCode: e.target.value.toUpperCase() })} className="form-control form-control-sm rounded-3 shadow-none font-monospace fw-bold text-primary" />
                    </div>
                    <div className="col-6">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Lớp Sinh Hoạt</label>
                      <input type="text" value={editFormData.className} onChange={(e) => setEditFormData({ ...editFormData, className: e.target.value.toUpperCase() })} className="form-control form-control-sm rounded-3 shadow-none fw-bold" />
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-8">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Chuyên Ngành</label>
                      <select value={editFormData.faculty} onChange={(e) => setEditFormData({ ...editFormData, faculty: e.target.value })} className="form-select form-select-sm rounded-3 shadow-none fw-semibold">
                        {options.majors.map((m) => (
                          <option key={m.majorCode} value={m.majorName}>{m.majorName}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-4">
                      <label className="form-label text-uppercase text-secondary fw-bold mb-1" style={{ fontSize: "10px" }}>Tín Chỉ</label>
                      <input type="number" value={editFormData.totalCredits} onChange={(e) => setEditFormData({ ...editFormData, totalCredits: Number(e.target.value) })} className="form-control form-control-sm rounded-3 shadow-none fw-bold" />
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-0 px-4 pt-1 pb-4 d-flex justify-content-end gap-2">
                  <button type="button" onClick={() => setEditingUser(null)} className="btn btn-light rounded-pill px-3.5 py-1.5 small border cursor-pointer">Hủy</button>
                  <button type="submit" className="btn btn-primary rounded-pill px-4 py-1.5 small border-0 text-white cursor-pointer" style={{ background: "#185bf0" }}>Lưu & Đưa về chờ duyệt</button>
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