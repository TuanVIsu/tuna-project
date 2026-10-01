// src/pages/index/ProfileSection.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { handleZaloLogin, getCurrentUser } from "../../services/authService";

const API_BASE = "https://tuna-project.onrender.com/api";

export const ProfileSection = ({ currentUser: initialUser }) => {
  const [user, setUser] = useState(initialUser || getCurrentUser());
  const [loading, setLoading] = useState(false);

  // Thống kê động từ PostgreSQL
  const [stats, setStats] = useState({
    streak: 0,
    xp: 0,
    rank: "-",
  });

  // Danh sách ngành nạp tự động từ CSDL
  const [availableFaculties, setAvailableFaculties] = useState([]);

  // Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [studentCodeInput, setStudentCodeInput] = useState("");
  const [classNameInput, setClassNameInput] = useState("");
  const [facultyInput, setFacultyInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Đồng bộ User ID duy nhất
  const myUserId = useMemo(() => {
    let savedId = localStorage.getItem("tuna_user_id");
    if (!savedId) {
      savedId = user?.student_code || user?.id || "B2300001";
      localStorage.setItem("tuna_user_id", String(savedId));
    }
    return String(savedId);
  }, [user]);

  // Nạp danh mục chuyên ngành từ CSDL
  const fetchFaculties = async () => {
    try {
      const res = await fetch(`${API_BASE}/library/majors`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setAvailableFaculties(json.data);
      }
    } catch (e) {
      console.warn("Không tải được danh mục khoa từ DB:", e);
    }
  };

  // Nạp dữ liệu cá nhân & thống kê thực tế từ DB
  const fetchProfileAndStats = useCallback(async () => {
    if (!myUserId) return;
    try {
      const res = await fetch(`${API_BASE}/student/profile/${myUserId}`);
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.user) {
          setUser((prev) => ({ ...prev, ...json.data.user }));
          localStorage.setItem("user", JSON.stringify(json.data.user));
          localStorage.setItem("user_info", JSON.stringify(json.data.user));
        }
        if (json.data.stats) {
          setStats(json.data.stats);
          localStorage.setItem("user_current_streak", String(json.data.stats.streak));
          localStorage.setItem("user_study_xp", String(json.data.stats.xp));
        }
      }
    } catch (err) {
      console.error("Lỗi nạp thông tin hồ sơ:", err);
    }
  }, [myUserId]);

  useEffect(() => {
    fetchFaculties();
    fetchProfileAndStats();
  }, [fetchProfileAndStats]);

  useEffect(() => {
    if (user) {
      setNameInput(user.name || "");
      setStudentCodeInput(user.student_code || "");
      setClassNameInput(user.class_name || "");
      setFacultyInput(user.faculty || (availableFaculties[0] || ""));
    }
  }, [user, availableFaculties]);

  const onLoginClick = async () => {
    setLoading(true);
    try {
      const loggedUser = await handleZaloLogin();
      if (loggedUser) {
        setUser(loggedUser);
        fetchProfileAndStats();
      }
    } catch (e) {
      alert("Đăng nhập thất bại: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onLogoutClick = () => {
    localStorage.removeItem("user_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_info");
    localStorage.removeItem("user");
    localStorage.removeItem("tuna_user_id");
    setUser(null);
  };

  const handleOpenEdit = () => {
    if (!user) {
      alert("Vui lòng đăng nhập bằng Zalo trước!");
      return;
    }
    setNameInput(user.name || "");
    setStudentCodeInput(user.student_code || "");
    setClassNameInput(user.class_name || "");
    setFacultyInput(user.faculty || (availableFaculties[0] || ""));
    setShowEditModal(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      alert("Vui lòng nhập Họ và tên!");
      return;
    }
    if (!studentCodeInput.trim()) {
      alert("Vui lòng nhập Mã số sinh viên (MSSV)!");
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/student/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zaloId: user.zalo_id || user.id || myUserId,
          name: nameInput.trim(),
          studentCode: studentCodeInput.trim(),
          className: classNameInput.trim(),
          faculty: facultyInput.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("✅ Cập nhật hồ sơ sinh viên thành công!");
        const updatedUser = {
          ...user,
          name: nameInput.trim(),
          student_code: studentCodeInput.trim(),
          class_name: classNameInput.trim(),
          faculty: facultyInput.trim(),
          verification_status: "pending",
        };
        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
        localStorage.setItem("user_info", JSON.stringify(updatedUser));
        localStorage.setItem("tuna_user_id", studentCodeInput.trim());
        setShowEditModal(false);
        fetchProfileAndStats();
      } else {
        alert("⚠️ " + (data.message || "Không thể cập nhật hồ sơ!"));
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ đào tạo");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pb-8 px-1">
      {/* Khối Thông tin Người dùng */}
      {!user ? (
        <div className="bg-white rounded-3xl p-5 shadow-xs border border-slate-200/80 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-3xl mb-3 shadow-inner">
            <i className="bi bi-person-circle"></i>
          </div>
          <h5 className="font-black text-slate-900 mb-1 text-sm">Chào bạn!</h5>
          <p className="text-xs text-slate-500 mb-4 font-medium">
            Đăng nhập qua Zalo để đồng bộ tiến độ học tập, bài thi và phân quyền.
          </p>
          <button
            onClick={onLoginClick}
            disabled={loading}
            className="w-full py-3 bg-[#0068FF] hover:bg-blue-700 text-white font-black rounded-2xl shadow-md shadow-blue-500/20 active:scale-95 transition flex items-center justify-center gap-2 border-0 cursor-pointer text-xs"
          >
            {loading ? (
              <div className="spinner-border spinner-border-sm" role="status"></div>
            ) : (
              <>
                <i className="bi bi-shield-lock-fill"></i> Đăng nhập bằng Zalo
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-blue-500 p-0.5 shadow-xs shrink-0 bg-blue-50 flex items-center justify-center">
              {user.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="font-black text-blue-600 text-lg">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : "SV"}
                </span>
              )}
            </div>

            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <h6 className="font-black text-slate-900 mb-0 text-[15px] truncate">
                  {user.name || "Người dùng"}
                </h6>
                <span
                  className={`px-2 py-0.5 text-[9.5px] font-extrabold rounded-full uppercase shrink-0 ${
                    user.is_verified || user.verification_status === "approved"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {user.is_verified || user.verification_status === "approved"
                    ? "Đã duyệt"
                    : "Chờ duyệt"}
                </span>
              </div>
              <p className="text-[11.5px] text-slate-500 mb-0 mt-0.5 truncate font-medium">
                MSSV: <b className="text-blue-700">{user.student_code || "Chưa cập nhật"}</b> • Lớp: <b className="text-slate-700">{user.class_name || "Chưa phân lớp"}</b>
              </p>
              <p className="text-[11px] text-slate-400 mb-0 truncate font-semibold">
                Khoa: {user.faculty || "Chưa cập nhật khoa"}
              </p>
            </div>
          </div>

          {/* 3 Ô Thống kê dữ liệu thực tế từ PostgreSQL */}
          <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 text-center">
            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-500 font-bold block">Chuỗi học</span>
              <span className="text-xs font-black text-slate-900">🔥 {stats.streak} ngày</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-500 font-bold block">Điểm thưởng</span>
              <span className="text-xs font-black text-blue-600">⚡ {stats.xp} XP</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-500 font-bold block">Xếp hạng</span>
              <span className="text-xs font-black text-amber-600">
                🏆 Top {stats.rank}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Cài đặt & Sửa hồ sơ */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 space-y-2.5">
        <p className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
          Tài khoản & Hồ sơ sinh viên
        </p>

        <div
          onClick={handleOpenEdit}
          className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 active:scale-98 transition cursor-pointer border border-transparent hover:border-slate-200/80"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0 border border-blue-100">
              <i className="bi bi-person-badge"></i>
            </div>
            <div className="truncate">
              <p className="text-xs font-black text-slate-800 m-0 leading-tight">Chỉnh sửa hồ sơ</p>
              <p className="text-[11px] text-slate-500 m-0 mt-0.5 truncate font-medium">
                {user?.student_code
                  ? `${user.name} • ${user.student_code} • ${user.class_name || "Chưa có lớp"}`
                  : "Cập nhật MSSV, lớp và chuyên ngành"}
              </p>
            </div>
          </div>
          <span className="bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0">
            Sửa
          </span>
        </div>
      </div>

      {user && (
        <button
          onClick={onLogoutClick}
          className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black rounded-2xl border border-rose-200 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer text-xs shadow-2xs mt-2"
        >
          <i className="bi bi-box-arrow-right"></i> Đăng xuất tài khoản
        </button>
      )}

      {/* MODAL CẬP NHẬT HỒ SƠ */}
      {showEditModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3 z-50 animate-fade-in"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(4px)" }}
        >
          <div className="bg-white p-4 rounded-3xl shadow-2xl w-100 border border-slate-200" style={{ maxWidth: "390px" }}>
            <div className="d-flex align-items-center justify-content-between mb-3 border-b pb-2">
              <h6 className="fw-black text-dark mb-0 d-flex align-items-center gap-2 text-sm">
                <i className="bi bi-person-vcard text-primary fs-5"></i>
                Hồ Sơ Sinh Viên
              </h6>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="btn btn-sm btn-light rounded-circle p-0"
                style={{ width: "28px", height: "28px" }}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="d-flex flex-column gap-2.5">
              <div>
                <label className="form-label text-muted small fw-bold mb-1">
                  Họ và Tên Sinh Viên *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn A"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="form-control form-control-sm rounded-3 fw-bold text-dark"
                />
              </div>

              <div>
                <label className="form-label text-muted small fw-bold mb-1">
                  Mã Số Sinh Viên (MSSV) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: B2300001"
                  value={studentCodeInput}
                  onChange={(e) => setStudentCodeInput(e.target.value)}
                  className="form-control form-control-sm rounded-3 fw-bold text-primary"
                />
              </div>

              <div>
                <label className="form-label text-muted small fw-bold mb-1">Chuyên Ngành (Từ CSDL)</label>
                <select
                  value={facultyInput}
                  onChange={(e) => setFacultyInput(e.target.value)}
                  className="form-select form-select-sm rounded-3 fw-semibold"
                >
                  {availableFaculties.length > 0 ? (
                    availableFaculties.map((f, i) => (
                      <option key={i} value={f}>
                        {f}
                      </option>
                    ))
                  ) : (
                    <option value={facultyInput || "Hệ Thống Thông Tin"}>
                      {facultyInput || "Hệ Thống Thông Tin"}
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label className="form-label text-muted small fw-bold mb-1">Mã Lớp Sinh Hoạt *</label>
                <input
                  type="text"
                  required
                  placeholder="VD: HTTT2311"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  className="form-control form-control-sm rounded-3 fw-bold"
                />
              </div>

              <div className="d-flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-light rounded-pill py-2 fw-bold flex-1 border text-secondary"
                  style={{ fontSize: "12px" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="btn btn-primary rounded-pill py-2 fw-bold flex-1 border-0 text-white"
                  style={{ background: "#185bf0", fontSize: "12px" }}
                >
                  {isUpdating ? "Đang lưu..." : "Cập nhật ngay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSection;