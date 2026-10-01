// src/pages/index/AIHubSection.jsx
import React, { useState, useEffect } from "react";
import {
  computeContentHash,
  generateQuizFromDoc,
  generateFlashcardsFromDoc,
  summarizeFromDoc,
  translateFromDoc,
  checkPostgresCache,
  savePostgresCache,
  fetchDocumentsFromDB,
  saveDocumentToDB,
  deleteDocumentFromDB,
  fetchTasksFromDB,
  saveTaskToDB,
  deleteTaskFromDB,
} from "../../services/aiService";

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
        if (text === correctText) {
          newAnswerLetter = label;
        }
        return `${label}. ${text}`;
      });

      return {
        ...q,
        options: newOptions,
        answer: newAnswerLetter,
      };
    })
    .sort(() => 0.5 - Math.random());
};

export const AIHubSection = () => {
  const [documents, setDocuments] = useState([]);
  const [allSavedDocs, setAllSavedDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);

  const [configModal, setConfigModal] = useState(null);
  const [questionCount, setQuestionCount] = useState(3);
  const [difficulty, setDifficulty] = useState("Căn bản");
  const [targetLang, setTargetLang] = useState("Tiếng Việt");

  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [currentCards, setCurrentCards] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState(new Set());
  const [showRestartMenu, setShowRestartMenu] = useState(false);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);

  // Toast Notification thay thế alert()
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      const docs = await fetchDocumentsFromDB();
      if (isMounted && docs && docs.length > 0) {
        setAllSavedDocs(docs);
        const originalDocsOnly = docs.filter(
          (d) => d.type !== "AI_SUMMARY" && !d.name?.startsWith("[Tóm tắt]") && !d.name?.startsWith("[Bản dịch]")
        );
        setDocuments(originalDocsOnly);
        setSelectedDocId((prev) => prev || (originalDocsOnly[0] ? originalDocsOnly[0].id : null));
      }

      const dbTasks = await fetchTasksFromDB();
      if (isMounted && dbTasks && dbTasks.length > 0) {
        setTasks(dbTasks);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      let rawContent = event.target.result;
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const matches = rawContent.match(/[a-zA-Z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ.,:;!?()/-]{4,}/g);
        rawContent = matches ? matches.join(" ") : rawContent.slice(0, 10000);
      }

      const newDoc = {
        id: `doc_${Date.now()}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        content: rawContent || `Tài liệu: ${file.name}`,
        date: "Vừa cập nhật",
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setAllSavedDocs((prev) => [newDoc, ...prev]);
      setSelectedDocId(newDoc.id);
      await saveDocumentToDB(newDoc);
      showToast(`Đã tải lên tài liệu "${file.name}"!`);
    };
    reader.readAsText(file);
  };

  const handleDeleteDoc = async (e, docId) => {
    e.stopPropagation();
    const filtered = documents.filter((d) => d.id !== docId);
    setDocuments(filtered);
    setAllSavedDocs((prev) => prev.filter((d) => d.id !== docId));
    if (selectedDocId === docId) {
      setSelectedDocId(filtered.length > 0 ? filtered[0].id : null);
    }
    await deleteDocumentFromDB(docId);
    showToast("Đã xóa tài liệu ôn tập!");
  };

  const handleSaveItem = async (e, task) => {
    e.stopPropagation();
    const isDocResource = task.featureId === "summary" || task.featureId === "translate";

    if (isDocResource) {
      const docTitle = task.featureId === "summary" 
        ? `[Tóm tắt] ${task.docName}` 
        : `[Bản dịch] ${task.docName}`;
      
      const newDoc = {
        id: `doc_${task.id}`,
        name: docTitle,
        subject: task.docName || "Tóm tắt kiến thức",
        size: `${(task.resultData?.length ? (task.resultData.length / 1024).toFixed(1) : 1)} KB`,
        content: task.resultData || "",
        type: "AI_SUMMARY",
        originTaskId: task.id,
        date: "Vừa lưu từ AI",
      };

      await saveDocumentToDB(newDoc);
      setAllSavedDocs((prev) => [newDoc, ...prev]);

      try {
        const activeDoc = documents.find((d) => d.name === task.docName) || documents[0];
        if (activeDoc) {
          const contentHash = await computeContentHash(activeDoc.content);
          await savePostgresCache(contentHash, task.featureId, task.resultData, task.docName, task.config?.difficulty || "Căn bản");
        }
      } catch (err) {
        console.error("Lỗi lưu cache CSDL:", err);
      }

      const updatedTask = { ...task, isSaved: false, isDocSaved: true };
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
      if (activeTask && activeTask.id === task.id) setActiveTask(updatedTask);
      await saveTaskToDB(updatedTask);
      showToast(`Đã lưu bản tóm tắt vào kho "Tài liệu"!`);
    } else {
      const updatedTask = { ...task, isSaved: true };
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));
      if (activeTask && activeTask.id === task.id) setActiveTask(updatedTask);
      await saveTaskToDB(updatedTask);
      showToast(`Đã lưu bài tập vào danh sách "Bài tập & Luyện thi"!`);
    }
  };

  const handleDeleteTaskFromHistory = async (e, taskId) => {
    e.stopPropagation();
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    if (target.isSaved || target.isDocSaved) {
      const updated = { ...target, hiddenInHistory: true };
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      await saveTaskToDB(updated);
    } else {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      await deleteTaskFromDB(taskId);
    }
    showToast("Đã xóa tác vụ khỏi lịch sử!");
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm("Dọn dẹp danh sách lịch sử tác vụ? Các bài tập và tài liệu đã lưu vẫn được giữ nguyên.")) return;

    for (const task of tasks) {
      if (task.isSaved || task.isDocSaved) {
        await saveTaskToDB({ ...task, hiddenInHistory: true });
      } else {
        await deleteTaskFromDB(task.id);
      }
    }
    setTasks((prev) => prev.filter((t) => t.isSaved || t.isDocSaved).map((t) => ({ ...t, hiddenInHistory: true })));
    showToast("Đã dọn dẹp lịch sử tác vụ!");
  };

  const handleStartTask = async (forceRefresh = false, retryFeatureId = null) => {
    const activeDoc = documents.find((d) => d.id === selectedDocId);
    if (!activeDoc) {
      showToast("Vui lòng chọn hoặc tải lên một tài liệu trước!", "error");
      return;
    }

    const featureId = retryFeatureId || configModal;
    setConfigModal(null);

    const taskId = Date.now().toString();
    const currentDocName = activeDoc.name;
    const currentConfig = { difficulty, questionCount, targetLang };

    const newTask = {
      id: taskId,
      featureId,
      docName: currentDocName,
      status: "loading",
      resultData: null,
      config: currentConfig,
      errorMessage: "",
      isSaved: false,
      isDocSaved: false,
      hiddenInHistory: false,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setTasks((prev) => [newTask, ...prev]);
    await saveTaskToDB(newTask);

    const contentHash = await computeContentHash(activeDoc.content);

    if (!forceRefresh) {
      const cached = await checkPostgresCache(contentHash, featureId, questionCount, difficulty);
      if (cached && cached.data) {
        const isStringValid = typeof cached.data === "string" && cached.data.trim().length > 0;
        const isArrayValid = Array.isArray(cached.data) && cached.data.length > 0;

        if (isStringValid || isArrayValid) {
          const completedTask = { ...newTask, status: "done", resultData: cached.data };
          setTasks((prev) => prev.map((t) => (t.id === taskId ? completedTask : t)));
          await saveTaskToDB(completedTask);
          showToast("Đã nạp nội dung thành công từ bộ nhớ đệm!");
          return;
        }
      }
    }

    try {
      let output = null;
      if (featureId === "quiz") {
        output = await generateQuizFromDoc(activeDoc.content, questionCount, difficulty);
      } else if (featureId === "flashcard") {
        output = await generateFlashcardsFromDoc(activeDoc.content, questionCount, difficulty);
      } else if (featureId === "summary") {
        output = await summarizeFromDoc(activeDoc.content);
      } else if (featureId === "translate") {
        output = await translateFromDoc(activeDoc.content, targetLang);
      }

      const completedTask = { ...newTask, status: "done", resultData: output };
      setTasks((prev) => prev.map((t) => (t.id === taskId ? completedTask : t)));
      await saveTaskToDB(completedTask);

      if (output) {
        await savePostgresCache(contentHash, featureId, output, activeDoc.name, difficulty);
      }
      showToast("Tác vụ AI đã hoàn tất!");
    } catch (err) {
      const failedTask = {
        ...newTask,
        status: "error",
        errorMessage: err.message || "Lỗi xử lý AI",
      };
      setTasks((prev) => prev.map((t) => (t.id === taskId ? failedTask : t)));
      await saveTaskToDB(failedTask);
      showToast(err.message || "Lỗi xử lý AI!", "error");
    }
  };

  const openStudyView = (task) => {
    if (task.status !== "done") return;
    setActiveTask(task);
    if (task.featureId === "quiz" && Array.isArray(task.resultData)) {
      setCurrentQuestions([...task.resultData]);
      setSelectedAnswers({});
    } else if (task.featureId === "flashcard" && Array.isArray(task.resultData)) {
      setCurrentCards([...task.resultData]);
      setActiveCardIndex(0);
      setIsFlipped(false);
      setMasteredCards(new Set());
    }
    setShowRestartMenu(false);
  };

  const handleExitStudyView = () => {
    setActiveTask(null);
    setCurrentQuestions([]);
    setCurrentCards([]);
    setSelectedAnswers({});
    setShowRestartMenu(false);
    setIsGeneratingMore(false);
  };

  const handleRestart = (mode = "default") => {
    setShowRestartMenu(false);
    if (!activeTask) return;

    if (activeTask.featureId === "quiz") {
      setSelectedAnswers({});
      if (mode === "shuffle") {
        setCurrentQuestions(shuffleQuizCompletely(activeTask.resultData));
      } else {
        setCurrentQuestions([...activeTask.resultData]);
      }
    } else if (activeTask.featureId === "flashcard") {
      setActiveCardIndex(0);
      setIsFlipped(false);
      setMasteredCards(new Set());
      if (mode === "shuffle") {
        setCurrentCards((prev) => [...prev].sort(() => 0.5 - Math.random()));
      } else {
        setCurrentCards([...activeTask.resultData]);
      }
    }
  };

  const handleToggleMastered = (cardIndex, isMastered) => {
    setMasteredCards((prev) => {
      const updated = new Set(prev);
      if (isMastered) updated.add(cardIndex);
      else updated.delete(cardIndex);
      return updated;
    });
    if (activeCardIndex < currentCards.length - 1) {
      setTimeout(() => {
        setIsFlipped(false);
        setActiveCardIndex((prev) => prev + 1);
      }, 150);
    }
  };

  const handleAddMore = async () => {
    const activeDoc = documents.find((d) => d.name === activeTask.docName) || documents[0];
    if (!activeDoc) {
      showToast("Không tìm thấy tài liệu gốc để tạo thêm nội dung!", "error");
      return;
    }

    setIsGeneratingMore(true);
    try {
      if (activeTask.featureId === "quiz") {
        const newItems = await generateQuizFromDoc(activeDoc.content, 3, activeTask.config?.difficulty || "Căn bản");
        if (Array.isArray(newItems) && newItems.length > 0) {
          const merged = [...currentQuestions, ...newItems];
          setCurrentQuestions(merged);
          const updatedTask = { ...activeTask, resultData: merged };
          setActiveTask(updatedTask);
          setTasks((prev) => prev.map((t) => (t.id === activeTask.id ? updatedTask : t)));
          await saveTaskToDB(updatedTask);
          showToast("Đã bổ sung 3 câu hỏi trắc nghiệm mới!");
        }
      } else if (activeTask.featureId === "flashcard") {
        const newItems = await generateFlashcardsFromDoc(activeDoc.content, 3, activeTask.config?.difficulty || "Căn bản");
        if (Array.isArray(newItems) && newItems.length > 0) {
          const merged = [...currentCards, ...newItems];
          setCurrentCards(merged);
          const updatedTask = { ...activeTask, resultData: merged };
          setActiveTask(updatedTask);
          setTasks((prev) => prev.map((t) => (t.id === activeTask.id ? updatedTask : t)));
          await saveTaskToDB(updatedTask);
          showToast("Đã bổ sung 3 thẻ flashcard mới!");
        }
      }
    } catch (e) {
      showToast(`Lỗi tạo thêm: ${e.message}`, "error");
    } finally {
      setIsGeneratingMore(false);
    }
  };

  const getNormalizedLetter = (opt, index) => {
    const trimmed = (opt || "").trim();
    const match = trimmed.match(/^([A-D])[\.\:\s]/i);
    if (match) return match[1].toUpperCase();
    return String.fromCharCode(65 + index);
  };

  const getQuizScore = () => {
    if (!currentQuestions || !Array.isArray(currentQuestions)) return { correct: 0, total: 0, percent: 0 };
    let correct = 0;
    currentQuestions.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      const correctLetter = (q.answer || "").trim().charAt(0).toUpperCase();
      if (selected && selected === correctLetter) {
        correct++;
      }
    });
    const total = currentQuestions.length;
    return { correct, total, percent: Math.round((correct / (total || 1)) * 100) };
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const quizScore = getQuizScore();
  const progressPercent = currentQuestions.length > 0 ? Math.round((answeredCount / currentQuestions.length) * 100) : 0;

  const tools = [
    {
      id: "quiz",
      title: "Tạo trắc nghiệm",
      desc: "Luyện đề thông minh theo cấp độ Dễ / Căn bản / Nâng cao.",
      gradient: "bg-gradient-to-br from-[#0045ce] to-indigo-700 text-white shadow-md shadow-blue-500/25",
      badgeColor: "bg-blue-100 text-blue-800 font-extrabold",
      iconClass: "bi bi-journal-check",
    },
    {
      id: "flashcard",
      title: "Tạo thẻ ghi nhớ (Flashcards)",
      desc: "Trích xuất thuật ngữ cốt lõi thành thẻ học lật 2 mặt.",
      gradient: "bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md shadow-emerald-500/25",
      badgeColor: "bg-emerald-100 text-emerald-800 font-extrabold",
      iconClass: "bi bi-collection-play",
    },
    {
      id: "summary",
      title: "Tóm tắt văn bản",
      desc: "Tổng hợp các ý chính trọng tâm theo bố cục rõ ràng.",
      gradient: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/25",
      badgeColor: "bg-amber-100 text-amber-800 font-extrabold",
      iconClass: "bi bi-file-earmark-text",
    },
  ];

  const visibleTasks = tasks.filter((t) => !t.hiddenInHistory);

  // MÀN HÌNH XEM CHI TIẾT TÁC VỤ
  if (activeTask) {
    const isDocOutput = activeTask.featureId === "summary" || activeTask.featureId === "translate";
    const isDocActuallyInDB = isDocOutput && allSavedDocs.some(
      (d) => d.originTaskId === activeTask.id || (d.id === `doc_${activeTask.id}`)
    );
    const isSavedBadge = isDocOutput ? (activeTask.isDocSaved && isDocActuallyInDB) : activeTask.isSaved;

    return (
      <div 
        className="position-fixed top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column"
        style={{ zIndex: 1050, overflow: "hidden" }}
        onClick={() => { if (showRestartMenu) setShowRestartMenu(false); }}
      >
        {/* TOAST NỔI */}
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

        {/* Header né Dynamic Island */}
        <div className="bg-white border-b border-slate-200/80 shadow-xs shrink-0 z-20" style={{ paddingTop: "max(var(--sat, 0px), 38px)" }}>
          <div className="px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                onClick={handleExitStudyView}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200 active:scale-90 transition cursor-pointer shrink-0"
                title="Rời khỏi"
              >
                <i className="bi bi-arrow-left font-bold text-sm"></i>
              </button>

              <div className="min-w-0 flex-1">
                <h6 className="m-0 font-black text-slate-900 text-xs truncate leading-snug">
                  {tools.find((t) => t.id === activeTask.featureId)?.title}
                </h6>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-bold text-slate-400">
                    Cấp độ: <b className="text-[#0045ce]">{activeTask.config?.difficulty || "Căn bản"}</b>
                  </span>
                  {isSavedBadge && (
                    <span className="px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-700 font-extrabold text-[9px] border border-emerald-200 shrink-0">
                      ✓ Đã lưu
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isSavedBadge && (
                <button
                  onClick={(e) => handleSaveItem(e, activeTask)}
                  className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-black border-0 cursor-pointer shadow-xs active:scale-95 transition flex items-center gap-1 ${
                    isDocOutput 
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-500" 
                      : "bg-[#0045ce] text-white hover:bg-blue-700"
                  }`}
                >
                  <i className={`bi ${isDocOutput ? "bi-folder-plus" : "bi-bookmark-plus"}`}></i>
                  <span>{isDocOutput ? "Lưu tài liệu" : "Lưu bài"}</span>
                </button>
              )}

              {(activeTask.featureId === "quiz" || activeTask.featureId === "flashcard") && (
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRestartMenu(!showRestartMenu);
                    }}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10.5px] font-black border border-slate-200 flex items-center gap-1 cursor-pointer active:scale-95 transition"
                  >
                    <i className="bi bi-arrow-repeat text-[#0045ce]"></i>
                    <span>Lại</span>
                    <i className="bi bi-chevron-down text-[8px] text-slate-400"></i>
                  </button>

                  {showRestartMenu && (
                    <div
                      className="absolute right-0 top-full mt-1.5 bg-white shadow-xl rounded-2xl p-1.5 border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100"
                      style={{ minWidth: 155 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleRestart("default")}
                        className="w-full text-left py-1.5 px-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 border-0 bg-transparent flex items-center gap-2 cursor-pointer transition"
                      >
                        <i className="bi bi-arrow-counterclockwise text-[#0045ce] text-xs"></i> Mặc định
                      </button>
                      <button
                        onClick={() => handleRestart("shuffle")}
                        className="w-full text-left py-1.5 px-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 border-0 bg-transparent flex items-center gap-2 cursor-pointer transition"
                      >
                        <i className="bi bi-shuffle text-emerald-600 text-xs"></i> Xáo trộn vị trí
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 w-full" style={{ paddingBottom: "calc(var(--sab, 0px) + 36px)" }}>
          {activeTask.featureId === "quiz" && Array.isArray(currentQuestions) && (
            <div className="d-flex flex-column gap-3">
              <div className="card border-0 shadow-xs rounded-4 p-3 bg-white border border-blue-100">
                <div className="d-flex justify-content-between small fw-bold mb-2">
                  <span className="text-slate-600 font-bold" style={{ fontSize: "11px" }}>
                    Tiến độ: {answeredCount}/{currentQuestions.length} câu
                  </span>
                  <span className="text-[#0045ce] fw-black">{progressPercent}%</span>
                </div>
                <div className="progress rounded-pill bg-slate-100 p-0.5" style={{ height: 8 }}>
                  <div
                    className="progress-bar bg-[#0045ce] rounded-pill"
                    role="progressbar"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>

              {answeredCount === currentQuestions.length && currentQuestions.length > 0 && (
                <div className="card border-0 rounded-4 p-4 text-center text-white bg-gradient-to-r from-[#0045ce] to-indigo-700 shadow-lg">
                  <p className="small text-uppercase fw-extrabold mb-1 tracking-wider text-blue-100" style={{ fontSize: "10.5px" }}>Kết quả ôn tập</p>
                  <h3 className="fw-black mb-1 text-3xl">
                    {quizScore.correct}/{quizScore.total} ({quizScore.percent}%)
                  </h3>
                  <p className="small mb-0 opacity-95 text-blue-100 font-medium" style={{ fontSize: "11.5px" }}>
                    {quizScore.percent >= 80
                      ? "🎉 Xuất sắc! Bạn nắm bài rất vững."
                      : "💪 Hãy đọc kĩ giải thích để củng cố kiến thức nhé!"}
                  </p>
                </div>
              )}

              {currentQuestions.map((q, idx) => {
                const userChoice = selectedAnswers[idx];
                const hasAnswered = !!userChoice;
                const correctLetter = (q.answer || "").trim().charAt(0).toUpperCase();

                return (
                  <div key={idx} className="card border-0 shadow-xs rounded-4 p-3 mb-1 bg-white border border-slate-100">
                    <div className="d-flex align-items-start gap-2 mb-2.5">
                      <span className="badge bg-[#0045ce] text-white rounded-pill px-2.5 py-1 fw-black shadow-xs" style={{ fontSize: "10.5px" }}>
                        Câu {idx + 1}
                      </span>
                      <p className="fw-black text-slate-900 small mb-0 flex-grow-1 leading-snug">
                        {q.question}
                      </p>
                    </div>

                    <div className="d-flex flex-column gap-2 mb-2">
                      {q.options.map((opt, oIdx) => {
                        const optLetter = getNormalizedLetter(opt, oIdx);
                        const isThisSelected = userChoice === optLetter;
                        const isThisCorrect = correctLetter === optLetter;

                        let btnStyle = "bg-white text-slate-800 border-slate-200 hover:bg-slate-50";

                        if (hasAnswered) {
                          if (isThisCorrect) {
                            btnStyle = "bg-emerald-600 text-white font-bold border-emerald-600 shadow-sm";
                          } else if (isThisSelected) {
                            btnStyle = "bg-rose-600 text-white font-bold border-rose-600 shadow-sm";
                          } else {
                            btnStyle = "bg-slate-100 text-slate-400 border-slate-200 opacity-60";
                          }
                        }

                        return (
                          <button
                            key={oIdx}
                            disabled={hasAnswered}
                            onClick={() => setSelectedAnswers((prev) => ({ ...prev, [idx]: optLetter }))}
                            className={`w-100 text-start rounded-3 p-2.5 small font-bold transition border ${btnStyle}`}
                            style={{ fontSize: "12px" }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {hasAnswered && (
                      <div className="alert bg-blue-50/90 text-blue-900 border border-blue-200 rounded-3 small mb-0 py-2 px-3 mt-1" style={{ fontSize: "11.5px" }}>
                        <i className="bi bi-lightbulb-fill text-amber-500 me-1"></i> <b>Giải thích:</b> {q.explain}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="text-center pt-2 pb-4">
                <button
                  disabled={isGeneratingMore}
                  onClick={handleAddMore}
                  className="px-4 py-2 bg-[#0045ce] hover:bg-blue-700 text-white rounded-full font-black text-xs border-0 shadow-md flex items-center gap-1.5 mx-auto active:scale-95 transition cursor-pointer"
                >
                  {isGeneratingMore ? (
                    <>
                      <div className="spinner-border spinner-border-sm" role="status"></div>
                      <span>AI đang tạo thêm...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-plus-circle-fill"></i>
                      <span>Làm thêm 3 câu hỏi mới</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTask.featureId === "flashcard" && Array.isArray(currentCards) && currentCards.length > 0 && (
            <div className="d-flex flex-column gap-3.5 pt-1 select-none">
              <div className="card border-0 shadow-xs rounded-4 p-3 bg-white border border-emerald-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small text-slate-700 fw-bold" style={{ fontSize: "11px" }}>
                    Tiến trình: <b className="text-emerald-700 font-black">{activeCardIndex + 1}</b> / {currentCards.length} thẻ
                  </span>
                  <span className="badge bg-emerald-600 text-white rounded-pill px-3 py-1 fw-black shadow-xs" style={{ fontSize: "11px" }}>
                    Đã thuộc: {masteredCards.size}
                  </span>
                </div>
                <div className="progress rounded-pill bg-slate-100 p-0.5" style={{ height: 8 }}>
                  <div
                    className="progress-bar bg-gradient-to-r from-emerald-500 to-teal-600 rounded-pill"
                    role="progressbar"
                    style={{ width: `${Math.round(((activeCardIndex + 1) / currentCards.length) * 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Khung thẻ 3D Flip */}
              <div
                style={{ perspective: "1200px" }}
                className="w-100 cursor-pointer active:scale-[0.985] transition-transform duration-150"
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
                      <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10.5px] font-black flex items-center gap-1.5 border border-white/20 tracking-wide">
                        📌 Thuật ngữ
                      </span>
                      {masteredCards.has(activeCardIndex) && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px] shadow-xs">
                          ✓ Đã thuộc
                        </span>
                      )}
                    </div>

                    <div className="my-auto py-4 text-center px-3 relative z-10">
                      <h3 className="text-[17px] font-black leading-relaxed m-0 text-white drop-shadow-xs">
                        {currentCards[activeCardIndex]?.front}
                      </h3>
                    </div>

                    <div className="text-center text-blue-100/75 text-[11px] font-medium flex items-center justify-center gap-1.5 relative z-10">
                      <i className="bi bi-arrow-repeat animate-spin-slow"></i>
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
                      <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10.5px] font-black flex items-center gap-1.5 border border-white/20 tracking-wide text-amber-200">
                        💡 Giải nghĩa chi tiết
                      </span>
                      <span className="text-[10px] font-bold text-emerald-100/80">Mặt sau</span>
                    </div>

                    <div className="my-auto py-4 text-center px-3 relative z-10 overflow-y-auto max-h-[150px]">
                      <p className="text-[14.5px] font-bold leading-relaxed m-0 text-white drop-shadow-xs">
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
                  className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl text-xs font-black border border-rose-200 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer shadow-2xs"
                >
                  <i className="bi bi-x-circle-fill text-sm"></i>
                  <span>Chưa thuộc</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleMastered(activeCardIndex, true)}
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black border-0 flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer shadow-md shadow-emerald-600/25"
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
                  className="px-3.5 py-1.5 bg-white rounded-xl text-xs font-black border border-slate-200 text-slate-700 cursor-pointer disabled:opacity-40 hover:bg-slate-50 transition shadow-2xs flex items-center gap-1"
                >
                  <i className="bi bi-chevron-left"></i> Trước
                </button>

                <button
                  type="button"
                  disabled={isGeneratingMore}
                  onClick={handleAddMore}
                  className="px-3.5 py-1.5 bg-[#0045ce] hover:bg-blue-700 text-white rounded-xl text-[11px] font-black border-0 shadow-xs cursor-pointer active:scale-95 transition flex items-center gap-1"
                >
                  {isGeneratingMore ? (
                    <>
                      <div className="spinner-border spinner-border-sm" role="status"></div>
                      <span>Đang tạo...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-plus-lg"></i> Thêm 3 thẻ
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={activeCardIndex === currentCards.length - 1}
                  onClick={() => {
                    setIsFlipped(false);
                    setActiveCardIndex((p) => Math.min(currentCards.length - 1, p + 1));
                  }}
                  className="px-3.5 py-1.5 bg-white rounded-xl text-xs font-black border border-slate-200 text-slate-700 cursor-pointer disabled:opacity-40 hover:bg-slate-50 transition shadow-2xs flex items-center gap-1"
                >
                  Sau <i className="bi bi-chevron-right"></i>
                </button>
              </div>
            </div>
          )}

          {isDocOutput && (
            <div className="card border-0 shadow-sm rounded-4 p-4 text-slate-800 small leading-relaxed bg-white border border-slate-100" style={{ whiteSpace: "pre-wrap", fontSize: "12px" }}>
              {activeTask.resultData}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ================= GIAO DIỆN CHÍNH AI HUB =================
  return (
    <div className="flex flex-col gap-3.5 pb-24 px-1 w-full max-w-full relative">
      {/* TOAST NỔI */}
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

      {/* Nguồn tài liệu học tập */}
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white border border-slate-100">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-7 h-7 rounded-xl bg-blue-100 text-[#0045ce] flex items-center justify-center font-bold text-sm shrink-0">
              <i className="bi bi-folder2-open"></i>
            </span>
            <h6 className="font-black text-slate-900 m-0 text-xs sm:text-sm truncate">
              Nguồn tài liệu học tập
            </h6>
          </div>

          <label 
            className="px-3 py-1.5 bg-[#0045ce] hover:bg-blue-700 text-white rounded-xl text-[11px] font-black border-0 cursor-pointer shadow-xs active:scale-95 transition flex items-center gap-1 shrink-0 m-0"
          >
            <i className="bi bi-plus-lg text-[10px]"></i>
            <span>Tải tệp</span>
            <input type="file" accept=".txt,.doc,.docx,.pdf" onChange={handleFileUpload} className="d-none" />
          </label>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-4 border-2 border-dashed border-slate-200 rounded-3 bg-slate-50/60">
            <i className="bi bi-cloud-arrow-up-fill text-2xl text-blue-500"></i>
            <p className="small fw-bold text-slate-700 mt-1 mb-0">Chưa có tài liệu trong CSDL</p>
            <p className="text-slate-400 small mb-0" style={{ fontSize: "10.5px" }}>Nhấn nút <b>Tải tệp</b> để chọn tài liệu ôn tập</p>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2 overflow-y-auto pr-0.5" style={{ maxHeight: 200 }}>
            {documents.map((doc) => {
              const isSelected = selectedDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`d-flex align-items-center justify-content-between p-2.5 rounded-3 border transition-all ${
                    isSelected
                      ? "bg-blue-50/90 border-[#0045ce] shadow-xs"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <div className="d-flex align-items-center gap-2 overflow-hidden flex-grow-1 me-2">
                    <div className="text-[#0045ce] fs-5">
                      {isSelected ? (
                        <i className="bi bi-check-circle-fill"></i>
                      ) : (
                        <i className="bi bi-circle text-slate-400"></i>
                      )}
                    </div>
                    <div className="text-truncate">
                      <div className={`small fw-black text-truncate ${isSelected ? "text-[#0045ce]" : "text-slate-900"}`}>
                        {doc.name}
                      </div>
                      <div className="text-slate-500 font-medium" style={{ fontSize: "10.5px" }}>
                        {doc.size} • {doc.date || "Vừa cập nhật"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteDoc(e, doc.id)}
                    className="btn btn-sm text-slate-400 hover-text-danger p-1 border-0"
                  >
                    <i className="bi bi-x-lg"></i>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Khối chức năng tác vụ AI */}
      <div>
        <h6 className="fw-black text-slate-900 px-1 mb-2.5 d-flex align-items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#0045ce] animate-pulse"></span>
          Chọn tác vụ xử lý AI
        </h6>
        <div className="d-flex flex-column gap-2">
          {tools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => {
                if (!selectedDocId) return showToast("Vui lòng tải lên và chọn tài liệu!", "error");
                setConfigModal(tool.id);
              }}
              className="card border-0 shadow-xs rounded-4 p-3 d-flex flex-row align-items-center justify-content-between transition-all cursor-pointer bg-white border border-slate-100 hover:border-blue-300 active:scale-[0.99]"
              style={{ cursor: "pointer" }}
            >
              <div className="d-flex align-items-center gap-3">
                <div
                  className={`rounded-2xl d-flex align-items-center justify-content-center p-2.5 ${tool.gradient}`}
                  style={{ width: 44, height: 44, fontSize: "1.3rem" }}
                >
                  <i className={tool.iconClass}></i>
                </div>
                <div>
                  <h6 className="fw-black text-slate-900 mb-0.5 small">{tool.title}</h6>
                  <p className="text-slate-500 font-medium mb-0" style={{ fontSize: "10.5px" }}>{tool.desc}</p>
                </div>
              </div>
              <i className="bi bi-chevron-right text-slate-400 font-bold small"></i>
            </div>
          ))}
        </div>
      </div>

      {/* Lịch sử tác vụ AI */}
      {visibleTasks.length > 0 && (
        <div>
          <div className="d-flex align-items-center justify-content-between mb-2 px-1">
            <h6 className="fw-black text-slate-900 mb-0 d-flex align-items-center gap-1.5 text-xs">
              <i className="bi bi-clock-history text-[#0045ce]"></i> Lịch sử tác vụ ({visibleTasks.length})
            </h6>
            <button
              onClick={handleClearAllHistory}
              className="btn btn-sm btn-outline-danger rounded-pill px-2.5 py-0.5 fw-bold"
              style={{ fontSize: "10.5px" }}
            >
              Dọn dẹp lịch sử
            </button>
          </div>
          <div className="d-flex flex-column gap-2">
            {visibleTasks.map((task) => {
              const isDocType = task.featureId === "summary" || task.featureId === "translate";
              const isDocActuallyInDB = isDocType && allSavedDocs.some(
                (d) => d.originTaskId === task.id || (d.id === `doc_${task.id}`)
              );
              const isSavedBadge = isDocType ? (task.isDocSaved && isDocActuallyInDB) : task.isSaved;

              return (
                <div
                  key={task.id}
                  onClick={() => openStudyView(task)}
                  className={`card border shadow-xs rounded-4 p-2.5 d-flex flex-row align-items-center justify-content-between bg-white ${
                    task.status === "done"
                      ? "border-emerald-300 cursor-pointer"
                      : task.status === "error"
                      ? "border-rose-300"
                      : "border-blue-300"
                  }`}
                  style={{ cursor: task.status === "done" ? "pointer" : "default" }}
                >
                  <div className="d-flex align-items-center gap-2.5 overflow-hidden flex-grow-1 me-2">
                    <div
                      className="rounded-xl d-flex align-items-center justify-content-center bg-slate-100"
                      style={{ width: 36, height: 36 }}
                    >
                      {task.status === "loading" ? (
                        <div className="spinner-border spinner-border-sm text-[#0045ce]" role="status"></div>
                      ) : task.status === "done" ? (
                        <i className="bi bi-check-circle-fill text-emerald-600 fs-5"></i>
                      ) : (
                        <i className="bi bi-exclamation-circle-fill text-rose-600 fs-5"></i>
                      )}
                    </div>
                    <div className="text-truncate">
                      <p className="fw-black text-slate-900 mb-0 small text-truncate">
                        {tools.find((t) => t.id === task.featureId)?.title}
                      </p>
                      <p className="text-slate-500 font-medium mb-0 text-truncate" style={{ fontSize: "10.5px" }}>
                        {task.status === "loading"
                          ? "Đang xử lý nội dung..."
                          : task.status === "done"
                          ? `Tạo lúc ${task.time} • ${
                              isSavedBadge 
                                ? (isDocType ? "Đã lưu vào Tài liệu" : "Đã lưu vào Bài tập") 
                                : "Chưa lưu"
                            }`
                          : `Lỗi: ${task.errorMessage}`}
                      </p>
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {task.status === "done" && (
                      <>
                        {!isSavedBadge ? (
                          <button
                            onClick={(e) => handleSaveItem(e, task)}
                            className={`btn btn-sm rounded-pill px-2.5 py-1 fw-bold text-nowrap d-flex align-items-center gap-1 shadow-xs border-0 ${
                              isDocType ? "btn-warning text-slate-900 bg-amber-400 hover:bg-amber-500" : "btn-primary bg-[#0045ce]"
                            }`}
                            style={{ fontSize: "10.5px" }}
                          >
                            <i className={`bi ${isDocType ? "bi-folder-plus" : "bi-bookmark-plus"}`}></i>
                            <span>{isDocType ? "Lưu tài liệu" : "Lưu bài"}</span>
                          </button>
                        ) : (
                          <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1 fw-bold text-nowrap" style={{ fontSize: "10px" }}>
                            ✓ Đã lưu
                          </span>
                        )}

                        <span
                          onClick={() => openStudyView(task)}
                          className="badge bg-[#0045ce] text-white rounded-pill px-2.5 py-1.5 fw-bold shadow-xs cursor-pointer text-nowrap"
                          style={{ fontSize: "10.5px" }}
                        >
                          {isDocType ? "Xem nội dung →" : "Làm bài →"}
                        </span>
                      </>
                    )}
                    <button
                      onClick={(e) => handleDeleteTaskFromHistory(e, task.id)}
                      className="btn btn-sm btn-link text-slate-400 hover-text-danger p-1 border-0"
                      title="Xóa khỏi lịch sử"
                    >
                      <i className="bi bi-x-lg"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL CẤU HÌNH TÁC VỤ AI */}
      {configModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-end justify-center z-50 p-0"
          onClick={() => setConfigModal(null)}
        >
          <div
            className="bg-white w-full rounded-t-[32px] p-4 shadow-2xl overflow-y-auto animate-in slide-in-from-bottom duration-200"
            style={{ maxHeight: "85vh", paddingBottom: "max(var(--sab, 0px), 28px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3"></div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <h6 className="font-black text-slate-900 m-0 text-sm">
                Tùy chỉnh {tools.find((t) => t.id === configModal)?.title}
              </h6>
              <button
                onClick={() => setConfigModal(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center border-0 text-slate-500 cursor-pointer transition"
              >
                <i className="bi bi-x-lg text-xs"></i>
              </button>
            </div>

            <div className="flex flex-col gap-3.5 text-xs">
              {(configModal === "quiz" || configModal === "flashcard") && (
                <>
                  <div>
                    <label className="font-extrabold text-slate-800 mb-1.5 block text-[11.5px]">
                      Số lượng {configModal === "quiz" ? "câu hỏi" : "thẻ"}:
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[3, 5, 10, 15].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setQuestionCount(num)}
                          className={`py-2 rounded-xl font-black text-xs border transition cursor-pointer ${
                            questionCount === num
                              ? "bg-[#0045ce] text-white border-[#0045ce] shadow-sm"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {num} {configModal === "quiz" ? "câu" : "thẻ"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="font-extrabold text-slate-800 mb-1.5 block text-[11.5px]">
                      Mức độ chuyên sâu:
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: "Dễ", desc: "Nhận biết" },
                        { id: "Căn bản", desc: "Vận dụng" },
                        { id: "Nâng cao", desc: "Phân tích" },
                      ].map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setDifficulty(lvl.id)}
                          className={`py-2 px-1 rounded-xl border text-center transition cursor-pointer ${
                            difficulty === lvl.id
                              ? "bg-[#0045ce] text-white border-[#0045ce] shadow-sm"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <div className="font-black text-xs">{lvl.id}</div>
                          <div
                            className={`text-[9.5px] mt-0.5 ${
                              difficulty === lvl.id ? "text-blue-100" : "text-slate-400"
                            }`}
                          >
                            {lvl.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {configModal === "summary" && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed text-[11.5px]">
                  <i className="bi bi-info-circle-fill text-amber-600 me-1"></i>
                  Bản tóm tắt sẽ được tạo theo cấu trúc luận điểm chính và tự động có thể lưu vào mục <b>Tài liệu</b> để bạn đọc lại bất cứ lúc nào.
                </div>
              )}

              <button
                type="button"
                onClick={() => handleStartTask(false)}
                className="w-full py-3 bg-[#0045ce] hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-md shadow-blue-500/25 mt-2 flex items-center justify-center gap-1.5 border-0 cursor-pointer active:scale-95 transition"
              >
                <i className="bi bi-stars"></i>
                <span>Chạy ngầm & Bắt đầu</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIHubSection;