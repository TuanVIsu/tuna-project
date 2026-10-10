// src/pages/index/ProfileSection.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { getCurrentUser } from "../../services/authService";

const API_BASE = "https://tuna-project.onrender.com/api";
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80";

export const ProfileSection = ({ currentUser: initialUser }) => {
  const [user, setUser] = useState(initialUser || getCurrentUser());
  const [stats, setStats] = useState({
    streak: 0,
    xp: 0,
    rank: "-",
  });

  const [availableFaculties, setAvailableFaculties] = useState([]);

  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [studentCodeInput, setStudentCodeInput] = useState("");
  const [facultyInput, setFacultyInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const myUserId = useMemo(() => {
    let savedId = localStorage.getItem("tuna_user_id");
    if (!savedId) {
      savedId = user?.student_code || user?.id || "B2300001";
      localStorage.setItem("tuna_user_id", String(savedId));
    }
    return String(savedId);
  }, [user]);

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
      setFacultyInput(user.faculty || (availableFaculties[0] || "Hệ Thống Thông Tin"));
    }
  }, [user, availableFaculties]);

  const onLogoutClick = () => {
    localStorage.removeItem("user_token");
    localStorage.removeItem("token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_info");
    localStorage.removeItem("user");
    localStorage.removeItem("tuna_current_user");
    localStorage.removeItem("tuna_user_id");
    setUser(null);
    showToast("Đã đăng xuất tài khoản!");
    window.location.reload();
  };

  const handleOpenEdit = () => {
    if (!user) {
      showToast("Vui lòng xác thực tài khoản trước!", "error");
      return;
    }
    setNameInput(user.name || "");
    setStudentCodeInput(user.student_code || "");
    setFacultyInput(user.faculty || (availableFaculties[0] || "Hệ Thống Thông Tin"));
    setShowEditModal(true);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) {
      showToast("Vui lòng nhập Họ và tên!", "error");
      return;
    }
    if (!studentCodeInput.trim()) {
      showToast("Vui lòng nhập Mã số sinh viên (MSSV)!", "error");
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/student/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zaloId: user.zalo_id || `ctut_${studentCodeInput.trim().toLowerCase()}`,
          name: nameInput.trim(),
          studentCode: studentCodeInput.trim().toUpperCase(),
          faculty: facultyInput.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast("Cập nhật hồ sơ sinh viên thành công!");
        const updatedUser = {
          ...user,
          name: nameInput.trim(),
          student_code: studentCodeInput.trim().toUpperCase(),
          faculty: facultyInput.trim(),
          verification_status: "approved",
          is_verified: true,
        };
        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
        localStorage.setItem("user_info", JSON.stringify(updatedUser));
        localStorage.setItem("tuna_user_id", studentCodeInput.trim().toUpperCase());
        setShowEditModal(false);
        fetchProfileAndStats();
      } else {
        showToast(data.message || "Không thể cập nhật hồ sơ!", "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối máy chủ đào tạo!", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 pb-8 px-1 w-full relative">
      {toastMessage && (
        <div 
          className="fixed top-24 left-3 right-3 z-50 flex items-center justify-between p-3.5 rounded-2xl shadow-xl border animate-in slide-in-from-top duration-300 backdrop-blur-md break-words"
          style={{
            backgroundColor: toastMessage.type === "error" ? "rgba(239, 68, 68, 0.95)" : "rgba(16, 185, 129, 0.95)",
            color: "white",
            borderColor: toastMessage.type === "error" ? "#f87171" : "#34d399",
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center text-sm shrink-0">
              <i className={`bi ${toastMessage.type === "error" ? "bi-exclamation-triangle-fill" : "bi-check2-circle"} text-base`}></i>
            </span>
            <span className="text-xs font-black truncate leading-snug">
              {toastMessage.message}
            </span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="w-6 h-6 rounded-full bg-white/20 text-white flex items-center justify-center border-0 cursor-pointer shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Thẻ thông tin cá nhân */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#0045ce] p-0.5 shadow-xs shrink-0 bg-blue-50 flex items-center justify-center">
            <img
              src={user?.avatar || DEFAULT_AVATAR}
              alt="Avatar"
              className="w-full h-full object-cover rounded-full"
              onError={(e) => {
                e.target.src = DEFAULT_AVATAR;
              }}
            />
          </div>

          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            <div className="flex items-center gap-2">
              <h6 className="font-black text-slate-900 mb-0 text-[15px] truncate break-words">
                {user?.name || "Sinh viên"}
              </h6>
              <span
                className={`px-2 py-0.5 text-[9.5px] font-extrabold rounded-full uppercase shrink-0 ${
                  user?.is_verified || user?.verification_status === "approved"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {user?.is_verified || user?.verification_status === "approved"
                  ? "Đã duyệt"
                  : "Chờ duyệt"}
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 mb-0 mt-0.5 truncate font-medium">
              MSSV: <b className="text-[#0045ce]">{user?.student_code || "Chưa cập nhật"}</b>
            </p>
            <p className="text-[11px] text-slate-400 mb-0 truncate font-semibold">
              Ngành: {user?.faculty || "Chưa xác nhận"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 text-center">
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-500 font-bold block">Chuỗi học</span>
            <span className="text-xs font-black text-slate-900">🔥 {stats.streak} ngày</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-500 font-bold block">Điểm thưởng</span>
            <span className="text-xs font-black text-[#0045ce]">⚡ {stats.xp} XP</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
            <span className="text-[10px] text-slate-500 font-bold block">Xếp hạng</span>
            <span className="text-xs font-black text-amber-600">
              🏆 Top {stats.rank}
            </span>
          </div>
        </div>
      </div>

      {/* Cài đặt tài khoản */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 space-y-2.5">
        <p className="text-[10.5px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
          Tài khoản & Hồ sơ sinh viên
        </p>

        <div
          onClick={handleOpenEdit}
          className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 active:scale-98 transition cursor-pointer border border-transparent hover:border-slate-200/80"
        >
          <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#0045ce] flex items-center justify-center text-lg shrink-0 border border-blue-100">
              <i className="bi bi-person-badge"></i>
            </div>
            <div className="truncate min-w-0 flex-1">
              <p className="text-xs font-black text-slate-800 m-0 leading-tight">Chỉnh sửa hồ sơ</p>
              <p className="text-[11px] text-slate-500 m-0 mt-0.5 truncate font-medium">
                {user?.student_code
                  ? `${user.name} • ${user.student_code} • ${user.faculty || "Hệ Thống Thông Tin"}`
                  : "Cập nhật MSSV và chuyên ngành"}
              </p>
            </div>
          </div>
          <span className="bg-blue-50 text-[#0045ce] border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0">
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

      {/* Modal Sửa Hồ Sơ */}
      {showEditModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3 z-50 animate-fade-in"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(4px)" }}
        >
          <div className="bg-white p-4 rounded-3xl shadow-2xl w-100 border border-slate-200" style={{ maxWidth: "390px" }}>
            <div className="d-flex align-items-center justify-content-between mb-3 border-b pb-2">
              <h6 className="fw-black text-dark mb-0 d-flex align-items-center gap-2 text-sm">
                <i className="bi bi-person-vcard text-[#0045ce] fs-5"></i>
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
                  onChange={(e) => setStudentCodeInput(e.target.value.toUpperCase())}
                  className="form-control form-control-sm rounded-3 fw-bold text-[#0045ce] uppercase"
                />
              </div>

              <div>
                <label className="form-label text-muted small fw-bold mb-1">Chuyên Ngành</label>
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
                  className="btn rounded-pill py-2 fw-bold flex-1 border-0 text-white"
                  style={{ background: "#0045ce", fontSize: "12px" }}
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