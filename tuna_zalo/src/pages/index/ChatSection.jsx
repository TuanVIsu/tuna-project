// src/pages/index/ChatSection.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { io } from "socket.io-client";

const SOCKET_SERVER = "https://tuna-project.onrender.com";

const ANIMATION_STYLES = `
@keyframes bubbleFadeIn {
  0% { opacity: 0; transform: translateY(6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
}
.msg-bubble-anim {
  animation: bubbleFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.typing-dot {
  width: 5px; height: 5px; background-color: #64748b; border-radius: 50%; display: inline-block;
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
  const [previewMsgContext, setPreviewMsgContext] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Trả lời tin nhắn
  const [replyingMessage, setReplyingMessage] = useState(null);

  // Menu tương tác tin nhắn (Trả lời / Thu hồi)
  const [activeActionMsg, setActiveActionMsg] = useState(null);

  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (message, type = "success") => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Cảnh báo & Khóa từ Admin
  const [adminWarning, setAdminWarning] = useState(null);
  const [penaltyStatus, setPenaltyStatus] = useState({
    isLocked: false,
    lockUntil: null,
    lockReason: "",
    durationText: "",
    showLockModal: false,
  });

  // Quản lý danh tính
  const [isAnonymous, setIsAnonymous] = useState(() => {
    return localStorage.getItem("tuna_chat_is_anon") === "true";
  });
  const [nickname, setNickname] = useState(() => {
    return localStorage.getItem("tuna_chat_nickname") || `IT_Student_${Math.floor(100 + Math.random() * 900)}`;
  });
  const [showIdentityMenu, setShowIdentityMenu] = useState(false);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [tempNickname, setTempNickname] = useState("");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const actionMenuRef = useRef(null);

  const myUserId = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || localStorage.getItem("user_info") || "{}");
      const id = u.student_code || u.id || u.email || u.zalo_id;
      if (id) return String(id).trim();
    } catch (e) {}

    let savedId = localStorage.getItem("tuna_user_id");
    if (!savedId) {
      savedId = currentUser?.student_code || currentUser?.id || currentUser?.email || currentUser?.zalo_id || `sv_${Date.now()}`;
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

  // Đóng menu thao tác khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setActiveActionMsg(null);
      }
    };
    if (activeActionMsg) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeActionMsg]);

  // Kiểm tra trạng thái phạt từ server (Bắt cả warningReason và lastWarningReason)
  const checkMyPenaltyStatus = useCallback(async () => {
    if (!myUserId) return;
    try {
      const res = await fetch(`${SOCKET_SERVER}/api/community/user-status/${encodeURIComponent(myUserId)}`);
      const data = await res.json();
      if (data.success) {
        if (data.isLocked) {
          setPenaltyStatus((prev) => ({
            ...prev,
            isLocked: true,
            lockUntil: data.lockUntil,
            lockReason: data.lockReason || "Tài khoản bị tạm khóa quyền nhắn tin",
            durationText: data.durationText || "Tạm đình chỉ",
          }));
        }

        const reason = data.warningReason || data.lastWarningReason;
        if (reason) {
          const dismissedReason = sessionStorage.getItem("tuna_dismissed_warn");
          if (dismissedReason !== reason) {
            setAdminWarning({
              reason: reason,
              warnedBy: "Ban Quản Trị",
            });
          }
        }
      }
    } catch (err) {
      console.warn("Lỗi kiểm tra khóa:", err);
    }
  }, [myUserId]);

  useEffect(() => {
    checkMyPenaltyStatus();
    const interval = setInterval(checkMyPenaltyStatus, 10000);
    return () => clearInterval(interval);
  }, [checkMyPenaltyStatus]);

  // Kết nối Socket và Lắng nghe sự kiện
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

    // Lắng nghe CẢNH BÁO từ Admin (Khớp đa tầng theo ID và Tên)
    const handleReceiveWarning = (data) => {
      if (!data) return;
      const targetId = String(data.userId || "").trim().toLowerCase();
      const targetName = String(data.userName || "").trim().toLowerCase();
      const currentId = String(myUserId || "").trim().toLowerCase();
      const currentName = String(currentUser?.name || localStorage.getItem("tuna_user_name") || "").trim().toLowerCase();
      const currentNick = String(nickname || "").trim().toLowerCase();

      const isMatchId = targetId && (targetId === currentId || targetId === "all");
      const isMatchName = targetName && (targetName === currentName || targetName === currentNick);

      if (isMatchId || isMatchName) {
        setAdminWarning({
          reason: data.reason || "Vi phạm quy chế thảo luận cộng đồng",
          warnedBy: data.warnedBy || "Ban Quản Trị",
        });
      }
    };

    socket.on("admin_warning_received", handleReceiveWarning);
    socket.on("user_warned", handleReceiveWarning);

    // Lắng nghe KHÓA TÀI KHOẢN
    socket.on("user_locked", (data) => {
      if (String(data.userId) === myUserId || String(data.userId).toLowerCase() === myUserId.toLowerCase()) {
        setPenaltyStatus({
          isLocked: true,
          lockUntil: data.lockUntil,
          lockReason: data.reason || "Tài khoản bị khóa nhắn tin",
          durationText: data.durationText || "Tạm đình chỉ",
          showLockModal: true,
        });
      }
    });

    socket.on("user_unlocked", (data) => {
      if (String(data.userId) === myUserId || String(data.userId).toLowerCase() === myUserId.toLowerCase()) {
        setPenaltyStatus({
          isLocked: false,
          lockUntil: null,
          lockReason: "",
          durationText: "",
          showLockModal: false,
        });
        showToast("Tài khoản đã được mở quyền nhắn tin!");
      }
    });

    // Nhận tin nhắn mới
    socket.on("receive_message", (newMsg) => {
      if (!newMsg) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;

        const isFromMe = String(newMsg.user_id) === myUserId || String(newMsg.userId) === myUserId;
        if (isFromMe) {
          const tempIndex = prev.findIndex(
            (m) => String(m.id).startsWith("temp_") && (m.content === newMsg.content || m.image_url === newMsg.image_url)
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

    // Thu hồi tin nhắn
    socket.on("message_recalled", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          Number(m.id) === Number(messageId) || String(m.id) === String(messageId)
            ? {
                ...m,
                content: "Tin nhắn đã được thu hồi",
                image_url: null,
                imageUrl: null,
                replyTo: null,
                reply_to: null,
                is_recalled: true,
                isRecalled: true,
              }
            : m
        )
      );
      setActiveActionMsg((prev) => (prev && String(prev.id) === String(messageId) ? null : prev));
      if (previewMsgContext && String(previewMsgContext.id) === String(messageId)) {
        setPreviewModalImg(null);
        setPreviewMsgContext(null);
      }
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
  }, [myUserId, myDisplayName, previewMsgContext, currentUser, nickname]);

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
        console.error("Lỗi nạp tin nhắn:", err);
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

  const handleSelectReply = (msg) => {
    setActiveActionMsg(null);
    setPreviewModalImg(null);
    setReplyingMessage(msg);
    const targetName = msg.user_name || "Thành viên";
    setInputValue((prev) => {
      if (prev.startsWith(`@${targetName} `)) return prev;
      return `@${targetName} ${prev}`;
    });
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleCancelReply = () => {
    const targetName = replyingMessage?.user_name || "";
    setReplyingMessage(null);
    if (inputValue.startsWith(`@${targetName} `)) {
      setInputValue((prev) => prev.replace(`@${targetName} `, ""));
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

    let replyPayload = null;
    if (replyingMessage) {
      const snippet = replyingMessage.content?.trim()
        ? replyingMessage.content.slice(0, 80)
        : (replyingMessage.image_url ? "[Hình ảnh]" : "Nội dung");
      replyPayload = {
        id: replyingMessage.id,
        userName: replyingMessage.user_name || "Thành viên",
        textSnippet: snippet,
        imageUrl: replyingMessage.image_url || null,
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

  const handleRecallMessage = async (msg) => {
    setActiveActionMsg(null);
    setPreviewModalImg(null);
    if (!msg || String(msg.id).startsWith("temp_")) return;

    const targetId = msg.id;

    setMessages((prev) =>
      prev.map((m) =>
        Number(m.id) === Number(targetId) || String(m.id) === String(targetId)
          ? {
              ...m,
              content: "Tin nhắn đã được thu hồi",
              image_url: null,
              imageUrl: null,
              replyTo: null,
              reply_to: null,
              is_recalled: true,
              isRecalled: true,
            }
          : m
      )
    );

    showToast("Đã thu hồi tin nhắn!");

    if (socketRef.current) {
      socketRef.current.emit("recall_message", { messageId: targetId, userId: myUserId });
    }

    try {
      await fetch(`${SOCKET_SERVER}/api/community/messages/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": myUserId },
        body: JSON.stringify({ messageId: targetId, userId: myUserId }),
      });
    } catch (err) {
      console.warn("Đã đồng bộ thu hồi qua Socket:", err);
    }
  };

  const canRecall = (msg) => {
    if (!msg) return false;
    const isMe = String(msg.user_id) === myUserId || String(msg.userId) === myUserId || msg.isMine;
    const isRecalled = Boolean(
      msg.is_recalled ||
      msg.isRecalled ||
      msg.content === "Tin nhắn đã được thu hồi"
    );
    if (!isMe || isRecalled) return false;
    const timeVal = msg.created_at || msg.createdAt;
    if (!timeVal) return true;
    const diff = (Date.now() - new Date(timeVal).getTime()) / (1000 * 60);
    return diff <= 60;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full max-w-full relative select-none bg-[#F4F5F7]">
      <style>{ANIMATION_STYLES}</style>

      {/* 1. TOAST THÔNG BÁO */}
      {toastMessage && (
        <div 
          className="fixed top-20 left-4 right-4 z-50 p-3 rounded-2xl shadow-xl flex items-center justify-between text-xs font-bold text-white msg-bubble-anim"
          style={{ backgroundColor: toastMessage.type === "error" ? "#ef4444" : "#10b981" }}
        >
          <span>{toastMessage.message}</span>
          <button onClick={() => setToastMessage(null)} className="w-5 h-5 rounded-full bg-white/20 text-white border-0 cursor-pointer text-xs">✕</button>
        </div>
      )}

      {/* 2. POPUP CẢNH BÁO TỪ ADMIN */}
      {adminWarning && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-amber-300">
            <div className="flex items-center gap-2.5 text-amber-600 mb-2">
              <span className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center text-lg">
                <i className="bi bi-exclamation-triangle-fill"></i>
              </span>
              <div>
                <h5 className="font-black text-sm m-0 text-slate-900">Cảnh Báo Từ Quản Trị Viên</h5>
                <span className="text-[10.5px] text-slate-400 font-semibold">{adminWarning.warnedBy}</span>
              </div>
            </div>

            <div className="my-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block mb-1">
                Lý do cảnh báo:
              </span>
              <p className="text-xs text-slate-800 font-bold m-0 leading-relaxed">
                "{adminWarning.reason}"
              </p>
            </div>

            <p className="text-[11px] text-slate-500 font-medium mb-3 leading-tight">
              Vui lòng giữ gìn văn hóa thảo luận văn minh. Tiếp tục vi phạm sẽ dẫn đến việc khóa chat.
            </p>

            <button
              type="button"
              onClick={() => {
                if (adminWarning?.reason) {
                  sessionStorage.setItem("tuna_dismissed_warn", adminWarning.reason);
                }
                setAdminWarning(null);
              }}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs border-0 cursor-pointer shadow-xs active:scale-95 transition"
            >
              Tôi Đã Đọc & Hiểu
            </button>
          </div>
        </div>
      )}

      {/* 3. MODAL KHOÁ CHAT */}
      {penaltyStatus.showLockModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-5 w-full max-w-sm shadow-2xl border border-rose-300 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mx-auto mb-2">
              <i className="bi bi-slash-circle-fill"></i>
            </div>
            <h5 className="font-black text-sm text-slate-900 mb-1">Tài Khoản Đang Bị Khóa Chat</h5>
            <p className="text-xs text-slate-600 font-bold mb-2">Lý do: {penaltyStatus.lockReason}</p>
            <span className="text-[11px] text-rose-600 font-bold bg-rose-50 px-3 py-1 rounded-full border border-rose-200 inline-block mb-3">
              Thời hạn: {penaltyStatus.durationText}
            </span>
            <button
              type="button"
              onClick={() => setPenaltyStatus((prev) => ({ ...prev, showLockModal: false }))}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-black text-xs border-0 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* 4. KHU VỰC DANH SÁCH TIN NHẮN */}
      <div className="flex-1 overflow-y-auto space-y-3.5 p-3 pr-2 no-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <i className="bi bi-chat-dots text-4xl mb-2 block opacity-70"></i>
            <p className="text-xs font-bold mb-0.5">Phòng thảo luận cộng đồng</p>
            <p className="text-[11px]">Gửi lời chào hoặc đặt câu hỏi bài tập ngay nhé!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.isMine === true ||
              String(msg.user_id) === myUserId ||
              String(msg.userId) === myUserId ||
              (msg.user_name && msg.user_name === myDisplayName);

            const isRecalled = Boolean(
              msg.is_recalled ||
              msg.isRecalled ||
              msg.content === "Tin nhắn đã được thu hồi"
            );

            const replyData = isRecalled ? null : (msg.replyTo || msg.reply_to);
            const safeKey = `msg_${msg.id || 'tmp'}_${index}`;
            const isActionMenuOpen = !isRecalled && activeActionMsg?.id === msg.id;

            // Tin nhắn của tôi
            if (isMe) {
              return (
                <div 
                  key={safeKey} 
                  className={`flex flex-col items-end msg-bubble-anim relative w-full ${isActionMenuOpen ? "z-30" : "z-1"}`}
                >
                  <span className="text-[10px] text-slate-400 mb-1 mr-1">{msg.time}</span>

                  {isRecalled ? (
                    <div className="py-2 px-3 rounded-2xl rounded-tr-xs text-xs italic text-slate-400 bg-slate-200/80 border border-slate-300/80 flex items-center gap-1.5 select-none shadow-2xs">
                      <i className="bi bi-slash-circle text-[11px]"></i>
                      <span>Tin nhắn đã được thu hồi</span>
                    </div>
                  ) : (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveActionMsg(isActionMenuOpen ? null : msg);
                      }}
                      className="flex flex-col p-2.5 px-3.5 rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-xs break-words cursor-pointer transition bg-[#0068FF] text-white active:scale-[0.99] relative"
                    >
                      {replyData && (
                        <div className="mb-2 p-2 px-2.5 rounded-xl bg-black/15 border-l-4 border-amber-300 text-[11px] leading-tight text-white block select-none">
                          <div className="flex items-center gap-1 text-amber-300 font-bold mb-0.5">
                            <i className="bi bi-reply-fill text-xs"></i>
                            <span>{replyData.userName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {replyData.imageUrl && (
                              <img src={replyData.imageUrl} alt="thumb" className="w-5 h-5 rounded object-cover shrink-0 border border-white/20" />
                            )}
                            <span className="truncate block text-white/90 font-medium text-[10.5px]">
                              {replyData.textSnippet || "[Hình ảnh]"}
                            </span>
                          </div>
                        </div>
                      )}

                      {msg.image_url && (
                        <div className="relative my-1">
                          <img
                            src={msg.image_url}
                            alt="Đính kèm"
                            className="rounded-xl max-w-full max-h-56 object-cover border border-white/10"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewModalImg(msg.image_url);
                              setPreviewMsgContext(msg);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center border-0 cursor-pointer shadow-md transition"
                            title="Phóng to ảnh"
                          >
                            <i className="bi bi-arrows-fullscreen text-xs"></i>
                          </button>
                        </div>
                      )}

                      {msg.content && <span className="break-words">{msg.content}</span>}
                    </div>
                  )}

                  {/* Menu nổi thao tác (Bên phải) */}
                  {isActionMenuOpen && (
                    <div 
                      ref={actionMenuRef}
                      className="absolute right-0 bottom-full mb-2 bg-white shadow-2xl rounded-2xl p-1.5 border border-slate-200 z-50 flex items-center gap-1 msg-bubble-anim"
                      style={{
                        boxShadow: "0 14px 28px -4px rgba(0, 0, 0, 0.2), 0 6px 12px -2px rgba(0, 0, 0, 0.08)",
                        transformOrigin: "bottom right"
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectReply(msg)}
                        className="px-3 py-1.5 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 hover:text-[#0068FF] rounded-xl border-0 bg-transparent flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                      >
                        <i className="bi bi-reply-fill text-[#0068FF] text-sm"></i>
                        <span>Trả lời</span>
                      </button>

                      {msg.image_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveActionMsg(null);
                            setPreviewModalImg(msg.image_url);
                            setPreviewMsgContext(msg);
                          }}
                          className="px-3 py-1.5 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-600 rounded-xl border-0 bg-transparent flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                        >
                          <i className="bi bi-zoom-in text-emerald-600 text-sm"></i>
                          <span>Xem ảnh</span>
                        </button>
                      )}

                      {canRecall(msg) && (
                        <button
                          type="button"
                          onClick={() => handleRecallMessage(msg)}
                          className="px-3 py-1.5 text-[11.5px] font-bold text-rose-600 hover:bg-rose-50 rounded-xl border-0 bg-transparent flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                        >
                          <i className="bi bi-arrow-counterclockwise text-sm"></i>
                          <span>Thu hồi</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            // Tin nhắn của người khác
            return (
              <div 
                key={safeKey} 
                className={`flex items-start gap-2 msg-bubble-anim relative w-full ${isActionMenuOpen ? "z-30" : "z-1"}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 shadow-xs uppercase mt-0.5 ${
                  isRecalled ? "bg-slate-300 text-slate-500 opacity-60" : "bg-gradient-to-br from-blue-700 to-indigo-800"
                }`}>
                  {msg.user_name ? msg.user_name.substring(0, 2) : "SV"}
                </div>
                
                <div className="max-w-[85%] flex flex-col items-start w-full relative">
                  {/* TIÊU ĐỀ TÊN NGƯỜI GỬI */}
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-xs font-bold text-slate-800 leading-none">{msg.user_name}</span>
                    <span className="text-[10px] text-slate-400 leading-none">• {msg.time}</span>
                  </div>

                  {isRecalled ? (
                    <div className="py-2 px-3 rounded-2xl rounded-tl-xs text-xs italic text-slate-400 bg-slate-100 border border-slate-200/80 flex items-center gap-1.5 select-none shadow-2xs">
                      <i className="bi bi-slash-circle text-[11px]"></i>
                      <span>Tin nhắn đã được thu hồi</span>
                    </div>
                  ) : (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveActionMsg(isActionMenuOpen ? null : msg);
                      }}
                      className="flex flex-col p-2.5 px-3.5 rounded-2xl rounded-tl-xs text-xs leading-relaxed shadow-xs break-words cursor-pointer transition bg-white text-slate-900 border border-slate-200/90 active:scale-[0.99] relative"
                    >
                      {replyData && (
                        <div className="mb-2 p-2 px-2.5 rounded-xl bg-slate-100/90 border-l-4 border-[#0068FF] text-[11px] leading-tight text-slate-700 block select-none">
                          <div className="flex items-center gap-1 text-[#0068FF] font-bold mb-0.5">
                            <i className="bi bi-reply-fill text-xs"></i>
                            <span>{replyData.userName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {replyData.imageUrl && (
                              <img src={replyData.imageUrl} alt="thumb" className="w-5 h-5 rounded object-cover shrink-0 border border-slate-300" />
                            )}
                            <span className="truncate block text-slate-500 font-medium text-[10.5px]">
                              {replyData.textSnippet || "[Hình ảnh]"}
                            </span>
                          </div>
                        </div>
                      )}

                      {msg.image_url && (
                        <div className="relative my-1">
                          <img
                            src={msg.image_url}
                            alt="Đính kèm"
                            className="rounded-xl max-w-full max-h-56 object-cover border border-slate-100"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewModalImg(msg.image_url);
                              setPreviewMsgContext(msg);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 text-white flex items-center justify-center border-0 cursor-pointer shadow-md transition"
                            title="Phóng to ảnh"
                          >
                            <i className="bi bi-arrows-fullscreen text-xs"></i>
                          </button>
                        </div>
                      )}

                      {msg.content && <span className="break-words">{msg.content}</span>}
                    </div>
                  )}

                  {/* Nút trả lời của người khác */}
                  {isActionMenuOpen && (
                    <div 
                      ref={actionMenuRef}
                      className="absolute right-0 bottom-full mb-2 bg-white shadow-2xl rounded-2xl p-1.5 border border-slate-200 z-50 flex items-center gap-1 msg-bubble-anim"
                      style={{
                        boxShadow: "0 14px 28px -4px rgba(0, 0, 0, 0.2), 0 6px 12px -2px rgba(0, 0, 0, 0.08)",
                        transformOrigin: "bottom right"
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectReply(msg)}
                        className="px-3 py-1.5 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 hover:text-[#0068FF] rounded-xl border-0 bg-transparent flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                      >
                        <i className="bi bi-reply-fill text-[#0068FF] text-sm"></i>
                        <span>Trả lời</span>
                      </button>

                      {msg.image_url && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveActionMsg(null);
                            setPreviewModalImg(msg.image_url);
                            setPreviewMsgContext(msg);
                          }}
                          className="px-3 py-1.5 text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 hover:text-emerald-600 rounded-xl border-0 bg-transparent flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
                        >
                          <i className="bi bi-zoom-in text-emerald-600 text-sm"></i>
                          <span>Xem ảnh</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 pt-1 msg-bubble-anim">
            <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
              <i className="bi bi-chat-dots-fill"></i>
            </div>
            <div className="bg-white px-3 py-2 rounded-2xl rounded-tl-xs border border-slate-200/80 shadow-xs flex items-center gap-2">
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

      {/* 5. KHUNG NHẬP LIỆU CHUẨN ZALO CỐ ĐỊNH Ở ĐÁY */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-md z-30">
        
        {/* BANNER PREVIEW TRẢ LỜI CHUẨN ZALO */}
        {replyingMessage && (
          <div className="bg-white border-b border-slate-100 px-3.5 py-2 flex items-center justify-between msg-bubble-anim">
            <div className="border-l-3 border-[#0068FF] pl-2.5 truncate flex-1 min-w-0 pr-3 flex items-center gap-2">
              {replyingMessage.image_url && (
                <img
                  src={replyingMessage.image_url}
                  alt="Ảnh trích dẫn"
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              )}
              <div className="truncate min-w-0 flex-1">
                <span className="text-[12px] font-bold text-slate-900 block leading-tight">
                  {replyingMessage.user_name || "Thành viên"}
                </span>
                <span className="text-[11px] text-slate-500 truncate block mt-0.5 leading-tight font-medium">
                  {replyingMessage.content?.trim() || "[Hình ảnh]"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center border-0 cursor-pointer shrink-0 transition"
              title="Hủy trả lời"
            >
              <i className="bi bi-x-lg text-xs font-black"></i>
            </button>
          </div>
        )}

        {/* XEM TRƯỚC ẢNH ĐÍNH KÈM CHUẨN BỊ GỬI */}
        {selectedImage && (
          <div className="bg-slate-50 border-b border-slate-200 p-2 px-3 flex items-center justify-between msg-bubble-anim">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                <img src={selectedImage} alt="Xem trước" className="w-full h-full object-cover" />
              </div>
              <div className="truncate">
                <span className="text-[11px] font-bold text-slate-800 block truncate">
                  {selectedImageName || "Ảnh đính kèm"}
                </span>
                <span className="text-[9.5px] text-[#0068FF] font-semibold">Sẵn sàng gửi</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedImage(null); setSelectedImageName(""); }}
              className="w-6 h-6 rounded-full bg-slate-200 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center border-0 cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* THANH NHẬP LIỆU CHÍNH */}
        <div className="p-2 px-3 flex items-center gap-1.5 bg-white">
          {penaltyStatus.isLocked ? (
            <div className="bg-rose-50 border border-rose-300 p-2.5 rounded-2xl flex items-center justify-between w-full shadow-xs">
              <span className="text-xs font-black text-rose-800 truncate">
                {penaltyStatus.lockReason || "Tài khoản đang bị tạm khóa nhắn tin"}
              </span>
              <button
                onClick={() => setPenaltyStatus((prev) => ({ ...prev, showLockModal: true }))}
                className="text-[11px] font-bold text-rose-700 underline border-0 bg-transparent cursor-pointer shrink-0"
              >
                Chi tiết
              </button>
            </div>
          ) : (
            <>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={handleImageSelect}
              />

              {/* NÚT TÍCH HỢP ẨN DANH / ĐỔI TÊN */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowIdentityMenu((prev) => !prev)}
                  className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border-0 cursor-pointer transition active:scale-95 ${
                    isAnonymous ? "bg-purple-100 text-purple-700 shadow-2xs" : "bg-blue-50 text-[#0068FF]"
                  }`}
                  title={`Đang dùng: ${myDisplayName}`}
                >
                  <i className={`bi ${isAnonymous ? "bi-incognito text-base" : "bi-person-fill text-base"}`}></i>
                </button>

                {showIdentityMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]" 
                      onClick={() => setShowIdentityMenu(false)}
                    />
                    <div 
                      className="absolute bottom-full left-0 mb-3 bg-white rounded-3xl p-3 shadow-2xl border border-slate-200 w-52 z-50 flex flex-col gap-1 msg-bubble-anim"
                      style={{
                        boxShadow: "0 20px 30px -10px rgba(0, 0, 0, 0.25), 0 10px 15px -5px rgba(0, 0, 0, 0.1)"
                      }}
                    >
                      <div className="px-2.5 py-1 border-b border-slate-100">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Tên hiển thị:</span>
                        <span className="text-xs font-black text-slate-900 truncate block">{myDisplayName}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !isAnonymous;
                          setIsAnonymous(nextVal);
                          localStorage.setItem("tuna_chat_is_anon", String(nextVal));
                          setShowIdentityMenu(false);
                        }}
                        className="w-full text-left px-2.5 py-2 text-xs font-bold rounded-xl border-0 bg-transparent hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                      >
                        <i className={`bi ${isAnonymous ? "bi-person-check text-[#0068FF]" : "bi-incognito text-purple-600"} text-sm`}></i>
                        <span>{isAnonymous ? "Hiện tên thật" : "Bật ẩn danh"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowIdentityMenu(false);
                          setTempNickname(nickname);
                          setShowNicknameModal(true);
                        }}
                        className="w-full text-left px-2.5 py-2 text-xs font-bold rounded-xl border-0 bg-transparent hover:bg-slate-50 cursor-pointer flex items-center gap-2"
                      >
                        <i className="bi bi-pencil-square text-amber-600 text-sm"></i>
                        <span>Đổi biệt danh</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Nút gửi ảnh */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border-0 cursor-pointer transition ${
                  selectedImage ? "bg-blue-100 text-[#0068FF]" : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
                title="Gửi hình ảnh"
              >
                <i className="bi bi-image text-sm"></i>
              </button>

              {/* Ô nhập tin nhắn */}
              <div className="flex-1 bg-slate-100 rounded-2xl px-3 py-1.5 flex items-center focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0068FF]/20 border border-transparent focus-within:border-[#0068FF] transition">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={isAnonymous ? "Nhắn ẩn danh..." : "Nhập nội dung thảo luận..."}
                  className="w-full text-xs text-slate-800 bg-transparent focus:outline-none border-0 p-0"
                />
              </div>

              {/* Nút gửi */}
              <button
                type="button"
                disabled={!inputValue.trim() && !selectedImage}
                onClick={handleSendMessage}
                className="w-9 h-9 rounded-2xl bg-[#0068FF] disabled:bg-slate-200 disabled:opacity-50 text-white flex items-center justify-center shrink-0 border-0 cursor-pointer shadow-xs active:scale-95 transition"
              >
                <i className="bi bi-send-fill text-sm"></i>
              </button>
            </>
          )}
        </div>
      </div>

      {/* MODAL ĐỔI BIỆT DANH */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-3xl p-4 w-full max-w-xs shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-black text-slate-900 m-0">Đặt biệt danh ẩn danh</h5>
              <button onClick={() => setShowNicknameModal(false)} className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 border-0 cursor-pointer text-xs">✕</button>
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
                className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold border-0 cursor-pointer shadow-xs"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PHÓNG TO ẢNH */}
      {previewModalImg && (
        <div
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-between p-4 z-50"
          onClick={() => {
            setPreviewModalImg(null);
            setPreviewMsgContext(null);
          }}
        >
          <div className="w-full flex justify-end">
            <button
              onClick={() => {
                setPreviewModalImg(null);
                setPreviewMsgContext(null);
              }}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center border-0 cursor-pointer"
            >
              <i className="bi bi-x-lg text-sm"></i>
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
            <img src={previewModalImg} alt="Phóng to" className="max-w-[95vw] max-h-[75vh] rounded-2xl shadow-2xl object-contain" />
          </div>

          {previewMsgContext && (
            <div className="flex items-center gap-2 p-2 bg-slate-900/80 rounded-2xl border border-white/20 mb-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => handleSelectReply(previewMsgContext)}
                className="px-3.5 py-1.5 rounded-xl bg-[#0068FF] text-white font-bold text-xs border-0 cursor-pointer flex items-center gap-1.5"
              >
                <i className="bi bi-reply-fill text-sm"></i>
                <span>Trả lời ảnh này</span>
              </button>

              {canRecall(previewMsgContext) && (
                <button
                  type="button"
                  onClick={() => handleRecallMessage(previewMsgContext)}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs border-0 cursor-pointer flex items-center gap-1.5"
                >
                  <i className="bi bi-arrow-counterclockwise text-sm"></i>
                  <span>Thu hồi ảnh</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatSection;