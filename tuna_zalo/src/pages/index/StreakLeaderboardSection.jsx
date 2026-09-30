// src/pages/index/StreakLeaderboardSection.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";

const API_BASE = "http://localhost:5000/api";

export const StreakLeaderboardSection = ({ onBack, currentUser }) => {
  const [activeTab, setActiveTab] = useState("streak");

  // Đồng bộ ID người dùng duy nhất
  const targetUserId = useMemo(() => {
    let id = currentUser?.student_code || currentUser?.id || localStorage.getItem("tuna_user_id");
    if (!id || id === "undefined") {
      id = "B2300001";
      localStorage.setItem("tuna_user_id", id);
    }
    return String(id);
  }, [currentUser]);

  const [streakData, setStreakData] = useState(() => {
    const localStreak = Number(localStorage.getItem("user_current_streak") || 3);
    const localXp = Number(localStorage.getItem("user_study_xp") || 220);
    return {
      current_streak: localStreak,
      longest_streak: Math.max(localStreak, 3),
      xp_points: localXp,
      streak_freeze: 1,
      activeDays: [],
    };
  });

  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);

  // Nạp dữ liệu đồng bộ từ PostgreSQL
  const fetchDbData = useCallback(async () => {
    setLoading(true);
    try {
      const [lbRes, streakRes] = await Promise.all([
        fetch(`${API_BASE}/leaderboard`).catch(() => null),
        fetch(`${API_BASE}/streak/${targetUserId}`).catch(() => null),
      ]);

      if (lbRes && lbRes.ok) {
        const lbJson = await lbRes.json();
        if (lbJson.success && Array.isArray(lbJson.leaderboard)) {
          setLeaderboard(lbJson.leaderboard);
        }
      }

      if (streakRes && streakRes.ok) {
        const sJson = await streakRes.json();
        if (sJson.success) {
          const localStreak = Number(localStorage.getItem("user_current_streak") || 0);
          const finalStreak = Math.max(Number(sJson.current_streak) || 0, localStreak);
          const finalXp = Number(sJson.xp_points) || Number(localStorage.getItem("user_study_xp")) || 220;

          setStreakData({
            current_streak: finalStreak,
            longest_streak: Math.max(Number(sJson.longest_streak) || 0, finalStreak),
            xp_points: finalXp,
            streak_freeze: Number(sJson.streak_freeze) || 1,
            activeDays: Array.isArray(sJson.activeDays) ? sJson.activeDays : [],
          });

          localStorage.setItem("user_current_streak", String(finalStreak));
          localStorage.setItem("user_study_xp", String(finalXp));
        }
      }
    } catch (e) {
      console.error("Lỗi nạp dữ liệu Streak & BXH:", e);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    fetchDbData();
  }, [fetchDbData]);

  // Chuẩn hóa định dạng ngày tháng địa phương YYYY-MM-DD
  const formatLocalDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const todayLocalStr = formatLocalDate(new Date());

  // Tính toán hiển thị 7 ngày gần nhất & thắp sáng đủ số ngày trong streak
  const last7Days = useMemo(() => {
    const streakCount = streakData.current_streak || 1;
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date();
      const diffFromToday = 6 - idx;
      d.setDate(d.getDate() - diffFromToday);
      const str = formatLocalDate(d);
      const dayLabel = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()];
      const isToday = diffFromToday === 0;

      // Thắp sáng ngọn lửa nếu ngày có trong DB logs HOẶC nằm trong phạm vi chuỗi streak liên tiếp hiện tại
      const isDone =
        streakData.activeDays?.includes(str) ||
        (diffFromToday >= 0 && diffFromToday < streakCount);

      return { str, dayLabel, isToday, isDone };
    });
  }, [streakData.activeDays, streakData.current_streak]);

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] pb-24 max-w-lg mx-auto w-full">
      {/* 1. HEADER TRANG: MỀM MẠI, NÚT BACK VÀ LÀM MỚI CHUẨN UX */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-600 to-indigo-700 text-white px-4 py-3.5 shadow-sm flex items-center justify-between mb-3 rounded-b-3xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center border-0 cursor-pointer active:scale-95 transition shrink-0"
            title="Quay lại"
          >
            <i className="bi bi-arrow-left text-base font-bold"></i>
          </button>
          <div>
            <h2 className="text-base font-black m-0 leading-tight">Thành Tích & Xếp Hạng</h2>
            <span className="text-[11px] text-amber-100 font-medium">
              Đồng bộ dữ liệu điểm học tập thời gian thực
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={fetchDbData}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center border-0 cursor-pointer active:scale-90 transition shadow-xs disabled:opacity-50 shrink-0"
          title="Làm mới dữ liệu từ CSDL"
        >
          <i
            className={`bi bi-arrow-clockwise text-base ${
              loading ? "animate-spin text-amber-200" : ""
            }`}
          ></i>
        </button>
      </div>

      {/* 2. THANH CHUYỂN TAB CÂN ĐỐI */}
      <div className="px-3.5 mb-3.5">
        <div className="bg-slate-200/70 p-1 rounded-2xl flex gap-1 shadow-inner border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveTab("streak")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition border-0 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "streak"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 bg-transparent"
            }`}
          >
            <i className="bi bi-fire text-amber-500 text-sm"></i>
            <span>Chuỗi Streak</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition border-0 cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "leaderboard"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 bg-transparent"
            }`}
          >
            <i className="bi bi-trophy-fill text-amber-500 text-sm"></i>
            <span>Bảng Xếp Hạng</span>
          </button>
        </div>
      </div>

      {/* 3. NỘI DUNG TAB 1: CHUỖI STREAK */}
      {activeTab === "streak" && (
        <div className="px-3.5 space-y-3.5">
          {/* Card Hero Ngọn Lửa Lớn */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs text-center relative overflow-hidden">
            <div className="w-20 h-20 rounded-3xl bg-amber-50/80 text-amber-500 border border-amber-200/80 flex items-center justify-center text-4xl mx-auto shadow-inner mb-3">
              🔥
            </div>
            <h3 className="text-2xl font-black text-slate-900 m-0 tracking-tight">
              {streakData.current_streak} Ngày Liên Tiếp
            </h3>
            <p className="text-xs text-slate-500 font-semibold m-0 mt-1 max-w-xs mx-auto leading-relaxed">
              {streakData.current_streak > 0
                ? "Tuyệt vời! Bạn đang giữ vững nhịp độ ôn luyện mỗi ngày cùng AI."
                : "Hãy hoàn thành 1 bài trắc nghiệm hôm nay để thắp sáng chuỗi lửa của bạn!"}
            </p>
          </div>

          {/* Card Lịch Sử 7 Ngày (Đã căn chỉnh thoáng rộng, không rớt chữ) */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                Nhật ký 7 ngày gần nhất
              </span>
              <span className="text-[11px] text-amber-600 font-black bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {streakData.xp_points} XP Tích Lũy
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center">
              {last7Days.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400">{d.dayLabel}</span>
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black border transition ${
                      d.isDone
                        ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white border-amber-500 shadow-sm"
                        : d.isToday
                        ? "bg-white text-slate-400 border-amber-400 border-dashed animate-pulse"
                        : "bg-slate-100 text-slate-300 border-transparent"
                    }`}
                  >
                    {d.isDone ? "🔥" : d.isToday ? "•" : ""}
                  </div>
                  <span className="text-[8.5px] font-semibold text-slate-400">
                    {d.str.slice(8, 10)}/{d.str.slice(5, 7)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Khối Thống Kê 2 Cột */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-blue-50/70 border border-blue-200/80 p-3.5 rounded-3xl shadow-xs text-center">
              <span className="text-[10.5px] font-black text-blue-700 block mb-0.5 tracking-wide">
                KỶ LỤC DÀI NHẤT
              </span>
              <span className="text-xl font-black text-blue-950">{streakData.longest_streak} ngày</span>
            </div>
            <div className="bg-purple-50/70 border border-purple-200/80 p-3.5 rounded-3xl shadow-xs text-center">
              <span className="text-[10.5px] font-black text-purple-700 block mb-0.5 tracking-wide">
                BẢO HIỂM STREAK
              </span>
              <span className="text-xl font-black text-purple-950">🛡️ {streakData.streak_freeze} lượt</span>
            </div>
          </div>

          {/* Nút Tiếp Tục Ôn Luyện */}
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-xs rounded-2xl border-0 cursor-pointer shadow-lg shadow-orange-500/25 active:scale-[0.98] transition mt-1"
          >
            Tiếp Tục Ôn Luyện
          </button>
        </div>
      )}

      {/* 4. NỘI DUNG TAB 2: BẢNG XẾP HẠNG THÀNH TÍCH THỰC TẾ */}
      {activeTab === "leaderboard" && (
        <div className="px-3.5 space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-slate-800">Top Học Bá Điểm Cao Tuần Này</span>
            <span className="text-[10.5px] text-slate-400 font-semibold">Theo điểm XP thực tế</span>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-16 text-slate-400 text-xs font-bold bg-white rounded-3xl border border-slate-200">
                <div className="spinner-border spinner-border-sm text-blue-600 mb-2"></div>
                <p className="m-0">Đang đồng bộ dữ liệu từ CSDL...</p>
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-xs font-semibold bg-white rounded-3xl border border-slate-200">
                Chưa có dữ liệu sinh viên trong hệ thống!
              </div>
            ) : (
              leaderboard.map((user, idx) => {
                const isTop1 = idx === 0;
                const isTop2 = idx === 1;
                const isTop3 = idx === 2;
                const isMe = String(user.user_id) === String(targetUserId);

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                      isMe
                        ? "bg-amber-50/90 border-amber-300 shadow-sm ring-1 ring-amber-300"
                        : isTop1
                        ? "bg-amber-100/60 border-amber-300 shadow-2xs"
                        : "bg-white border-slate-200/90 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span
                        className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                          isTop1
                            ? "bg-amber-500 text-white shadow-xs text-sm"
                            : isTop2
                            ? "bg-slate-400 text-white text-sm"
                            : isTop3
                            ? "bg-amber-700 text-white text-sm"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isTop1 ? "🥇" : isTop2 ? "🥈" : isTop3 ? "🥉" : idx + 1}
                      </span>

                      <div className="truncate">
                        <span
                          className={`text-xs font-black block truncate ${
                            isMe ? "text-amber-900" : "text-slate-900"
                          }`}
                        >
                          {user.user_name} {isMe && "(Bạn)"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold block">
                          🔥 Chuỗi {user.streak} ngày
                        </span>
                      </div>
                    </div>

                    <div className="text-end shrink-0 pl-2">
                      <span className="text-xs font-black text-blue-600 block">{user.xp} XP</span>
                      <span className="text-[9px] text-slate-400 font-bold block">điểm tích lũy</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StreakLeaderboardSection;