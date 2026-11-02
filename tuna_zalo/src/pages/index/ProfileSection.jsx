// src/pages/index/ProfileSection.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { io } from "socket.io-client";
import { getCurrentUser } from "../../services/authService";

const API_BASE = "https://tuna-project.onrender.com/api";
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80";

export const ProfileSection = ({ currentUser: initialUser }) => {
  const [user, setUser] = useState(() => initialUser || getCurrentUser());
  
  // Khởi tạo state từ localStorage để tránh giật số
  const [stats, setStats] = useState(() => {
    const cachedStreak = Number(localStorage.getItem("user_current_streak") || 0);
    const cachedXp = Number(localStorage.getItem("user_study_xp") || 0);
    return {
      streak: cachedStreak,
      xp: cachedXp,
      rank: "-",
    };
  });

  const [availableFaculties, setAvailableFaculties] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  // State Form chỉnh sửa hồ sơ
  const [showEditModal, setShowEditModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [studentCodeInput, setStudentCodeInput] = useState("");
  const [classNameInput, setClassNameInput] = useState("");
  const [facultyInput, setFacultyInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Định danh người dùng chuẩn xác
  const myUserId = useMemo(() => {
    const saved = localStorage.getItem("tuna_user_id") || user?.student_code || user?.id || user?.zalo_id || user?.email;
    return saved ? String(saved).trim() : "";
  }, [user]);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token") || localStorage.getItem("user_token") || localStorage.getItem("admin_token") || "";
    const headers = {
      "Content-Type": "application/json",
      "x-user-id": myUserId || "",
    };
    if (token && token !== "null" && token !== "undefined") {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [myUserId]);

  // Nạp danh mục chuyên ngành từ CSDL
  const fetchFaculties = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/library/majors`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setAvailableFaculties(json.data);
      }
    } catch (e) {
      console.warn("Không tải được danh mục khoa:", e);
    }
  }, [getAuthHeaders]);

  // Đồng bộ thông tin hồ sơ và điểm streak thực tế từ DB
  const fetchProfileAndStats = useCallback(async () => {
    if (!myUserId) return;

    try {
      const [profileRes, streakRes, lbRes] = await Promise.all([
        fetch(`${API_BASE}/student/profile/${encodeURIComponent(myUserId)}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`${API_BASE}/streak/${encodeURIComponent(myUserId)}`, { headers: getAuthHeaders() }).catch(() => null),
        fetch(`${API_BASE}/leaderboard`, { headers: getAuthHeaders() }).catch(() => null),
      ]);

      // Cập nhật thông tin sinh viên từ server
      if (profileRes && profileRes.ok) {
        const json = await profileRes.json();
        const serverUser = json.data?.user || json.user;
        if (serverUser) {
          setUser((prev) => {
            const merged = { ...prev, ...serverUser };
            localStorage.setItem("user", JSON.stringify(merged));
            localStorage.setItem("user_info", JSON.stringify(merged));
            localStorage.setItem("tuna_current_user", JSON.stringify(merged));
            return merged;
          });
        }
      }

      let currentStreak = Number(localStorage.getItem("user_current_streak") || 0);
      let currentXp = Number(localStorage.getItem("user_study_xp") || 0);

      if (streakRes && streakRes.ok) {
        const sJson = await streakRes.json();
        if (sJson.success) {
          currentStreak = Number(sJson.current_streak) || 0;
          currentXp = Number(sJson.xp_points) || 0;
          localStorage.setItem("user_current_streak", String(currentStreak));
          localStorage.setItem("user_study_xp", String(currentXp));
        }
      }

      let rankText = "-";
      if (lbRes && lbRes.ok) {
        const lbJson = await lbRes.json();
        if (lbJson.success && Array.isArray(lbJson.leaderboard)) {
          const myIndex = lbJson.leaderboard.findIndex(
            (item) =>
              String(item.user_id).toLowerCase() === myUserId.toLowerCase() ||
              String(item.student_code || "").toLowerCase() === String(user?.student_code || "").toLowerCase()
          );
          if (myIndex !== -1) {
            rankText = String(myIndex + 1);
          } else {
            rankText = String(lbJson.leaderboard.length + 1);
          }
        }
      }

      setStats({
        streak: currentStreak,
        xp: currentXp,
        rank: rankText,
      });
    } catch (err) {
      console.error("Lỗi nạp thông tin hồ sơ và điểm thưởng:", err);
    }
  }, [myUserId, getAuthHeaders, user?.student_code]);

  useEffect(() => {
    fetchFaculties();
    fetchProfileAndStats();

    const handleSync = () => fetchProfileAndStats();
    window.addEventListener("tuna_study_task_completed", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("tuna_study_task_completed", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [fetchFaculties, fetchProfileAndStats]);

  // LOGIC LẮNG NGHE SOCKET TỪ BACKEND ĐỂ CHỐNG KẸT TRẠNG THÁI
  useEffect(() => {
    if (!myUserId) return;
    const socket = io(API_BASE.replace('/api', '')); 

    socket.on(`force_logout_${myUserId}`, (data) => {
      alert(data.reason || "Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên!");
      onLogoutClick(); 
    });

    socket.on(`user_verify_status_${myUserId}`, (data) => {
      setUser((prev) => {
        const updated = {
          ...prev,
          verification_status: data.status,
          is_verified: data.status === 'approved'
        };
        localStorage.setItem("user", JSON.stringify(updated));
        localStorage.setItem("user_info", JSON.stringify(updated));
        localStorage.setItem("tuna_current_user", JSON.stringify(updated));
        return updated;
      });
    });

    return () => {
      socket.off(`force_logout_${myUserId}`);
      socket.off(`user_verify_status_${myUserId}`);
      socket.disconnect();
    };
  }, [myUserId]);

  // Tự động suy ra mã lớp khi sinh viên gõ MSSV (Ví dụ: HTTT2311052 -> HTTT2311)
  const handleStudentCodeChange = (val) => {
    const cleanVal = val.toUpperCase().trim();
    setStudentCodeInput(cleanVal);
    
    if (!classNameInput || classNameInput.length < 4) {
      const match = cleanVal.match(/^([A-Z]{2,4}\d{4})/i);
      if (match) {
        setClassNameInput(match[1]);
      }
    }
  };

  const handleOpenEdit = () => {
    if (!user) {
      showToast("Vui lòng xác thực tài khoản trước!", "error");
      return;
    }
    setNameInput(user.name || "");
    setStudentCodeInput(user.student_code || "");
    setClassNameInput(user.class_name || "");
    setFacultyInput(user.faculty || (availableFaculties[0] || "Hệ Thống Thông Tin"));
    setShowEditModal(true);
  };

  // CẬP NHẬT HỒ SƠ CHUẨN XÁC LÊN SERVER
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const cleanName = nameInput.trim();
    const cleanCode = studentCodeInput.trim().toUpperCase();
    const cleanClass = classNameInput.trim().toUpperCase();
    const cleanFaculty = facultyInput.trim();

    if (!cleanName) {
      showToast("Vui lòng nhập Họ và tên sinh viên!", "error");
      return;
    }
    if (!cleanCode) {
      showToast("Vui lòng nhập Mã số sinh viên (MSSV)!", "error");
      return;
    }
    if (!cleanClass) {
      showToast("Vui lòng nhập Lớp sinh hoạt (VD: HTTT2311)!", "error");
      return;
    }

    setIsUpdating(true);
    try {
      const payload = {
        userId: user.id || myUserId,
        zaloId: user.zalo_id || null,
        email: user.email || null,
        name: cleanName,
        studentCode: cleanCode,
        className: cleanClass,
        faculty: cleanFaculty,
      };

      let res = await fetch(`${API_BASE}/student/link`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status === 404) {
        res = await fetch(`${API_BASE}/users/sync`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success || res.ok) {
        // LẤY TRỰC TIẾP TRẠNG THÁI TỪ SERVER TRẢ VỀ THAY VÌ GÁN CỨNG
        const serverStatus = data.user?.verification_status || "pending";
        const serverVerified = data.user?.is_verified || false;

        if (serverStatus === "pending") {
          showToast("Đã lưu hồ sơ! Vui lòng chờ Quản trị viên duyệt lại.", "success");
        } else {
          showToast("Cập nhật hồ sơ sinh viên thành công!");
        }
        
        const updatedUser = {
          ...user,
          name: cleanName,
          student_code: cleanCode,
          class_name: cleanClass,
          faculty: cleanFaculty,
          is_verified: serverVerified,
          verification_status: serverStatus,
        };

        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
        localStorage.setItem("user_info", JSON.stringify(updatedUser));
        localStorage.setItem("tuna_current_user", JSON.stringify(updatedUser));
        localStorage.setItem("tuna_user_id", cleanCode);

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
              {/* CHỈ HIỂN THỊ TRẠNG THÁI ĐÃ DUYỆT NẾU SERVER TRẢ VỀ APPROVED */}
              <span
                className={`px-2 py-0.5 text-[9.5px] font-extrabold rounded-full uppercase shrink-0 ${
                  user?.verification_status === "approved"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : user?.verification_status === "rejected"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {user?.verification_status === "approved"
                  ? "Đã duyệt"
                  : user?.verification_status === "rejected"
                  ? "Bị từ chối"
                  : "Chờ duyệt"}
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500 mb-0 mt-0.5 truncate font-medium">
              MSSV: <b className="text-[#0045ce] font-mono">{user?.student_code || "Chưa cập nhật"}</b>
              {user?.class_name && <span> • Lớp: <b className="text-slate-800">{user.class_name}</b></span>}
            </p>
            <p className="text-[11px] text-slate-400 mb-0 truncate font-semibold">
              Ngành: {user?.faculty || "Hệ Thống Thông Tin"}
            </p>
          </div>
        </div>

        {/* 3 Ô Thống kê */}
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
            <span className="text-xs font-black text-amber-600">🏆 Top {stats.rank}</span>
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
                  ? `${user.name} • ${user.student_code} • ${user.class_name || "Chưa có lớp"}`
                  : "Cập nhật MSSV, lớp và chuyên ngành"}
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
          className="fixed inset-0 flex items-center justify-center p-3 z-50 animate-fade-in"
          style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", backdropFilter: "blur(4px)" }}
        >
          <div className="bg-white p-5 rounded-3xl shadow-2xl w-full border border-slate-200" style={{ maxWidth: "400px" }}>
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
              <h6 className="font-black text-slate-900 mb-0 flex items-center gap-2 text-sm">
                <i className="bi bi-person-vcard text-[#0045ce] text-lg"></i>
                Hồ Sơ Sinh Viên
              </h6>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-3">
              <div>
                <label className="text-slate-500 text-[11px] font-bold mb-1 block">
                  Họ và Tên Sinh Viên *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Nguyễn Văn A"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-[#0045ce]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-500 text-[11px] font-bold mb-1 block">
                    Mã Sinh Viên (MSSV) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: HTTT2311052"
                    value={studentCodeInput}
                    onChange={(e) => handleStudentCodeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-[#0045ce] font-mono uppercase focus:outline-none focus:border-[#0045ce]"
                  />
                </div>

                <div>
                  <label className="text-slate-500 text-[11px] font-bold mb-1 block">
                    Lớp Sinh Hoạt *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: HTTT2311"
                    value={classNameInput}
                    onChange={(e) => setClassNameInput(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono uppercase focus:outline-none focus:border-[#0045ce]"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-500 text-[11px] font-bold mb-1 block">Chuyên Ngành *</label>
                <select
                  value={facultyInput}
                  onChange={(e) => setFacultyInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#0045ce] bg-white"
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

              <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-2.5 rounded-xl border-0 text-white text-xs font-black bg-[#0045ce] hover:bg-blue-700 cursor-pointer shadow-xs"
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