// tuna_zalo/src/components/LibraryModal.jsx
import React, { useState, useEffect, useMemo } from "react";
import { saveDocumentToDB } from "../services/aiService";

const API_BASE = "https://tuna-project.onrender.com/api";
const ITEMS_PER_PAGE = 10;

const SUB_CATEGORIES = {
  lecture_slide: { label: "Slide bài giảng", badge: "bg-blue-50 text-[#0045ce] border-blue-200", icon: "bi-file-earmark-easel" },
  exam_prep: { label: "Đề thi & Trắc nghiệm", badge: "bg-purple-50 text-purple-700 border-purple-200", icon: "bi-patch-question" },
  textbook: { label: "Giáo trình chính", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "bi-journal-bookmark" },
  assignment_project: { label: "Bài tập / Đồ án", badge: "bg-amber-50 text-amber-800 border-amber-200", icon: "bi-code-square" },
  reference: { label: "Tài liệu đọc thêm", badge: "bg-cyan-50 text-cyan-800 border-cyan-200", icon: "bi-bookmark-plus" },
};

const normalizeText = (str) => {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

export const LibraryModal = ({ isOpen, onClose, userMajor = "Hệ Thống Thông Tin", onNavigateToDocs }) => {
  const [activeTab, setActiveTab] = useState("docs");
  const [filterType, setFilterType] = useState("all");
  const [filterSubCategory, setFilterSubCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [allMajors, setAllMajors] = useState([]);
  const [selectedMajor, setSelectedMajor] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedSemester, setSelectedSemester] = useState("all");
  const [isRoadmapOnly, setIsRoadmapOnly] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [resources, setResources] = useState({ docs: [], videos: [], quizzes: [] });
  const [loading, setLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const [activeQuizExam, setActiveQuizExam] = useState(null);
  const [flippedCardIdx, setFlippedCardIdx] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});

  const [profile, setProfile] = useState({ year: 4, semester: 1, major: userMajor });

  // Toast thay alert()
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3200);
  };

  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem("user_academic_profile");
      if (saved && saved !== "undefined") {
        const parsed = JSON.parse(saved);
        setProfile({
          year: Number(parsed.year) || 4,
          semester: Number(parsed.semester) || 1,
          major: parsed.major || userMajor,
        });
      }
    } catch (e) {
      console.error(e);
    }
  }, [isOpen, userMajor]);

  const fetchMajors = async () => {
    try {
      const res = await fetch(`${API_BASE}/library/majors`);
      const d = await res.json();
      if (d.success && d.data && d.data.length > 0) {
        setAllMajors(d.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAllLibrary = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/library`);
      const data = await res.json();
      if (data.success) {
        const allItems = data.all || [];
        const visibleItems = allItems.filter((i) => i.isPublished !== false);

        setResources({
          docs: visibleItems.filter((i) => i.resourceType === "doc" || (!i.resourceType && (i.type || "").toUpperCase() !== "QUIZ")),
          videos: visibleItems.filter((i) => i.resourceType === "video"),
          quizzes: visibleItems.filter((i) => i.resourceType === "quiz" || String(i.id).startsWith("exam_")),
        });
      }
    } catch (err) {
      console.error("Lỗi nạp học liệu:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMajors();
      fetchAllLibrary();
    }
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, filterSubCategory, selectedMajor, selectedYear, selectedSemester, activeTab, isRoadmapOnly]);

  const handleApplyRoadmapFilter = () => {
    setIsRoadmapOnly(true);
    setSelectedMajor(profile.major || userMajor);
    setSelectedYear(String(profile.year));
    setSelectedSemester(String(profile.semester));
  };

  const handleResetFilters = () => {
    setIsRoadmapOnly(false);
    setSelectedMajor("all");
    setSelectedYear("all");
    setSelectedSemester("all");
    setFilterType("all");
    setFilterSubCategory("all");
    setSearchQuery("");
  };

  const filterResources = (items) => {
    return items.filter((item) => {
      if (filterType === "main" && item.isReference) return false;
      if (filterType === "ref" && !item.isReference) return false;

      if (filterSubCategory !== "all" && item.subCategory !== filterSubCategory) {
        return false;
      }

      if (selectedMajor !== "all" && selectedMajor !== "Tất cả ngành") {
        const itemMajors = Array.isArray(item.facultyMajors) ? item.facultyMajors : [item.major];
        const matchMajor = itemMajors.some(
          (m) => m && normalizeText(m).includes(normalizeText(selectedMajor))
        );
        if (!matchMajor) return false;
      }

      if (selectedYear !== "all" && String(item.year) !== String(selectedYear)) {
        return false;
      }

      if (selectedSemester !== "all" && String(item.semester) !== String(selectedSemester)) {
        return false;
      }

      const rawQuery = searchQuery.trim();
      if (!rawQuery) return true;

      const normQuery = normalizeText(rawQuery);
      const keywords = normQuery.split(/\s+/);

      const normTitle = normalizeText(item.title);
      const normSubject = normalizeText(item.subject);
      const normAuthor = normalizeText(item.author);
      const normCode = normalizeText(item.curriculumSubjectCode);
      const normType = normalizeText(item.type);
      const isRefText = item.isReference ? "tham khao mo rong" : "chinh khoa giao trinh";
      const yearText = `nam ${item.year} k${item.year}`;
      const semText = `ky ${item.semester} hoc ky ${item.semester}`;

      const combinedData = `${normTitle} ${normSubject} ${normCode} ${normAuthor} ${normType} ${isRefText} ${yearText} ${semText}`;
      return keywords.every((kw) => combinedData.includes(kw));
    });
  };

  const currentDocs = useMemo(() => filterResources(resources.docs), [resources.docs, searchQuery, filterType, filterSubCategory, selectedMajor, selectedYear, selectedSemester]);
  const currentVideos = useMemo(() => filterResources(resources.videos), [resources.videos, searchQuery, filterType, filterSubCategory, selectedMajor, selectedYear, selectedSemester]);
  const currentQuizzes = useMemo(() => filterResources(resources.quizzes), [resources.quizzes, searchQuery, filterType, filterSubCategory, selectedMajor, selectedYear, selectedSemester]);

  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return currentDocs.slice(start, start + ITEMS_PER_PAGE);
  }, [currentDocs, currentPage]);

  const paginatedVideos = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return currentVideos.slice(start, start + ITEMS_PER_PAGE);
  }, [currentVideos, currentPage]);

  const paginatedQuizzes = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return currentQuizzes.slice(start, start + ITEMS_PER_PAGE);
  }, [currentQuizzes, currentPage]);

  const activeLength = activeTab === "docs" ? currentDocs.length : activeTab === "videos" ? currentVideos.length : currentQuizzes.length;
  const totalPages = Math.ceil(activeLength / ITEMS_PER_PAGE) || 1;

  if (!isOpen) return null;

  const getEmbedUrl = (url) => {
    if (!url) return "";
    if (url.includes("embed/")) return url;
    const matchWatch = url.match(/[?&]v=([^&]+)/);
    if (matchWatch) return `https://www.youtube.com/embed/${matchWatch[1]}`;
    const matchShort = url.match(/youtu\.be\/([^?&]+)/);
    if (matchShort) return `https://www.youtube.com/embed/${matchShort[1]}`;
    return url;
  };

  const getFullFileUrl = (url) => {
    if (!url || url === "#" || url.startsWith("#exam")) return "#";
    if (url.startsWith("http")) return url;
    return `${API_BASE.replace("/api", "")}${url}`;
  };

  const handleOpenQuiz = async (quiz) => {
    const realExamId = String(quiz.id).replace("exam_", "");
    setFlippedCardIdx(null);
    setSelectedAnswers({});
    try {
      const res = await fetch(`${API_BASE}/exams/admin/${realExamId}`);
      const d = await res.json();
      if (d.success && d.data) {
        setActiveQuizExam(d.data);
      } else {
        showToast("Không tải được chi tiết bộ câu hỏi!", "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối máy chủ!", "error");
    }
  };

  const handleDownloadAndSaveToDocs = async (doc) => {
    try {
      setDownloadingId(doc.id);
      const downloadUrl = getFullFileUrl(doc.downloadUrl || doc.fileUrl);

      const newDoc = {
        id: `lib_doc_${doc.id}_${Date.now()}`,
        name: doc.title,
        size: doc.size || "4.5 MB",
        type: doc.type || "PDF",
        subject: doc.subject,
        downloadUrl: downloadUrl !== "#" ? downloadUrl : "",
        content: `Tài liệu môn học: ${doc.subject}\nTên bài giảng: ${doc.title}\nGiảng viên: ${doc.author}\n\nTài liệu học tập chính thống. Bấm "Mở tệp / Tải về" để mở toàn bộ tài liệu.`,
        date: "Vừa tải từ Thư viện",
      };

      await saveDocumentToDB(newDoc);
      showToast(`Đã lưu "${doc.title}" vào Không gian Tài liệu cá nhân!`);

      if (onNavigateToDocs) {
        setTimeout(() => {
          onClose();
          onNavigateToDocs();
        }, 1200);
      }
    } catch (err) {
      showToast("Lỗi khi tải tài liệu: " + err.message, "error");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      className="position-absolute top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column"
      style={{ zIndex: 1050, overflowY: "auto", overflowX: "hidden" }}
    >
      {/* TOAST THÔNG BÁO HIỆN ĐẠI */}
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

      {/* 1. Header Bar: Đệm né Dynamic Island / Tai thỏ iOS */}
      <div className="bg-[#0045ce] text-white sticky-top shadow-xs select-none">
        <div style={{ height: "max(var(--sat, 0px), 38px)", width: "100%" }} />

        <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 flex items-center justify-center border-0 text-white transition shrink-0 cursor-pointer shadow-2xs"
              title="Quay lại"
            >
              <i className="bi bi-chevron-left text-sm font-black"></i>
            </button>
            
            <div className="flex flex-col justify-center min-w-0 flex-1">
              <h6 className="mb-0 font-black text-[16px] tracking-tight leading-tight truncate text-white">
                Thư viện số CTUT
              </h6>
              <span className="text-blue-100/80 text-[11px] font-medium block truncate mt-0.5">
                Kho học liệu & Đề thi chuyên ngành
              </span>
            </div>
          </div>

          <div className="w-[105px] shrink-0 pointer-events-none" />
        </div>
      </div>

      {/* 2. Thanh chuyển đổi 3 Tabs */}
      <div className="bg-white px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-2 shadow-2xs">
        <div className="bg-slate-100 p-1 rounded-2xl flex flex-1 border border-slate-200/70">
          <button
            onClick={() => setActiveTab("docs")}
            className={`flex-1 py-1.5 rounded-xl text-[11px] font-black transition border-0 flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "docs" ? "bg-[#0045ce] text-white shadow-xs" : "bg-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <i className="bi bi-file-earmark-text"></i> Tài liệu ({resources.docs.length})
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`flex-1 py-1.5 rounded-xl text-[11px] font-black transition border-0 flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "videos" ? "bg-[#0045ce] text-white shadow-xs" : "bg-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <i className="bi bi-play-circle-fill"></i> Video ({resources.videos.length})
          </button>
          <button
            onClick={() => setActiveTab("quizzes")}
            className={`flex-1 py-1.5 rounded-xl text-[11px] font-black transition border-0 flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === "quizzes" ? "bg-purple-600 text-white shadow-xs" : "bg-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <i className="bi bi-patch-question-fill"></i> Đề thi ({resources.quizzes.length})
          </button>
        </div>
      </div>

      {/* 3. Khu vực tìm kiếm */}
      <div className="bg-white px-3 py-2.5 border-b border-slate-200 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <i className="bi bi-search absolute left-3 text-slate-400 text-xs"></i>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo môn, mã HP, trắc nghiệm, giảng viên..."
              className="w-full bg-slate-100 border border-slate-200/80 rounded-2xl pl-8 pr-8 py-2 text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0045ce] focus:bg-white transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] border-0 cursor-pointer"
              >
                <i className="bi bi-x"></i>
              </button>
            )}
          </div>

          <button
            onClick={isRoadmapOnly ? handleResetFilters : handleApplyRoadmapFilter}
            className={`px-3 py-2 rounded-2xl font-black text-xs flex items-center gap-1.5 border-0 shadow-xs active:scale-95 transition cursor-pointer shrink-0 ${
              isRoadmapOnly
                ? "bg-amber-400 text-slate-950"
                : "bg-[#0045ce] text-white shadow-blue-500/20"
            }`}
          >
            <i className={`bi ${isRoadmapOnly ? "bi-globe" : "bi-mortarboard-fill"} text-xs`}></i>
            <span>{isRoadmapOnly ? "Tất cả" : "Của tôi"}</span>
          </button>
        </div>

        {/* Thanh lọc Ngành - Năm - Kỳ */}
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
          <select
            value={selectedMajor}
            onChange={(e) => {
              setSelectedMajor(e.target.value);
              setIsRoadmapOnly(false);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-[#0045ce] truncate"
          >
            <option value="all">Tất cả ngành</option>
            {allMajors.map((m, idx) => (
              <option key={idx} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setIsRoadmapOnly(false);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-[#0045ce]"
          >
            <option value="all">Tất cả năm</option>
            <option value="1">Năm 1</option>
            <option value="2">Năm 2</option>
            <option value="3">Năm 3</option>
            <option value="4">Năm 4</option>
          </select>

          <select
            value={selectedSemester}
            onChange={(e) => {
              setSelectedSemester(e.target.value);
              setIsRoadmapOnly(false);
            }}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-[#0045ce]"
          >
            <option value="all">Tất cả kỳ</option>
            <option value="1">Học kỳ 1</option>
            <option value="2">Học kỳ 2</option>
            <option value="3">Học kỳ 3 (Hè)</option>
          </select>
        </div>

        {/* Bộ lọc nhãn con */}
        <div className="flex items-center justify-between pt-0.5 overflow-x-auto gap-1">
          <div className="flex gap-1 flex-nowrap shrink-0">
            <button
              onClick={() => setFilterSubCategory("all")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border transition ${
                filterSubCategory === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              Toàn bộ
            </button>
            {Object.entries(SUB_CATEGORIES).map(([key, item]) => (
              <button
                key={key}
                onClick={() => setFilterSubCategory(key)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border transition text-nowrap ${
                  filterSubCategory === key
                    ? "bg-[#0045ce] text-white border-[#0045ce]"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-bold text-slate-500 shrink-0 ml-2">
            Tổng: <b className="text-[#0045ce]">{activeLength}</b>
          </span>
        </div>
      </div>

      {/* 4. Danh sách học liệu */}
      <div className="p-3 space-y-2.5 flex-1">
        {activeTab === "docs" && (
          <>
            {loading ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                <span className="spinner-border spinner-border-sm me-2 text-[#0045ce]"></span> Đang nạp tài liệu...
              </div>
            ) : currentDocs.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0045ce] flex items-center justify-center text-xl mx-auto mb-2">
                  <i className="bi bi-folder-x"></i>
                </div>
                <h6 className="font-black text-slate-800 text-xs mb-1">Không tìm thấy tài liệu phù hợp</h6>
                <p className="text-[10.5px] text-slate-400 mb-3">Thử thay đổi bộ lọc hoặc xóa từ khóa tìm kiếm.</p>
                <button onClick={handleResetFilters} className="px-3 py-1 rounded-full bg-blue-50 text-[#0045ce] font-extrabold text-[10.5px] border border-blue-200">
                  Xem tất cả
                </button>
              </div>
            ) : (
              paginatedDocs.map((doc) => {
                const subMeta = SUB_CATEGORIES[doc.subCategory] || SUB_CATEGORIES.lecture_slide;
                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center justify-between gap-2.5 hover:border-blue-300 transition"
                  >
                    <div onClick={() => setPreviewDoc(doc)} className="flex items-center gap-2.5 overflow-hidden flex-1 cursor-pointer">
                      <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 font-black text-xs flex items-center justify-center shrink-0 border border-rose-100">
                        {doc.type || "PDF"}
                      </div>
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-50 text-[#0045ce] border border-blue-200 truncate max-w-[120px]">
                            {doc.subject}
                          </span>
                          {doc.curriculumSubjectCode && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              {doc.curriculumSubjectCode}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${subMeta.badge}`}>
                            {subMeta.label}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">
                            Năm {doc.year} • K{doc.semester}
                          </span>
                        </div>
                        <h3 className="font-black text-slate-900 text-xs truncate m-0 leading-tight">{doc.title}</h3>
                        <p className="text-[10px] text-slate-400 font-medium m-0 mt-0.5 truncate">
                          {doc.size || "Tài liệu"} • Tác giả: <b className="text-slate-600">{doc.author}</b>
                        </p>
                      </div>
                    </div>

                    <button
                      disabled={downloadingId === doc.id}
                      onClick={() => handleDownloadAndSaveToDocs(doc)}
                      className="w-7 h-7 rounded-full bg-[#0045ce] text-white flex items-center justify-center text-xs shrink-0 border-0 active:scale-95 transition cursor-pointer shadow-xs"
                      title="Lưu vào Không gian Tài liệu cá nhân"
                    >
                      {downloadingId === doc.id ? (
                        <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10 }}></span>
                      ) : (
                        <i className="bi bi-download"></i>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}

        {activeTab === "videos" && (
          <>
            {loading ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                <span className="spinner-border spinner-border-sm me-2 text-[#0045ce]"></span> Đang nạp video bài giảng...
              </div>
            ) : currentVideos.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0045ce] flex items-center justify-center text-xl mx-auto mb-2">
                  <i className="bi bi-camera-video-off"></i>
                </div>
                <h6 className="font-black text-slate-800 text-xs mb-1">Chưa có video bài giảng</h6>
                <p className="text-[10.5px] text-slate-400 mb-3">Không có video phù hợp bộ lọc đang chọn.</p>
                <button onClick={handleResetFilters} className="px-3 py-1 rounded-full bg-blue-50 text-[#0045ce] font-extrabold text-[10.5px] border border-blue-200">
                  Xem tất cả
                </button>
              </div>
            ) : (
              paginatedVideos.map((vid) => (
                <div key={vid.id} className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs space-y-2 overflow-hidden">
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black shadow-inner">
                    <iframe
                      className="w-full h-full border-0"
                      src={getEmbedUrl(vid.embedUrl)}
                      title={vid.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>

                  <div className="px-0.5 space-y-0.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-blue-50 text-[#0045ce] border border-blue-200">
                        {vid.subject}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">
                        Năm {vid.year} • K{vid.semester}
                      </span>
                    </div>

                    <h3 className="font-black text-slate-900 text-xs m-0 leading-tight">{vid.title}</h3>
                    <p className="text-[10px] text-slate-400 font-medium m-0">
                      Giảng viên: <b className="text-slate-600">{vid.author}</b> • {vid.duration || "Bài giảng trực tuyến"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "quizzes" && (
          <>
            {loading ? (
              <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                <span className="spinner-border spinner-border-sm me-2 text-purple-600"></span> Đang nạp đề thi & ôn tập...
              </div>
            ) : currentQuizzes.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl mx-auto mb-2">
                  <i className="bi bi-patch-question"></i>
                </div>
                <h6 className="font-black text-slate-800 text-xs mb-1">Chưa có đề thi hoặc thẻ Flashcard</h6>
                <p className="text-[10.5px] text-slate-400 mb-3">Thầy cô sẽ sớm cập nhật đề thi ôn tập cho môn học này.</p>
                <button onClick={handleResetFilters} className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-extrabold text-[10.5px] border border-purple-200">
                  Xem tất cả
                </button>
              </div>
            ) : (
              paginatedQuizzes.map((quiz) => {
                const isFlashcard = quiz.duration === "0 phút" || quiz.examType === "flashcard";
                return (
                  <div
                    key={quiz.id}
                    className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs flex items-center justify-between gap-2.5 hover:border-purple-300 transition"
                  >
                    <div onClick={() => handleOpenQuiz(quiz)} className="flex items-center gap-2.5 overflow-hidden flex-1 cursor-pointer">
                      <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 font-black text-xs flex items-center justify-center shrink-0 border border-purple-100">
                        <i className={`bi ${isFlashcard ? "bi-card-text" : "bi-patch-question-fill"}`}></i>
                      </div>
                      <div className="truncate flex-1">
                        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200 truncate max-w-[120px]">
                            {quiz.subject}
                          </span>
                          {quiz.curriculumSubjectCode && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              {quiz.curriculumSubjectCode}
                            </span>
                          )}
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
                            {isFlashcard ? "Lật thẻ Flashcard" : "Trắc nghiệm ABCD"}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">
                            Năm {quiz.year} • K{quiz.semester}
                          </span>
                        </div>
                        <h3 className="font-black text-slate-900 text-xs truncate m-0 leading-tight">{quiz.title}</h3>
                        <p className="text-[10px] text-slate-400 font-medium m-0 mt-0.5 truncate">
                          Quy mô: <b>{quiz.size || "10 câu"}</b> • Thời lượng: <b>{quiz.duration || "45 phút"}</b>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenQuiz(quiz)}
                      className="px-3 py-1 rounded-full bg-purple-600 text-white font-extrabold text-[10.5px] border-0 active:scale-95 transition cursor-pointer shadow-xs shrink-0"
                    >
                      {isFlashcard ? "Lật thẻ" : "Làm bài"}
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* 5. Phân trang */}
      {totalPages > 1 && (
        <div className="bg-white px-3 py-2 border-t border-slate-200 d-flex align-items-center justify-content-between sticky-bottom shadow-xs mt-auto">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="btn btn-sm btn-light rounded-pill px-3 py-1 font-bold text-[11px] border cursor-pointer disabled:opacity-40"
          >
            ← Trước
          </button>

          <span className="text-[11px] font-black text-slate-700">
            Trang <b className="text-[#0045ce]">{currentPage}</b> / {totalPages}
          </span>

          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="btn btn-sm btn-light rounded-pill px-3 py-1 font-bold text-[11px] border cursor-pointer disabled:opacity-40"
          >
            Sau →
          </button>
        </div>
      )}

      {/* 6. Modal xem trước */}
      {previewDoc && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark/60 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1100 }}
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-3xl p-4 w-100 max-w-[420px] shadow-2xl flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#0045ce] font-extrabold text-[10px]">
                {previewDoc.subject} (Năm {previewDoc.year} - Kỳ {previewDoc.semester})
              </span>
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border-0 cursor-pointer"
              >
                <i className="bi bi-x-lg text-xs"></i>
              </button>
            </div>

            <div>
              <h4 className="text-sm font-black text-slate-900 leading-snug mb-1">{previewDoc.title}</h4>
              <p className="text-xs text-slate-400 m-0">
                Tác giả: <b className="text-slate-700">{previewDoc.author}</b> • {previewDoc.size || "Tài liệu"}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 leading-relaxed max-h-48 overflow-y-auto">
              <p className="font-bold text-slate-800 mb-1">📖 Tóm lược học phần:</p>
              Tài liệu chính thức cung cấp slide bài giảng, bài tập thực hành và câu hỏi ôn tập theo khung chương trình đào tạo của Khoa.
            </div>

            <button
              onClick={() => {
                const target = previewDoc;
                setPreviewDoc(null);
                handleDownloadAndSaveToDocs(target);
              }}
              className="w-full py-2.5 bg-[#0045ce] text-white rounded-xl text-xs font-black shadow-md border-0 active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <i className="bi bi-download"></i> Tải về và thêm vào Tài liệu cá nhân
            </button>
          </div>
        </div>
      )}

      {/* 7. Modal làm bài trắc nghiệm / flashcard */}
      {activeQuizExam && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark/70 d-flex align-items-center justify-content-center p-3"
          style={{ zIndex: 1150 }}
          onClick={() => setActiveQuizExam(null)}
        >
          <div
            className="bg-white rounded-3xl p-3.5 w-100 max-w-[480px] shadow-2xl flex flex-col gap-2.5 max-h-[88vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-2">
              <div className="overflow-hidden">
                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-extrabold text-[10px]">
                  {activeQuizExam.exam_type === "flashcard" ? "Bộ thẻ Flashcard" : "Trắc nghiệm ABCD"} • {activeQuizExam.subject_name}
                </span>
                <h4 className="text-xs font-black text-slate-900 truncate mt-1 mb-0">{activeQuizExam.title}</h4>
              </div>
              <button
                onClick={() => setActiveQuizExam(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center border-0 cursor-pointer shrink-0"
              >
                <i className="bi bi-x-lg text-xs"></i>
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 p-1 flex-1">
              {activeQuizExam.exam_type === "flashcard" ? (
                <div className="space-y-2.5">
                  <div className="text-center text-[11px] text-slate-400 font-medium">
                    Nhấp vào thẻ để lật xem đáp án / định nghĩa
                  </div>
                  {(activeQuizExam.questions || []).map((card, idx) => {
                    const isFlipped = flippedCardIdx === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => setFlippedCardIdx(isFlipped ? null : idx)}
                        className={`p-4 rounded-2xl border transition text-center cursor-pointer shadow-2xs ${
                          isFlipped ? "bg-emerald-50/80 border-emerald-300" : "bg-white border-purple-200"
                        }`}
                        style={{ minHeight: "130px" }}
                      >
                        <span className="text-[10px] font-extrabold text-slate-400 block mb-1">
                          Thẻ #{idx + 1} ({isFlipped ? "Mặt Sau - Đáp án" : "Mặt Trước - Câu hỏi"})
                        </span>
                        <div className="py-2">
                          {isFlipped ? (
                            <p className="font-extrabold text-emerald-800 text-xs leading-relaxed m-0">
                              {card.backText || card.explanation}
                            </p>
                          ) : (
                            <p className="font-black text-slate-900 text-xs leading-relaxed m-0">
                              {card.frontText || card.questionText}
                            </p>
                          )}
                        </div>
                        <span className="text-[9.5px] font-bold text-slate-400 mt-2 block">
                          <i className="bi bi-arrow-repeat me-1"></i> Bấm để {isFlipped ? "xem lại câu hỏi" : "lật xem lời giải"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {(activeQuizExam.questions || []).map((q, idx) => {
                    const chosen = selectedAnswers[q.id];
                    const isCorrect = chosen === q.correctOption;
                    return (
                      <div key={q.id || idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                        <h5 className="font-black text-slate-900 text-xs leading-tight m-0">
                          Câu {idx + 1}: {q.questionText}
                        </h5>

                        <div className="grid grid-cols-2 gap-1.5">
                          {["A", "B", "C", "D"].map((opt) => {
                            const isSelected = chosen === opt;
                            let btnStyle = "bg-white border-slate-200 text-slate-700";

                            if (chosen) {
                              if (opt === q.correctOption) btnStyle = "bg-emerald-50 border-emerald-400 text-emerald-700 font-bold";
                              else if (isSelected) btnStyle = "bg-rose-50 border-rose-400 text-rose-700 line-through";
                            }

                            return (
                              <button
                                key={opt}
                                onClick={() => setSelectedAnswers({ ...selectedAnswers, [q.id]: opt })}
                                className={`p-2 rounded-xl border text-[11px] text-left transition flex items-center gap-1.5 ${btnStyle}`}
                              >
                                <span className="font-black text-[10px] w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                  {opt}
                                </span>
                                <span className="truncate">{q[`option${opt}`]}</span>
                              </button>
                            );
                          })}
                        </div>

                        {chosen && (
                          <div className={`p-2 rounded-xl text-[10.5px] ${isCorrect ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                            <b>{isCorrect ? " Chính xác!" : " Chưa đúng!"}</b> Đáp án đúng là <b>{q.correctOption}</b>.
                            {q.explanation && <p className="m-0 mt-0.5 text-slate-600">{q.explanation}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">
                Tổng cộng: {activeQuizExam.questions?.length || 0} mục
              </span>
              <button
                onClick={() => setActiveQuizExam(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold border-0 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryModal;