// src/pages/index/HomeSection.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AcademicSurveyModal } from "../../components/AcademicSurveyModal";
import { ScheduleModal } from "../../components/ScheduleModal";
import { LibraryModal } from "../../components/LibraryModal";

const API_BASE = "https://tuna-project.onrender.com/api";

export const HomeSection = ({ currentUser, onNavigate }) => {
  const [academicProfile, setAcademicProfile] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [dbTimelinesToday, setDbTimelinesToday] = useState([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);

  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  
  const [currentTaskIdx, setCurrentTaskIdx] = useState(0);
  const [isHoveredTask, setIsHoveredTask] = useState(false);
  const [activeQuickPage, setActiveQuickPage] = useState(0);

  // 1. Đồng bộ ID người dùng an toàn
  const myUserId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || localStorage.getItem("user_info") || "{}");
      const id = u.student_code || u.studentCode || u.id || u.zalo_id || u.email;
      if (id && id !== "undefined" && id !== "null") return String(id).trim();
    } catch (e) {}

    const directId = currentUser?.student_code || currentUser?.studentCode || currentUser?.id || currentUser?.zalo_id || currentUser?.email;
    if (directId) return String(directId).trim();

    const savedId = localStorage.getItem("tuna_user_id");
    return (savedId && savedId !== "undefined" && savedId !== "null") ? String(savedId).trim() : "";
  }, [currentUser]);

  const [streakCount, setStreakCount] = useState(() => {
    return Number(localStorage.getItem("user_current_streak") || 0);
  });

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayStr = useMemo(() => getTodayDateString(), []);

  const loadStoredData = useCallback(() => {
    try {
      const savedProfile = localStorage.getItem("user_academic_profile");
      if (savedProfile && savedProfile !== "undefined") {
        setAcademicProfile(JSON.parse(savedProfile));
      } else if (currentUser) {
        setShowSurveyModal(true);
      }

      const savedSchedules = localStorage.getItem("user_custom_schedules");
      if (savedSchedules && savedSchedules !== "undefined") {
        setSchedules(JSON.parse(savedSchedules));
      }

      const cachedTodayTasks = localStorage.getItem("tuna_today_tasks");
      if (cachedTodayTasks) {
        const parsed = JSON.parse(cachedTodayTasks);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDbTimelinesToday(parsed);
        }
      }

      const currentStreak = Number(localStorage.getItem("user_current_streak") || 0);
      setStreakCount(currentStreak);
    } catch (e) {
      console.error("Lỗi nạp dữ liệu cá nhân:", e);
    }
  }, [currentUser]);

  useEffect(() => {
    loadStoredData();
  }, [loadStoredData]);

  const fetchStreak = useCallback(async () => {
    if (!myUserId) return;
    try {
      const res = await fetch(`${API_BASE}/streak/${encodeURIComponent(myUserId)}`);
      const data = await res.json();
      if (data.success) {
        const streakVal = Number(data.current_streak) || 0;
        setStreakCount(streakVal);
        localStorage.setItem("user_current_streak", String(streakVal));
        if (data.xp_points !== undefined) {
          localStorage.setItem("user_study_xp", String(data.xp_points));
        }
      }
    } catch (err) {
      console.error("Lỗi lấy thông tin streak:", err);
    }
  }, [myUserId]);

  useEffect(() => {
    fetchStreak();
  }, [fetchStreak]);

  const fetchTodayTimeline = useCallback(async () => {
    if (!myUserId) return;
    setIsTimelineLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/timelines?userId=${encodeURIComponent(myUserId)}&startDate=${todayStr}&endDate=${todayStr}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-user-id": myUserId,
          },
        }
      );
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const formatted = json.data.map((item) => {
          let d = item.timelineDate || item.timeline_date || "";
          if (d.includes("T")) d = d.split("T")[0];
          return {
            ...item,
            timelineDate: d,
            timeline_date: d,
          };
        });

        const todayItems = formatted.filter((t) => t.timelineDate === todayStr);
        setDbTimelinesToday(todayItems);
        localStorage.setItem("tuna_today_tasks", JSON.stringify(todayItems));
      }
    } catch (err) {
      console.error("Lỗi nạp lịch trình hôm nay:", err);
    } finally {
      setIsTimelineLoading(false);
    }
  }, [todayStr, myUserId]);

  useEffect(() => {
    fetchTodayTimeline();
  }, [fetchTodayTimeline]);

  // Kiểm tra trạng thái hoàn thành đồng bộ với TasksSection
  const checkTaskCompletion = useCallback((subjectName, type = "quiz") => {
    const keyQuiz1 = `daily_quiz_completed_${subjectName}_${todayStr}`;
    const keyQuiz2 = `daily_quiz_completed_${todayStr}`;
    const keyFlash1 = `daily_flash_completed_${subjectName}_${todayStr}`;
    const keyFlash2 = `daily_flash_completed_${todayStr}`;
    const keyGeneral = `daily_completed_date_${subjectName}`;

    if (type === "quiz") {
      return (
        localStorage.getItem(keyQuiz1) === "true" ||
        localStorage.getItem(keyQuiz2) === "true" ||
        localStorage.getItem(keyGeneral) === todayStr
      );
    }
    return (
      localStorage.getItem(keyFlash1) === "true" ||
      localStorage.getItem(keyFlash2) === "true" ||
      localStorage.getItem(keyQuiz1) === "true" ||
      localStorage.getItem(keyGeneral) === todayStr
    );
  }, [todayStr]);

  const todaySchedules = useMemo(() => {
    const scheduleItems = [];

    let matchedSchedules = schedules.filter((s) => s.date === todayStr);
    if (matchedSchedules.length === 0 && schedules.length > 0) {
      const currentDayOfWeek = new Date().getDay();
      const matchedByDay = schedules.filter((s) => {
        if (!s.date) return false;
        const [y, m, d] = s.date.split("-").map(Number);
        return new Date(y, m - 1, d).getDay() === currentDayOfWeek;
      });
      matchedSchedules = matchedByDay.length > 0 ? matchedByDay : [];
    }

    matchedSchedules.forEach((item) => {
      scheduleItems.push({
        id: `class_${item.id}`,
        title: item.title,
        time: `${item.period ? `Tiết ${item.period} • ` : ""}${item.time || "07:30 - 09:50"} • Phòng ${item.room || "C201"}`,
        badge: item.category === "exam" ? "Lịch thi" : item.category === "online" ? "Trực tuyến" : "Chính khóa",
        badgeStyle:
          item.category === "exam"
            ? "bg-amber-50 text-amber-700 border border-amber-200"
            : item.category === "online"
            ? "bg-purple-50 text-purple-700 border border-purple-200"
            : "bg-blue-50 text-blue-700 border border-blue-200",
        borderLeft: item.category === "exam" ? "border-l-amber-500" : "border-l-blue-600",
        action: () => setShowScheduleModal(true),
      });
    });

    dbTimelinesToday.forEach((item) => {
      const isDone = item.isCompleted || item.is_completed || checkTaskCompletion(item.subject);
      const isDoc = item.task_type === "doc_study" || item.taskType === "doc_study";
      const isQuiz = item.task_type === "quiz" || item.taskType === "quiz";

      let badgeName = isDone ? "✓ Hoàn thành" : isDoc ? "Tài liệu" : isQuiz ? "Luyện đề" : "Flashcard";
      let badgeStyle = isDone
        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
        : isDoc
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : "bg-indigo-50 text-indigo-700 border border-indigo-200";
      let borderLeft = isDone ? "border-l-emerald-500" : isDoc ? "border-l-amber-500" : "border-l-indigo-600";

      const timeText = item.time_slot || item.timeSlot || "07:45 - 08:30";
      const duration = item.duration_minutes || item.durationMinutes || 30;

      scheduleItems.push({
        id: `timeline_${item.id}`,
        title: item.title,
        time: `${timeText} • ${duration}p • ${item.subject || "Tự học"}`,
        badge: badgeName,
        badgeStyle: badgeStyle,
        borderLeft: borderLeft,
        action: () => {
          if (isDoc || item.actionTarget === "docs") {
            if (onNavigate) onNavigate("docs");
            else setShowLibraryModal(true);
          } else {
            if (onNavigate) onNavigate("tasks");
          }
        },
      });
    });

    return scheduleItems;
  }, [schedules, dbTimelinesToday, todayStr, checkTaskCompletion, onNavigate]);

  const dynamicTaskList = useMemo(() => {
    const rawSubjects = academicProfile?.subjects || [];
    const subjects = rawSubjects.filter(
      (s) => s && String(s).trim() !== "" && String(s) !== "undefined"
    );

    const fallbackSub = "Xây dựng và triển khai TMĐT";
    const sub1 = subjects[0] || fallbackSub;
    const sub2 = subjects[1] || sub1;
    const sub3 = subjects[2] || sub1;

    const isQuizDone = checkTaskCompletion(sub1, "quiz");
    const isFlashDone = checkTaskCompletion(sub2, "flash");

    const paceTime = academicProfile?.dailyPace || 15;

    return [
      {
        id: "daily_task_1",
        tag: isQuizDone ? "Đã hoàn thành" : "Nhiệm vụ hôm nay",
        tagBg: isQuizDone ? "bg-emerald-600 text-white" : "bg-blue-600 text-white",
        title: `Ôn tập trắc nghiệm ${sub1}`,
        desc: isQuizDone
          ? `Bạn đã hoàn thành thử thách môn ${sub1} hôm nay và nhận trọn vẹn điểm thưởng XP.`
          : `Luyện đề trắc nghiệm AI bám sát giáo trình Thư viện theo thời lượng ${paceTime} phút/ngày.`,
        current: isQuizDone ? 1 : 0,
        total: 1,
        isCompleted: isQuizDone,
        actionTarget: isQuizDone ? "done" : "tasks",
      },
      {
        id: "daily_task_2",
        tag: isFlashDone ? "Đã hoàn thành" : "Thử thách Flashcard",
        tagBg: isFlashDone ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white",
        title: `Lật thẻ thuật ngữ môn ${sub2}`,
        desc: isFlashDone
          ? `Đã hoàn tất phiên ghi nhớ thuật ngữ của ngày hôm nay!`
          : `Ghi nhớ các khái niệm cốt lõi của môn ${sub2} để chuẩn bị kiến thức thi kết thúc học phần.`,
        current: isFlashDone ? 1 : 0,
        total: 1,
        isCompleted: isFlashDone,
        actionTarget: isFlashDone ? "done" : "tasks",
      },
      {
        id: "daily_task_3",
        tag: "Tài liệu học tập",
        tagBg: "bg-amber-600 text-white",
        title: `Đọc đề cương & slide ${sub3}`,
        desc: `Mở thư viện khoa để tải tài liệu chính khóa và tóm tắt bài giảng môn ${sub3}.`,
        current: 1,
        total: 1,
        isCompleted: true,
        actionTarget: "docs",
      },
    ];
  }, [academicProfile, checkTaskCompletion]);

  // Tạm dừng timer khi người dùng đang giữ ngón tay/hover trên task
  useEffect(() => {
    if (isHoveredTask) return;
    const timer = setInterval(() => {
      setCurrentTaskIdx((prev) => (prev + 1) % dynamicTaskList.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [dynamicTaskList.length, isHoveredTask]);

  const activeTask = dynamicTaskList[currentTaskIdx] || dynamicTaskList[0];

  const handleTaskAction = () => {
    if (activeTask.actionTarget === "survey") setShowSurveyModal(true);
    else if (activeTask.actionTarget === "tasks") onNavigate && onNavigate("tasks");
    else if (activeTask.actionTarget === "docs") onNavigate && onNavigate("docs");
  };

  const quickActions = [
    { label: "Lịch học", icon: "bi-calendar3", iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/20", action: () => setShowScheduleModal(true) },
    { label: "Hỏi AI", icon: "bi-stars", iconBg: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-amber-500/20", action: () => onNavigate && onNavigate("aihub") },
    { label: "Xếp hạng", icon: "bi-trophy-fill", iconBg: "bg-gradient-to-br from-amber-400 to-yellow-600 text-white shadow-amber-500/20", action: () => onNavigate && onNavigate("streak") },
    { label: "Lịch trình", icon: "bi-calendar-week-fill", iconBg: "bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sky-500/20", action: () => onNavigate && onNavigate("timeline") },
    { label: "Thư viện", icon: "bi-collection-play-fill", iconBg: "bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/20", action: () => setShowLibraryModal(true) },
    { label: "Bài tập", icon: "bi-journal-check", iconBg: "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-blue-500/20", action: () => onNavigate && onNavigate("tasks") },
    // 3 chức năng phụ đẩy sang trang 2 khi kéo qua
    { label: "Cộng đồng", icon: "bi-chat-square-text-fill", iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-blue-500/20", action: () => onNavigate && onNavigate("community") },
    { label: "Khảo sát", icon: "bi-mortarboard-fill", iconBg: "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-violet-500/20", action: () => setShowSurveyModal(true) },
    { label: "Cài đặt", icon: "bi-gear-fill", iconBg: "bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-slate-600/20", action: () => onNavigate && onNavigate("profile") },
  ];

  // Bắt sự kiện vuốt ngang trang tiện ích để cập nhật dấu chấm tròn
  const quickScrollRef = useRef(null);
  const handleQuickScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const page = Math.round(scrollLeft / width);
    setActiveQuickPage(page);
  };

  return (
    <div className="flex flex-col gap-3.5 pb-8 px-1">
      <AcademicSurveyModal
        isOpen={showSurveyModal}
        onSave={async (data) => {
          setAcademicProfile(data);
          setShowSurveyModal(false);
          loadStoredData();

          try {
            await fetch(`${API_BASE}/timelines/generate-wrr-plan`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: myUserId,
                facultyMajor: data?.major || "Hệ Thống Thông Tin",
                year: data?.year || 1,
                semester: data?.semester || 1,
                subjects: data?.subjects || ["Hệ cơ sở dữ liệu"],
                currentGpa: Number(data?.currentGpa) || 3.0,
                goalLevel: data?.targetGoal || "KhaGioi",
                dailyPace: data?.dailyPace || 15,
                startDate: todayStr,
              }),
            });
            // Đồng bộ lại dữ liệu mượt mà, KHÔNG reload trang
            await fetchTodayTimeline();
          } catch (e) {
            console.error("Lỗi tự động kích hoạt thuật toán WRR:", e);
          }
        }}
        onDismiss={() => setShowSurveyModal(false)}
      />

      <ScheduleModal
        isOpen={showScheduleModal}
        onClose={() => {
          setShowScheduleModal(false);
          loadStoredData();
        }}
      />

      <LibraryModal
        isOpen={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        userMajor={academicProfile?.major || "Hệ Thống Thông Tin"}
        onNavigateToDocs={() => {
          setShowLibraryModal(false);
          if (onNavigate) onNavigate("docs");
        }}
      />

      {/* 1. Banner lộ trình học tập */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-4 text-white shadow-lg shadow-blue-900/15 border border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200/90 block mb-0.5">
              Lộ trình học tập
            </span>
            <h2 className="text-base font-black text-white m-0 tracking-tight truncate">
              {academicProfile?.major || "Hệ Thống Thông Tin"}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowSurveyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-[11px] font-bold border border-white/15 cursor-pointer transition shrink-0"
            title="Đổi lộ trình"
          >
            <i className="bi bi-sliders text-amber-300 text-xs"></i>
            <span>Đổi</span>
          </button>
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-blue-100/90 font-medium">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span>Năm {academicProfile?.year || 1} • Học kỳ {academicProfile?.semester || 1}</span>
          </div>

          <div className="flex items-center gap-1 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10 whitespace-nowrap">
            <i className="bi bi-bullseye text-amber-300 text-[10px]"></i>
            <span className="font-bold text-amber-200">
              {academicProfile?.targetGoal === "HocBong"
                ? "Học bổng"
                : academicProfile?.targetGoal === "QuaMon"
                ? "Qua môn"
                : "Khá / Giỏi"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Tiện ích: Hiển thị 6 chức năng chính, vuốt ngang xem thêm 3 chức năng còn lại */}
      <div className="bg-white pt-3.5 pb-2 px-2 rounded-3xl border border-slate-200/80 shadow-xs relative">
        <div 
          ref={quickScrollRef}
          onScroll={handleQuickScroll}
          className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth w-full"
        >
          {/* TRANG 1: 6 CHỨC NĂNG CHÍNH (2 HÀNG X 3 CỘT CÂN ĐỐI) */}
          <div className="min-w-full snap-start grid grid-cols-3 grid-rows-2 gap-y-3.5 gap-x-2 px-1">
            {quickActions.slice(0, 6).map((item, idx) => (
              <div
                key={`p1_${idx}`}
                onClick={item.action}
                className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition"
              >
                <div className={`w-11 h-11 rounded-2xl ${item.iconBg} flex items-center justify-center text-base shadow-md mb-1.5 transition-transform`}>
                  <i className={`bi ${item.icon}`}></i>
                </div>
                <span className="text-[11px] font-extrabold text-slate-800 tracking-tight text-center truncate w-full px-0.5">
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* TRANG 2: CÁC CHỨC NĂNG CÒN LẠI */}
          <div className="min-w-full snap-start grid grid-cols-3 grid-rows-2 gap-y-3.5 gap-x-2 px-1">
            {quickActions.slice(6).map((item, idx) => (
              <div
                key={`p2_${idx}`}
                onClick={item.action}
                className="flex flex-col items-center justify-center cursor-pointer active:scale-95 transition"
              >
                <div className={`w-11 h-11 rounded-2xl ${item.iconBg} flex items-center justify-center text-base shadow-md mb-1.5 transition-transform`}>
                  <i className={`bi ${item.icon}`}></i>
                </div>
                <span className="text-[11px] font-extrabold text-slate-800 tracking-tight text-center truncate w-full px-0.5">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chấm tròn điều hướng (Pagination Dots) */}
        <div className="flex justify-center items-center gap-1.5 pt-2">
          <span className={`h-1.5 rounded-full transition-all duration-300 ${activeQuickPage === 0 ? "w-4 bg-blue-600" : "w-1.5 bg-slate-200"}`}></span>
          <span className={`h-1.5 rounded-full transition-all duration-300 ${activeQuickPage === 1 ? "w-4 bg-blue-600" : "w-1.5 bg-slate-200"}`}></span>
        </div>
      </div>

      {/* 3. Thẻ nhiệm vụ thông minh */}
      <div 
        onMouseEnter={() => setIsHoveredTask(true)}
        onMouseLeave={() => setIsHoveredTask(false)}
        onTouchStart={() => setIsHoveredTask(true)}
        onTouchEnd={() => setIsHoveredTask(false)}
        className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80 relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-black tracking-wide flex items-center gap-1 ${activeTask.tagBg}`}>
            {activeTask.isCompleted && <i className="bi bi-check2-circle"></i>}
            {activeTask.tag}
          </span>

          <button
            type="button"
            onClick={() => onNavigate && onNavigate("streak")}
            className="flex items-center gap-1 text-[11px] font-extrabold text-amber-600 bg-amber-50 hover:bg-amber-100 active:scale-95 px-2.5 py-0.5 rounded-full border border-amber-200 cursor-pointer transition shadow-2xs"
            title="Mở Bảng xếp hạng"
          >
            <i className="bi bi-fire text-amber-500 animate-pulse"></i> Streak {streakCount} ngày
            <i className="bi bi-chevron-right text-[9px] text-amber-400"></i>
          </button>
        </div>

        <h3 className="text-[14px] font-black text-slate-900 leading-snug mt-1 mb-1 truncate break-words">
          {activeTask.title}
        </h3>
        <p className="text-[11px] text-slate-500 leading-relaxed min-h-[32px] font-medium mb-2.5 break-words">
          {activeTask.desc}
        </p>

        <div className="flex items-end justify-between gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[10.5px] font-extrabold text-slate-700 mb-1">
              <span>{activeTask.isCompleted ? "Trạng thái: Đã hoàn tất" : "Tiến độ thực tế"}</span>
              <span className={activeTask.isCompleted ? "text-emerald-600 font-black" : "text-blue-600 font-black"}>
                {activeTask.current}/{activeTask.total}
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  activeTask.isCompleted ? "bg-gradient-to-r from-emerald-500 to-teal-600" : "bg-gradient-to-r from-blue-600 to-indigo-600"
                }`}
                style={{ width: `${Math.min(100, Math.round((activeTask.current / activeTask.total) * 100))}%` }}
              ></div>
            </div>
          </div>

          {activeTask.isCompleted ? (
            <button
              disabled
              className="px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black shadow-2xs flex items-center gap-1 shrink-0 cursor-default"
            >
              <i className="bi bi-check2-all text-emerald-600 font-black text-sm"></i>
              <span>Đã hoàn thành</span>
            </button>
          ) : (
            <button
              onClick={handleTaskAction}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 active:scale-95 transition border-0 cursor-pointer flex items-center gap-1 shrink-0"
            >
              <span>Làm bài ngay</span>
              <i className="bi bi-arrow-right-short text-base leading-none"></i>
            </button>
          )}
        </div>

        {/* Chấm tròn đổi task thủ công */}
        <div className="flex justify-center items-center gap-1.5 mt-3 pt-1 border-t border-slate-50">
          {dynamicTaskList.map((_, i) => (
            <span
              key={i}
              onClick={() => setCurrentTaskIdx(i)}
              className={`h-1.5 rounded-full cursor-pointer transition-all duration-300 ${
                currentTaskIdx === i ? "w-4 bg-blue-600" : "w-1.5 bg-slate-200 hover:bg-slate-300"
              }`}
            ></span>
          ))}
        </div>
      </div>

      {/* 4. Lịch trình hôm nay */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-slate-200/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
            <div>
              <h3 className="font-black text-slate-900 text-[14px] m-0">Lịch trình hôm nay</h3>
              <span className="text-[10px] text-slate-400 font-bold">
                Mục tiêu: {academicProfile?.targetGoal === "HocBong" ? "Học bổng" : academicProfile?.targetGoal === "QuaMon" ? "Qua môn" : "Khá / Giỏi"}
              </span>
            </div>
          </div>

          <button
            onClick={() => onNavigate && onNavigate("timeline")}
            className="text-blue-600 text-xs font-extrabold cursor-pointer hover:underline border-0 bg-transparent flex items-center gap-0.5"
          >
            Mở lịch tuần <i className="bi bi-chevron-right text-[10px]"></i>
          </button>
        </div>

        {isTimelineLoading && todaySchedules.length === 0 ? (
          <div className="py-6 text-center text-xs font-bold text-slate-400">
            <span className="spinner-border spinner-border-sm text-blue-600 me-2"></span>
            Đang nạp dữ liệu lịch học...
          </div>
        ) : todaySchedules.length === 0 ? (
          <div className="py-7 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-1.5">
            <span className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-base">
              <i className="bi bi-calendar-check"></i>
            </span>
            <p className="text-xs font-bold text-slate-500 m-0">Hôm nay không có ca học nào</p>
            <span className="text-[10.5px] text-slate-400">Bấm "Mở lịch tuần" để xem lịch các ngày tới</span>
          </div>
        ) : (
          <div className="space-y-2.5">
            {todaySchedules.map((item) => (
              <div
                key={item.id}
                onClick={item.action}
                className={`border-l-[4px] ${item.borderLeft} bg-slate-50/80 hover:bg-slate-100/90 rounded-r-2xl p-3 transition-all cursor-pointer flex items-center justify-between border border-slate-100 active:scale-[0.99]`}
              >
                <div className="overflow-hidden pr-2 min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 leading-tight m-0 truncate break-words">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 font-semibold m-0 flex items-center gap-1 truncate">
                    <i className="bi bi-clock"></i> {item.time}
                  </p>
                </div>
                <span className={`px-2.5 py-0.5 text-[9.5px] font-extrabold rounded-full shrink-0 ${item.badgeStyle}`}>
                  {item.badge}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomeSection;