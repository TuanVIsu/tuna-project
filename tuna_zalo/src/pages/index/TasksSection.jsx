// tuna_zalo/src/pages/index/TasksSection.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { fetchTasksFromDB, saveTaskToDB } from "../../services/aiService";

const API_BASE = "https://tuna-project.onrender.com/api";
const ITEMS_PER_PAGE = 5;

const shuffleQuizCompletely = (questions) => {
  if (!Array.isArray(questions)) return [];
  return [...questions]
    .map((q) => {
      const rawCorrectLetter = (q.answer || "").trim().charAt(0).toUpperCase();
      const currentCorrectOption = (q.options || []).find((opt, idx) => {
        const letterMatch = (opt || "").trim().match(/^([A-D])[\.\:\s]/i);
        const letter = letterMatch ? letterMatch[1].toUpperCase() : String.fromCharCode(65 + idx);
        return letter === rawCorrectLetter;
      }) || (q.options && q.options[0]);

      const correctText = (currentCorrectOption || "").replace(/^[A-D][\.\:\s]+/i, "").trim();
      const shuffledOptionTexts = [...(q.options || [])]
        .map((opt) => (opt || "").replace(/^[A-D][\.\:\s]+/i, "").trim())
        .sort(() => 0.5 - Math.random());

      const labels = ["A", "B", "C", "D"];
      let newAnswerLetter = "A";

      const newOptions = shuffledOptionTexts.map((text, idx) => {
        const label = labels[idx] || String.fromCharCode(65 + idx);
        if (text === correctText) newAnswerLetter = label;
        return `${label}. ${text}`;
      });

      return { ...q, options: newOptions, answer: newAnswerLetter };
    })
    .sort(() => 0.5 - Math.random());
};

export const TasksSection = ({ onNavigate }) => {
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [isGeneratingDaily, setIsGeneratingDaily] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const hasAutoTriggeredRef = useRef(false);
  const isGeneratingRef = useRef(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  const myUserId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return u.student_code || u.id || localStorage.getItem("tuna_user_id") || "B2300001";
    } catch {
      return localStorage.getItem("tuna_user_id") || "B2300001";
    }
  }, []);

  const [userXp, setUserXp] = useState(() => {
    return Number(localStorage.getItem("user_study_xp") || 0);
  });

  const [activeTaskView, setActiveTaskView] = useState(null);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [showRestartMenu, setShowRestartMenu] = useState(false);

  // Flashcard states
  const [currentCards, setCurrentCards] = useState([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState(new Set());

  // Lấy danh sách môn học từ Profile
  const userProfile = useMemo(() => {
    try {
      const p = localStorage.getItem("user_academic_profile");
      if (!p || p === "undefined") return null;
      const parsed = JSON.parse(p);
      if (Array.isArray(parsed.subjects)) {
        parsed.subjects = parsed.subjects.filter((s) => s && s !== "undefined" && s.trim() !== "");
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const todaySubject = useMemo(() => {
    if (selectedSubject && selectedSubject !== "all" && selectedSubject !== "undefined") {
      return selectedSubject;
    }
    if (userProfile?.subjects && Array.isArray(userProfile.subjects) && userProfile.subjects.length > 0) {
      return userProfile.subjects[0];
    }
    return "Hệ cơ sở dữ liệu đa phương tiện";
  }, [userProfile, selectedSubject]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const dailyStorageKey = `daily_tasks_${todaySubject}_${todayStr}`;

  // Kiểm tra trạng thái hoàn thành độc lập
  const [completedQuizDate, setCompletedQuizDate] = useState(() => {
    return (
      localStorage.getItem(`daily_quiz_completed_${todaySubject}_${todayStr}`) === "true" ||
      localStorage.getItem(`daily_quiz_completed_${todayStr}`) === "true"
    );
  });
  const [completedFlashDate, setCompletedFlashDate] = useState(() => {
    return (
      localStorage.getItem(`daily_flash_completed_${todaySubject}_${todayStr}`) === "true" ||
      localStorage.getItem(`daily_flash_completed_${todayStr}`) === "true"
    );
  });

  const isAllDailyDone = completedQuizDate && completedFlashDate;

  // Lấy XP người dùng
  useEffect(() => {
    const fetchXp = async () => {
      try {
        const res = await fetch(`${API_BASE}/streak/${encodeURIComponent(myUserId)}`);
        const data = await res.json();
        if (data.success && data.xp_points !== undefined) {
          setUserXp(data.xp_points);
          localStorage.setItem("user_study_xp", String(data.xp_points));
        }
      } catch (err) {
        console.warn("Lỗi nạp XP:", err);
      }
    };
    fetchXp();
  }, [myUserId]);

  // GỌI API GEMINI & CƠ SỞ DỮ LIỆU TẠO BÀI TẬP ĐỘNG
  const generateDailyQuizAndFlash = useCallback(async (subjectName) => {
    const targetSubject = (subjectName && subjectName !== "undefined" && subjectName.trim() !== "")
      ? subjectName
      : "Hệ cơ sở dữ liệu đa phương tiện";

    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGeneratingDaily(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const payload = {
        subject: targetSubject,
        targetGoal: userProfile?.targetGoal || "KhaGioi",
        userId: myUserId,
      };

      const res = await fetch(`${API_BASE}/daily-quiz/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(payload),
      }).catch(() => null);

      clearTimeout(timeoutId);

      let generatedQuestions = [];
      let generatedFlashcards = [];

      if (res && res.ok) {
        const data = await res.json();
        if (data.success) {
          generatedQuestions = data.questions || [];
          generatedFlashcards = data.flashcards || [];
        }
      }

      if (generatedQuestions.length === 0) {
        showToast("Máy chủ đang đồng bộ câu hỏi từ CSDL, vui lòng thử lại sau giây lát!", "error");
        return;
      }

      const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const newDailyItems = [];

      const newQuiz = {
        id: `daily_quiz_${targetSubject}_${todayStr}`,
        featureId: "quiz",
        docName: `[Hôm nay] ${targetSubject}`,
        status: "done",
        config: { difficulty: userProfile?.targetGoal === "HocBong" ? "Nâng cao" : "Căn bản" },
        resultData: generatedQuestions,
        isSaved: false,
        isDaily: true,
        dailyDate: todayStr,
        isCompleted: false,
        time: currentTime,
      };
      newDailyItems.push(newQuiz);
      saveTaskToDB(newQuiz).catch(() => {});

      if (generatedFlashcards.length > 0) {
        const newFlash = {
          id: `daily_flash_${targetSubject}_${todayStr}`,
          featureId: "flashcard",
          docName: `[Thuật ngữ] ${targetSubject}`,
          status: "done",
          config: { difficulty: "Căn bản" },
          resultData: generatedFlashcards,
          isSaved: false,
          isDaily: true,
          dailyDate: todayStr,
          isCompleted: false,
          time: currentTime,
        };
        newDailyItems.push(newFlash);
        saveTaskToDB(newFlash).catch(() => {});
      }

      localStorage.setItem(dailyStorageKey, JSON.stringify(newDailyItems));
      setTasks((prev) => [
        ...newDailyItems,
        ...prev.filter((p) => p.docName !== `[Hôm nay] ${targetSubject}` && p.docName !== `[Thuật ngữ] ${targetSubject}`)
      ]);
      showToast(`Đã nạp câu hỏi từ CSDL & AI cho môn ${targetSubject}!`, "success");
    } catch (err) {
      console.error("Lỗi sinh bài tập:", err);
      showToast("Lỗi kết nối khi tải bài tập từ CSDL!", "error");
    } finally {
      isGeneratingRef.current = false;
      setIsGeneratingDaily(false);
    }
  }, [userProfile, myUserId, todayStr, dailyStorageKey]);

  // ĐỒNG BỘ DỮ LIỆU
  useEffect(() => {
    let localSavedDaily = [];
    try {
      const cached = localStorage.getItem(dailyStorageKey);
      if (cached) localSavedDaily = JSON.parse(cached);
    } catch (e) {}

    fetchTasksFromDB()
      .then((dbTasks) => {
        const tasksList = Array.isArray(dbTasks) ? dbTasks : [];
        const taskMap = new Map();
        [...localSavedDaily, ...tasksList].forEach((t) => {
          if (t && t.id) taskMap.set(String(t.id), t);
        });

        const merged = Array.from(taskMap.values());
        setTasks(merged);

        const hasTodayDaily = merged.some(
          (t) => (t.isDaily || t.is_daily) && t.docName?.includes(todaySubject) && (t.dailyDate === todayStr || t.daily_date === todayStr)
        );

        if (!hasTodayDaily && !isAllDailyDone && localSavedDaily.length === 0 && !hasAutoTriggeredRef.current) {
          hasAutoTriggeredRef.current = true;
          generateDailyQuizAndFlash(todaySubject);
        }
      })
      .catch(() => {
        if (localSavedDaily.length > 0) {
          setTasks(localSavedDaily);
        } else if (!isAllDailyDone && !hasAutoTriggeredRef.current) {
          hasAutoTriggeredRef.current = true;
          generateDailyQuizAndFlash(todaySubject);
        }
      });
  }, [dailyStorageKey, todayStr, todaySubject, isAllDailyDone, generateDailyQuizAndFlash]);

  const todayQuizTask = useMemo(() => {
    return tasks.find(
      (t) =>
        (t.isDaily || t.is_daily) &&
        t.featureId === "quiz" &&
        t.docName?.includes(todaySubject) &&
        (t.dailyDate === todayStr || t.daily_date === todayStr)
    );
  }, [tasks, todaySubject, todayStr]);

  const todayFlashTask = useMemo(() => {
    return tasks.find(
      (t) =>
        (t.isDaily || t.is_daily) &&
        t.featureId === "flashcard" &&
        t.docName?.includes(todaySubject) &&
        (t.dailyDate === todayStr || t.daily_date === todayStr)
    );
  }, [tasks, todaySubject, todayStr]);

  const allSavedTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.featureId === "summary" || t.featureId === "translate") return false;
      if (!t.isSaved && !t.is_saved) return false;
      if (activeTab === "quiz" && t.featureId !== "quiz") return false;
      if (activeTab === "flashcard" && t.featureId !== "flashcard") return false;
      if (selectedSubject !== "all" && t.docName && !t.docName.includes(selectedSubject)) return false;
      return true;
    });
  }, [tasks, activeTab, selectedSubject]);

  const totalPages = Math.ceil(allSavedTasks.length / ITEMS_PER_PAGE) || 1;

  const paginatedSavedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return allSavedTasks.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [allSavedTasks, currentPage]);

  const openStudy = (task) => {
    if (!task) return;
    setActiveTaskView(task);
    setShowRestartMenu(false);

    if (task.featureId === "quiz" && Array.isArray(task.resultData)) {
      setCurrentQuestions([...task.resultData]);
      setSelectedAnswers({});
    } else if (task.featureId === "flashcard" && Array.isArray(task.resultData)) {
      setCurrentCards([...task.resultData]);
      setActiveCardIndex(0);
      setIsFlipped(false);
      setMasteredCards(new Set());
    }
  };

  const handleRestart = (mode = "default") => {
    setShowRestartMenu(false);
    if (!activeTaskView) return;

    if (activeTaskView.featureId === "quiz") {
      setSelectedAnswers({});
      if (mode === "shuffle") {
        setCurrentQuestions(shuffleQuizCompletely(activeTaskView.resultData));
      } else {
        setCurrentQuestions([...activeTaskView.resultData]);
      }
    } else if (activeTaskView.featureId === "flashcard") {
      setActiveCardIndex(0);
      setIsFlipped(false);
      setMasteredCards(new Set());
      if (mode === "shuffle") {
        setCurrentCards([...activeTaskView.resultData].sort(() => 0.5 - Math.random()));
      } else {
        setCurrentCards([...activeTaskView.resultData]);
      }
    }
  };

  const handleSaveCurrentTask = async () => {
    if (!activeTaskView) return;
    const updated = { ...activeTaskView, isSaved: true, is_saved: true };
    setActiveTaskView(updated);
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

    try {
      const cached = localStorage.getItem(dailyStorageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const newCached = parsed.map((t) => (t.id === updated.id ? updated : t));
        localStorage.setItem(dailyStorageKey, JSON.stringify(newCached));
      }
    } catch (e) {}

    saveTaskToDB(updated).catch(() => {});
    showToast("Đã lưu bài tập vào danh sách ôn tập!");
  };

  const handleDeleteSaved = async (e, taskId) => {
    e.stopPropagation();
    if (!window.confirm("Bỏ lưu bài tập này khỏi danh sách?")) return;
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    const updated = { ...target, isSaved: false, is_saved: false };
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));

    try {
      const cached = localStorage.getItem(dailyStorageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const newCached = parsed.map((t) => (t.id === taskId ? updated : t));
        localStorage.setItem(dailyStorageKey, JSON.stringify(newCached));
      }
    } catch (e) {}

    saveTaskToDB(updated).catch(() => {});
    showToast("Đã bỏ lưu bài tập!");

    if (paginatedSavedTasks.length === 1 && currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const getNormalizedLetter = (opt, index) => {
    const trimmed = (opt || "").trim();
    const match = trimmed.match(/^([A-D])[\.\:\s]/i);
    if (match) return match[1].toUpperCase();
    return String.fromCharCode(65 + index);
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const isAllAnswered = currentQuestions.length > 0 && answeredCount === currentQuestions.length;

  let correctCount = 0;
  if (isAllAnswered) {
    currentQuestions.forEach((q, idx) => {
      const userA = selectedAnswers[idx];
      const correctA = (q.answer || "").trim().charAt(0).toUpperCase();
      if (userA === correctA) correctCount++;
    });
  }

  // NỘP BÀI: ĐỒNG BỘ CẢ 2 KHÓA STORAGE VÀ PHÁT EVENT CHO HOME
  const handleConfirmCompletion = async () => {
    if (!activeTaskView) return;

    const isQuiz = activeTaskView.featureId === "quiz";
    const bonusXp = 10;

    if (isQuiz) {
      setCompletedQuizDate(true);
      // Ghi cả 2 khóa để HomeSection đọc theo cách nào cũng trúng
      localStorage.setItem(`daily_quiz_completed_${todaySubject}_${todayStr}`, "true");
      localStorage.setItem(`daily_quiz_completed_${todayStr}`, "true");
      localStorage.setItem(`daily_completed_date_${todaySubject}`, todayStr);
      localStorage.setItem(`daily_completed_date_${todayStr}`, "true");
    } else {
      setCompletedFlashDate(true);
      localStorage.setItem(`daily_flash_completed_${todaySubject}_${todayStr}`, "true");
      localStorage.setItem(`daily_flash_completed_${todayStr}`, "true");
    }

    const nextXp = userXp + bonusXp;
    setUserXp(nextXp);
    localStorage.setItem("user_study_xp", String(nextXp));

    const completedTask = { ...activeTaskView, isCompleted: true, is_completed: true };
    setTasks((prev) => prev.map((t) => (t.id === completedTask.id ? completedTask : t)));
    saveTaskToDB(completedTask).catch(() => {});

    try {
      const res = await fetch(`${API_BASE}/streak/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: myUserId,
          xpBonus: bonusXp,
        }),
      });
      const data = await res.json();
      if (data.success && data.current_streak) {
        localStorage.setItem("user_current_streak", String(data.current_streak));
      }
    } catch (err) {
      console.error("Lỗi lưu streak check-in:", err);
    }

    // Phát custom event thông báo toàn hệ thống để HomeSection tự cập nhật UI
    window.dispatchEvent(new Event("tuna_study_task_completed"));

    showToast(`Chúc mừng! Bạn nhận được +${bonusXp} XP!`, "success");
    setActiveTaskView(null);
  };

  const handleToggleMastered = (cardIndex, isMastered) => {
    setMasteredCards((prev) => {
      const copy = new Set(prev);
      if (isMastered) copy.add(cardIndex);
      else copy.delete(cardIndex);
      return copy;
    });

    if (activeCardIndex < currentCards.length - 1) {
      setTimeout(() => {
        setIsFlipped(false);
        setActiveCardIndex((p) => p + 1);
      }, 150);
    }
  };

  // MÀN HÌNH LÀM BÀI TOÀN MÀN HÌNH
  if (activeTaskView) {
    const isQuiz = activeTaskView.featureId === "quiz";
    const isFlashcard = activeTaskView.featureId === "flashcard";

    return (
      <div className="position-fixed top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column z-50 overflow-y-auto">
        <div 
          className="bg-[#0045ce] text-white px-3.5 pb-3 d-flex align-items-center justify-between sticky-top shadow-sm flex-shrink-0"
          style={{ paddingTop: "max(var(--sat, 0px), 38px)" }}
        >
          <div className="d-flex align-items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2">
            <button
              onClick={() => setActiveTaskView(null)}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border-0 text-white active:scale-95 transition cursor-pointer shrink-0"
            >
              <i className="bi bi-arrow-left font-bold"></i>
            </button>
            <div className="truncate">
              <h6 className="mb-0 font-black text-sm text-white truncate leading-tight">
                {isQuiz ? "Luyện Đề Trắc Nghiệm" : "Bộ Thẻ Flashcard"}
              </h6>
              <span className="text-blue-100 text-[10.5px] truncate block">
                {activeTaskView.docName}
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-1.5 shrink-0">
            {!activeTaskView.isSaved && !activeTaskView.is_saved ? (
              <button
                onClick={handleSaveCurrentTask}
                className="px-3 py-1.5 rounded-full bg-white text-[#0045ce] font-black text-xs border-0 shadow-sm active:scale-95 transition cursor-pointer flex items-center gap-1"
              >
                <i className="bi bi-bookmark-plus"></i> Lưu bài
              </button>
            ) : (
              <span className="badge bg-white/20 text-white border border-white/30 rounded-full px-2.5 py-1 text-[10px] font-bold">
                ✓ Đã lưu
              </span>
            )}

            <div className="position-relative">
              <button
                onClick={() => setShowRestartMenu(!showRestartMenu)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border-0 text-white active:scale-95 transition cursor-pointer"
              >
                <i className="bi bi-arrow-repeat"></i>
              </button>

              {showRestartMenu && (
                <div
                  className="position-absolute end-0 top-100 mt-1 bg-white shadow-xl rounded-2xl p-1.5 border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100"
                  style={{ minWidth: 160 }}
                >
                  <button
                    onClick={() => handleRestart("default")}
                    className="w-full text-left py-1.5 px-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border-0 bg-transparent flex items-center gap-2 cursor-pointer"
                  >
                    <i className="bi bi-arrow-counterclockwise text-[#0045ce]"></i> Mặc định
                  </button>
                  <button
                    onClick={() => handleRestart("shuffle")}
                    className="w-full text-left py-1.5 px-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border-0 bg-transparent flex items-center gap-2 cursor-pointer"
                  >
                    <i className="bi bi-shuffle text-emerald-600"></i> Xáo trộn
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div 
          className="p-3.5 space-y-3 pb-24 max-w-lg mx-auto w-full"
          style={{ paddingBottom: "calc(var(--sab, 0px) + 36px)" }}
        >
          {isQuiz && (
            <>
              <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between text-xs font-black text-slate-700">
                <span>Tiến độ: <b className="text-[#0045ce]">{answeredCount}/{currentQuestions.length}</b> câu</span>
                <span className="text-[#0045ce]">{Math.round((answeredCount / (currentQuestions.length || 1)) * 100)}%</span>
              </div>

              {isAllAnswered && (
                <div className="bg-gradient-to-r from-[#0045ce] via-blue-700 to-indigo-700 text-white rounded-3xl p-4 text-center shadow-lg space-y-2.5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                      Đã hoàn thành bài làm
                    </span>
                    <h3 className="text-2xl font-black m-0 mt-0.5">
                      Đúng {correctCount}/{currentQuestions.length} câu ({Math.round((correctCount / currentQuestions.length) * 100)}%)
                    </h3>
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={handleConfirmCompletion}
                      className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black border-0 shadow-md active:scale-95 transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <i className="bi bi-check-circle-fill"></i> Nộp bài & Nhận +10 XP
                    </button>
                  </div>
                </div>
              )}

              {currentQuestions.map((q, idx) => {
                const userChoice = selectedAnswers[idx];
                const hasAnswered = !!userChoice;
                const correctLetter = (q.answer || "").trim().charAt(0).toUpperCase();

                return (
                  <div key={idx} className="bg-white rounded-3xl p-3.5 border border-slate-200 shadow-xs space-y-2.5">
                    <div className="flex items-start gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-[#0045ce] font-black text-[10.5px] shrink-0 mt-0.5">
                        Câu {idx + 1}
                      </span>
                      <h4 className="text-xs font-black text-slate-900 m-0 leading-snug">
                        {q.question}
                      </h4>
                    </div>

                    <div className="space-y-1.5">
                      {(q.options || []).map((opt, oIdx) => {
                        const optLetter = getNormalizedLetter(opt, oIdx);
                        const isSelected = userChoice === optLetter;
                        const isCorrect = correctLetter === optLetter;

                        let btnClass = "bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100";
                        if (hasAnswered) {
                          if (isCorrect) {
                            btnClass = "bg-emerald-600 text-white font-black border-emerald-600";
                          } else if (isSelected) {
                            btnClass = "bg-rose-600 text-white font-black border-rose-600";
                          } else {
                            btnClass = "bg-slate-50 text-slate-400 border-slate-200 opacity-60";
                          }
                        }

                        return (
                          <button
                            key={oIdx}
                            disabled={hasAnswered}
                            onClick={() => setSelectedAnswers((prev) => ({ ...prev, [idx]: optLetter }))}
                            className={`w-full text-left p-2.5 rounded-xl text-xs transition border cursor-pointer ${btnClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {hasAnswered && (
                      <div className="p-2.5 bg-blue-50 text-blue-950 rounded-xl text-[11px] leading-relaxed border border-blue-200">
                        <i className="bi bi-lightbulb-fill text-amber-500 me-1"></i>
                        <b>Giải thích:</b> {q.explain}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {isFlashcard && currentCards.length > 0 && (
            <div className="space-y-3.5 select-none">
              <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700">
                    Thẻ: <b className="text-[#0045ce]">{activeCardIndex + 1}</b> / {currentCards.length}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span className="text-[11px] font-bold text-slate-400">
                    {Math.round(((activeCardIndex + 1) / currentCards.length) * 100)}%
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10.5px] font-black">
                  ✓ Đã thuộc: {masteredCards.size}
                </span>
              </div>

              <div
                style={{ perspective: "1200px" }}
                className="w-full cursor-pointer active:scale-[0.985] transition-transform duration-150"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <div
                  className="relative w-full rounded-[28px] transition-transform duration-500 ease-out"
                  style={{
                    minHeight: "260px",
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  <div
                    className="absolute inset-0 w-full h-full rounded-[28px] p-5 flex flex-col justify-between text-white overflow-hidden shadow-xl"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      background: "linear-gradient(135deg, #0045ce 0%, #2563EB 100%)",
                      boxShadow: "0 14px 28px -6px rgba(0, 69, 206, 0.35)",
                    }}
                  >
                    <div className="flex items-center justify-between relative z-10">
                      <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10.5px] font-black border border-white/20">
                        📌 Thuật ngữ
                      </span>
                      {masteredCards.has(activeCardIndex) && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px]">
                          ✓ Đã thuộc
                        </span>
                      )}
                    </div>

                    <div className="my-auto py-4 text-center px-3 relative z-10">
                      <h3 className="text-[17px] font-black leading-relaxed m-0 text-white">
                        {currentCards[activeCardIndex]?.front}
                      </h3>
                    </div>

                    <div className="text-center text-blue-100/75 text-[11px] font-medium flex items-center justify-center gap-1.5 relative z-10">
                      <i className="bi bi-arrow-repeat"></i>
                      <span>Chạm để xem giải nghĩa</span>
                    </div>
                  </div>

                  <div
                    className="absolute inset-0 w-full h-full rounded-[28px] p-5 flex flex-col justify-between text-white overflow-hidden shadow-xl"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                      background: "linear-gradient(135deg, #047857 0%, #059669 50%, #10B981 100%)",
                      boxShadow: "0 14px 28px -6px rgba(5, 150, 105, 0.35)",
                    }}
                  >
                    <div className="flex items-center justify-between relative z-10">
                      <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10.5px] font-black border border-white/20 text-amber-200">
                        💡 Giải nghĩa chi tiết
                      </span>
                      <span className="text-[10px] font-bold text-emerald-100/80">Mặt sau</span>
                    </div>

                    <div className="my-auto py-4 text-center px-3 relative z-10 overflow-y-auto max-h-[150px]">
                      <p className="text-[14.5px] font-bold leading-relaxed m-0 text-white">
                        {currentCards[activeCardIndex]?.back}
                      </p>
                    </div>

                    <div className="text-center text-emerald-100/75 text-[11px] font-medium flex items-center justify-center gap-1.5 relative z-10">
                      <i className="bi bi-arrow-repeat"></i>
                      <span>Chạm để lật lại thuật ngữ</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleToggleMastered(activeCardIndex, false)}
                  className="py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl text-xs font-black border border-rose-200 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                >
                  <i className="bi bi-x-circle-fill text-sm"></i>
                  <span>Chưa thuộc</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleMastered(activeCardIndex, true)}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black border-0 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer shadow-md shadow-emerald-600/25"
                >
                  <i className="bi bi-check-circle-fill text-sm"></i>
                  <span>Đã thuộc ✓</span>
                </button>
              </div>

              <div className="flex justify-between items-center pt-1.5 px-1">
                <button
                  type="button"
                  disabled={activeCardIndex === 0}
                  onClick={() => {
                    setIsFlipped(false);
                    setActiveCardIndex((p) => Math.max(0, p - 1));
                  }}
                  className="px-4 py-2 bg-white rounded-xl text-xs font-black border border-slate-200 text-slate-700 cursor-pointer disabled:opacity-40"
                >
                  <i className="bi bi-chevron-left"></i> Trước
                </button>

                {activeCardIndex === currentCards.length - 1 && (
                  <button
                    type="button"
                    onClick={handleConfirmCompletion}
                    className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black border-0 cursor-pointer shadow-xs active:scale-95 transition flex items-center gap-1"
                  >
                    <i className="bi bi-check2-circle"></i> Xong thẻ (+10 XP)
                  </button>
                )}

                <button
                  type="button"
                  disabled={activeCardIndex === currentCards.length - 1}
                  onClick={() => {
                    setIsFlipped(false);
                    setActiveCardIndex((p) => Math.min(currentCards.length - 1, p + 1));
                  }}
                  className="px-4 py-2 bg-white rounded-xl text-xs font-black border border-slate-200 text-slate-700 cursor-pointer disabled:opacity-40"
                >
                  Sau <i className="bi bi-chevron-right"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-24 px-1 w-full max-w-full relative">
      {toastMessage && (
        <div 
          className="fixed top-24 left-3 right-3 z-50 flex items-center justify-between p-3.5 rounded-2xl shadow-xl border animate-in slide-in-from-top duration-300 backdrop-blur-md"
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

      {/* 1. Header Banner */}
      <div className="bg-gradient-to-br from-[#0045ce] via-blue-700 to-indigo-900 text-white rounded-3xl p-4 shadow-md flex items-center justify-between">
        <div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-blue-100 text-[10px] font-black uppercase tracking-wide border border-white/20">
            Không gian rèn luyện
          </span>
          <h3 className="text-base font-black mt-1 mb-0.5 leading-snug">
            Bài tập & Luyện thi
          </h3>
          <p className="text-[11px] text-blue-100 font-medium m-0 opacity-90">
            Luyện trắc nghiệm và flashcard theo môn học trong lộ trình.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="bg-amber-400 text-slate-950 font-black text-xs px-2.5 py-1 rounded-xl shadow-xs flex items-center gap-1">
            ⚡ {userXp} XP
          </span>
          <button
            onClick={() => onNavigate && onNavigate("aihub")}
            className="px-2.5 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-[10.5px] border-0 transition cursor-pointer flex items-center gap-1"
          >
            <i className="bi bi-stars"></i> Tạo từ AI
          </button>
        </div>
      </div>

      {/* 2. KHỐI THỬ THÁCH HÔM NAY */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-3xl p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className={`px-2 py-0.5 rounded-md text-white font-black text-[10px] uppercase shrink-0 ${isAllDailyDone ? "bg-emerald-600" : "bg-[#0045ce]"}`}>
              {isAllDailyDone ? "ĐÃ HOÀN THÀNH TẤT CẢ" : "THỬ THÁCH HÔM NAY"}
            </span>
            <span className="text-xs font-black text-slate-800 truncate" title={todaySubject}>
              {todaySubject}
            </span>
          </div>

          <span className="text-[10.5px] font-bold text-amber-700 flex items-center gap-1 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 shrink-0">
            <i className="bi bi-fire text-amber-500"></i> {isAllDailyDone ? "Đã nhận +20 XP" : "+20 XP"}
          </span>
        </div>

        {isAllDailyDone ? (
          <div className="bg-white rounded-2xl p-3 border border-emerald-200 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg font-black shrink-0">
              <i className="bi bi-check2-all"></i>
            </div>
            <div className="flex-1">
              <h5 className="text-xs font-black text-slate-900 m-0 leading-tight">
                Tuyệt vời! Bạn đã hoàn thành toàn bộ bài tập hôm nay!
              </h5>
              <p className="text-[10.5px] text-slate-500 m-0 mt-0.5">
                Cả trắc nghiệm và thẻ nhớ đều đã xong. Quay lại vào ngày mai nhé!
              </p>
            </div>
          </div>
        ) : (todayQuizTask || todayFlashTask) ? (
          <div className="space-y-2">
            {todayQuizTask && (
              <div className="bg-white rounded-2xl p-2.5 border border-blue-100 flex items-center justify-between gap-2 shadow-2xs">
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] text-[#0045ce] font-extrabold block">
                      Đề trắc nghiệm ({todayQuizTask.resultData?.length || 4} câu)
                    </span>
                    {completedQuizDate && (
                      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold py-0.5">
                        ✓ Đã xong (+10 XP)
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-black text-slate-900 m-0 truncate">
                    {todayQuizTask.docName}
                  </p>
                </div>

                {completedQuizDate ? (
                  <button
                    onClick={() => openStudy(todayQuizTask)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black border border-slate-200 transition cursor-pointer shrink-0"
                  >
                    Xem lại
                  </button>
                ) : (
                  <button
                    onClick={() => openStudy(todayQuizTask)}
                    className="px-3.5 py-1.5 bg-[#0045ce] text-white rounded-xl text-xs font-black border-0 shadow-sm active:scale-95 transition cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    Vào thi ngay <i className="bi bi-arrow-right-short text-base leading-none"></i>
                  </button>
                )}
              </div>
            )}

            {todayFlashTask && (
              <div className="bg-white rounded-2xl p-2.5 border border-emerald-100 flex items-center justify-between gap-2 shadow-2xs">
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] text-emerald-600 font-extrabold block">
                      Bộ thẻ nhớ ({todayFlashTask.resultData?.length || 4} thẻ)
                    </span>
                    {completedFlashDate && (
                      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold py-0.5">
                        ✓ Đã xong (+10 XP)
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-black text-slate-900 m-0 truncate">
                    {todayFlashTask.docName}
                  </p>
                </div>

                {completedFlashDate ? (
                  <button
                    onClick={() => openStudy(todayFlashTask)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black border border-slate-200 transition cursor-pointer shrink-0"
                  >
                    Xem lại
                  </button>
                ) : (
                  <button
                    onClick={() => openStudy(todayFlashTask)}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-black border-0 shadow-sm active:scale-95 transition cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    Lật thẻ <i className="bi bi-arrow-right-short text-base leading-none"></i>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : isGeneratingDaily ? (
          <div className="py-3 bg-white rounded-2xl border border-blue-100 text-center text-xs font-bold text-slate-600 flex items-center justify-center gap-2 shadow-2xs">
            <span className="spinner-border spinner-border-sm text-[#0045ce]"></span>
            <span>Đang lấy câu hỏi từ CSDL & AI...</span>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-2.5 border border-blue-100 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 font-medium truncate">Chưa có bài tập hôm nay.</span>
            <button
              onClick={() => generateDailyQuizAndFlash(todaySubject)}
              className="px-3 py-1.5 bg-[#0045ce] text-white rounded-xl text-xs font-black border-0 active:scale-95 transition cursor-pointer shadow-xs flex items-center gap-1 shrink-0"
            >
              <i className="bi bi-lightning-charge-fill text-amber-300"></i> Tạo ngay
            </button>
          </div>
        )}
      </div>

      {/* 3. Bộ lọc Thể loại */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 flex items-center gap-1 shadow-2xs">
        {[
          { id: "all", label: "Tất cả", icon: "bi-grid-fill" },
          { id: "quiz", label: "Trắc nghiệm", icon: "bi-journal-check" },
          { id: "flashcard", label: "Flashcards", icon: "bi-card-text" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition border-0 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === tab.id
                ? "bg-[#0045ce] text-white shadow-xs"
                : "bg-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <i className={`bi ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* 4. Chọn môn học theo lộ trình */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedSubject("all")}
          className={`px-3 py-1 rounded-full text-[11px] font-black border transition shrink-0 cursor-pointer ${
            selectedSubject === "all"
              ? "bg-[#0045ce] text-white border-[#0045ce]"
              : "bg-white text-slate-600 border-slate-200"
          }`}
        >
          Tất cả môn
        </button>
        {(userProfile?.subjects || ["Hệ cơ sở dữ liệu đa phương tiện"])
          .filter((s) => s && s !== "undefined" && s.trim() !== "")
          .map((sub, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1 rounded-full text-[11px] font-black border transition shrink-0 cursor-pointer ${
                selectedSubject === sub
                  ? "bg-[#0045ce] text-white border-[#0045ce] shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {sub}
            </button>
          ))}
      </div>

      {/* 5. Danh sách bài tập đã lưu */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-black text-slate-900 m-0 flex items-center gap-1.5">
            <i className="bi bi-bookmark-check-fill text-[#0045ce]"></i> Bài tập đã lưu ({allSavedTasks.length})
          </h4>
          <span className="text-[10.5px] text-slate-400 font-medium">
            Trang {currentPage} / {totalPages}
          </span>
        </div>

        {allSavedTasks.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0045ce] flex items-center justify-center text-xl mx-auto mb-2">
              <i className="bi bi-journal-bookmark"></i>
            </div>
            <h6 className="font-black text-slate-800 text-xs mb-1">Chưa có bài tập lưu trữ</h6>
            <p className="text-[11px] text-slate-400 mb-0">
              Làm bài tập hàng ngày hoặc tạo từ AI rồi bấm <b>"Lưu bài"</b> để đưa vào đây.
            </p>
          </div>
        ) : (
          <>
            {paginatedSavedTasks.map((task) => {
              const isQuiz = task.featureId === "quiz";
              return (
                <div
                  key={task.id}
                  onClick={() => openStudy(task)}
                  className="bg-white rounded-3xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3 hover:border-blue-300 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0 border ${
                        isQuiz
                          ? "bg-blue-50 text-[#0045ce] border-blue-100"
                          : "bg-emerald-50 text-emerald-600 border-emerald-100"
                      }`}
                    >
                      <i className={`bi ${isQuiz ? "bi-patch-question-fill" : "bi-card-text"}`}></i>
                    </div>
                    <div className="truncate flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`px-2 py-0.2 rounded text-[9.5px] font-black uppercase ${isQuiz ? "bg-blue-100 text-[#0045ce]" : "bg-emerald-100 text-emerald-700"}`}>
                          {isQuiz ? "Trắc nghiệm" : "Flashcard"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {task.time || "Đã lưu"}
                        </span>
                      </div>
                      <h4 className="text-xs font-black text-slate-900 m-0 truncate">
                        {task.docName || "Bài tập ôn tập"}
                      </h4>
                      <p className="text-[10.5px] text-slate-400 font-medium m-0 mt-0.5">
                        Cấp độ: <b className="text-slate-700">{task.config?.difficulty || "Căn bản"}</b>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => openStudy(task)}
                      className="px-3 py-1.5 bg-[#0045ce] text-white rounded-full text-[10.5px] font-black border-0 active:scale-95 transition cursor-pointer shadow-xs"
                    >
                      Luyện lại
                    </button>
                    <button
                      onClick={(e) => handleDeleteSaved(e, task.id)}
                      className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs transition border-0 cursor-pointer"
                      title="Bỏ lưu khỏi danh sách"
                    >
                      <i className="bi bi-trash3"></i>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* PHÂN TRANG */}
            {totalPages > 1 && (
              <div className="d-flex justify-content-center align-items-center mt-3 pt-1">
                <nav aria-label="Tasks pagination">
                  <ul className="pagination pagination-sm m-0 gap-1">
                    <li className={`page-item ${currentPage === 1 ? "disabled" : ""}`}>
                      <button
                        className="page-link rounded-2 border-0 shadow-2xs font-bold text-xs"
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        <i className="bi bi-chevron-left"></i>
                      </button>
                    </li>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                      <li
                        key={pageNum}
                        className={`page-item ${currentPage === pageNum ? "active" : ""}`}
                      >
                        <button
                          className={`page-link rounded-2 border-0 shadow-2xs font-black text-xs px-3 ${
                            currentPage === pageNum
                              ? "bg-[#0045ce] text-white"
                              : "text-slate-700 hover:bg-slate-100"
                          }`}
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                      </li>
                    ))}

                    <li className={`page-item ${currentPage === totalPages ? "disabled" : ""}`}>
                      <button
                        className="page-link rounded-2 border-0 shadow-2xs font-bold text-xs"
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                      >
                        <i className="bi bi-chevron-right"></i>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TasksSection;