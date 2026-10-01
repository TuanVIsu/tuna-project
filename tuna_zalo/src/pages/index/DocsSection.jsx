// tuna_zalo/src/pages/index/DocsSection.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  fetchDocumentsFromDB,
  saveDocumentToDB,
  deleteDocumentFromDB,
  saveTaskToDB,
} from "../../services/aiService";

const API_BASE = "https://tuna-project.onrender.com/api";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || "3.11.174"}/pdf.worker.min.js`;

export const DocsSection = ({ onNavigateToAIHub }) => {
  const [documents, setDocuments] = useState(() => {
    try {
      const cached = localStorage.getItem("tuna_cached_docs");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [adminVideos, setAdminVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activeVideoModal, setActiveVideoModal] = useState(null);
  const [docFilter, setDocFilter] = useState("all"); // 'all' | 'files' | 'ai_summary'

  // PDF Viewer
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const canvasRef = useRef(null);

  const syncData = async () => {
    try {
      const [docs, libRes] = await Promise.all([
        fetchDocumentsFromDB(),
        fetch(`${API_BASE}/library`).then((r) => r.json()).catch(() => null),
      ]);
      if (docs) setDocuments(docs);
      if (libRes && libRes.success && Array.isArray(libRes.videos)) {
        setAdminVideos(libRes.videos);
      }
    } catch (e) {
      console.error("Lỗi nạp dữ liệu thư viện:", e);
    }
  };

  useEffect(() => {
    syncData();
  }, []);

  const relevantVideos = useMemo(() => {
    if (!adminVideos.length) return [];
    if (!documents.length) return adminVideos.slice(0, 6);

    const activeSubjects = new Set(documents.map((d) => d.subject).filter(Boolean));
    const matched = adminVideos.filter((v) => activeSubjects.has(v.subject));
    return matched.length > 0 ? matched.slice(0, 8) : adminVideos.slice(0, 6);
  }, [documents, adminVideos]);

  // Phân loại danh sách tài liệu
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const isAi = doc.name?.startsWith("[Tóm tắt]") || doc.name?.startsWith("[Bản dịch]");
      if (docFilter === "files") return !isAi;
      if (docFilter === "ai_summary") return isAi;
      return true;
    });
  }, [documents, docFilter]);

  useEffect(() => {
    if (!viewingDoc) {
      setPdfDoc(null);
      return;
    }
    const targetUrl = viewingDoc.downloadUrl || viewingDoc.fileUrl;
    const isPDF =
      viewingDoc.name?.toLowerCase().endsWith(".pdf") ||
      viewingDoc.type === "PDF" ||
      (targetUrl && targetUrl.toLowerCase().endsWith(".pdf"));

    if (isPDF && targetUrl && targetUrl.startsWith("http")) {
      setPdfLoading(true);
      pdfjsLib.getDocument(targetUrl).promise
        .then((doc) => {
          setPdfDoc(doc);
          setTotalPages(doc.numPages);
          setPageNum(1);
          setPdfLoading(false);
        })
        .catch(() => setPdfLoading(false));
    }
  }, [viewingDoc]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    pdfDoc.getPage(pageNum).then((page) => {
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      const viewport = page.getViewport({ scale: 1.15 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      page.render({ canvasContext: context, viewport });
    });
  }, [pdfDoc, pageNum]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const fileBlobUrl = URL.createObjectURL(file);
    const reader = new FileReader();

    reader.onload = async (event) => {
      let rawContent = event.target.result;
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const matches = rawContent.match(
          /[a-zA-Z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ.,:;!?()/-]{4,}/g
        );
        rawContent = matches ? matches.join(" ") : "";
      }

      const rawName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
      const newDoc = {
        id: `doc_${Date.now()}`,
        name: file.name,
        subject: rawName.replace(/[-_]/g, " ").trim(),
        size: `${(file.size / 1024).toFixed(1)} KB`,
        content: rawContent || `Tài liệu: ${file.name}`,
        fileUrl: fileBlobUrl,
        downloadUrl: fileBlobUrl,
        type: file.name.split(".").pop().toUpperCase(),
        date: "Vừa cập nhật",
      };

      setDocuments((prev) => [newDoc, ...prev]);
      await saveDocumentToDB(newDoc);
      setUploading(false);
    };
    reader.readAsText(file);
  };

  const handleDeleteDoc = async (e, docId) => {
    e.stopPropagation();
    if (!window.confirm("Bạn có chắc muốn xóa tài liệu này?")) return;

    const targetDoc = documents.find((d) => d.id === docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    await deleteDocumentFromDB(docId);

    // Đồng bộ: Nếu là bản tóm tắt hoặc bản dịch AI, gỡ cờ isDocSaved trong ai_tasks
    if (targetDoc && (targetDoc.type === "AI_SUMMARY" || targetDoc.name?.startsWith("[Tóm tắt]") || targetDoc.name?.startsWith("[Bản dịch]"))) {
      try {
        const rawCachedTasks = localStorage.getItem("tuna_cached_tasks");
        if (rawCachedTasks) {
          const cachedTasks = JSON.parse(rawCachedTasks);
          const updatedTasks = cachedTasks.map((t) => {
            const isMatch = targetDoc.name.includes(t.docName) || t.docName?.includes(targetDoc.subject);
            if (isMatch && (t.featureId === "summary" || t.featureId === "translate")) {
              const resetTask = { ...t, isDocSaved: false, isSaved: false };
              saveTaskToDB(resetTask).catch(() => {});
              return resetTask;
            }
            return t;
          });
          localStorage.setItem("tuna_cached_tasks", JSON.stringify(updatedTasks));
        }
      } catch (err) {
        console.error("Lỗi đồng bộ cờ task khi xóa tài liệu:", err);
      }
    }
  };

  const handleDownloadFile = (doc) => {
    const targetUrl = doc.downloadUrl || doc.fileUrl;
    if (targetUrl && targetUrl !== "#" && targetUrl.startsWith("http")) {
      window.open(targetUrl, "_blank");
      return;
    }
    const blob = new Blob([doc.content || ""], { type: "text/plain;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = doc.name.endsWith(".txt") ? doc.name : `${doc.name}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const getEmbedUrl = (url) => {
    if (!url) return "";
    if (url.includes("embed/")) return url;
    const matchWatch = url.match(/[?&]v=([^&]+)/);
    if (matchWatch) return `https://www.youtube.com/embed/${matchWatch[1]}`;
    const matchShort = url.match(/youtu\.be\/([^?&]+)/);
    if (matchShort) return `https://www.youtube.com/embed/${matchShort[1]}`;
    return url;
  };

  const renderDocFileIcon = (doc) => {
    const isAi = doc.name?.startsWith("[Tóm tắt]") || doc.name?.startsWith("[Bản dịch]");
    if (isAi) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0 border border-amber-200 shadow-2xs">
          <i className="bi bi-file-earmark-text-fill"></i>
        </div>
      );
    }

    const cleanExt = (doc.name?.split(".").pop() || doc.type || "DOC").toUpperCase();
    switch (cleanExt) {
      case "PDF":
        return (
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg shrink-0 border border-rose-100 shadow-2xs">
            <i className="bi bi-file-earmark-pdf-fill"></i>
          </div>
        );
      case "DOC":
      case "DOCX":
        return (
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0 border border-blue-100 shadow-2xs">
            <i className="bi bi-file-earmark-word-fill"></i>
          </div>
        );
      case "PPT":
      case "PPTX":
        return (
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0 border border-amber-100 shadow-2xs">
            <i className="bi bi-file-earmark-easel-fill"></i>
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-lg shrink-0 border border-slate-200 shadow-2xs">
            <i className="bi bi-file-earmark-richtext-fill"></i>
          </div>
        );
    }
  };

  // MÀN HÌNH ĐỌC TÀI LIỆU TOÀN MÀN HÌNH (SAFE AREA CHUẨN IOS)
  if (viewingDoc) {
    const isAiDoc = viewingDoc.name?.startsWith("[Tóm tắt]") || viewingDoc.name?.startsWith("[Bản dịch]");
    const ext = (viewingDoc.name?.split(".").pop() || viewingDoc.type || (isAiDoc ? "VĂN BẢN AI" : "DOC")).toUpperCase();

    return (
      <div className="position-fixed top-0 start-0 w-100 h-100 bg-[#F8FAFC] d-flex flex-column z-50 overflow-hidden">
        {/* Header né Dynamic Island / Tai thỏ chuẩn */}
        <div 
          className="bg-[#0045ce] text-white px-3.5 pb-3 d-flex align-items-center justify-content-between shadow-sm shrink-0"
          style={{ paddingTop: "max(var(--sat, 0px), 38px)" }}
        >
          <div className="d-flex align-items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2">
            <button
              onClick={() => setViewingDoc(null)}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border-0 text-white active:scale-95 transition cursor-pointer shrink-0"
            >
              <i className="bi bi-arrow-left text-sm font-bold"></i>
            </button>
            <div className="truncate">
              <h6 className="mb-0 font-black text-sm text-white truncate leading-tight">{viewingDoc.name}</h6>
              <span className="text-blue-100 text-[10.5px]">
                {isAiDoc ? "Bản Tóm Tắt AI" : ext} • {viewingDoc.size}
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-1.5 shrink-0">
            {isAiDoc && onNavigateToAIHub && (
              <button
                onClick={() => {
                  setViewingDoc(null);
                  onNavigateToAIHub();
                }}
                className="px-2.5 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] border-0 shadow-sm cursor-pointer flex items-center gap-1 active:scale-95 transition"
                title="Luyện tập trắc nghiệm từ tóm tắt này"
              >
                <i className="bi bi-patch-question-fill"></i> Tạo Quiz
              </button>
            )}

            <button
              onClick={() => handleDownloadFile(viewingDoc)}
              className="px-3 py-1.5 rounded-full bg-white text-[#0045ce] font-black text-xs border-0 shadow-sm cursor-pointer flex items-center gap-1 active:scale-95 transition"
            >
              <i className="bi bi-cloud-arrow-down-fill"></i> Tải về
            </button>
          </div>
        </div>

        <div className="flex-1 w-100 bg-slate-100 d-flex flex-column overflow-hidden position-relative">
          {isAiDoc ? (
            /* Khung đọc văn bản tóm tắt */
            <div 
              className="flex-1 overflow-y-auto p-3.5 max-w-lg mx-auto w-full"
              style={{ paddingBottom: "calc(var(--sab, 0px) + 36px)" }}
            >
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200/80 leading-relaxed text-slate-800 text-xs whitespace-pre-wrap">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <span className="font-extrabold text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    Nội dung tóm tắt kiến thức
                  </span>
                  <span className="text-[10px] text-slate-400">{viewingDoc.date}</span>
                </div>
                {viewingDoc.content || "Chưa có nội dung chi tiết."}
              </div>
            </div>
          ) : pdfLoading ? (
            <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
              <div className="spinner-border spinner-border-sm text-primary mb-2"></div>
              <small className="fw-bold">Đang tải PDF...</small>
            </div>
          ) : ext === "PDF" && pdfDoc ? (
            <div className="d-flex flex-column h-100">
              <div className="flex-1 overflow-auto d-flex justify-content-center p-2 bg-slate-200">
                <canvas ref={canvasRef} className="shadow rounded-3 bg-white" style={{ maxWidth: "100%" }} />
              </div>
              <div 
                className="bg-white p-2 border-top d-flex align-items-center justify-content-between px-3"
                style={{ paddingBottom: "max(var(--sab, 0px), 8px)" }}
              >
                <button
                  disabled={pageNum <= 1}
                  onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                  className="btn btn-sm btn-light rounded-pill px-3 fw-bold border flex items-center gap-1"
                >
                  <i className="bi bi-chevron-left"></i> Trước
                </button>
                <span className="small font-bold text-slate-700">Trang {pageNum} / {totalPages}</span>
                <button
                  disabled={pageNum >= totalPages}
                  onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))}
                  className="btn btn-sm btn-light rounded-pill px-3 fw-bold border flex items-center gap-1"
                >
                  Sau <i className="bi bi-chevron-right"></i>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 h-100 d-flex flex-column justify-content-center align-items-center">
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm w-full max-w-sm text-center space-y-3">
                <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl font-black bg-blue-50 text-[#0045ce] border border-blue-100">
                  <i className="bi bi-file-earmark-text-fill"></i>
                </div>
                <h4 className="text-sm font-black text-slate-900 m-0">{viewingDoc.name}</h4>
                <p className="text-xs text-slate-500 m-0">Tệp tài liệu giáo trình chính khóa.</p>
                <button
                  onClick={() => handleDownloadFile(viewingDoc)}
                  className="w-full py-2.5 bg-[#0045ce] hover:bg-blue-700 text-white rounded-2xl text-xs font-black border-0 cursor-pointer shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <i className="bi bi-box-arrow-up-right"></i> Mở tệp / Tải về máy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-24 px-1 w-full max-w-full">
      {/* Banner */}
      <div className="bg-gradient-to-br from-[#0045ce] via-blue-700 to-indigo-900 text-white rounded-3xl p-4 shadow-md flex items-center justify-between">
        <div>
          <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-blue-100 text-[10px] font-black uppercase tracking-wide border border-white/20">
            Thư viện học tập
          </span>
          <h3 className="text-base font-black mt-1 mb-0.5">Kho Tài Liệu Của Tôi</h3>
          <p className="text-[11px] text-blue-100 font-medium m-0 opacity-90">
            Giáo trình chính khóa và các bản tóm tắt trọng tâm từ AI.
          </p>
        </div>

        <label className="px-3.5 py-2 rounded-2xl bg-white text-[#0045ce] font-black text-xs shadow-md border-0 active:scale-95 transition cursor-pointer flex items-center gap-1 shrink-0 m-0">
          <i className="bi bi-cloud-arrow-up-fill text-sm"></i>
          <span>{uploading ? "Đang tải..." : "Tải tệp lên"}</span>
          <input
            type="file"
            accept=".txt,.doc,.docx,.pdf,.pptx,.xlsx,.zip"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Bộ lọc phân loại tài liệu */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 flex items-center gap-1 shadow-2xs">
        {[
          { id: "all", label: "Tất cả", icon: "bi-collection" },
          { id: "files", label: "Tệp tải lên", icon: "bi-file-earmark-arrow-up" },
          { id: "ai_summary", label: "Tóm tắt AI", icon: "bi-stars" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDocFilter(tab.id)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition border-0 flex items-center justify-center gap-1 cursor-pointer ${
              docFilter === tab.id
                ? "bg-[#0045ce] text-white shadow-xs"
                : "bg-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <i className={`bi ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* Danh sách tài liệu */}
      <div className="bg-white rounded-3xl p-3.5 border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-black text-slate-900 m-0 flex items-center gap-1.5">
            <i className="bi bi-folder-symlink-fill text-[#0045ce]"></i> Danh sách mục đã lưu ({filteredDocuments.length})
          </h4>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
            <i className="bi bi-folder-plus text-3xl text-slate-300 mb-1 block"></i>
            <p className="text-xs text-slate-600 font-bold mb-0.5">Không có tài liệu nào trong danh mục này</p>
            <p className="text-[10.5px] text-slate-400 m-0">Tải tệp mới lên hoặc lưu bài tóm tắt từ AI Hub.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {filteredDocuments.map((doc) => {
              const isAi = doc.name?.startsWith("[Tóm tắt]") || doc.name?.startsWith("[Bản dịch]");
              const ext = (doc.name?.split(".").pop() || doc.type || (isAi ? "TÓM TẮT" : "DOC")).toUpperCase();

              return (
                <div
                  key={doc.id}
                  onClick={() => setViewingDoc(doc)}
                  className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-blue-300 transition flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                    {renderDocFileIcon(doc)}

                    <div className="truncate flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`px-1.5 py-0.2 rounded font-black text-[9px] uppercase ${
                          isAi ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-slate-200 text-slate-700"
                        }`}>
                          {isAi ? "AI Tóm Tắt" : ext}
                        </span>
                        <span className="text-[10px] text-slate-400">{doc.date || "Vừa lưu"}</span>
                      </div>
                      <h5 className="text-xs font-black text-slate-900 m-0 truncate leading-snug">
                        {doc.name}
                      </h5>
                      <p className="text-[10px] text-slate-400 font-medium m-0 mt-0.5 truncate">
                        {doc.subject ? `${doc.subject} • ` : ""}{doc.size}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setViewingDoc(doc)}
                      className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-[#0045ce] font-black text-[10.5px] hover:bg-blue-50 shadow-2xs cursor-pointer transition"
                    >
                      Đọc
                    </button>
                    <button
                      onClick={(e) => handleDeleteDoc(e, doc.id)}
                      className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs transition border-0 cursor-pointer"
                      title="Xóa tài liệu"
                    >
                      <i className="bi bi-trash3-fill"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Video bài giảng chính khóa */}
      <div className="bg-white rounded-3xl p-3.5 border border-slate-200 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-black text-slate-900 m-0 flex items-center gap-1.5">
            <i className="bi bi-play-circle-fill text-rose-600"></i> Video bài giảng chính khóa
          </h4>
          <span className="text-[10.5px] text-slate-400 font-semibold">
            Ban Quản Trị cung cấp
          </span>
        </div>

        {relevantVideos.length === 0 ? (
          <div className="text-center py-6 border border-slate-150 rounded-2xl bg-slate-50/50">
            <i className="bi bi-camera-video-off text-2xl text-slate-300 mb-1 block"></i>
            <p className="text-xs text-slate-500 font-medium m-0">Chưa có bài giảng video cho môn học này từ Ban Quản Trị.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {relevantVideos.map((vid) => (
              <div
                key={vid.id}
                onClick={() => setActiveVideoModal(vid)}
                className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-rose-300 transition flex items-center justify-between gap-2.5 cursor-pointer"
              >
                <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg shrink-0 border border-rose-100 shadow-2xs">
                    <i className="bi bi-youtube"></i>
                  </div>
                  <div className="truncate flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-50 text-[#0045ce] border border-blue-200">
                        {vid.subject}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400">
                        Năm {vid.year} • K{vid.semester}
                      </span>
                    </div>
                    <h5 className="text-xs font-black text-slate-900 m-0 truncate">{vid.title}</h5>
                    <p className="text-[10px] text-slate-400 m-0">
                      GV: <b className="text-slate-600">{vid.author}</b> {vid.duration ? `• ${vid.duration}` : ""}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-black text-[10px] shrink-0 border border-rose-200 flex items-center gap-1">
                  <i className="bi bi-play-fill"></i> Xem
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Video */}
      {activeVideoModal && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark/70 d-flex align-items-center justify-content-center p-3 z-50"
          onClick={() => setActiveVideoModal(null)}
        >
          <div className="bg-white rounded-3xl p-3.5 w-full max-w-[420px] shadow-2xl flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-black text-[10.5px]">
                {activeVideoModal.subject}
              </span>
              <button onClick={() => setActiveVideoModal(null)} className="btn btn-sm btn-light rounded-circle p-1 border-0">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-inner">
              <iframe
                className="w-full h-full border-0"
                src={getEmbedUrl(activeVideoModal.embedUrl)}
                title={activeVideoModal.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900 m-0 leading-snug">{activeVideoModal.title}</h4>
              <p className="text-[10px] text-slate-400 m-0 mt-0.5">
                Biên soạn: <b className="text-slate-700">{activeVideoModal.author}</b> • Năm {activeVideoModal.year} Kỳ {activeVideoModal.semester}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocsSection;