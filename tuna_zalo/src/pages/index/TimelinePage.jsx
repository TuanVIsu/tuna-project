// tuna_zalo/src/pages/index/TimelinePage.jsx
import React, { useState, useEffect, useMemo, useCallback } from "react";

const API_BASE = "http://localhost:5000/api";

export const TimelinePage = ({ onBack, onNavigateToTasks, onNavigateToDocs, onOpenScheduleModal }) => {
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => getLocalDateString(), []);
  const [currentViewDate, setCurrentViewDate] = useState(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(todayStr);

  const [dbTimelines, setDbTimelines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isWrrGenerating, setIsWrrGenerating] = useState(false);
  const [calculatedWeights, setCalculatedWeights] = useState([]);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    timeSlot: "19:30 - 20:15",
    taskType: "quiz",
    description: "",
    durationMinutes: 15,
    subject: "",
  });

  const academicProfile = useMemo(() => {
    try {
      const p = localStorage.getItem("user_academic_profile");
      return p ? JSON.parse(p) : null;
    } catch {
      return null;
    }
  }, []);

  const rawSchedules = useMemo(() => {
    try {
      const s = localStorage.getItem("user_custom_schedules");
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  }, []);

  const currentWeekDays = useMemo(() => {
    const base = new Date(currentViewDate);
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1);

    const monday = new Date(base.setDate(diff));
    const days = [];
    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(monday);
      nextDate.setDate(monday.getDate() + i);
      days.push(nextDate);
    }
    return days;
  }, [currentViewDate]);

  const startDateStr = useMemo(() => getLocalDateString(currentWeekDays[0]), [currentWeekDays]);
  const endDateStr = useMemo(() => getLocalDateString(currentWeekDays[6]), [currentWeekDays]);

  // Điều hướng thông minh: doc_study -> Docs, quiz/flashcard -> Tasks
  const handleTaskAction = useCallback((task) => {
    const type = task.task_type || task.taskType;
    const target = task.action_target || task.actionTarget;

    if (type === "doc_study" || target === "docs") {
      if (onNavigateToDocs) onNavigateToDocs(task.subject);
      else if (onNavigateToTasks) onNavigateToTasks();
    } else {
      if (onNavigateToTasks) onNavigateToTasks();
    }
  }, [onNavigateToDocs, onNavigateToTasks]);

  const handleTriggerWRRPlan = useCallback(async (isAuto = false) => {
    if (isWrrGenerating) return;
    setIsWrrGenerating(true);
    try {
      const studentId = localStorage.getItem("tuna_user_id") || "sv_01";
      const res = await fetch(`${API_BASE}/timelines/generate-wrr-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: studentId,
          facultyMajor: academicProfile?.major || "Hệ Thống Thông Tin",
          year: academicProfile?.year || 1,
          semester: academicProfile?.semester || 1,
          subjects: academicProfile?.subjects || [],
          subjectLevels: academicProfile?.subjectLevels || {},
          currentGpa: Number(academicProfile?.currentGpa) || 3.0,
          goalLevel: academicProfile?.targetGoal || "KhaGioi",
          dailyPace: academicProfile?.dailyPace || 15,
          startDate: startDateStr,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCalculatedWeights(data.weights || []);
        if (!isAuto) {
          alert("✅ Đã tối ưu lịch tự động theo thuật toán Vòng tròn trọng số (WRR)!");
        }
        fetchTimelines();
      } else if (!isAuto) {
        alert("Lỗi: " + (data.error || "Không thể tạo lịch"));
      }
    } catch (e) {
      if (!isAuto) alert("Không thể kết nối máy chủ để chạy thuật toán!");
    } finally {
      setIsWrrGenerating(false);
    }
  }, [academicProfile, startDateStr, isWrrGenerating]);

  const fetchTimelines = useCallback(async () => {
    setLoading(true);
    try {
      const studentId = localStorage.getItem("tuna_user_id") || "sv_01";
      const res = await fetch(
        `${API_BASE}/timelines?userId=${studentId}&startDate=${startDateStr}&endDate=${endDateStr}`
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setDbTimelines(json.data);
        if (json.data.length === 0) {
          handleTriggerWRRPlan(true);
        }
      }
    } catch (err) {
      console.error("Lỗi tải lịch trình:", err);
    } finally {
      setLoading(false);
    }
  }, [startDateStr, endDateStr, handleTriggerWRRPlan]);

  useEffect(() => {
    fetchTimelines();
  }, [fetchTimelines]);

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    try {
      const studentId = localStorage.getItem("tuna_user_id") || "sv_01";
      if (editingItem) {
        const res = await fetch(`${API_BASE}/timelines/${editingItem.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (data.success) {
          setDbTimelines((prev) => prev.map((item) => (item.id === editingItem.id ? data.data : item)));
        }
      } else {
        const res = await fetch(`${API_BASE}/timelines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            userId: studentId,
            timelineDate: selectedDayKey,
            goalLevel: academicProfile?.targetGoal || "KhaGioi",
            subject: formData.subject || academicProfile?.subjects?.[0] || "Hệ thống phân tán",
          }),
        });
        const data = await res.json();
        if (data.success) {
          setDbTimelines((prev) => [...prev, data.data]);
        }
      }
      setShowItemModal(false);
      setEditingItem(null);
    } catch (err) {
      alert("Lỗi khi lưu lịch trình!");
    }
  };

  const handleDeleteItem = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc chắn muốn xóa mục này khỏi lịch trình?")) return;

    try {
      const res = await fetch(`${API_BASE}/timelines/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDbTimelines((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      alert("Lỗi khi xóa mục lịch trình!");
    }
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      title: "",
      timeSlot: "19:30 - 20:15",
      taskType: "quiz",
      description: "",
      durationMinutes: academicProfile?.dailyPace || 15,
      subject: academicProfile?.subjects?.[0] || "Hệ thống phân tán",
    });
    setShowItemModal(true);
  };

  const handleOpenEdit = (e, item) => {
    e.stopPropagation();
    setEditingItem(item);
    setFormData({
      title: item.title,
      timeSlot: item.timeSlot || item.time_slot,
      taskType: item.taskType || item.task_type || "quiz",
      description: item.description || "",
      durationMinutes: item.durationMinutes || item.duration_minutes || 15,
      subject: item.subject,
    });
    setShowItemModal(true);
  };

  const handleShiftWeek = (offsetWeeks) => {
    const next = new Date(currentViewDate);
    next.setDate(next.getDate() + offsetWeeks * 7);
    setCurrentViewDate(next);
  };

  const getDayName = (dateObj) => {
    const names = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    return names[dateObj.getDay()];
  };

  const dayScheduleData = useMemo(() => {
    let matchedClasses = rawSchedules.filter((s) => s.date === selectedDayKey);
    if (matchedClasses.length === 0 && rawSchedules.length > 0) {
      const [y, m, d] = selectedDayKey.split("-").map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      matchedClasses = rawSchedules.filter((s) => {
        if (!s.date) return false;
        const [sy, sm, sd] = s.date.split("-").map(Number);
        return new Date(sy, sm - 1, sd).getDay() === dayOfWeek;
      });
    }

    const matchedTimelines = dbTimelines.filter((t) => (t.timelineDate || t.timeline_date) === selectedDayKey);

    return {
      classes: matchedClasses,
      tasks: matchedTimelines,
      totalCount: matchedClasses.length + matchedTimelines.length,
    };
  }, [selectedDayKey, rawSchedules, dbTimelines]);

  const targetGoalName = academicProfile?.targetGoal === "HocBong" 
    ? "Săn học bổng (GPA 3.6+)" 
    : academicProfile?.targetGoal === "QuaMon" 
    ? "Chuẩn qua môn" 
    : "Khá / Giỏi (GPA 3.2+)";

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] pb-24 text-slate-800 antialiased">
      {/* 1. Header Hero */}
      <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 text-white p-4 pt-3 pb-7 rounded-b-[36px] shadow-lg relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-blue-400/15 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between relative z-10 mb-3.5">
          <button
            onClick={onBack}
            className="w-8.5 h-8.5 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center border border-white/20 text-white active:scale-90 transition cursor-pointer"
          >
            <i className="bi bi-chevron-left font-bold text-xs"></i>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleOpenAdd}
              className="px-3 py-1.5 bg-white text-blue-800 rounded-xl text-[11px] font-black shadow-sm active:scale-95 transition border-0 cursor-pointer flex items-center gap-1 hover:bg-blue-50"
            >
              <i className="bi bi-plus-circle-fill text-blue-600 text-xs"></i>
              <span>Thêm lịch</span>
            </button>

            <button
              onClick={() => handleTriggerWRRPlan(false)}
              disabled={isWrrGenerating}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black shadow-sm active:scale-95 transition border-0 cursor-pointer flex items-center gap-1"
            >
              {isWrrGenerating ? (
                <span className="spinner-border spinner-border-sm text-[10px]"></span>
              ) : (
                <i className="bi bi-pie-chart-fill text-xs"></i>
              )}
              <span>Lập Lịch WRR</span>
            </button>

            <button
              onClick={onOpenScheduleModal}
              className="w-8.5 h-8.5 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center border border-white/20 text-white active:scale-90 transition cursor-pointer"
              title="Xem TKB trường"
            >
              <i className="bi bi-calendar3 text-xs"></i>
            </button>
          </div>
        </div>

        <div className="relative z-10 space-y-1">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/15 text-amber-300 text-[9.5px] font-black uppercase tracking-wider border border-white/10">
            {academicProfile?.major || "Công Nghệ Thông Tin"} • Năm {academicProfile?.year || 1}
          </span>
          <h2 className="text-[19px] font-black m-0 tracking-tight text-white leading-tight">
            Lịch Trình Cá Nhân Hóa
          </h2>
          <p className="text-[11.5px] text-blue-100/80 m-0 font-medium flex items-center gap-1.5">
            <i className="bi bi-bullseye text-amber-400"></i> {targetGoalName} • {academicProfile?.dailyPace || 15}p/ngày
          </p>
        </div>
      </div>

      {/* 2. Dải chọn Tuần */}
      <div className="px-3.5 -mt-4 relative z-20 space-y-2">
        <div className="bg-white rounded-3xl p-3 shadow-sm border border-slate-200/80">
          <div className="flex items-center justify-between px-1 mb-2">
            <button
              onClick={() => handleShiftWeek(-1)}
              className="w-6.5 h-6.5 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-90 cursor-pointer hover:bg-slate-200"
            >
              <i className="bi bi-chevron-left text-[11px]"></i>
            </button>
            <span className="flex items-center gap-1.5 bg-blue-50 text-blue-800 font-extrabold px-3 py-0.5 rounded-full text-[10.5px]">
              <i className="bi bi-calendar-range text-[10px]"></i>
              {startDateStr.split("-").reverse().slice(0, 2).join("/")} – {endDateStr.split("-").reverse().slice(0, 2).join("/")}
            </span>
            <button
              onClick={() => handleShiftWeek(1)}
              className="w-6.5 h-6.5 rounded-lg bg-slate-100 flex items-center justify-center border-0 text-slate-600 active:scale-90 cursor-pointer hover:bg-slate-200"
            >
              <i className="bi bi-chevron-right text-[11px]"></i>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {currentWeekDays.map((d, idx) => {
              const dKey = getLocalDateString(d);
              const isSelected = dKey === selectedDayKey;
              const isToday = dKey === todayStr;
              const isSunday = d.getDay() === 0;

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDayKey(dKey)}
                  className={`py-2 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                      : isToday
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className={`text-[9.5px] font-bold mb-0.5 ${isSelected ? "text-blue-100" : isSunday ? "text-rose-500" : "text-slate-400"}`}>
                    {isSunday ? "CN" : `T${d.getDay() + 1}`}
                  </span>
                  <span className="text-[13px] font-black leading-none">{d.getDate()}</span>
                  {isToday && !isSelected && (
                    <span className="w-1 h-1 rounded-full bg-blue-600 mt-1"></span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Trọng số WRR rút gọn */}
        {calculatedWeights.length > 0 && (
          <div className="bg-white rounded-2xl p-2.5 border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] font-black text-slate-600 flex items-center gap-1 mb-1.5 px-0.5">
              <i className="bi bi-diagram-3-fill text-emerald-600"></i> Trọng số phân bổ môn học:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {calculatedWeights.map((w, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-lg bg-slate-50 text-slate-700 text-[10px] font-bold border border-slate-200 flex items-center gap-1"
                >
                  <span className="truncate max-w-[120px]">{w.subject}</span>
                  <span className="text-emerald-700 font-black bg-emerald-100/80 px-1 rounded text-[9px]">
                    W: {w.weight}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Danh sách Timeline */}
      <div className="p-3.5 space-y-4 flex-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-black text-slate-900 m-0">
              {getDayName(new Date(selectedDayKey.replace(/-/g, "/")))}, {selectedDayKey.split("-").reverse().join("/")}
            </h4>
            {selectedDayKey === todayStr && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] font-black tracking-wide">
                HÔM NAY
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-slate-400">
            {dayScheduleData.totalCount} sự kiện
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">
            <span className="spinner-border spinner-border-sm text-blue-600 me-2"></span>
            Đang tải lịch trình...
          </div>
        ) : dayScheduleData.totalCount === 0 ? (
          <div className="bg-white rounded-3xl p-6 text-center border border-slate-200/80 shadow-2xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl mx-auto">
              <i className="bi bi-calendar-check"></i>
            </div>
            <div>
              <h5 className="text-xs font-black text-slate-800 m-0">Chưa có lịch cho ngày này</h5>
              <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                Bấm "Lập Lịch WRR" để tự động tối ưu hóa ca tự học.
              </p>
            </div>
            <button
              onClick={() => handleTriggerWRRPlan(false)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black border-0 shadow-sm cursor-pointer active:scale-95 transition"
            >
              Chạy thuật toán WRR
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {/* 3.1 Lớp học chính khóa */}
            {dayScheduleData.classes.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-blue-700 tracking-wider uppercase px-1 flex items-center gap-1">
                  <i className="bi bi-building"></i> Lớp học chính khóa trên trường
                </span>

                {dayScheduleData.classes.map((item) => (
                  <div
                    key={item.id}
                    onClick={onOpenScheduleModal}
                    className="bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200/80 border-l-[4px] border-l-blue-600 hover:border-blue-300 transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-extrabold text-[9.5px] rounded-md border border-blue-200/60">
                          {item.category === "exam" ? "Lịch thi" : "Chính khóa"}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">
                          <i className="bi bi-clock"></i> {item.time || "07:30 - 09:50"}
                        </span>
                      </div>
                      <h5 className="font-black text-[13px] text-slate-900 m-0 leading-tight">
                        {item.title}
                      </h5>
                      <p className="text-[11px] text-slate-400 m-0">
                        Phòng {item.room || "C201"} • {item.teacher || "Giảng viên bộ môn"}
                      </p>
                    </div>
                    <i className="bi bi-chevron-right text-slate-300 text-xs"></i>
                  </div>
                ))}
              </div>
            )}

            {/* 3.2 Ca tự học WRR */}
            {dayScheduleData.tasks.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black text-indigo-700 tracking-wider uppercase px-1 flex items-center gap-1">
                  <i className="bi bi-cpu-fill text-emerald-500"></i> Kế hoạch tự học theo vòng tròn trọng số
                </span>

                {dayScheduleData.tasks.map((task) => {
                  const isDone = task.isCompleted || task.is_completed || localStorage.getItem(`daily_completed_date_${task.subject}`) === selectedDayKey;
                  const isDoc = task.task_type === "doc_study" || task.taskType === "doc_study";

                  return (
                    <div
                      key={task.id}
                      onClick={() => handleTaskAction(task)}
                      className={`bg-white rounded-2xl p-3.5 shadow-xs border border-slate-200/80 border-l-[4px] ${
                        isDone ? "border-l-emerald-500" : isDoc ? "border-l-amber-500" : "border-l-indigo-600"
                      } hover:border-indigo-300 transition cursor-pointer flex flex-col gap-2.5`}
                    >
                      {/* Dòng 1: Badge loại bài tập + Thời gian */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 font-black text-[10px] rounded-md border whitespace-nowrap inline-flex items-center shrink-0 leading-none ${
                            isDone
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : task.task_type === "quiz"
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : task.task_type === "flashcard"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-amber-50 text-amber-800 border-amber-300"
                          }`}
                        >
                          {isDone
                            ? "✓ Đã xong"
                            : task.task_type === "quiz"
                            ? "Luyện đề"
                            : task.task_type === "flashcard"
                            ? "Thuật ngữ"
                            : "Tài liệu"}
                        </span>

                        <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                          <i className="bi bi-clock"></i> {task.time_slot || task.timeSlot} • {task.duration_minutes || task.durationMinutes || 15} phút
                        </span>
                      </div>

                      {/* Dòng 2: Tiêu đề và Mô tả */}
                      <div>
                        <h5 className="font-black text-[13.5px] text-slate-900 m-0 leading-snug">
                          {task.title}
                        </h5>
                        <p className="text-[11px] text-slate-500 m-0 mt-0.5 line-clamp-1 leading-relaxed">
                          {task.description}
                        </p>
                      </div>

                      {/* Dòng 3: Footer chứa nút Thao tác */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] font-bold text-slate-400 truncate max-w-[170px]">
                          {task.subject}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={(e) => handleOpenEdit(e, task)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 flex items-center justify-center text-xs transition border-0 cursor-pointer"
                            title="Sửa"
                          >
                            <i className="bi bi-pencil-square"></i>
                          </button>

                          <button
                            onClick={(e) => handleDeleteItem(e, task.id)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 flex items-center justify-center text-xs transition border-0 cursor-pointer"
                            title="Xóa"
                          >
                            <i className="bi bi-trash3"></i>
                          </button>

                          <button
                            onClick={() => handleTaskAction(task)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-black border-0 cursor-pointer shadow-xs transition ${
                              isDone
                                ? "bg-slate-100 text-slate-500"
                                : isDoc
                                ? "bg-amber-500 hover:bg-amber-600 text-slate-950 active:scale-95"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95"
                            }`}
                          >
                            {isDone ? "Xem lại" : isDoc ? "Đọc tài liệu" : "Làm bài"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL THÊM / SỬA */}
      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <h4 className="font-black text-sm text-slate-900 m-0">
                {editingItem ? "Chỉnh Sửa Lịch Trình" : "Thêm Lịch Trình Mới"}
              </h4>
              <button
                onClick={() => setShowItemModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center border-0 text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <i className="bi bi-x-lg text-xs"></i>
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3 text-xs font-bold text-slate-700">
              <div>
                <label className="block mb-1 text-[11px]">Tiêu đề ca học / bài tập</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ví dụ: Ôn tập 5 câu trắc nghiệm..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-blue-600 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 text-[11px]">Khung giờ</label>
                  <input
                    type="text"
                    value={formData.timeSlot}
                    onChange={(e) => setFormData({ ...formData, timeSlot: e.target.value })}
                    placeholder="19:30 - 20:15"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-blue-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[11px]">Thời lượng (phút)</label>
                  <input
                    type="number"
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-blue-600 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-[11px]">Hình thức rèn luyện</label>
                <select
                  value={formData.taskType}
                  onChange={(e) => setFormData({ ...formData, taskType: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-blue-600 text-xs bg-white"
                >
                  <option value="quiz">Trắc nghiệm (Quiz)</option>
                  <option value="flashcard">Thẻ ghi nhớ (Flashcard)</option>
                  <option value="doc_study">Tự nghiên cứu giáo trình</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 text-[11px]">Mô tả chi tiết / Hướng dẫn</label>
                <textarea
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ghi chú kiến thức hoặc mục tiêu..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-blue-600 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold border-0 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold border-0 cursor-pointer shadow-sm active:scale-95 transition"
                >
                  {editingItem ? "Lưu thay đổi" : "Thêm ngay"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelinePage;