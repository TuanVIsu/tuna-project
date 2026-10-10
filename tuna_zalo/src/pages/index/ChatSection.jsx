// src/pages/index/ChatSection.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_SERVER = "https://tuna-project.onrender.com";

const ANIMATION_STYLES = `
@keyframes bubbleFadeIn {
  0% { opacity: 0; transform: translateY(8px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
.msg-bubble-right {
  animation: bubbleFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: bottom right;
}
.msg-bubble-left {
  animation: bubbleFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transform-origin: bottom left;
}
.typing-dot {
  width: 5px; height: 5px; background-color: #475569; border-radius: 50%; display: inline-block;
  animation: typingBounce 1.2s infinite ease-in-out;
}
.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
`;

export const ChatSection = ({ currentUser }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageName, setSelectedImageName] = useState("");
  const [previewModalImg, setPreviewModalImg] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // State Trả lời tin nhắn (Reply)
  const [replyingMessage, setReplyingMessage] = useState(null);

  // State Menu thao tác tin nhắn (Menu chọn Trả lời / Thu hồi)
  const [activeActionMsg, setActiveActionMsg] = useState(null);

  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const [penaltyStatus, setPenaltyStatus] = useState({
    isLocked: false,
    lockUntil: null,
    lockReason: "",
    durationText: "",
    showLockModal: false,
  });

  const [isAnonymous, setIsAnonymous] = useState(() => {
    return localStorage.getItem("tuna_chat_is_anon") === "true";
  });
  const [nickname, setNickname] = useState(() => {
    return localStorage.getItem("tuna_chat_nickname") || `IT_Student_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [tempNickname, setTempNickname] = useState("");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const myUserId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || localStorage.getItem("user_info") || "{}");
      const id = u.email || u.student_code || u.zalo_id || u.id;
      if (id) return String(id).trim();
    } catch (e) {}

    let savedId = localStorage.getItem("tuna_user_id");
    if (!savedId) {
      savedId = currentUser?.email || currentUser?.student_code || currentUser?.zalo_id || currentUser?.id || `sv_${Date.now()}`;
      localStorage.setItem("tuna_user_id", String(savedId));
    }
    return String(savedId);
  }, [currentUser]);

  const myDisplayName = useMemo(() => {
    if (isAnonymous) return nickname;
    return currentUser?.name || localStorage.getItem("tuna_user_name") || "Sinh viên TUNA";
  }, [isAnonymous, nickname, currentUser]);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Kiểm tra trạng thái khóa
  const checkMyPenaltyStatus = useCallback(async () => {
    if (!myUserId) return;
    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/user-status/${encodeURIComponent(myUserId)}`);
      const data = await res.json();
      if (data.success && data.isLocked) {
        setPenaltyStatus((prev) => ({
          ...prev,
          isLocked: true,
          lockUntil: data.lockUntil,
          lockReason: data.lockReason || "Tài khoản bị tạm khóa quyền nhắn tin",
          durationText: data.durationText || "Tạm đình chỉ",
        }));
      }
    } catch (err) {
      console.warn("Lỗi kiểm tra khóa:", err);
    }
  }, [myUserId]);

  useEffect(() => {
    checkMyPenaltyStatus();
  }, [checkMyPenaltyStatus]);

  // Kết nối socket
  useEffect(() => {
    const socket = io(SOCKET_SERVER, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 8,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join_room", { category: "all", userId: myUserId, userName: myDisplayName });
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("receive_message", (newMsg) => {
      if (!newMsg) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;

        const isFromMe = String(newMsg.user_id) === myUserId || String(newMsg.userId) === myUserId;
        if (isFromMe) {
          const tempIndex = prev.findIndex(
            (m) => String(m.id).startsWith("temp_") && m.content === newMsg.content
          );
          if (tempIndex !== -1) {
            const nextList = [...prev];
            nextList[tempIndex] = newMsg;
            return nextList;
          }
        }
        return [...prev, newMsg];
      });
      setTypingUsers((prev) => prev.filter((u) => u.userId !== String(newMsg.user_id)));
    });

    // Sự kiện thu hồi tin nhắn
    socket.on("message_recalled", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.id) === Number(messageId)
            ? { ...m, content: "Tin nhắn đã được thu hồi", image_url: null, is_recalled: true }
            : m
        )
      );
    });

    socket.on("message_deleted", (deletedMsgId) => {
      setMessages((prev) => prev.filter((m) => m.id !== deletedMsgId));
    });

    socket.on("user_typing", ({ userName, userId }) => {
      if (String(userId) === myUserId) return;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === String(userId))) return prev;
        return [...prev, { userId: String(userId), userName }];
      });
    });

    socket.on("user_stop_typing", ({ userId }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== String(userId)));
    });

    return () => {
      socket.emit("leave_room", { category: "all" });
      socket.disconnect();
    };
  }, [myUserId, myDisplayName]);

  // Nạp lịch sử
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${SOCKET_SERVER}/api/community/messages/all`);
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch (err) {
        console.error("Lỗi tải lịch sử chat:", err);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, typingUsers, scrollToBottom]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    if (socketRef.current && !penaltyStatus.isLocked) {
      socketRef.current.emit("typing", { category: "all", userId: myUserId, userName: myDisplayName });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current.emit("stop_typing", { category: "all", userId: myUserId });
      }, 1500);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      showToast("Kích thước ảnh tối đa là 8MB!", "error");
      e.target.value = "";
      return;
    }

    setSelectedImageName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        setSelectedImage(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // GỬI TIN NHẮN (KÈM DỮ LIỆU REPLY NẾU CÓ)
  const handleSendMessage = async () => {
    if (penaltyStatus.isLocked) {
      setPenaltyStatus((prev) => ({ ...prev, showLockModal: true }));
      return;
    }
    const text = inputValue.trim();
    if (!text && !selectedImage) return;

    if (socketRef.current) {
      socketRef.current.emit("stop_typing", { category: "all", userId: myUserId });
    }

    // Đóng gói nội dung kèm trích dẫn trả lời nếu có
    let replyPayload = null;
    if (replyingMessage) {
      replyPayload = {
        id: replyingMessage.id,
        userName: replyingMessage.user_name || "Thành viên",
        textSnippet: (replyingMessage.content || "Hình ảnh").slice(0, 75),
      };
    }

    const payload = {
      category: "all",
      userId: myUserId,
      userName: myDisplayName,
      avatar: currentUser?.avatar || "",
      content: text,
      imageUrl: selectedImage,
      replyTo: replyPayload,
      isAnonymous: Boolean(isAnonymous),
    };

    setInputValue("");
    const imgToSend = selectedImage;
    setSelectedImage(null);
    setSelectedImageName("");
    setReplyingMessage(null);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const tempMsg = {
      id: tempId,
      user_id: myUserId,
      user_name: myDisplayName,
      content: text,
      image_url: imgToSend,
      reply_to: replyPayload,
      created_at: now.toISOString(),
      time: timeStr,
      isMine: true,
    };

    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": myUserId },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...data.message, isMine: true } : m))
        );
      }
    } catch (err) {
      if (socketRef.current) socketRef.current.emit("send_message", payload);
    }
  };

  // XỬ LÝ THU HỒI TIN NHẮN (KIỂM TRA 60 PHÚT)
  const handleRecallMessage = async (msg) => {
    setActiveActionMsg(null);
    if (!msg || String(msg.id).startsWith("temp_")) return;

    const createdAt = msg.created_at || msg.createdAt;
    if (createdAt) {
      const diffMinutes = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60);
      if (diffMinutes > 60) {
        showToast("Đã quá 60 phút, không thể thu hồi tin nhắn này!", "error");
        return;
      }
    }

    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/messages/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": myUserId },
        body: JSON.stringify({ messageId: msg.id, userId: myUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, content: "Tin nhắn đã được thu hồi", image_url: null, is_recalled: true }
              : m
          )
        );
        showToast("Đã thu hồi tin nhắn!");
      } else {
        showToast(data.message || "Không thể thu hồi tin nhắn", "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối khi thu hồi tin nhắn!", "error");
    }
  };

  // KIỂM TRA ĐIỀU KIỆN 60 PHÚT ĐỂ HIỆN NÚT THU HỒI
  const canRecall = (msg) => {
    const isMe = String(msg.user_id) === myUserId || msg.isMine;
    if (!isMe || msg.is_recalled || msg.content === "Tin nhắn đã được thu hồi") return false;
    const timeVal = msg.created_at || msg.createdAt;
    if (!timeVal) return true;
    const diff = (Date.now() - new Date(timeVal).getTime()) / (1000 * 60);
    return diff <= 60;
  };

  return (
    <div 
      className="flex flex-col h-[calc(100vh-140px)] w-full max-w-full relative select-none"
      onClick={() => { if (activeActionMsg) setActiveActionMsg(null); }}
    >
      <style>{ANIMATION_STYLES}</style>

      {/* TOAST THÔNG BÁO TỔNG QUÁT */}
      {toastMessage && (
        <div 
          className="fixed top-20 left-4 right-4 z-50 p-3 rounded-2xl shadow-xl flex items-center justify-between text-xs font-bold text-white msg-bubble-right"
          style={{ backgroundColor: toastMessage.type === "error" ? "#ef4444" : "#10b981" }}
        >
          <span>{toastMessage.message}</span>
          <button onClick={() => setToastMessage(null)} className="w-5 h-5 rounded-full bg-white/20 text-white border-0 cursor-pointer text-xs">✕</button>
        </div>
      )}

      {/* THANH THÔNG TIN NGƯỜI DÙNG */}
      <div className="bg-white rounded-2xl p-2 px-3 border border-slate-200/80 shadow-2xs mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
            isAnonymous ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
          }`}>
            <i className={`bi ${isAnonymous ? "bi-incognito" : "bi-person-fill"}`}></i>
          </div>
          <div>
            <div className="text-[12px] font-black text-slate-900 flex items-center gap-1.5 leading-none">
              <span>{myDisplayName}</span>
              {isAnonymous && (
                <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 text-[9px] font-bold border border-purple-200">
                  Ẩn danh
                </span>
              )}
            </div>
            <span className="text-[9.5px] text-slate-400 block mt-0.5 font-mono truncate max-w-[140px]">
              {myUserId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setTempNickname(nickname); setShowNicknameModal(true); }}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold rounded-lg border-0 cursor-pointer"
          >
            Đổi biệt danh
          </button>
          <button
            onClick={() => {
              const nextVal = !isAnonymous;
              setIsAnonymous(nextVal);
              localStorage.setItem("tuna_chat_is_anon", String(nextVal));
            }}
            className={`px-2.5 py-1 text-[10.5px] font-bold rounded-lg border-0 cursor-pointer ${
              isAnonymous ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {isAnonymous ? "Bật tên thật" : "Bật ẩn danh"}
          </button>
          <span
            className={`w-2.5 h-2.5 rounded-full ml-1 ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-400"}`}
            title={isConnected ? "Đã kết nối máy chủ" : "Mất kết nối"}
          />
        </div>
      </div>

      {/* DANH SÁCH TIN NHẮN */}
      <div className="flex-1 overflow-y-auto space-y-3 px-1 pr-1.5 no-scrollbar pb-3">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <i className="bi bi-chat-dots text-3xl mb-1 block"></i>
            <p className="text-xs font-bold mb-0.5">Phòng thảo luận chung</p>
            <p className="text-[10.5px]">Gửi câu hỏi hoặc chia sẻ học tập để bắt đầu!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.isMine === true ||
              String(msg.user_id) === myUserId ||
              String(msg.userId) === myUserId ||
              (msg.user_name && msg.user_name === myDisplayName);

            const isRecalled = msg.is_recalled || msg.content === "Tin nhắn đã được thu hồi";
            const replyData = msg.replyTo || msg.reply_to;
            const safeKey = `msg_${msg.id || 'tmp'}_${index}_${msg.time || ''}`;
            const isActionMenuOpen = activeActionMsg?.id === msg.id;

            if (isMe) {
              return (
                <div key={safeKey} className="flex flex-col items-end msg-bubble-right relative">
                  <span className="text-[9.5px] text-slate-400 mb-0.5 mr-1">{msg.time}</span>

                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRecalled) setActiveActionMsg(isActionMenuOpen ? null : msg);
                    }}
                    className={`p-2.5 px-3.5 rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-sm break-words cursor-pointer transition ${
                      isRecalled 
                        ? "bg-slate-200 text-slate-500 italic border border-slate-300" 
                        : "bg-[#0045ce] text-white active:scale-[0.99]"
                    }`}
                  >
                    {/* KHỐI TRÍCH DẪN REPLY NẾU CÓ */}
                    {replyData && (
                      <div className="mb-2 p-2 rounded-xl bg-white/15 border-l-3 border-amber-300 text-[11px] leading-tight text-blue-100">
                        <span className="font-black text-amber-300 block mb-0.5">↩ {replyData.userName}:</span>
                        <span className="truncate block opacity-90">{replyData.textSnippet}</span>
                      </div>
                    )}

                    {msg.image_url && !isRecalled && (
                      <img
                        src={msg.image_url}
                        alt="Đính kèm"
                        onClick={(e) => { e.stopPropagation(); setPreviewModalImg(msg.image_url); }}
                        className="rounded-xl max-w-full max-h-56 object-cover mb-1.5 cursor-pointer hover:opacity-95 transition bg-white/10"
                      />
                    )}

                    <div className="flex items-center gap-1.5">
                      {isRecalled && <i className="bi bi-slash-circle text-xs text-slate-400"></i>}
                      <span>{msg.content}</span>
                    </div>
                  </div>

                  {/* MENU NỔI THAO TÁC (TRẢ LỜI / THU HỒI) */}
                  {isActionMenuOpen && !isRecalled && (
                    <div 
                      className="absolute right-0 top-full mt-1 bg-white shadow-xl rounded-2xl p-1 border border-slate-200 z-40 flex items-center gap-1 msg-bubble-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => { setReplyingMessage(msg); setActiveActionMsg(null); }}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 rounded-xl border-0 bg-transparent flex items-center gap-1 cursor-pointer"
                      >
                        <i className="bi bi-reply-fill text-[#0045ce]"></i> Trả lời
                      </button>

                      {canRecall(msg) && (
                        <button
                          type="button"
                          onClick={() => handleRecallMessage(msg)}
                          className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-xl border-0 bg-transparent flex items-center gap-1 cursor-pointer"
                        >
                          <i className="bi bi-arrow-counterclockwise"></i> Thu hồi
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={safeKey} className="flex items-start gap-2 msg-bubble-left relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-indigo-700 flex items-center justify-center text-xs font-black text-white shrink-0 shadow-2xs uppercase">
                  {msg.user_name ? msg.user_name.substring(0, 2) : "SV"}
                </div>
                <div className="max-w-[85%]">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-slate-800">{msg.user_name}</span>
                    <span className="text-[9.5px] text-slate-400">• {msg.time}</span>
                  </div>

                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isRecalled) setActiveActionMsg(isActionMenuOpen ? null : msg);
                    }}
                    className={`p-2.5 px-3.5 rounded-2xl rounded-tl-xs text-xs leading-relaxed shadow-2xs break-words cursor-pointer transition ${
                      isRecalled
                        ? "bg-slate-100 text-slate-400 italic border border-slate-200"
                        : "bg-white text-slate-800 border border-slate-200/90 active:scale-[0.99]"
                    }`}
                  >
                    {/* KHỐI TRÍCH DẪN REPLY NẾU CÓ */}
                    {replyData && (
                      <div className="mb-2 p-2 rounded-xl bg-slate-50 border-l-3 border-[#0045ce] text-[11px] leading-tight text-slate-600">
                        <span className="font-black text-[#0045ce] block mb-0.5">↩ {replyData.userName}:</span>
                        <span className="truncate block">{replyData.textSnippet}</span>
                      </div>
                    )}

                    {msg.image_url && !isRecalled && (
                      <img
                        src={msg.image_url}
                        alt="Đính kèm"
                        onClick={(e) => { e.stopPropagation(); setPreviewModalImg(msg.image_url); }}
                        className="rounded-xl max-w-full max-h-56 object-cover mb-1.5 cursor-pointer hover:opacity-95 transition border border-slate-100"
                      />
                    )}

                    <div className="flex items-center gap-1.5">
                      {isRecalled && <i className="bi bi-slash-circle text-xs text-slate-400"></i>}
                      <span>{msg.content}</span>
                    </div>
                  </div>

                  {/* MENU NỔI CHO TIN NHẮN NGƯỜI KHÁC (CHỈ HIỆN NÚT TRẢ LỜI) */}
                  {isActionMenuOpen && !isRecalled && (
                    <div 
                      className="absolute left-10 top-full mt-1 bg-white shadow-xl rounded-2xl p-1 border border-slate-200 z-40 flex items-center gap-1 msg-bubble-left"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => { setReplyingMessage(msg); setActiveActionMsg(null); }}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 rounded-xl border-0 bg-transparent flex items-center gap-1 cursor-pointer"
                      >
                        <i className="bi bi-reply-fill text-[#0045ce]"></i> Trả lời
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 pt-1 msg-bubble-left">
            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
              <i className="bi bi-chat-dots-fill"></i>
            </div>
            <div className="bg-white px-3 py-2 rounded-2xl rounded-tl-xs border border-slate-200/80 shadow-2xs flex items-center gap-2">
              <div className="flex items-center gap-1 py-0.5">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold italic">Đang soạn tin...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* THANH TRẢ LỜI TIN NHẮN (REPLY BAR) */}
      {replyingMessage && (
        <div className="bg-blue-50 border border-blue-200 p-2 px-3 rounded-2xl mb-1.5 shadow-xs flex items-center justify-between msg-bubble-right">
          <div className="truncate pr-2 border-l-3 border-[#0045ce] pl-2">
            <span className="text-[11px] font-black text-[#0045ce] block">
              Đang trả lời {replyingMessage.user_name || "thành viên"}:
            </span>
            <span className="text-[10px] text-slate-600 truncate block">
              {replyingMessage.content || "Hình ảnh đính kèm"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyingMessage(null)}
            className="w-6 h-6 rounded-full bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center border border-slate-200 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* THANH XEM TRƯỚC ẢNH (PREVIEW BAR) */}
      {selectedImage && (
        <div className="bg-white border border-blue-200 p-2 rounded-2xl mb-1.5 shadow-sm flex items-center justify-between msg-bubble-right">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-slate-200 shrink-0">
              <img src={selectedImage} alt="Xem trước" className="w-full h-full object-cover" />
            </div>
            <div className="truncate">
              <span className="text-[11px] font-black text-slate-800 block truncate">
                {selectedImageName || "Ảnh chuẩn bị gửi"}
              </span>
              <span className="text-[9.5px] text-blue-600 font-bold block">Sẵn sàng gửi</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setSelectedImage(null); setSelectedImageName(""); }}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center border-0 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* KHUNG NHẬP TIN NHẮN */}
      <div className="pt-1 sticky bottom-0 bg-[#F8FAFC]">
        {penaltyStatus.isLocked ? (
          <div className="bg-rose-50 border border-rose-300 p-3 rounded-2xl flex items-center justify-between shadow-xs">
            <span className="text-xs font-black text-rose-800 truncate">Tài khoản đang bị tạm khóa nhắn tin</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-white rounded-2xl p-1.5 pl-2 border border-slate-200 shadow-sm focus-within:border-blue-500">
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              className="hidden"
              onChange={handleImageSelect}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border-0 cursor-pointer transition ${
                selectedImage ? "bg-blue-100 text-[#0045ce]" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
            >
              <i className="bi bi-image text-sm"></i>
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={replyingMessage ? "Nhập câu trả lời..." : "Nhập nội dung thảo luận..."}
              className="flex-1 text-xs text-slate-800 bg-transparent focus:outline-none border-0 px-1"
            />

            <button
              type="button"
              disabled={!inputValue.trim() && !selectedImage}
              onClick={handleSendMessage}
              className="w-8 h-8 rounded-xl bg-[#0045ce] disabled:opacity-40 text-white flex items-center justify-center shrink-0 border-0 cursor-pointer shadow-xs active:scale-90 transition-transform"
            >
              <i className="bi bi-send-fill text-xs"></i>
            </button>
          </div>
        )}
      </div>

      {/* MODAL ĐỔI BIỆT DANH */}
      {showNicknameModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-black/50 d-flex align-items-center justify-center p-3 z-50">
          <div className="bg-white rounded-3xl p-4 w-full max-w-xs shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-black text-slate-900 m-0">Đặt biệt danh ẩn danh</h5>
              <button onClick={() => setShowNicknameModal(false)} className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 border-0 cursor-pointer">✕</button>
            </div>
            <input
              type="text"
              value={tempNickname}
              onChange={(e) => setTempNickname(e.target.value)}
              placeholder="VD: Cú Đêm HTTT..."
              className="w-full p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none text-slate-800"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNicknameModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border-0 cursor-pointer">Hủy</button>
              <button
                onClick={() => {
                  if (tempNickname.trim()) {
                    setNickname(tempNickname.trim());
                    localStorage.setItem("tuna_chat_nickname", tempNickname.trim());
                    setIsAnonymous(true);
                    localStorage.setItem("tuna_chat_is_anon", "true");
                  }
                  setShowNicknameModal(false);
                }}
                className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold border-0 cursor-pointer"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX XEM ẢNH */}
      {previewModalImg && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-black/85 d-flex align-items-center justify-center p-3 z-50 cursor-pointer"
          onClick={() => setPreviewModalImg(null)}
        >
          <img src={previewModalImg} alt="Phóng to" className="max-w-[95vw] max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
};

export default ChatSection;