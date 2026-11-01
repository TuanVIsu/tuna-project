// src/admin/ManageLibrary.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "https://tuna-project.onrender.com/api";

const SUB_CATEGORIES = {
  lecture_slide: { label: "Slide bài giảng", badge: "bg-primary-subtle text-primary border-primary-subtle", icon: "bi-file-earmark-easel" },
  textbook: { label: "Giáo trình chính", badge: "bg-success-subtle text-success border-success-subtle", icon: "bi-journal-bookmark" },
  assignment_project: { label: "Bài tập / Đồ án", badge: "bg-warning-subtle text-dark border-warning-subtle", icon: "bi-code-square" },
  exam_prep: { label: "Đề thi & Trắc nghiệm", badge: "bg-danger-subtle text-danger border-danger-subtle", icon: "bi-patch-question" },
  reference: { label: "Tài liệu đọc thêm", badge: "bg-info-subtle text-dark border-info-subtle", icon: "bi-bookmark-plus" },
};

// Tự động đoán phân loại dựa trên tên file
const detectCategoryFromName = (name) => {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("giáo trình") || lower.includes("giao trinh") || lower.includes("textbook") || lower.includes("sách")) {
    return "textbook";
  }
  if (lower.includes("bài tập") || lower.includes("bai tap") || lower.includes("đồ án") || lower.includes("do an") || lower.includes("lab") || lower.includes("thực hành")) {
    return "assignment_project";
  }
  if (lower.includes("đề thi") || lower.includes("de thi") || lower.includes("trắc nghiệm") || lower.includes("trac nghiem") || lower.includes("ôn tập") || lower.includes("quiz")) {
    return "exam_prep";
  }
  if (lower.includes("tham khảo") || lower.includes("tham khao") || lower.includes("đọc thêm")) {
    return "reference";
  }
  return "lecture_slide";
};

export const ManageLibrary = () => {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Chế độ hiển thị: 'grouped' (Gom theo môn học) | 'list' (Danh sách phẳng)
  const [viewMode, setViewMode] = useState("grouped");
  const [expandedSubjects, setExpandedSubjects] = useState({});

  // Danh mục động từ CSDL
  const [allMajors, setAllMajors] = useState([]);
  const [curriculumSubjects, setCurriculumSubjects] = useState([]);

  // Bộ lọc
  const [filterMajor, setFilterMajor] = useState("Tất cả");
  const [filterYear, setFilterYear] = useState("all");
  const [filterSemester, setFilterSemester] = useState("all");
  const [filterSubCategory, setFilterSubCategory] = useState("all");
  const [filterPublished, setFilterPublished] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Floating Menu 3 chấm
  const [activeMenuData, setActiveMenuData] = useState(null);
  const menuDropdownRef = useRef(null);

  // Phân trang (cho chế độ bảng phẳng)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // MODAL STATES
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [viewingQuizModal, setViewingQuizModal] = useState(null);
  const [flippedCardIdx, setFlippedCardIdx] = useState(null);

  // Autocomplete môn học
  const [docSubjectSearch, setDocSubjectSearch] = useState("");
  const [showDocSubjectSuggestions, setShowDocSubjectSuggestions] = useState(false);
  const docSearchRef = useRef(null);

  const [examSubjectSearch, setExamSubjectSearch] = useState("");
  const [showExamSubjectSuggestions, setShowExamSubjectSuggestions] = useState(false);
  const examSearchRef = useRef(null);

  // ================= FORM 1: ĐĂNG TẢI TÀI LIỆU / VIDEO =================
  const [selectedMajors, setSelectedMajors] = useState([]);
  const [formYear, setFormYear] = useState(1);
  const [formSemester, setFormSemester] = useState(1);
  const [formSubject, setFormSubject] = useState("");
  const [formSubjectCode, setFormSubjectCode] = useState("");
  const [formSubCategory, setFormSubCategory] = useState("lecture_slide");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formAuthor, setFormAuthor] = useState("Ban Đào Tạo");
  const [uploadItems, setUploadItems] = useState([]);
  const [videoInput, setVideoInput] = useState({ title: "", embedUrl: "", subCategory: "lecture_slide" });

  // ================= FORM 2: TẠO ĐỀ THI ĐỘC LẬP =================
  const [examType, setExamType] = useState("multiple_choice");
  const [examForm, setExamForm] = useState({
    title: "",
    subjectName: "",
    subjectCode: "",
    facultyMajor: "Hệ Thống Thông Tin",
    academicYear: 1,
    semester: 1,
    durationMinutes: 45,
    passScore: 5,
  });
  const [mcQuestions, setMcQuestions] = useState([
    { questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctOption: "A", explanation: "" },
  ]);
  const [flashcardItems, setFlashcardItems] = useState([
    { frontText: "", backText: "", explanation: "" },
  ]);

  // ================= FORM 3: CHỈNH SỬA THÔNG TIN =================
  const [editFormData, setEditFormData] = useState({
    title: "",
    subject: "",
    subjectCode: "",
    facultyMajors: [],
    year: 1,
    semester: 1,
    isReference: false,
    subCategory: "lecture_slide",
    isPublished: true,
    author: "",
    embedUrl: "",
  });
  const [editReplacementFile, setEditReplacementFile] = useState(null);

  const getHeaders = useCallback((isMultipart = false) => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("token") || "";
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (!isMultipart) headers["Content-Type"] = "application/json";
    return headers;
  }, []);

  useEffect(() => {
    const handleOutside = (e) => {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(e.target)) setActiveMenuData(null);
      if (docSearchRef.current && !docSearchRef.current.contains(e.target)) setShowDocSubjectSuggestions(false);
      if (examSearchRef.current && !examSearchRef.current.contains(e.target)) setShowExamSubjectSuggestions(false);
    };
    const handleScroll = () => {
      setActiveMenuData(null);
    };

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  const fetchMajors = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/library/majors`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success && d.data && d.data.length > 0) {
        setAllMajors(d.data);
        setSelectedMajors((prev) => (prev.length === 0 ? [d.data[0]] : prev));
      }
    } catch (err) {
      console.error(err);
    }
  }, [getHeaders]);

  const fetchCurriculum = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/library/curriculum-sync-subjects`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success) setCurriculumSubjects(d.data || []);
    } catch (err) {
      console.error(err);
    }
  }, [getHeaders]);

  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams({
        major: filterMajor,
        year: filterYear,
        semester: filterSemester,
        subCategory: filterSubCategory,
        isPublished: filterPublished,
        search: searchTerm,
      }).toString();

      const res = await fetch(`${API_BASE}/library?${query}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) setResources(data.all || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterMajor, filterYear, filterSemester, filterSubCategory, filterPublished, searchTerm, getHeaders]);

  useEffect(() => {
    fetchMajors();
    fetchCurriculum();
  }, [fetchMajors, fetchCurriculum]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchResources();
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchResources]);

  // Gom nhóm tài liệu theo Môn học (Giải quyết triệt để sự phân tán)
  const groupedResources = useMemo(() => {
    const groups = {};
    resources.forEach((item) => {
      const key = item.curriculumSubjectCode
        ? `${item.curriculumSubjectCode}_${item.subject}`
        : item.subject || "Chưa phân loại";
      if (!groups[key]) {
        groups[key] = {
          key,
          subjectName: item.subject || "Học phần chung",
          subjectCode: item.curriculumSubjectCode || "",
          year: item.year || 1,
          semester: item.semester || 1,
          facultyMajors: item.facultyMajors || [],
          items: [],
        };
      }
      groups[key].items.push(item);
    });
    return Object.values(groups);
  }, [resources]);

  // Mở nhanh Modal thêm tiếp tài liệu vào đúng môn học đó
  const handleQuickAddForSubject = (group) => {
    setUploadItems([]);
    setFormSubject(group.subjectName);
    setDocSubjectSearch(group.subjectName);
    setFormSubjectCode(group.subjectCode || "");
    setFormYear(group.year || 1);
    setFormSemester(group.semester || 1);
    if (group.facultyMajors && group.facultyMajors.length > 0) {
      setSelectedMajors(group.facultyMajors);
    } else if (allMajors.length > 0) {
      setSelectedMajors([allMajors[0]]);
    }
    setShowAddDocModal(true);
  };

  const toggleSubjectAccordion = (key) => {
    setExpandedSubjects((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  const handleToggleStatus = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/library/${id}/toggle-status`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      const d = await res.json();
      if (d.success) {
        setResources((prev) =>
          prev.map((r) => (r.id === id ? { ...r, isPublished: d.isPublished } : r))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleActionMenu = (e, item) => {
    e.stopPropagation();
    if (activeMenuData && activeMenuData.item.id === item.id) {
      setActiveMenuData(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    let top = rect.bottom + 4;
    if (spaceBelow < 140) top = rect.top - 140 - 4;

    setActiveMenuData({
      item,
      top,
      right: window.innerWidth - rect.right,
    });
  };

  // --- LOGIC FORM 1: CHỌN NHIỀU FILE & TỰ ĐỘNG PHÂN LOẠI TỪNG FILE ---
  const handleMultipleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newItems = files.map((file) => {
      const sizeMB = file.size / (1024 * 1024);
      const sizeStr = sizeMB >= 1 ? `${sizeMB.toFixed(1)} MB` : `${Math.max(1, (file.size / 1024).toFixed(0))} KB`;
      const ext = file.name.split(".").pop().toUpperCase();
      const rawName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      const cleanTitle = rawName.replace(/[-_]/g, " ").trim();

      return {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        resourceType: "doc",
        title: cleanTitle,
        subCategory: detectCategoryFromName(cleanTitle),
        fileType: ext,
        fileSize: sizeStr,
        rawFile: file,
      };
    });

    setUploadItems((prev) => [...prev, ...newItems]);
    // KHÔNG tự gán tên file vào tên môn học để tránh sinh tên môn học sai
    e.target.value = "";
  };

  const handleAddVideoItem = () => {
    if (!videoInput.title.trim() || !videoInput.embedUrl.trim()) {
      alert("Vui lòng nhập tiêu đề và liên kết YouTube!");
      return;
    }

    let formattedUrl = videoInput.embedUrl.trim();
    const matchWatch = formattedUrl.match(/[?&]v=([^&]+)/);
    if (matchWatch) formattedUrl = `https://www.youtube.com/embed/${matchWatch[1]}`;
    const matchShort = formattedUrl.match(/youtu\.be\/([^?&]+)/);
    if (matchShort) formattedUrl = `https://www.youtube.com/embed/${matchShort[1]}`;

    setUploadItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        resourceType: "video",
        title: videoInput.title.trim(),
        subCategory: videoInput.subCategory || "lecture_slide",
        embedUrl: formattedUrl,
        fileType: "VIDEO",
        fileSize: "YouTube",
        duration: "Bài giảng",
        rawFile: null,
      },
    ]);
    setVideoInput({ title: "", embedUrl: "", subCategory: "lecture_slide" });
  };

  const handleUpdateUploadItem = (id, field, value) => {
    setUploadItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    if (!formSubject.trim()) {
      alert("Vui lòng chọn hoặc nhập tên môn học áp dụng!");
      return;
    }
    if (uploadItems.length === 0) {
      alert("Vui lòng thêm ít nhất một file tài liệu hoặc video bài giảng!");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("facultyMajors", JSON.stringify(selectedMajors));
      formData.append("year", formYear);
      formData.append("semester", formSemester);
      formData.append("subject", formSubject.trim());
      formData.append("subjectCode", formSubjectCode);
      formData.append("isReference", false);
      formData.append("subCategory", formSubCategory);
      formData.append("isPublished", formIsPublished);
      formData.append("author", formAuthor.trim() || "Ban Đào Tạo");

      const itemsPayload = [];
      uploadItems.forEach((item) => {
        itemsPayload.push({
          resourceType: item.resourceType,
          title: item.title.trim() || formSubject.trim(),
          subCategory: item.subCategory || formSubCategory,
          fileType: item.fileType,
          fileSize: item.fileSize,
          embedUrl: item.embedUrl || null,
          duration: item.duration || null,
        });
        if (item.rawFile) formData.append("files", item.rawFile);
      });

      formData.append("items", JSON.stringify(itemsPayload));

      const res = await fetch(`${API_BASE}/library/batch`, {
        method: "POST",
        headers: getHeaders(true),
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        alert(`Đã đăng tải thành công ${result.count} học liệu cho môn "${formSubject}"!`);
        setShowAddDocModal(false);
        setUploadItems([]);
        fetchResources();
      } else {
        alert("Lỗi: " + result.error);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  // --- LOGIC FORM 2: TẠO ĐỀ THI ĐỘC LẬP ---
  const handleCreateExamSubmit = async (e) => {
    e.preventDefault();
    if (!examForm.title.trim() || !examForm.subjectName.trim()) {
      alert("Vui lòng nhập tên đề thi và chọn môn học!");
      return;
    }

    const payloadItems = examType === "multiple_choice" ? mcQuestions : flashcardItems;

    for (let i = 0; i < payloadItems.length; i++) {
      const item = payloadItems[i];
      if (examType === "multiple_choice") {
        if (!item.questionText.trim() || !item.optionA.trim() || !item.optionB.trim()) {
          alert(`Câu hỏi ${i + 1} chưa điền nội dung hoặc đáp án A/B!`);
          return;
        }
      } else {
        if (!item.frontText.trim() || !item.backText.trim()) {
          alert(`Thẻ ghi nhớ ${i + 1} chưa điền mặt trước hoặc mặt sau!`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/exams/admin/create`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          ...examForm,
          examType,
          items: payloadItems,
        }),
      });

      const d = await res.json();
      if (d.success) {
        alert("Tạo bài kiểm tra / bộ thẻ ghi nhớ thành công!");
        setShowCreateExamModal(false);
        fetchResources();
      } else {
        alert("Lỗi: " + d.message);
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  // --- LOGIC FORM 3: CẬP NHẬT CHỈNH SỬA ---
  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", editFormData.title.trim());
      formData.append("subject", editFormData.subject.trim());
      formData.append("subjectCode", editFormData.subjectCode || "");
      formData.append("facultyMajors", JSON.stringify(editFormData.facultyMajors));
      formData.append("year", editFormData.year);
      formData.append("semester", editFormData.semester);
      formData.append("isReference", editFormData.subCategory === "reference" ? true : editFormData.isReference);
      formData.append("subCategory", editFormData.subCategory);
      formData.append("isPublished", editFormData.isPublished);
      formData.append("author", editFormData.author.trim());

      if (editingItem.resourceType === "video") {
        let formattedUrl = editFormData.embedUrl;
        const matchWatch = formattedUrl.match(/[?&]v=([^&]+)/);
        if (matchWatch) formattedUrl = `https://www.youtube.com/embed/${matchWatch[1]}`;
        const matchShort = formattedUrl.match(/youtu\.be\/([^?&]+)/);
        if (matchShort) formattedUrl = `https://www.youtube.com/embed/${matchShort[1]}`;
        formData.append("embedUrl", formattedUrl);
      }

      if (editReplacementFile) {
        formData.append("file", editReplacementFile);
      }

      const res = await fetch(`${API_BASE}/library/${editingItem.id}`, {
        method: "PUT",
        headers: getHeaders(true),
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        setEditingItem(null);
        fetchResources();
      } else {
        alert("Lỗi máy chủ: " + (result.error || "Không thể cập nhật"));
      }
    } catch (err) {
      alert("Lỗi kết nối: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEditMajorSelection = (major) => {
    const majors = editFormData.facultyMajors;
    if (majors.includes(major)) {
      if (majors.length > 1) {
        setEditFormData({ ...editFormData, facultyMajors: majors.filter((m) => m !== major) });
      } else {
        alert("Phải chọn ít nhất một ngành học!");
      }
    } else {
      setEditFormData({ ...editFormData, facultyMajors: [...majors, major] });
    }
  };

  const handleViewExamQuestions = async (item) => {
    setActiveMenuData(null);
    setFlippedCardIdx(null);
    const realExamId = String(item.id).replace("exam_", "");
    try {
      const res = await fetch(`${API_BASE}/exams/admin/${realExamId}`, { headers: getHeaders() });
      const d = await res.json();
      if (d.success && d.data) {
        setViewingQuizModal(d.data);
      } else {
        alert("Không tải được chi tiết câu hỏi!");
      }
    } catch (e) {
      alert("Lỗi tải câu hỏi đề thi");
    }
  };

  const handleDelete = async (item) => {
    setActiveMenuData(null);
    if (!window.confirm(`Bạn có chắc muốn xóa "${item.title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/library/${item.id}`, { method: "DELETE", headers: getHeaders() });
      const result = await res.json();
      if (result.success) fetchResources();
      else alert(result.error);
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(resources.length / itemsPerPage) || 1;
  const currentItems = resources.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getFullFileUrl = (url) => {
    if (!url || url === "#" || url.startsWith("#exam")) return "#";
    if (url.startsWith("http")) return url;
    return `${API_BASE.replace("/api", "")}${url}`;
  };

  // Hàm tính Năm và Học kỳ chuẩn theo mô hình của ngành (3 hoặc 4 kỳ/năm)
  const applySubjectFromCurriculum = (s, isExam = false) => {
    const spy = Number(s.semestersPerYear) || 3;
    const semIdx = Number(s.semesterIndex) || 1;
    const calcYear = Math.ceil(semIdx / spy);
    const calcSem = ((semIdx - 1) % spy) + 1;

    if (isExam) {
      setExamForm((prev) => ({
        ...prev,
        subjectName: s.subjectName,
        subjectCode: s.subjectCode || "",
        facultyMajor: s.majorName || prev.facultyMajor,
        academicYear: calcYear,
        semester: calcSem,
      }));
      setExamSubjectSearch(s.subjectName);
      setShowExamSubjectSuggestions(false);
    } else {
      setFormSubject(s.subjectName);
      setDocSubjectSearch(s.subjectName);
      setFormSubjectCode(s.subjectCode || "");
      setFormYear(calcYear);
      setFormSemester(calcSem);
      if (s.majorName && allMajors.includes(s.majorName)) {
        setSelectedMajors([s.majorName]);
      }
      setShowDocSubjectSuggestions(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3 w-100 pb-5">
      {/* 1. Header Toolbar */}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 bg-white p-3.5 rounded-4 shadow-sm border">
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-3 d-flex align-items-center justify-content-center text-white shadow-sm flex-shrink-0"
            style={{ width: "42px", height: "42px", background: "linear-gradient(135deg, #185bf0 0%, #7c3aed 100%)" }}
          >
            <i className="bi bi-folder2-open fs-5"></i>
          </div>
          <div>
            <h6 className="fw-bold text-dark mb-0 fs-6">Kho Học Liệu & Ngân Hàng Đề Thi</h6>
            <small className="text-secondary fw-semibold">
              Quản lý tập trung theo từng môn học: Slide, Giáo trình, Video, Trắc nghiệm & Flashcard
            </small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Chuyển đổi chế độ xem: Gom theo môn vs Bảng phẳng */}
          <div className="p-1 bg-light rounded-pill border d-inline-flex gap-1 me-1">
            <button
              type="button"
              onClick={() => setViewMode("grouped")}
              className={`btn btn-sm rounded-pill px-2.5 py-1 fw-bold border-0 transition ${
                viewMode === "grouped" ? "bg-white text-primary shadow-2xs" : "text-secondary bg-transparent"
              }`}
              style={{ fontSize: "11.5px" }}
            >
              <i className="bi bi-folder-fill me-1"></i>Theo môn học ({groupedResources.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`btn btn-sm rounded-pill px-2.5 py-1 fw-bold border-0 transition ${
                viewMode === "list" ? "bg-white text-primary shadow-2xs" : "text-secondary bg-transparent"
              }`}
              style={{ fontSize: "11.5px" }}
            >
              <i className="bi bi-list-ul me-1"></i>Tất cả tệp ({resources.length})
            </button>
          </div>

          <button
            onClick={() => {
              setExamSubjectSearch("");
              setExamType("multiple_choice");
              setExamForm({
                title: "",
                subjectName: "",
                subjectCode: "",
                facultyMajor: allMajors[0] || "Hệ Thống Thông Tin",
                academicYear: 1,
                semester: 1,
                durationMinutes: 45,
                passScore: 5,
              });
              setMcQuestions([{ questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctOption: "A", explanation: "" }]);
              setFlashcardItems([{ frontText: "", backText: "", explanation: "" }]);
              setShowCreateExamModal(true);
            }}
            className="btn btn-sm text-white rounded-pill px-3.5 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-xs border-0"
            style={{ fontSize: "12.5px", background: "linear-gradient(180deg, #7c3aed 0%, #6d28d9 100%)" }}
          >
            <i className="bi bi-patch-question-fill fs-6"></i>
            <span>Tạo Đề Thi / Thẻ Mới</span>
          </button>

          <button
            onClick={() => {
              setUploadItems([]);
              setDocSubjectSearch("");
              setFormSubject("");
              setFormSubjectCode("");
              if (allMajors.length > 0 && selectedMajors.length === 0) setSelectedMajors([allMajors[0]]);
              setShowAddDocModal(true);
            }}
            className="btn btn-sm btn-primary rounded-pill px-3.5 py-1.5 fw-bold d-flex align-items-center gap-1.5 shadow-xs border-0 text-white"
            style={{ fontSize: "12.5px", background: "linear-gradient(180deg, #185bf0 0%, #1546cd 100%)" }}
          >
            <i className="bi bi-cloud-arrow-up-fill fs-6"></i>
            <span>Đăng Tải Học Liệu</span>
          </button>
        </div>
      </div>

      {/* 2. Thanh lọc dữ liệu */}
      <div className="card border shadow-sm rounded-4 p-3 bg-white">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-3">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light border-end-0 text-muted"><i className="bi bi-search"></i></span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm môn học, mã HP, tên tài liệu..."
                className="form-control bg-light border-start-0 fw-semibold"
                style={{ fontSize: "12px" }}
              />
            </div>
          </div>

          <div className="col-6 col-md-2">
            <select
              value={filterMajor}
              onChange={(e) => setFilterMajor(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="Tất cả">Tất cả ngành</option>
              {allMajors.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <select
              value={filterSubCategory}
              onChange={(e) => setFilterSubCategory(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả phân loại</option>
              {Object.entries(SUB_CATEGORIES).map(([key, item]) => (
                <option key={key} value={key}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="col-4 col-md-2">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả năm</option>
              <option value="1">Năm 1</option>
              <option value="2">Năm 2</option>
              <option value="3">Năm 3</option>
              <option value="4">Năm 4</option>
            </select>
          </div>

          <div className="col-4 col-md-1">
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả kỳ</option>
              <option value="1">Kỳ 1</option>
              <option value="2">Kỳ 2</option>
              <option value="3">Kỳ 3</option>
              <option value="4">Kỳ 4</option>
            </select>
          </div>

          <div className="col-4 col-md-2">
            <select
              value={filterPublished}
              onChange={(e) => setFilterPublished(e.target.value)}
              className="form-select form-select-sm fw-semibold rounded-3 bg-light border"
              style={{ fontSize: "12px" }}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="true">Đang hiển thị</option>
              <option value="false">Đang ẩn</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3A. CHẾ ĐỘ XEM GOM NHÓM THEO MÔN HỌC (FOLDER VIEW) */}
      {viewMode === "grouped" ? (
        <div className="d-flex flex-column gap-2.5">
          {loading ? (
            <div className="card border shadow-sm rounded-4 p-5 text-center text-muted bg-white">
              <div className="spinner-border spinner-border-sm text-primary me-2"></div>
              Đang tải dữ liệu học liệu...
            </div>
          ) : groupedResources.length === 0 ? (
            <div className="card border shadow-sm rounded-4 p-5 text-center text-muted bg-white">
              Chưa có học liệu hoặc đề thi nào phù hợp với bộ lọc.
            </div>
          ) : (
            groupedResources.map((group) => {
              const isExpanded = expandedSubjects[group.key] !== false;
              const docCount = group.items.filter((i) => i.resourceType === "doc").length;
              const videoCount = group.items.filter((i) => i.resourceType === "video").length;
              const quizCount = group.items.filter((i) => i.resourceType === "quiz" || String(i.id).startsWith("exam_")).length;

              return (
                <div key={group.key} className="card border shadow-2xs rounded-4 bg-white overflow-hidden">
                  {/* Thanh tiêu đề Thư mục Môn học */}
                  <div
                    onClick={() => toggleSubjectAccordion(group.key)}
                    className="p-3 bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 cursor-pointer border-bottom"
                    style={{ cursor: "pointer", backgroundColor: isExpanded ? "#f8fafc" : "#ffffff" }}
                  >
                    <div className="d-flex align-items-center gap-2.5">
                      <div
                        className="rounded-3 d-flex align-items-center justify-content-center text-primary"
                        style={{ width: "38px", height: "38px", backgroundColor: "#eff6ff" }}
                      >
                        <i className={`bi ${isExpanded ? "bi-folder2-open" : "bi-folder-fill"} fs-5`}></i>
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className="fw-bold text-dark" style={{ fontSize: "14px" }}>
                            {group.subjectName}
                          </span>
                          {group.subjectCode && (
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace" style={{ fontSize: "10.5px" }}>
                              {group.subjectCode}
                            </span>
                          )}
                          <span className="badge bg-light text-secondary border" style={{ fontSize: "10.5px" }}>
                            Năm {group.year} • Kỳ {group.semester}
                          </span>
                        </div>
                        <div className="d-flex align-items-center gap-2 mt-0.5">
                          <small className="text-muted fw-semibold" style={{ fontSize: "11px" }}>
                            Tổng <b>{group.items.length}</b> học liệu:
                          </small>
                          {docCount > 0 && <small className="text-primary fw-bold" style={{ fontSize: "11px" }}>• {docCount} Tài liệu</small>}
                          {videoCount > 0 && <small className="text-danger fw-bold" style={{ fontSize: "11px" }}>• {videoCount} Video</small>}
                          {quizCount > 0 && <small style={{ fontSize: "11px", color: "#7e22ce" }} className="fw-bold">• {quizCount} Đề/Flashcard</small>}
                        </div>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleQuickAddForSubject(group)}
                        className="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold d-flex align-items-center gap-1"
                        style={{ fontSize: "11.5px" }}
                      >
                        <i className="bi bi-plus-circle-fill"></i>
                        <span>Thêm tài liệu vào môn này</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSubjectAccordion(group.key)}
                        className="btn btn-sm btn-light rounded-circle border p-0 d-flex align-items-center justify-content-center"
                        style={{ width: "30px", height: "30px" }}
                      >
                        <i className={`bi bi-chevron-${isExpanded ? "up" : "down"} text-secondary`}></i>
                      </button>
                    </div>
                  </div>

                  {/* Danh sách tài liệu con bên trong môn học */}
                  {isExpanded && (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0 text-nowrap" style={{ fontSize: "12.5px" }}>
                        <tbody>
                          {group.items.map((item) => {
                            const isQuiz = item.resourceType === "quiz" || String(item.id).startsWith("exam_");
                            const tagMeta = SUB_CATEGORIES[item.subCategory] || SUB_CATEGORIES.lecture_slide;
                            return (
                              <tr key={item.id}>
                                <td className="ps-4" style={{ minWidth: "280px" }}>
                                  <div className="d-flex align-items-center gap-2.5">
                                    <div
                                      className="rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
                                      style={{
                                        width: "32px",
                                        height: "32px",
                                        backgroundColor: isQuiz ? "#f3e8ff" : item.resourceType === "video" ? "#fee2e2" : "#eff6ff",
                                        color: isQuiz ? "#7e22ce" : item.resourceType === "video" ? "#dc2626" : "#1d4ed8",
                                      }}
                                    >
                                      <i
                                        className={`bi ${
                                          isQuiz
                                            ? "bi-patch-question-fill"
                                            : item.resourceType === "video"
                                            ? "bi-youtube"
                                            : (item.type || "").toUpperCase() === "PDF"
                                            ? "bi-file-earmark-pdf-fill"
                                            : (item.type || "").toUpperCase() === "PPTX"
                                            ? "bi-file-earmark-easel-fill"
                                            : "bi-file-earmark-text-fill"
                                        }`}
                                      ></i>
                                    </div>
                                    <div>
                                      <span className="fw-bold text-dark d-block text-truncate" style={{ maxWidth: "340px" }} title={item.title}>
                                        {item.title}
                                      </span>
                                      <small className="text-muted" style={{ fontSize: "11px" }}>
                                        {item.type} • {item.size || item.duration} • {item.author} • {item.createdAt}
                                      </small>
                                    </div>
                                  </div>
                                </td>

                                <td style={{ width: "160px" }}>
                                  <span className={`badge rounded-pill border fw-bold ${tagMeta.badge}`} style={{ fontSize: "10px" }}>
                                    <i className={`bi ${tagMeta.icon} me-1`}></i>
                                    {tagMeta.label}
                                  </span>
                                </td>

                                <td className="text-center" style={{ width: "100px" }}>
                                  <button
                                    onClick={() => handleToggleStatus(item.id)}
                                    className={`btn btn-sm rounded-pill px-2.5 py-0.5 fw-bold border-0 ${
                                      item.isPublished ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
                                    }`}
                                    style={{ fontSize: "11px" }}
                                  >
                                    {item.isPublished ? "Hiện" : "Ẩn"}
                                  </button>
                                </td>

                                <td className="text-end pe-3" style={{ width: "80px" }}>
                                  <button
                                    type="button"
                                    onClick={(e) => toggleActionMenu(e, item)}
                                    className="btn btn-sm btn-light rounded-circle d-inline-flex align-items-center justify-content-center p-0 border"
                                    style={{ width: "30px", height: "30px", color: "#64748b" }}
                                  >
                                    <i className="bi bi-three-dots-vertical"></i>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* 3B. CHẾ ĐỘ BẢNG DANH SÁCH PHẲNG */
        <div className="card border shadow-sm rounded-4 bg-white">
          <div className="table-responsive" style={{ minHeight: "280px" }}>
            <table className="table table-hover align-middle mb-0 text-nowrap" style={{ minWidth: "900px" }}>
              <thead className="table-light">
                <tr style={{ fontSize: "11px", color: "#64748b", letterSpacing: "0.5px" }} className="text-uppercase">
                  <th className="ps-3" style={{ minWidth: "260px" }}>Tên học liệu / Đề thi</th>
                  <th style={{ minWidth: "160px" }}>Môn học & Mã HP</th>
                  <th style={{ minWidth: "130px" }}>Phân loại</th>
                  <th className="text-center" style={{ minWidth: "90px" }}>Năm / Kỳ</th>
                  <th className="text-center" style={{ minWidth: "90px" }}>Hiển thị</th>
                  <th className="text-end pe-4" style={{ width: "70px" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: "12.5px" }}>
                {loading ? (
                  <tr><td colSpan="6" className="text-center py-5 text-muted">Đang nạp dữ liệu...</td></tr>
                ) : resources.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-5 text-muted">Không tìm thấy tài liệu hoặc đề thi nào.</td></tr>
                ) : (
                  currentItems.map((item) => {
                    const isQuiz = item.resourceType === "quiz" || String(item.id).startsWith("exam_");
                    const tagMeta = SUB_CATEGORIES[item.subCategory] || SUB_CATEGORIES.lecture_slide;
                    return (
                      <tr key={item.id}>
                        <td className="ps-3">
                          <div className="d-flex align-items-center gap-2">
                            <div
                              className="rounded-2 d-flex align-items-center justify-content-center flex-shrink-0"
                              style={{
                                width: "34px",
                                height: "34px",
                                backgroundColor: isQuiz ? "#f3e8ff" : item.resourceType === "video" ? "#fee2e2" : "#eff6ff",
                                color: isQuiz ? "#7e22ce" : item.resourceType === "video" ? "#dc2626" : "#1d4ed8",
                              }}
                            >
                              <i
                                className={`bi ${
                                  isQuiz
                                    ? "bi-patch-question-fill fs-6"
                                    : item.resourceType === "video"
                                    ? "bi-youtube fs-6"
                                    : "bi-file-earmark-text-fill fs-6"
                                }`}
                              ></i>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <span className="fw-bold text-dark text-truncate d-block" style={{ maxWidth: "250px" }} title={item.title}>
                                {item.title}
                              </span>
                              <small className="text-muted d-block" style={{ fontSize: "11px" }}>
                                {item.size || item.duration || "Tài liệu"} • {item.author}
                              </small>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="fw-bold text-dark d-block text-truncate" style={{ maxWidth: "150px" }}>
                            {item.subject}
                          </span>
                          {item.curriculumSubjectCode && (
                            <code className="text-primary font-monospace" style={{ fontSize: "10.5px" }}>
                              [{item.curriculumSubjectCode}]
                            </code>
                          )}
                        </td>

                        <td>
                          <span className={`badge rounded-pill border fw-bold ${tagMeta.badge}`} style={{ fontSize: "10px" }}>
                            <i className={`bi ${tagMeta.icon} me-1`}></i>
                            {tagMeta.label}
                          </span>
                        </td>

                        <td className="text-center">
                          <small className="fw-semibold text-secondary">Năm {item.year} • K{item.semester}</small>
                        </td>

                        <td className="text-center">
                          <button
                            onClick={() => handleToggleStatus(item.id)}
                            className={`btn btn-sm rounded-pill px-2.5 py-0.5 fw-bold border-0 ${
                              item.isPublished ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
                            }`}
                            style={{ fontSize: "11px" }}
                          >
                            {item.isPublished ? "Hiện" : "Ẩn"}
                          </button>
                        </td>

                        <td className="text-end pe-3">
                          <button
                            type="button"
                            onClick={(e) => toggleActionMenu(e, item)}
                            className="btn btn-sm btn-light rounded-circle d-inline-flex align-items-center justify-content-center p-0 border"
                            style={{ width: "32px", height: "32px", color: "#64748b" }}
                          >
                            <i className="bi bi-three-dots-vertical fs-6"></i>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && resources.length > 0 && (
            <div className="d-flex flex-wrap justify-content-between align-items-center p-3 border-top bg-white gap-2">
              <div className="d-flex align-items-center gap-2 small text-muted">
                <span>Hiển thị</span>
                <select
                  className="form-select form-select-sm py-0.5 rounded-2 fw-semibold text-center"
                  style={{ width: "65px" }}
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
                <span>trên tổng số <b>{resources.length}</b> mục</span>
              </div>

              <div className="d-flex align-items-center gap-1 ms-auto">
                <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                  <i className="bi bi-chevron-double-left small"></i>
                </button>
                <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === 1} onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}>
                  <i className="bi bi-chevron-left small"></i>
                </button>
                <span className="small fw-bold px-2 text-secondary" style={{ fontSize: "12px" }}>
                  {currentPage} / {totalPages}
                </span>
                <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === totalPages} onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}>
                  <i className="bi bi-chevron-right small"></i>
                </button>
                <button className="btn btn-sm btn-light border px-2 py-1 rounded-2" disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                  <i className="bi bi-chevron-double-right small"></i>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. FLOATING MENU 3 CHẤM */}
      {activeMenuData && (
        <div
          ref={menuDropdownRef}
          className="card border-0 shadow-lg rounded-3 py-1 text-start position-fixed"
          style={{
            width: "170px",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            fontSize: "12px",
            zIndex: 99999,
            top: `${activeMenuData.top}px`,
            right: `${activeMenuData.right}px`,
          }}
        >
          {(activeMenuData.item.resourceType === "quiz" || String(activeMenuData.item.id).startsWith("exam_")) ? (
            <button
              type="button"
              onClick={() => handleViewExamQuestions(activeMenuData.item)}
              className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 border-0 bg-transparent"
              style={{ color: "#7e22ce" }}
            >
              <i className="bi bi-card-checklist fs-6"></i>
              <span>Xem bộ câu hỏi</span>
            </button>
          ) : activeMenuData.item.resourceType === "video" && activeMenuData.item.embedUrl ? (
            <a
              href={activeMenuData.item.embedUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setActiveMenuData(null)}
              className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent text-decoration-none"
            >
              <i className="bi bi-youtube text-danger fs-6"></i>
              <span>Mở Video</span>
            </a>
          ) : activeMenuData.item.downloadUrl && !activeMenuData.item.downloadUrl.startsWith("#") ? (
            <a
              href={getFullFileUrl(activeMenuData.item.downloadUrl)}
              download
              onClick={() => setActiveMenuData(null)}
              className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent text-decoration-none"
            >
              <i className="bi bi-download text-success fs-6"></i>
              <span>Tải file về</span>
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => {
              const item = activeMenuData.item;
              setActiveMenuData(null);
              setEditingItem(item);
              setEditFormData({
                title: item.title || "",
                subject: item.subject || "",
                subjectCode: item.curriculumSubjectCode || "",
                facultyMajors: Array.isArray(item.facultyMajors) ? item.facultyMajors : (allMajors.length > 0 ? [allMajors[0]] : ["Hệ Thống Thông Tin"]),
                year: item.year || 1,
                semester: item.semester || 1,
                isReference: !!item.isReference,
                subCategory: item.subCategory || "lecture_slide",
                isPublished: item.isPublished !== false,
                author: item.author || "Ban Đào Tạo",
                embedUrl: item.embedUrl || "",
              });
              setEditReplacementFile(null);
            }}
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-dark border-0 bg-transparent"
          >
            <i className="bi bi-pencil-fill text-primary" style={{ fontSize: "11px" }}></i>
            <span>Chỉnh sửa</span>
          </button>

          <div className="dropdown-divider my-1 border-top" style={{ borderColor: "#f1f5f9" }}></div>

          <button
            type="button"
            onClick={() => handleDelete(activeMenuData.item)}
            className="dropdown-item d-flex align-items-center gap-2 px-3 py-1.5 text-danger border-0 bg-transparent"
          >
            <i className="bi bi-trash3-fill text-danger" style={{ fontSize: "11px" }}></i>
            <span>Xóa mục này</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL ĐĂNG TẢI HỌC LIỆU HÀNG LOẠT (CHO PHÉP SỬA TÊN & LOẠI TỪNG FILE) */}
      {/* ========================================================================= */}
      {showAddDocModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0">Đăng Tải Bộ Học Liệu Theo Môn Học</h6>
                  <small className="text-secondary fw-semibold">
                    Tải lên cùng lúc nhiều Slide, Giáo trình, Bài tập và Video cho 1 môn học
                  </small>
                </div>
                <button type="button" onClick={() => setShowAddDocModal(false)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4">
                <form onSubmit={handleBatchSubmit} className="d-flex flex-column gap-3">
                  {/* Chọn môn học từ Khung CTĐT */}
                  <div className="p-3 bg-light rounded-3 border position-relative" ref={docSearchRef}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-uppercase text-secondary mb-0" style={{ fontSize: "10px" }}>
                        1. Môn học áp dụng (Tìm theo Mã HP hoặc Tên môn) *
                      </label>
                      {formSubjectCode && (
                        <span className="badge bg-primary-subtle text-primary border border-primary-subtle font-monospace" style={{ fontSize: "10px" }}>
                          Mã HP: {formSubjectCode} • Năm {formYear} Kỳ {formSemester}
                        </span>
                      )}
                    </div>

                    <div className="position-relative">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-white border-end-0 text-muted"><i className="bi bi-search"></i></span>
                        <input
                          type="text"
                          required
                          placeholder="Gõ mã hoặc tên môn học từ Khung CTĐT..."
                          value={docSubjectSearch}
                          onFocus={() => setShowDocSubjectSuggestions(true)}
                          onChange={(e) => {
                            setDocSubjectSearch(e.target.value);
                            setFormSubject(e.target.value);
                            setShowDocSubjectSuggestions(true);
                          }}
                          className="form-control form-control-sm bg-white border-start-0 fw-bold text-primary shadow-none"
                        />
                      </div>

                      {showDocSubjectSuggestions && (
                        <div
                          className="position-absolute start-0 end-0 bg-white border rounded-3 shadow-lg mt-1 p-1"
                          style={{ maxHeight: "200px", overflowY: "auto", zIndex: 1080 }}
                        >
                          {curriculumSubjects
                            .filter((s) => {
                              if (!docSubjectSearch.trim()) return true;
                              const q = docSubjectSearch.toLowerCase();
                              return s.subjectName?.toLowerCase().includes(q) || s.subjectCode?.toLowerCase().includes(q);
                            })
                            .map((s, idx) => (
                              <div
                                key={idx}
                                onClick={() => applySubjectFromCurriculum(s, false)}
                                className="p-2 rounded-2 d-flex justify-content-between align-items-center cursor-pointer"
                                style={{ cursor: "pointer" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                <div>
                                  <b className="text-primary font-monospace me-1.5">[{s.subjectCode}]</b>
                                  <span className="fw-semibold text-dark">{s.subjectName}</span>
                                  <small className="text-muted ms-2">({s.majorName})</small>
                                </div>
                                <span className="badge bg-light text-secondary border">{s.credits} TC</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Chọn nhiều tệp tin cùng lúc */}
                  <div className="row g-2">
                    <div className="col-12 col-md-6">
                      <div className="p-3 bg-light rounded-3 border border-dashed border-primary h-100 d-flex flex-column justify-content-center">
                        <label className="form-label small fw-bold text-primary mb-1 d-flex align-items-center gap-1.5">
                          <i className="bi bi-file-earmark-plus-fill fs-6"></i> 2A. Chọn nhiều tệp tài liệu cùng lúc:
                        </label>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.zip,.rar,.pptx,.xlsx"
                          onChange={handleMultipleFilesChange}
                          className="form-control form-control-sm bg-white rounded-3 shadow-none"
                        />
                        <small className="text-muted mt-1" style={{ fontSize: "10.5px" }}>
                          Mẹo: Giữ phím Ctrl / Shift để bôi đen nhiều file Slide, Giáo trình, Bài tập cùng lúc.
                        </small>
                      </div>
                    </div>

                    <div className="col-12 col-md-6">
                      <div className="p-3 bg-light rounded-3 border h-100">
                        <label className="form-label small fw-bold text-dark mb-1 d-flex align-items-center gap-1">
                          <i className="bi bi-youtube text-danger fs-6"></i> 2B. Hoặc đính kèm Video YouTube:
                        </label>
                        <div className="d-flex flex-column gap-1.5">
                          <input
                            type="text"
                            placeholder="Tiêu đề video bài giảng..."
                            value={videoInput.title}
                            onChange={(e) => setVideoInput({ ...videoInput, title: e.target.value })}
                            className="form-control form-control-sm rounded-2 shadow-none"
                          />
                          <div className="d-flex gap-1.5">
                            <input
                              type="text"
                              placeholder="Dán link YouTube..."
                              value={videoInput.embedUrl}
                              onChange={(e) => setVideoInput({ ...videoInput, embedUrl: e.target.value })}
                              className="form-control form-control-sm rounded-2 shadow-none"
                            />
                            <button
                              type="button"
                              onClick={handleAddVideoItem}
                              className="btn btn-dark btn-sm fw-bold rounded-2 px-3 text-nowrap"
                            >
                              + Thêm
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Danh sách các mục chờ tải lên: Sửa tên và phân loại riêng cho từng mục */}
                  {uploadItems.length > 0 && (
                    <div className="border rounded-3 p-2.5 bg-light">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="small fw-bold text-dark">
                          3. Danh sách học liệu chuẩn bị lưu ({uploadItems.length} mục) — Có thể sửa tên & nhãn riêng:
                        </span>
                        <button
                          type="button"
                          onClick={() => setUploadItems([])}
                          className="btn btn-sm btn-link text-danger p-0 text-decoration-none"
                          style={{ fontSize: "11.5px" }}
                        >
                          Xóa tất cả
                        </button>
                      </div>

                      <div className="d-flex flex-column gap-2" style={{ maxHeight: "220px", overflowY: "auto" }}>
                        {uploadItems.map((item, idx) => (
                          <div key={item.id} className="row g-2 align-items-center bg-white p-2 rounded-2 border mx-0">
                            <div className="col-auto">
                              <span className="badge bg-primary font-monospace" style={{ fontSize: "10px" }}>
                                #{idx + 1} • {item.fileType}
                              </span>
                            </div>
                            <div className="col">
                              <input
                                type="text"
                                value={item.title}
                                onChange={(e) => handleUpdateUploadItem(item.id, "title", e.target.value)}
                                className="form-control form-control-sm fw-semibold border-0 bg-light"
                                placeholder="Tên hiển thị của tài liệu..."
                              />
                            </div>
                            <div className="col-4">
                              <select
                                value={item.subCategory || "lecture_slide"}
                                onChange={(e) => handleUpdateUploadItem(item.id, "subCategory", e.target.value)}
                                className="form-select form-select-sm fw-semibold"
                                style={{ fontSize: "11.5px" }}
                              >
                                {Object.entries(SUB_CATEGORIES).map(([k, v]) => (
                                  <option key={k} value={k}>{v.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-auto">
                              <button
                                type="button"
                                onClick={() => setUploadItems(uploadItems.filter((i) => i.id !== item.id))}
                                className="btn btn-sm btn-light text-danger rounded-circle p-0"
                                style={{ width: "26px", height: "26px" }}
                              >
                                <i className="bi bi-trash3-fill" style={{ fontSize: "11px" }}></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="modal-footer px-0 pb-0 border-top pt-3 d-flex justify-content-end gap-2">
                    <button type="button" onClick={() => setShowAddDocModal(false)} className="btn btn-light rounded-pill px-3.5 py-1.5 small border">
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn btn-primary rounded-pill px-4 py-1.5 small fw-bold border-0 text-white"
                      style={{ background: "#185bf0" }}
                    >
                      {submitting ? "Đang tải lên..." : `Lưu Toàn Bộ (${uploadItems.length})`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MODAL TẠO ĐỀ THI & FLASHCARD */}
      {/* ========================================================================= */}
      {showCreateExamModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.6)", zIndex: 1065 }}>
          <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3 bg-white">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0 d-flex align-items-center gap-2">
                    <i className="bi bi-patch-question-fill" style={{ color: "#7c3aed" }}></i> Soạn Thảo Đề Thi & Bộ Thẻ Ôn Tập
                  </h6>
                  <small className="text-secondary fw-semibold">
                    Đồng bộ Khung CTĐT • Tự động xếp chung vào thư mục môn học
                  </small>
                </div>
                <button type="button" onClick={() => setShowCreateExamModal(false)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4 bg-light">
                <form onSubmit={handleCreateExamSubmit} className="d-flex flex-column gap-3">
                  <div className="p-3 bg-white rounded-3 border shadow-2xs position-relative" ref={examSearchRef}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-uppercase text-secondary mb-0" style={{ fontSize: "10px" }}>
                        1. Chọn môn học áp dụng *
                      </label>
                      {examForm.subjectCode && (
                        <span className="badge border font-monospace" style={{ fontSize: "10px", color: "#7c3aed" }}>
                          Mã HP: {examForm.subjectCode} • Năm {examForm.academicYear} Kỳ {examForm.semester}
                        </span>
                      )}
                    </div>

                    <div className="position-relative">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-light border-end-0 text-muted"><i className="bi bi-search"></i></span>
                        <input
                          type="text"
                          required
                          placeholder="Gõ mã hoặc tên môn học từ Khung CTĐT..."
                          value={examSubjectSearch}
                          onFocus={() => setShowExamSubjectSuggestions(true)}
                          onChange={(e) => {
                            setExamSubjectSearch(e.target.value);
                            setExamForm({ ...examForm, subjectName: e.target.value });
                            setShowExamSubjectSuggestions(true);
                          }}
                          className="form-control form-control-sm bg-light border-start-0 fw-bold text-primary shadow-none"
                        />
                      </div>

                      {showExamSubjectSuggestions && (
                        <div
                          className="position-absolute start-0 end-0 bg-white border rounded-3 shadow-lg mt-1 p-1"
                          style={{ maxHeight: "200px", overflowY: "auto", zIndex: 1080 }}
                        >
                          {curriculumSubjects
                            .filter((s) => {
                              if (!examSubjectSearch.trim()) return true;
                              const q = examSubjectSearch.toLowerCase();
                              return s.subjectName?.toLowerCase().includes(q) || s.subjectCode?.toLowerCase().includes(q);
                            })
                            .map((s, idx) => (
                              <div
                                key={idx}
                                onClick={() => applySubjectFromCurriculum(s, true)}
                                className="p-2 rounded-2 d-flex justify-content-between align-items-center cursor-pointer"
                                style={{ cursor: "pointer" }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                              >
                                <div>
                                  <b className="text-primary font-monospace me-1.5">[{s.subjectCode}]</b>
                                  <span className="fw-semibold text-dark">{s.subjectName}</span>
                                </div>
                                <span className="badge bg-light text-secondary border">{s.credits} TC</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Định dạng bài kiểm tra */}
                  <div className="p-3 bg-white rounded-3 border shadow-2xs">
                    <div className="row g-2">
                      <div className="col-12 col-md-6">
                        <div
                          onClick={() => setExamType("multiple_choice")}
                          className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center gap-3 transition ${
                            examType === "multiple_choice" ? "border-primary bg-primary-subtle" : "bg-light"
                          }`}
                          style={{ cursor: "pointer" }}
                        >
                          <i className={`bi bi-ui-checks fs-3 ${examType === "multiple_choice" ? "text-primary" : "text-secondary"}`}></i>
                          <div>
                            <b className="d-block text-dark" style={{ fontSize: "13px" }}>Trắc nghiệm 4 đáp án (A - B - C - D)</b>
                            <small className="text-muted">Tính điểm tự động và giới hạn thời gian làm bài.</small>
                          </div>
                        </div>
                      </div>

                      <div className="col-12 col-md-6">
                        <div
                          onClick={() => setExamType("flashcard")}
                          className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center gap-3 transition ${
                            examType === "flashcard" ? "border-warning bg-warning-subtle" : "bg-light"
                          }`}
                          style={{ cursor: "pointer" }}
                        >
                          <i className={`bi bi-card-text fs-3 ${examType === "flashcard" ? "text-amber-800" : "text-secondary"}`}></i>
                          <div>
                            <b className="d-block text-dark" style={{ fontSize: "13px" }}>Bộ thẻ ghi nhớ lật mặt (Flashcard)</b>
                            <small className="text-muted">Ôn tập nhanh thuật ngữ và khái niệm cốt lõi.</small>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="row g-2 mt-3 pt-3 border-top">
                      <div className="col-12 col-md-6">
                        <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>
                          Tiêu Đề Đề Thi / Bộ Thẻ *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="VD: Đề ôn tập Giữa kỳ / Flashcard Chương 1..."
                          value={examForm.title}
                          onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                          className="form-control form-control-sm rounded-3 fw-bold shadow-none"
                        />
                      </div>

                      {examType === "multiple_choice" && (
                        <>
                          <div className="col-6 col-md-3">
                            <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Thời Gian (Phút)</label>
                            <input
                              type="number" min="5" max="180"
                              value={examForm.durationMinutes}
                              onChange={(e) => setExamForm({ ...examForm, durationMinutes: Number(e.target.value) })}
                              className="form-control form-control-sm text-center fw-bold shadow-none"
                            />
                          </div>
                          <div className="col-6 col-md-3">
                            <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Điểm Đạt (/10)</label>
                            <input
                              type="number" min="1" max="10"
                              value={examForm.passScore}
                              onChange={(e) => setExamForm({ ...examForm, passScore: Number(e.target.value) })}
                              className="form-control form-control-sm text-center fw-bold shadow-none"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Danh sách câu hỏi */}
                  <div className="d-flex justify-content-between align-items-center pt-2">
                    <h6 className="fw-bold text-dark mb-0">
                      {examType === "multiple_choice"
                        ? `Danh sách câu hỏi (${mcQuestions.length} câu)`
                        : `Danh sách thẻ ghi nhớ (${flashcardItems.length} thẻ)`}
                    </h6>
                    <button
                      type="button"
                      onClick={() => {
                        if (examType === "multiple_choice") {
                          setMcQuestions([...mcQuestions, { questionText: "", optionA: "", optionB: "", optionC: "", optionD: "", correctOption: "A", explanation: "" }]);
                        } else {
                          setFlashcardItems([...flashcardItems, { frontText: "", backText: "", explanation: "" }]);
                        }
                      }}
                      className="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold"
                      style={{ fontSize: "11.5px" }}
                    >
                      <i className="bi bi-plus-lg me-1"></i> Thêm mới
                    </button>
                  </div>

                  {examType === "multiple_choice" ? (
                    <div className="d-flex flex-column gap-2.5">
                      {mcQuestions.map((q, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-3 border shadow-2xs">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="badge bg-primary text-white rounded-pill px-2.5 py-1">Câu {idx + 1}</span>
                            {mcQuestions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setMcQuestions(mcQuestions.filter((_, i) => i !== idx))}
                                className="btn btn-sm btn-link text-danger p-0 text-decoration-none"
                              >
                                Xóa
                              </button>
                            )}
                          </div>
                          <textarea
                            rows="2"
                            required
                            placeholder="Nhập nội dung câu hỏi..."
                            value={q.questionText}
                            onChange={(e) => {
                              const arr = [...mcQuestions];
                              arr[idx].questionText = e.target.value;
                              setMcQuestions(arr);
                            }}
                            className="form-control form-control-sm fw-semibold mb-2 shadow-none"
                          />
                          <div className="row g-2 mb-2">
                            {["A", "B", "C", "D"].map((opt) => (
                              <div key={opt} className="col-12 col-md-6">
                                <div className="input-group input-group-sm">
                                  <span className="input-group-text fw-bold bg-light" style={{ width: "36px" }}>{opt}</span>
                                  <input
                                    type="text"
                                    required
                                    placeholder={`Đáp án ${opt}...`}
                                    value={q[`option${opt}`]}
                                    onChange={(e) => {
                                      const arr = [...mcQuestions];
                                      arr[idx][`option${opt}`] = e.target.value;
                                      setMcQuestions(arr);
                                    }}
                                    className="form-control shadow-none"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="row g-2 pt-2 border-top">
                            <div className="col-12 col-md-3">
                              <select
                                value={q.correctOption}
                                onChange={(e) => {
                                  const arr = [...mcQuestions];
                                  arr[idx].correctOption = e.target.value;
                                  setMcQuestions(arr);
                                }}
                                className="form-select form-select-sm fw-bold border-success text-success shadow-none"
                              >
                                <option value="A">Đáp án đúng: A</option>
                                <option value="B">Đáp án đúng: B</option>
                                <option value="C">Đáp án đúng: C</option>
                                <option value="D">Đáp án đúng: D</option>
                              </select>
                            </div>
                            <div className="col-12 col-md-9">
                              <input
                                type="text"
                                placeholder="Giải thích đáp án (tùy chọn)..."
                                value={q.explanation}
                                onChange={(e) => {
                                  const arr = [...mcQuestions];
                                  arr[idx].explanation = e.target.value;
                                  setMcQuestions(arr);
                                }}
                                className="form-control form-control-sm shadow-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2.5">
                      {flashcardItems.map((card, idx) => (
                        <div key={idx} className="p-3 bg-white rounded-3 border shadow-2xs">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="badge bg-warning text-dark rounded-pill px-2.5 py-1">Thẻ #{idx + 1}</span>
                            {flashcardItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setFlashcardItems(flashcardItems.filter((_, i) => i !== idx))}
                                className="btn btn-sm btn-link text-danger p-0 text-decoration-none"
                              >
                                Xóa
                              </button>
                            )}
                          </div>
                          <div className="row g-2">
                            <div className="col-12 col-md-6">
                              <textarea
                                rows="2"
                                required
                                placeholder="Mặt trước (Câu hỏi / Thuật ngữ)..."
                                value={card.frontText}
                                onChange={(e) => {
                                  const arr = [...flashcardItems];
                                  arr[idx].frontText = e.target.value;
                                  setFlashcardItems(arr);
                                }}
                                className="form-control form-control-sm fw-semibold shadow-none"
                              />
                            </div>
                            <div className="col-12 col-md-6">
                              <textarea
                                rows="2"
                                required
                                placeholder="Mặt sau (Đáp án / Định nghĩa)..."
                                value={card.backText}
                                onChange={(e) => {
                                  const arr = [...flashcardItems];
                                  arr[idx].backText = e.target.value;
                                  setFlashcardItems(arr);
                                }}
                                className="form-control form-control-sm fw-semibold shadow-none"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="modal-footer px-0 pb-0 border-top pt-3 d-flex justify-content-end gap-2 bg-transparent">
                    <button type="button" onClick={() => setShowCreateExamModal(false)} className="btn btn-light rounded-pill px-3.5 py-1.5 fw-semibold border small">
                      Hủy bỏ
                    </button>
                    <button type="submit" disabled={submitting} className="btn btn-primary rounded-pill px-4 py-1.5 fw-bold shadow-xs border-0 text-white small" style={{ background: "#7c3aed" }}>
                      {submitting ? "Đang lưu..." : "Hoàn Tất & Lưu Đề"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. MODAL CHỈNH SỬA THÔNG TIN */}
      {/* ========================================================================= */}
      {editingItem && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", zIndex: 1065 }}>
          <div className="modal-dialog modal-md modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3">
                <h6 className="modal-title fw-bold text-dark mb-0">Cập Nhật Học Liệu</h6>
                <button type="button" onClick={() => setEditingItem(null)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4">
                <form onSubmit={handleUpdateSubmit} className="d-flex flex-column gap-3">
                  <div>
                    <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Tiêu đề *</label>
                    <input
                      type="text"
                      value={editFormData.title}
                      onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                      className="form-control form-control-sm fw-bold rounded-3 shadow-none"
                      required
                    />
                  </div>

                  <div className="row g-2">
                    <div className="col-8">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Tên môn học *</label>
                      <input
                        type="text"
                        value={editFormData.subject}
                        onChange={(e) => setEditFormData({ ...editFormData, subject: e.target.value })}
                        className="form-control form-control-sm fw-bold rounded-3 shadow-none"
                        required
                      />
                    </div>
                    <div className="col-4">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Mã HP</label>
                      <input
                        type="text"
                        value={editFormData.subjectCode}
                        onChange={(e) => setEditFormData({ ...editFormData, subjectCode: e.target.value })}
                        className="form-control form-control-sm font-monospace shadow-none text-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label small fw-bold text-secondary text-uppercase mb-1.5" style={{ fontSize: "10px" }}>Ngành học áp dụng:</label>
                    <div className="d-flex flex-wrap gap-1.5">
                      {allMajors.map((major, idx) => {
                        const isChecked = editFormData.facultyMajors.includes(major);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleEditMajorSelection(major)}
                            className={`btn btn-sm rounded-pill px-3 py-1 fw-bold transition ${
                              isChecked ? "btn-primary text-white" : "btn-light text-secondary border bg-white"
                            }`}
                            style={{ fontSize: "11px" }}
                          >
                            {major}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Nhãn nội dung</label>
                      <select
                        value={editFormData.subCategory}
                        onChange={(e) => setEditFormData({ ...editFormData, subCategory: e.target.value })}
                        className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                      >
                        {Object.entries(SUB_CATEGORIES).map(([key, item]) => (
                          <option key={key} value={key}>{item.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Hiển thị</label>
                      <select
                        value={editFormData.isPublished}
                        onChange={(e) => setEditFormData({ ...editFormData, isPublished: e.target.value === "true" })}
                        className="form-select form-select-sm rounded-3 shadow-none fw-semibold"
                      >
                        <option value="true">Hiển thị</option>
                        <option value="false">Tạm ẩn</option>
                      </select>
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Năm học</label>
                      <select value={editFormData.year} onChange={(e) => setEditFormData({ ...editFormData, year: Number(e.target.value) })} className="form-select form-select-sm rounded-3 shadow-none">
                        <option value="1">Năm 1</option>
                        <option value="2">Năm 2</option>
                        <option value="3">Năm 3</option>
                        <option value="4">Năm 4</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: "10px" }}>Học kỳ</label>
                      <select value={editFormData.semester} onChange={(e) => setEditFormData({ ...editFormData, semester: Number(e.target.value) })} className="form-select form-select-sm rounded-3 shadow-none">
                        <option value="1">Kỳ 1</option>
                        <option value="2">Kỳ 2</option>
                        <option value="3">Kỳ 3</option>
                        <option value="4">Kỳ 4</option>
                      </select>
                    </div>
                  </div>

                  {editingItem.resourceType === "doc" && !String(editingItem.id).startsWith("exam_") && (
                    <div className="p-3 bg-light rounded-3 border">
                      <label className="form-label small fw-bold text-primary mb-1">Thay thế tệp tin (Tùy chọn):</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.pptx,.xlsx,.zip,.rar"
                        onChange={(e) => setEditReplacementFile(e.target.files[0] || null)}
                        className="form-control form-control-sm bg-white rounded-3 shadow-none"
                      />
                    </div>
                  )}

                  <div className="modal-footer px-0 pb-0 border-top pt-3 d-flex justify-content-end gap-2">
                    <button type="button" onClick={() => setEditingItem(null)} className="btn btn-light rounded-pill px-3.5 py-1.5 fw-semibold border small">
                      Đóng
                    </button>
                    <button type="submit" disabled={submitting} className="btn btn-primary rounded-pill px-4 py-1.5 fw-bold shadow-xs border-0 text-white small" style={{ background: "#185bf0" }}>
                      {submitting ? "Đang lưu..." : "Lưu Thay Đổi"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MODAL XEM CHI TIẾT BỘ CÂU HỎI / FLASHCARD */}
      {/* ========================================================================= */}
      {viewingQuizModal && (
        <div className="modal show d-block p-2 p-sm-3" style={{ backgroundColor: "rgba(15, 23, 42, 0.65)", zIndex: 1075 }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg bg-white overflow-hidden">
              <div className="modal-header border-bottom px-4 py-3 bg-white">
                <div>
                  <h6 className="modal-title fw-bold text-dark mb-0">{viewingQuizModal.title}</h6>
                  <small className="text-secondary fw-semibold">
                    Môn: <b>{viewingQuizModal.subject_name}</b> • Tổng số: <b>{viewingQuizModal.questions?.length || 0} mục</b>
                  </small>
                </div>
                <button type="button" onClick={() => setViewingQuizModal(null)} className="btn-close"></button>
              </div>

              <div className="modal-body p-4 bg-light">
                {viewingQuizModal.exam_type === "flashcard" ? (
                  <div className="row g-3">
                    {viewingQuizModal.questions?.map((card, idx) => {
                      const isFlipped = flippedCardIdx === idx;
                      return (
                        <div key={idx} className="col-12 col-md-6">
                          <div
                            onClick={() => setFlippedCardIdx(isFlipped ? null : idx)}
                            className="p-3 rounded-4 bg-white border shadow-2xs text-center cursor-pointer d-flex flex-column justify-content-center position-relative"
                            style={{ minHeight: "160px", cursor: "pointer", borderLeft: isFlipped ? "4px solid #16a34a" : "4px solid #7c3aed" }}
                          >
                            <span className="badge rounded-pill bg-light text-secondary border position-absolute top-0 start-0 m-2 font-monospace">
                              Thẻ {idx + 1} ({isFlipped ? "Đáp án" : "Câu hỏi"})
                            </span>
                            <p className={`fw-bold mb-0 my-3 ${isFlipped ? "text-success" : "text-dark"}`}>
                              {isFlipped ? (card.backText || card.explanation) : (card.frontText || card.questionText)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {viewingQuizModal.questions?.map((q, idx) => (
                      <div key={idx} className="p-3 bg-white rounded-3 border shadow-2xs">
                        <h6 className="fw-bold text-dark mb-2" style={{ fontSize: "13px" }}>
                          Câu {idx + 1}: {q.questionText}
                        </h6>
                        <div className="row g-2">
                          {["A", "B", "C", "D"].map((opt) => {
                            const isCorrect = q.correctOption === opt;
                            return (
                              <div key={opt} className="col-12 col-md-6">
                                <div className={`p-2 rounded-2 border small ${isCorrect ? "bg-success-subtle border-success text-success fw-bold" : "bg-light text-dark"}`}>
                                  <b>{opt}.</b> {q[`option${opt}`]}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageLibrary;